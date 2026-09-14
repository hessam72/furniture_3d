#!/usr/bin/env node
/**
 * PNG → supercompressed `.ktx2`, without KTX-Software installed.
 *
 *   node scripts/ktx2-encode.mjs public/textures/covers out/*.png
 *   VERSION=v2 QUALITY=220 node scripts/ktx2-encode.mjs public/textures/covers a.png
 *   UASTC=1 node scripts/ktx2-encode.mjs public/textures/covers normal.png
 *
 * `scripts/optimize-texture.sh` is still the canonical path and should be used
 * wherever the `ktx` CLI exists — it is the reference encoder, it resizes, and
 * it is what the asset pipeline documents. This is the fallback for machines
 * that cannot have it: KTX-Software ships as a GitHub release and a `.pkg`, and
 * there are build environments that can reach neither.
 *
 * The encoder here is the same Basis Universal wasm the browser already
 * transcodes with, taken from `@loaders.gl/textures`, which bundles BinomialLLC's
 * `basis_encoder.wasm` alongside the transcoder. Same codec, same ETC1S, same
 * output container — `ktx info` cannot tell the two apart, which is the point.
 *
 * Install it on demand; it is not a dependency of the app and must not become
 * one, since nothing at runtime encodes anything:
 *
 *   npm i --no-save @loaders.gl/textures
 *
 * Profiles match optimize-texture.sh, and for the same reasons:
 *   (default)  base colour — sRGB, ETC1S. Half the bytes of UASTC, and on
 *              colour the difference does not survive being looked at.
 *   UASTC=1    normal maps — linear, UASTC. ETC1S quantises to a shared
 *              palette: fine for colour, visibly wrong for a packed vector.
 *
 * Mipmaps are generated. Without them the GPU samples a 1024² texture across a
 * swatch band forty pixels tall and the weave aliases into a shimmer the moment
 * anything moves — and the mip chain is only a third more memory.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import path from 'node:path'

const QUALITY = Number(process.env.QUALITY) || 200
const UASTC = process.env.UASTC === '1'
const VERSION = process.env.VERSION || 'v1'

/* ------------------------------------------------------------------ png --- */

/** Minimal PNG reader: 8-bit RGB/RGBA, non-interlaced — what make-fabric writes. */
function readPng(file) {
  const d = readFileSync(file)
  let pos = 8
  let w = 0
  let h = 0
  let colour = 0
  const idat = []
  while (pos < d.length) {
    const len = d.readUInt32BE(pos)
    const type = d.toString('ascii', pos + 4, pos + 8)
    const body = d.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = body.readUInt32BE(0)
      h = body.readUInt32BE(4)
      if (body[8] !== 8) throw new Error(`${file}: only 8-bit PNGs`)
      if (body[12] !== 0) throw new Error(`${file}: interlaced PNGs not supported`)
      colour = body[9]
    } else if (type === 'IDAT') idat.push(body)
    pos += 12 + len
  }
  const ch = colour === 6 ? 4 : colour === 2 ? 3 : 0
  if (!ch) throw new Error(`${file}: only RGB and RGBA PNGs`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  let i = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[i++]
    const line = Buffer.from(raw.subarray(i, i + stride))
    i += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0
      const b = prev[x]
      const c = x >= ch ? prev[x - ch] : 0
      if (filter === 1) line[x] = (line[x] + a) & 255
      else if (filter === 2) line[x] = (line[x] + b) & 255
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
    }
    line.copy(out, y * stride)
    prev = line
  }

  // The encoder wants RGBA.
  if (ch === 4) return { width: w, height: h, data: new Uint8Array(out) }
  const rgba = new Uint8Array(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    rgba[p * 4] = out[p * 3]
    rgba[p * 4 + 1] = out[p * 3 + 1]
    rgba[p * 4 + 2] = out[p * 3 + 2]
    rgba[p * 4 + 3] = 255
  }
  return { width: w, height: h, data: rgba }
}

/* -------------------------------------------------------------- encoder --- */

/**
 * Load the emscripten glue as CommonJS, by hand.
 *
 * Two things make the obvious `require` fail. `@loaders.gl/textures` is typed
 * `"module"`, so node treats `basis_encoder.js` as ESM and the glue's
 * `module.exports = BASIS` branch never runs — `require` hands back an empty
 * namespace. And the glue locates its own `.wasm` relative to the process cwd,
 * which is wrong from anywhere but that directory.
 *
 * Evaluating the source with a CJS shim fixes the first and lets the wasm be
 * handed over directly, which fixes the second without a `chdir`.
 */
function loadEncoderSource() {
  const candidates = []
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    candidates.push(path.join(dir, 'node_modules/@loaders.gl/textures/dist/libs/basis_encoder.js'))
    if (dir === path.dirname(dir)) break
  }
  for (const js of candidates) {
    try {
      return { src: readFileSync(js, 'utf8'), wasm: readFileSync(js.replace(/\.js$/, '.wasm')), js }
    } catch {
      /* next candidate */
    }
  }
  console.error(
    'missing: @loaders.gl/textures (it bundles the Basis encoder wasm)\n' +
      '  npm i --no-save @loaders.gl/textures\n' +
      'Or use scripts/optimize-texture.sh, which is the canonical path where `ktx` exists.'
  )
  return process.exit(2)
}

const { src, wasm, js } = loadEncoderSource()
const shim = { exports: {} }
new Function('module', 'exports', '__filename', '__dirname', src)(
  shim,
  shim.exports,
  js,
  path.dirname(js)
)
const Module = await shim.exports({ wasmBinary: wasm })
Module.initializeBasis()

/* ----------------------------------------------------------------- main --- */

const [, , outDir, ...inputs] = process.argv
if (!outDir || !inputs.length) {
  console.error('usage: [QUALITY=200] [UASTC=1] [VERSION=v1] node scripts/ktx2-encode.mjs <out-dir> <in.png ...>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

for (const input of inputs) {
  const image = readPng(input)
  const encoder = new Module.BasisEncoder()
  try {
    encoder.setCreateKTX2File(true)
    encoder.setKTX2UASTCSupercompression(UASTC)
    // Colour maps are authored and sampled in sRGB; a normal map is a vector
    // and must stay linear, or the transcode re-curves the components.
    encoder.setKTX2SRGBTransferFunc(!UASTC)
    encoder.setPerceptual(!UASTC)
    encoder.setMipSRGB(!UASTC)
    encoder.setSliceSourceImage(0, image.data, image.width, image.height, false)
    encoder.setQualityLevel(QUALITY)
    encoder.setUASTC(UASTC)
    encoder.setMipGen(true)

    // Worst case is the uncompressed size; the encoder reports what it used.
    const buffer = new Uint8Array(image.width * image.height * 4)
    const bytes = encoder.encode(buffer)
    if (!bytes) throw new Error('encoder returned 0 bytes')

    const stem = path.basename(input).replace(/\.png$/i, '')
    const out = path.join(outDir, `${stem}.${VERSION}.ktx2`)
    writeFileSync(out, Buffer.from(buffer.subarray(0, bytes)))

    // The number that matters is not this one — a block-compressed texture is
    // ~1 byte a pixel in VRAM whatever it weighs here. @see glb-budget.mjs
    console.log(
      `${path.basename(out).padEnd(34)} ${image.width}×${image.height}  ` +
        `${(bytes / 1024).toFixed(0)}KB  ${UASTC ? 'UASTC' : 'ETC1S'}`
    )
  } finally {
    encoder.delete()
  }
}
