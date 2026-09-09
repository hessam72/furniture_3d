#!/usr/bin/env node
/**
 * What a .glb will cost the GPU, read straight off the file.
 *
 *   node scripts/glb-budget.mjs public/models/presentation/test/*.glb
 *   node scripts/glb-budget.mjs --json public/test-models/final-scene.glb
 *   node scripts/glb-budget.mjs --strict public/models/**\/*.glb   # exit 1 past budget
 *
 * The point is that file size is not the budget and never was. Every texture in
 * these models is `EXT_texture_webp`, and WebP is very good — a 4000×4000 map
 * compresses to 850KB. The driver then unpacks it to 64MB, plus a third again
 * for mips. So a 19.5MB room GLB arrives carrying 740MB of texture memory, and
 * nothing in the download, the parse or the console says so.
 *
 * Standalone by design: this runs from a shell against files that are not in
 * git (`public/models` is gitignored and copied to the server out of band), so
 * it cannot depend on the Next build, on TypeScript, or on `three`. It reads
 * the GLB container and the image headers itself. The runtime counterpart is
 * `lib/three/textureBudget.ts`, which prices the same textures once they are
 * loaded; the two use the same formula and should agree.
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const MB = 1048576

/** Budgets. Deliberately the same numbers as lib/three/textureBudget.ts. */
const MAX_EDGE = 1024
const VRAM_WARN = 96 * MB
const VRAM_MAX = 256 * MB
/** Quick Look writes geometry as decimal text into an uncompressed zip. */
const TRIANGLE_WARN = 150_000

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

function readGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB')

  let offset = 12
  let json = null
  let bin = null
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (type === CHUNK_JSON) json = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))
    else if (type === CHUNK_BIN) bin = buffer.subarray(start, start + length)
    offset = start + length
  }
  if (!json) throw new Error('no JSON chunk')
  return { json, bin }
}

/**
 * Image dimensions from the container header alone.
 *
 * No decoding: the whole point is to read the number without paying for the
 * pixels. WebP is the one that needs real care — the dimensions live in a
 * different place in each of its three chunk layouts, and getting VP8L's
 * bit-packing wrong silently reports every texture as 0×0, which reads as
 * "nothing to fix here".
 */
function imageSize(bytes) {
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i += 1; continue }
      const marker = bytes[i + 1]
      // SOF0-SOF15, minus the four that are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) }
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
      i += 2 + bytes.readUInt16BE(i + 2)
    }
    return { format: 'jpeg', width: 0, height: 0 }
  }

  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16)
    if (kind === 'VP8X') {
      return { format: 'webp', width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 }
    }
    if (kind === 'VP8 ') {
      return { format: 'webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
    }
    if (kind === 'VP8L') {
      const bits = bytes.readUInt32LE(21)
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }

  // Already compressed for the GPU — the file *is* the resident form.
  if (bytes.length >= 12 && bytes[0] === 0xab && bytes.toString('ascii', 1, 7) === 'KTX 20') {
    return { format: 'ktx2', width: bytes.readUInt32LE(20), height: bytes.readUInt32LE(24) }
  }

  return { format: '?', width: 0, height: 0 }
}

function inspect(json, bin) {
  let triangles = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4) continue
      const accessor = primitive.indices ?? primitive.attributes?.POSITION
      if (accessor === undefined) continue
      triangles += Math.floor(json.accessors[accessor].count / 3)
    }
  }

  const images = (json.images ?? []).map((image, index) => {
    const view = json.bufferViews?.[image.bufferView]
    if (!view || !bin) return { index, name: image.name ?? '', format: 'external', width: 0, height: 0, fileBytes: 0 }
    const start = view.byteOffset ?? 0
    const slice = bin.subarray(start, start + view.byteLength)
    return { index, name: image.name ?? '', fileBytes: view.byteLength, ...imageSize(slice) }
  })

  return { triangles, images }
}

/** RGBA8 plus the mip chain, which converges on a third again. */
const residentBytes = (image) =>
  image.format === 'ktx2' ? image.fileBytes : Math.round(image.width * image.height * 4 * (4 / 3))

async function report(path) {
  const buffer = await readFile(path)
  const { json, bin } = readGlb(buffer)
  const { triangles, images } = inspect(json, bin)

  const vram = images.reduce((total, image) => total + residentBytes(image), 0)
  const oversized = images.filter((i) => Math.max(i.width, i.height) > MAX_EDGE)
  const mb = (bytes) => `${(bytes / MB).toFixed(bytes < 10 * MB ? 2 : 0)}MB`

  return {
    path,
    fileBytes: buffer.byteLength,
    triangles,
    textureVram: vram,
    images,
    oversized,
    over: vram > VRAM_MAX || triangles > TRIANGLE_WARN || oversized.length > 0,
    print() {
      console.log(`\n${basename(path)} — ${mb(buffer.byteLength)} on disk`)
      console.log(`  extensions   ${(json.extensionsUsed ?? []).join(', ') || 'none'}`)
      console.log(`  meshes ${json.meshes?.length ?? 0} · materials ${json.materials?.length ?? 0} · textures ${images.length}`)
      console.log(`  triangles    ${triangles.toLocaleString()}${triangles > TRIANGLE_WARN ? `   ⚠ over ${TRIANGLE_WARN.toLocaleString()} for AR` : ''}`)
      console.log(
        `  TEXTURE VRAM ${mb(vram)}` +
          (vram > VRAM_MAX ? '   ✖ over budget' : vram > VRAM_WARN ? '   ⚠ heavy for a phone' : '   ✔')
      )
      if (images.length) {
        console.log('  largest maps:')
        for (const image of [...images].sort((a, b) => residentBytes(b) - residentBytes(a)).slice(0, 6)) {
          const flag = Math.max(image.width, image.height) > MAX_EDGE ? ' ⚠' : ''
          console.log(
            `    ${String(image.width).padStart(5)}×${String(image.height).padEnd(5)} ${image.format.padEnd(5)}` +
              ` ${mb(image.fileBytes).padStart(7)} file → ${mb(residentBytes(image)).padStart(7)} VRAM${flag}  ${image.name.slice(0, 34)}`
          )
        }
      }
      if (oversized.length) {
        console.log(`  ⚠ ${oversized.length} map(s) exceed ${MAX_EDGE}px — run scripts/optimize-glb.sh`)
      }
    },
  }
}

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const strict = args.includes('--strict')
const paths = args.filter((arg) => !arg.startsWith('--'))

if (!paths.length) {
  console.error('usage: node scripts/glb-budget.mjs [--json] [--strict] <file.glb ...>')
  process.exit(2)
}

const results = []
for (const path of paths) {
  try {
    results.push(await report(path))
  } catch (error) {
    console.error(`${path}: ${error.message}`)
    process.exitCode = 2
  }
}

if (asJson) {
  console.log(
    JSON.stringify(
      results.map(({ path, fileBytes, triangles, textureVram, over }) => ({ path, fileBytes, triangles, textureVram, over })),
      null,
      2
    )
  )
} else {
  results.forEach((result) => result.print())
  if (results.length > 1) {
    const total = results.reduce((sum, r) => sum + r.textureVram, 0)
    console.log(`\nAll ${results.length} files together: ${(total / MB).toFixed(0)}MB of texture VRAM`)
  }
  console.log('')
}

if (strict && results.some((result) => result.over)) process.exitCode = 1
