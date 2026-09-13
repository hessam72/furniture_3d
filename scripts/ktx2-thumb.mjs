#!/usr/bin/env node
/**
 * A small PNG thumbnail of a fabric, taken from the fabric itself.
 *
 *   node scripts/ktx2-thumb.mjs public/images/fabrics 256 public/textures/covers/*.ktx2
 *   npm run tex:thumbs
 *
 * The swatch chips in the viewer are pictures of cloth, and the obvious way to
 * get them — export a JPEG beside each texture — means two assets describing one
 * fabric, which drift the first time someone re-encodes only one of them. This
 * reads the shipped `.ktx2` instead, so a chip cannot show a fabric the piece is
 * not wearing.
 *
 * It transcodes **one mip level** — the smallest at or under the requested size,
 * so a 256px thumbnail decodes a 256² image rather than a 1024² one — using the
 * same Basis transcoder the browser loads from `public/basis`. The PNG is
 * written with node's own zlib, so this needs no image library at all: there is
 * no ImageMagick, no sharp, and nothing to install before it runs.
 *
 * Output lands around 30KB at 256², which carries both the chip and the larger
 * preview card beside it. @see scripts/optimize-texture.sh, which makes the
 * `.ktx2` this reads.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const BASIS_DIR = '/home/user/furniture_3d/public/basis'

function crc32(buf) {
  let c, table = []
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** RGBA bytes → an 8-bit RGB PNG (alpha dropped; fabrics are opaque). */
function png(rgba, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = y * (1 + w * 3) + 1 + x * 3
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const cwd = process.cwd()
process.chdir(BASIS_DIR)
const Module = await require(path.join(BASIS_DIR, 'basis_transcoder.js'))()
process.chdir(cwd)
Module.initializeBasis()

const RGBA32 = Module.transcoder_texture_format.cTFRGBA32.value
const [, , outDir, target, ...inputs] = process.argv
const want = Number(target) || 128

for (const input of inputs) {
  const bytes = new Uint8Array(readFileSync(input))
  const file = new Module.KTX2File(bytes)
  if (!file.isValid()) { console.error(`${input}: not a valid KTX2`); file.close(); file.delete(); continue }
  file.startTranscoding()

  // The mip closest to the size we want, so the decode is small too.
  const levels = file.getLevels()
  let level = 0
  for (let i = 0; i < levels; i++) {
    const info = file.getImageLevelInfo(i, 0, 0)
    if (info.origWidth <= want) { level = i; break }
    level = i
  }
  const info = file.getImageLevelInfo(level, 0, 0)
  const w = info.origWidth, h = info.origHeight
  const size = file.getImageTranscodedSizeInBytes(level, 0, 0, RGBA32)
  const dst = new Uint8Array(size)
  if (!file.transcodeImage(dst, level, 0, 0, RGBA32, 0, -1, -1)) {
    console.error(`${input}: transcode failed`); file.close(); file.delete(); continue
  }
  file.close(); file.delete()

  const out = path.join(outDir, path.basename(input).replace(/\.v\d+\.ktx2$/, '').replace(/\.ktx2$/, '') + '.png')
  const buf = png(dst, w, h)
  writeFileSync(out, buf)
  console.log(`${path.basename(out).padEnd(32)} ${w}×${h}  ${(buf.length / 1024).toFixed(1)}KB`)
}
