#!/usr/bin/env node
/**
 * EXR -> Radiance .hdr, with an optional downsample.
 *
 *   node scripts/exr-to-hdr.mjs in.exr out.hdr 512
 *
 * Written for one measured problem. `/hdr/200_hdrmaps_com_free_1kk.exr` was
 * 5,687,982 bytes of 1000x500 **FLOAT32 RGBA**, loaded by /product/[id]/simple
 * and /showroom both — against ~1.8MB for every other environment here. And its
 * maximum value across all three channels is **1.00**: there is no high dynamic
 * range in it at all. It is an LDR image stored at 16 bytes a pixel, decoded on
 * the main thread into a float buffer before PMREM has even started.
 *
 * At 512x256 in RGBE it is 524KB and loses nothing — the environment is used
 * for lighting (`background={false}`), and PMREM blurs it past that resolution
 * anyway.
 *
 * Handles scanline EXRs with ZIP, ZIPS or no compression, HALF or FLOAT
 * channels. PIZ (which `main_hdr.exr` uses) is not implemented — that file is
 * 1024x512 half-float and already reasonable.
 *
 * Standalone, like scripts/glb-budget.mjs, and for the same reason: it runs
 * from a shell against assets, not from the Next build.
 */

// Minimal EXR (scanline, ZIP/ZIPS/none, HALF or FLOAT) -> Radiance .hdr
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

function readHeader(b) {
  let o = 8 // magic + version
  const attrs = {}
  for (;;) {
    let e = b.indexOf(0, o); const name = b.toString('ascii', o, e); o = e + 1
    if (!name) break
    e = b.indexOf(0, o); const type = b.toString('ascii', o, e); o = e + 1
    const size = b.readUInt32LE(o); o += 4
    attrs[name] = { type, data: b.subarray(o, o + size) }; o += size
  }
  return { attrs, dataStart: o }
}

function channels(attr) {
  const out = []; let o = 0
  for (;;) {
    const e = attr.indexOf(0, o); const name = attr.toString('ascii', o, e)
    if (!name) break
    o = e + 1
    out.push({ name, type: attr.readUInt32LE(o) }) // 0=UINT 1=HALF 2=FLOAT
    o += 16
  }
  return out
}

const half = (u) => {
  const s = (u >> 15) & 1, e = (u >> 10) & 0x1f, f = u & 0x3ff
  if (!e) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024)
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity)
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024)
}

// EXR's ZIP blocks are delta-predicted then byte-interleaved.
function unpredict(src) {
  for (let i = 1; i < src.length; i++) src[i] = (src[i - 1] + src[i] - 128) & 0xff
  const out = Buffer.allocUnsafe(src.length)
  const half2 = Math.floor((src.length + 1) / 2)
  let t1 = 0, t2 = half2, s = 0
  while (s < src.length) { out[s++] = src[t1++]; if (s < src.length) out[s++] = src[t2++] }
  return out
}

function decode(path) {
  const b = readFileSync(path)
  const { attrs, dataStart } = readHeader(b)
  const dw = attrs.dataWindow.data
  const x0 = dw.readInt32LE(0), y0 = dw.readInt32LE(4), x1 = dw.readInt32LE(8), y1 = dw.readInt32LE(12)
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const comp = attrs.compression.data[0] // 0 none, 2 ZIPS(1 row), 3 ZIP(16 rows)
  const rows = comp === 3 ? 16 : 1
  const chs = channels(attrs.channels.data).sort((a, c) => a.name.localeCompare(c.name)) // B,G,R
  const bpp = chs.reduce((n, c) => n + (c.type === 1 ? 2 : 4), 0)

  const idx = Object.fromEntries(chs.map((c, i) => [c.name, i]))
  const pix = new Float32Array(w * h * 3)
  const blocks = Math.ceil(h / rows)
  let o = dataStart + blocks * 8 // skip the offset table

  for (let bi = 0; bi < blocks; bi++) {
    const y = b.readInt32LE(o); o += 4
    const size = b.readUInt32LE(o); o += 4
    let data = b.subarray(o, o + size); o += size
    const n = Math.min(rows, y1 - y + 1)
    if (comp !== 0 && size < n * w * bpp) data = unpredict(Buffer.from(inflateSync(data)))

    let p = 0
    for (let r = 0; r < n; r++) {
      const row = y - y0 + r
      for (const c of chs) {
        const wide = c.type !== 1
        for (let x = 0; x < w; x++) {
          const v = wide ? data.readFloatLE(p + x * 4) : half(data.readUInt16LE(p + x * 2))
          const ch = c.name === 'R' ? 0 : c.name === 'G' ? 1 : c.name === 'B' ? 2 : -1
          if (ch >= 0) pix[(row * w + x) * 3 + ch] = v
        }
        p += w * (wide ? 4 : 2)
      }
    }
  }
  return { w, h, pix }
}

/** Box-filter down to a target width, in linear light — which is the only place
 *  averaging an HDR is correct. */
function resize(src, w, h, tw) {
  const th = Math.round((h * tw) / w)
  const out = new Float32Array(tw * th * 3)
  const sx = w / tw, sy = h / th
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let r = 0, g = 0, bl = 0, n = 0
      for (let j = Math.floor(y * sy); j < Math.min(h, Math.ceil((y + 1) * sy)); j++)
        for (let i = Math.floor(x * sx); i < Math.min(w, Math.ceil((x + 1) * sx)); i++) {
          const k = (j * w + i) * 3
          r += src[k]; g += src[k + 1]; bl += src[k + 2]; n++
        }
      const k = (y * tw + x) * 3
      out[k] = r / n; out[k + 1] = g / n; out[k + 2] = bl / n
    }
  }
  return { w: tw, h: th, pix: out }
}

/** Radiance RGBE, flat scanlines. 4 bytes a pixel, and every loader reads it. */
function writeHdr(path, { w, h, pix }) {
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'ascii')
  const body = Buffer.allocUnsafe(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const r = pix[i * 3], g = pix[i * 3 + 1], b = pix[i * 3 + 2]
    const m = Math.max(r, g, b)
    if (m < 1e-32) { body.writeUInt32BE(0, i * 4); continue }
    const e = Math.ceil(Math.log2(m))
    const s = 256 / Math.pow(2, e)
    body[i * 4] = Math.min(255, r * s); body[i * 4 + 1] = Math.min(255, g * s)
    body[i * 4 + 2] = Math.min(255, b * s); body[i * 4 + 3] = e + 128
  }
  writeFileSync(path, Buffer.concat([head, body]))
}

const [src, dst, width] = process.argv.slice(2)
const img = decode(src)
console.log(`in  ${img.w}x${img.h}`)
const out = width ? resize(img.pix, img.w, img.h, Number(width)) : img
writeHdr(dst, out)
console.log(`out ${out.w}x${out.h} -> ${dst}`)
