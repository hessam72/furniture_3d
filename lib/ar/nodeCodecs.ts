/**
 * The two wasm decoders and the two image encoders the USDZ builder needs,
 * running under Node.
 *
 * Both decoders already ship in `public/` for the browser — the Basis
 * transcoder the KTX2 loader uses, and the Draco decoder the GLTF loader uses.
 * Reusing those exact binaries rather than adding npm copies is deliberate:
 * a server that transcodes with a different build than the phone renders with
 * is a class of bug nobody ever finds.
 *
 * ## Why they need loading by hand
 *
 * Both are emscripten glue written for a browser, and `require()` will not
 * take them as they are:
 *
 *  - the Basis glue only assigns `module.exports` when it sees CommonJS, and
 *    `@loaders.gl`-style packages mark themselves `"type": "module"`, so Node
 *    treats the file as ESM and hands back an empty namespace;
 *  - the Draco glue contains both `require()` and a top-level `await`, which
 *    makes Node refuse to guess a module format at all;
 *  - and both resolve their `.wasm` relative to the process working directory,
 *    which is wrong from anywhere but the directory they sit in.
 *
 * Evaluating the source with a CommonJS shim fixes the format problem, and
 * handing the wasm over as `wasmBinary` fixes the path problem without a
 * `chdir` — which matters here, because this runs inside a request handler and
 * a process-wide `chdir` is not something a request may do.
 */

import { readFile } from 'node:fs/promises'
import * as nodeFs from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import jpeg from 'jpeg-js'

/**
 * The `require` the emscripten glue gets, which is deliberately not a real one.
 *
 * The Draco wrapper calls `require('fs')` and `require('path')` when it decides
 * it is running under Node. Handing it the bundler's `require` does not work:
 * inside Next's server build that is webpack's shim, it has never heard of
 * `fs`, and the failure surfaces as `MODULE_NOT_FOUND` from a file that never
 * mentions a module — which is a confusing half-hour if you have not seen it
 * before. `createRequire(import.meta.url)` is no better, since webpack rewrites
 * that too.
 *
 * So: answer the two questions it actually asks, from static imports the
 * bundler can see, and throw plainly on anything else rather than returning
 * undefined and failing somewhere further in.
 */
const glueRequire = (id: string): unknown => {
  if (id === 'fs') return nodeFs
  if (id === 'path') return path
  throw new Error(`wasm glue asked for an unexpected module: ${id}`)
}
const PUBLIC = () => path.join(process.cwd(), 'public')

/** Raw pixels, the currency between every function here. */
export interface Rgba {
  width: number
  height: number
  data: Uint8Array
}

/**
 * Evaluate emscripten glue as CommonJS and instantiate it with its own wasm.
 *
 * `require` and `__dirname` are passed in because the Draco glue reaches for
 * both; the Basis glue ignores them.
 */
async function loadEmscripten(jsPath: string, wasmPath: string): Promise<any> {
  const [src, wasmBinary] = await Promise.all([readFile(jsPath, 'utf8'), readFile(wasmPath)])
  const shim = { exports: {} as any }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__dirname', src)(
    shim,
    shim.exports,
    glueRequire,
    path.dirname(jsPath)
  )
  const factory = shim.exports
  if (typeof factory !== 'function') throw new Error(`${jsPath}: no module factory`)
  return await factory({ wasmBinary })
}

/* ------------------------------------------------------------------ ktx2 --- */

let basisPromise: Promise<any> | null = null

function basis(): Promise<any> {
  // One instance per process. Instantiating the wasm is the expensive part and
  // it is entirely reusable; the per-file state lives in `KTX2File` below.
  basisPromise ??= loadEmscripten(
    path.join(PUBLIC(), 'basis', 'basis_transcoder.js'),
    path.join(PUBLIC(), 'basis', 'basis_transcoder.wasm')
  ).then((module) => {
    module.initializeBasis()
    return module
  })
  return basisPromise
}

/**
 * A `.ktx2` to raw pixels, at or under `maxEdge`.
 *
 * Transcoded to `RGBA32` rather than to a block format, because the destination
 * is a JPEG or a PNG inside a USDZ — Quick Look reads neither ASTC nor ETC2, so
 * there is nothing to preserve by staying compressed.
 *
 * `maxEdge` is served from the **mip chain**, not by resampling: the file
 * already carries every power-of-two reduction, so asking for the level at or
 * under the cap decodes less and costs nothing to scale. That is also why the
 * cap has to be a real cap rather than a hint — a 1024² texture decodes to 4MB
 * of RGBA and a USDZ with a dozen of them is what Quick Look refuses to open.
 */
export async function ktx2ToRgba(bytes: Uint8Array, maxEdge = Infinity): Promise<Rgba | null> {
  const module = await basis()
  const file = new module.KTX2File(bytes)
  try {
    if (!file.isValid() || !file.startTranscoding()) return null

    const levels = file.getLevels()
    let level = 0
    for (let i = 0; i < levels; i++) {
      level = i
      if (file.getImageLevelInfo(i, 0, 0).origWidth <= maxEdge) break
    }

    const info = file.getImageLevelInfo(level, 0, 0)
    const format = module.transcoder_texture_format.cTFRGBA32.value
    const size = file.getImageTranscodedSizeInBytes(level, 0, 0, format)
    const data = new Uint8Array(size)
    if (!file.transcodeImage(data, level, 0, 0, format, 0, -1, -1)) return null

    return { width: info.origWidth, height: info.origHeight, data }
  } finally {
    file.close()
    file.delete()
  }
}

/* ----------------------------------------------------------------- draco --- */

let dracoPromise: Promise<any> | null = null

function draco(): Promise<any> {
  dracoPromise ??= loadEmscripten(
    path.join(PUBLIC(), 'draco', 'draco_wasm_wrapper.js'),
    path.join(PUBLIC(), 'draco', 'draco_decoder.wasm')
  )
  return dracoPromise
}

/** One decoded primitive: de-indexed attributes plus the index list. */
export interface DracoMesh {
  indices: Uint32Array
  attributes: Record<string, { array: Float32Array; itemSize: number }>
}

/**
 * A Draco-compressed primitive back to plain attribute arrays.
 *
 * Everything comes out as `Float32Array` regardless of how it was quantised:
 * `GetAttributeFloatForAllPoints` is the dequantising read, and USD wants
 * floats anyway. Positions and normals would be wrong read any other way —
 * Draco stores them as integers in a quantisation grid, and the grid is what
 * this call applies.
 */
export async function decodeDraco(
  bytes: Uint8Array,
  attributeIds: Record<string, number>
): Promise<DracoMesh> {
  const module = await draco()
  const buffer = new module.DecoderBuffer()
  const decoder = new module.Decoder()
  const mesh = new module.Mesh()
  try {
    buffer.Init(bytes, bytes.length)
    const status = decoder.DecodeBufferToMesh(buffer, mesh)
    if (!status.ok()) throw new Error(`draco: ${status.error_msg()}`)

    const faces = mesh.num_faces()
    const indices = new Uint32Array(faces * 3)
    const face = new module.DracoInt32Array()
    try {
      for (let i = 0; i < faces; i++) {
        decoder.GetFaceFromMesh(mesh, i, face)
        indices[i * 3] = face.GetValue(0)
        indices[i * 3 + 1] = face.GetValue(1)
        indices[i * 3 + 2] = face.GetValue(2)
      }
    } finally {
      module.destroy(face)
    }

    const attributes: DracoMesh['attributes'] = {}
    const points = mesh.num_points()
    for (const [name, id] of Object.entries(attributeIds)) {
      const attribute = decoder.GetAttributeByUniqueId(mesh, id)
      if (!attribute) continue
      const itemSize = attribute.num_components()
      const values = new module.DracoFloat32Array()
      try {
        decoder.GetAttributeFloatForAllPoints(mesh, attribute, values)
        const array = new Float32Array(points * itemSize)
        for (let i = 0; i < array.length; i++) array[i] = values.GetValue(i)
        attributes[name] = { array, itemSize }
      } finally {
        module.destroy(values)
      }
    }

    return { indices, attributes }
  } finally {
    module.destroy(mesh)
    module.destroy(decoder)
    module.destroy(buffer)
  }
}

/* ---------------------------------------------------------------- images --- */

/**
 * JPEG, for everything whose pixels are a colour.
 *
 * The format choice is not a preference — **USDZ supports PNG and JPEG and
 * nothing else**. WebP is the obvious candidate on size and cannot be used:
 * Quick Look's image reader does not know it, and Scene Viewer does not either,
 * which is what `AR_HAZARDS.EXT_texture_webp` has always said.
 *
 * Between the two that are allowed, JPEG is right for a photograph of cloth and
 * is the difference between a 25MB USDZ and a 5MB one — which on a phone, over
 * mobile data, before Quick Look will open anything, is most of whether the
 * feature works at all.
 */
export function encodeJpeg(image: Rgba, quality = 82): Uint8Array {
  const encoded = jpeg.encode(
    { data: Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), width: image.width, height: image.height },
    quality
  )
  return new Uint8Array(encoded.data)
}

/**
 * PNG, for normal maps only.
 *
 * A normal map is a vector packed into three channels, and JPEG's chroma
 * subsampling and DCT ringing move the vector — the lighting swims exactly the
 * way it does when a normal map is encoded as ETC1S instead of UASTC, which is
 * the same trade this project's texture pipeline already makes for the same
 * reason.
 *
 * Written with `zlib` alone, like every other PNG in this repo: there is no
 * ImageMagick and no `sharp` on the machines this runs on, and the encoder is
 * forty lines.
 */
export function encodePng(image: Rgba): Uint8Array {
  const { width: w, height: h, data } = image
  const raw = Buffer.alloc(h * (1 + w * 3))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4
      const d = y * (1 + w * 3) + 1 + x * 3
      raw[d] = data[s]
      raw[d + 1] = data[s + 1]
      raw[d + 2] = data[s + 2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // truecolour
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(raw, { level: 6 })),
      pngChunk('IEND', Buffer.alloc(0)),
    ])
  )
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
