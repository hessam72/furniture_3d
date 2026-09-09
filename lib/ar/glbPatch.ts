/**
 * Recolour a GLB by editing its JSON chunk, leaving every byte of geometry and
 * every texture exactly where it was.
 *
 * The alternative — the one this replaces — was `GLTFExporter.parseAsync`. That
 * path is ruinous here for a reason specific to these assets: the source files
 * are Draco-compressed, `GLTFLoader` decodes them to raw Float32/Uint16 on the
 * way in, and the exporter writes that back out *uncompressed* while re-encoding
 * every texture through a canvas. A 5MB file came back as the 40MB blob the
 * console was warning about, and on iOS that blob then had to survive being
 * re-parsed by model-viewer and turned into a USDZ.
 *
 * But nothing the configurator does actually touches geometry or textures. The
 * whole of it — `applyFirstCoat` in hooks/useZonePaint.ts — is four material
 * *factors*: base colour, metalness, roughness, clearcoat. Those are numbers in
 * the JSON chunk. Rewrite the JSON, copy the BIN chunk verbatim, and the output
 * is the input's size to within a few hundred bytes: Draco stays Draco, KTX2
 * stays KTX2, and the cost is a JSON round-trip.
 *
 * No `three` import, deliberately: the same module runs in the browser and in
 * app/api/ar/[key]/model.glb/route.ts, so the file the server builds and the
 * file the client would build are the same bytes.
 */

import type { PresentationZone } from '@/lib/product/presentation'
import type { ZonePaintConfig } from '@/stores/presentationStore'

const MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'

/** What a zone's paint becomes once it is expressed as glTF material factors. */
export interface MaterialEdit {
  /** Linear-sRGB, the space `baseColorFactor` is defined in. */
  color?: [number, number, number]
  metalness?: number
  roughness?: number
  clearcoat?: number
}

interface GlbChunk {
  type: number
  /** A view onto the caller's buffer — not a copy. */
  data: Uint8Array
}

/**
 * sRGB → linear-sRGB, the same transfer function `THREE.Color.set()` applies
 * with `ColorManagement` on.
 *
 * It has to be done here rather than read off a `THREE.Color`, because this
 * module runs on the server too. Getting it wrong is not subtle — an untransformed
 * hex lands visibly pale in AR against the same colour on the page.
 */
export function hexToLinearRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim()
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned
  const int = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(int)) return [1, 1, 1]

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return [
    toLinear(((int >> 16) & 255) / 255),
    toLinear(((int >> 8) & 255) / 255),
    toLinear((int & 255) / 255),
  ]
}

function readChunks(bytes: ArrayBuffer): GlbChunk[] {
  const view = new DataView(bytes)
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== MAGIC) {
    throw new Error('not a GLB: bad magic')
  }
  if (view.getUint32(4, true) !== 2) throw new Error('unsupported GLB version')

  const chunks: GlbChunk[] = []
  let offset = 12
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + length > bytes.byteLength) throw new Error('truncated GLB chunk')
    chunks.push({ type, data: new Uint8Array(bytes, start, length) })
    // Chunks are 4-byte aligned; a well-formed file is already padded, but a
    // hand-made one may not be, so step over the padding rather than assume it.
    offset = start + length + ((4 - (length % 4)) % 4)
  }
  if (!chunks.length || chunks[0].type !== CHUNK_JSON) throw new Error('GLB has no JSON chunk')
  return chunks
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The GLB's JSON chunk, parsed. Read-only use — patching goes through
 *  `patchGlbMaterials`, which re-serialises the whole container. */
export function readGlbJson(bytes: ArrayBuffer): any {
  const json = readChunks(bytes)[0]
  return JSON.parse(new TextDecoder().decode(json.data))
}

function applyEdit(material: any, edit: MaterialEdit) {
  // Neither of these is driven by a base-colour factor, and the viewer does not
  // paint them either — a spec-gloss or unlit material is left as authored
  // rather than silently ignored in one place and honoured in the other.
  const ext = material.extensions
  if (ext?.KHR_materials_unlit || ext?.KHR_materials_pbrSpecularGlossiness) return false

  const pbr = (material.pbrMetallicRoughness ??= {})
  if (edit.color) {
    // Alpha is the asset's business — a glass or cut-out material must not go
    // opaque because a swatch was picked.
    const alpha = Array.isArray(pbr.baseColorFactor) ? pbr.baseColorFactor[3] ?? 1 : 1
    pbr.baseColorFactor = [...edit.color, alpha]
  }
  if (edit.metalness !== undefined) pbr.metallicFactor = edit.metalness
  if (edit.roughness !== undefined) pbr.roughnessFactor = edit.roughness
  return true
}

/**
 * Rewrite the named materials' factors and re-emit the container.
 *
 * Everything after the JSON chunk — the BIN chunk, and any extra chunk a tool
 * may have appended — is copied through untouched.
 */
export function patchGlbMaterials(bytes: ArrayBuffer, edits: Map<number, MaterialEdit>): ArrayBuffer {
  const chunks = readChunks(bytes)
  const json = JSON.parse(new TextDecoder().decode(chunks[0].data))
  const materials: any[] = json.materials ?? []

  let clearcoatAdded = false
  edits.forEach((edit, index) => {
    const material = materials[index]
    if (!material) return
    if (!applyEdit(material, edit)) return

    if (edit.clearcoat !== undefined) {
      const ext = (material.extensions ??= {})
      // Only introduce the extension where there is a coat to describe: adding
      // `clearcoatFactor: 0` to every material would grow the JSON and change
      // nothing a renderer can see.
      if (ext.KHR_materials_clearcoat || edit.clearcoat > 0) {
        ;(ext.KHR_materials_clearcoat ??= {}).clearcoatFactor = edit.clearcoat
        clearcoatAdded = true
      }
    }
  })

  if (clearcoatAdded) {
    const used: string[] = (json.extensionsUsed ??= [])
    if (!used.includes('KHR_materials_clearcoat')) used.push('KHR_materials_clearcoat')
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4

  let total = 12 + 8 + jsonBytes.byteLength + jsonPadding
  for (let i = 1; i < chunks.length; i++) {
    total += 8 + chunks[i].data.byteLength + ((4 - (chunks[i].data.byteLength % 4)) % 4)
  }

  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const write = new Uint8Array(out)

  view.setUint32(0, MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)

  let offset = 12
  view.setUint32(offset, jsonBytes.byteLength + jsonPadding, true)
  view.setUint32(offset + 4, CHUNK_JSON, true)
  write.set(jsonBytes, offset + 8)
  // JSON pads with spaces, binary with zeroes — the spec is explicit, and a
  // zero-padded JSON chunk trips strict loaders.
  write.fill(0x20, offset + 8 + jsonBytes.byteLength, offset + 8 + jsonBytes.byteLength + jsonPadding)
  offset += 8 + jsonBytes.byteLength + jsonPadding

  for (let i = 1; i < chunks.length; i++) {
    const { type, data } = chunks[i]
    const padding = (4 - (data.byteLength % 4)) % 4
    view.setUint32(offset, data.byteLength + padding, true)
    view.setUint32(offset + 4, type, true)
    write.set(data, offset + 8)
    offset += 8 + data.byteLength + padding
  }

  return out
}

/**
 * Which glTF material index wears which zone's paint.
 *
 * This is `collectZoneTargets` + `applyFirstCoat` (lib/three/layerMaterials.ts,
 * hooks/useZonePaint.ts) restated against the raw JSON. It has to agree with
 * them exactly or AR shows a colour the page never displayed.
 *
 * The mesh-name `match` rule those two support is deliberately not implemented:
 * the plain viewer never passes one — it paints one file as one zone — and
 * guessing at it here would be a second, silently diverging copy of a rule that
 * only the layered page uses.
 *
 * `extras` is where the override lives, because that is what `GLTFLoader` copies
 * into `userData`, which is what `zoneOverride` reads.
 */
export function zoneEditsFromJson(
  json: any,
  zone: PresentationZone,
  paint: ZonePaintConfig
): Map<number, MaterialEdit> {
  const editFor = (z: PresentationZone): MaterialEdit | null => {
    const p = paint[z]
    if (!p) return null
    return {
      color: hexToLinearRgb(p.color),
      metalness: p.metalness,
      roughness: p.roughness,
      clearcoat: p.clearcoat,
    }
  }

  const readZone = (extras: any): PresentationZone | null => {
    const value = extras?.userdata?.zone ?? extras?.zone ?? extras?.userdata?.paintZone ?? extras?.paintZone
    return value === 'wood' || value === 'cover' || value === 'cushion' ? value : null
  }

  // A node's extras land in the same `userData` as its mesh's, so an override
  // tagged on either in Blender has to be honoured.
  const byMesh = new Map<number, PresentationZone>()
  ;(json.nodes ?? []).forEach((node: any) => {
    const override = readZone(node?.extras)
    if (override != null && typeof node.mesh === 'number') byMesh.set(node.mesh, override)
  })

  const edits = new Map<number, MaterialEdit>()
  ;(json.meshes ?? []).forEach((mesh: any, meshIndex: number) => {
    const override = readZone(mesh?.extras) ?? byMesh.get(meshIndex) ?? null
    const edit = editFor(override ?? zone)
    if (!edit) return
    ;(mesh.primitives ?? []).forEach((primitive: any) => {
      // An untextured primitive with no material draws in glTF's default white;
      // there is nothing to recolour and nothing the viewer paints either.
      if (typeof primitive.material === 'number') edits.set(primitive.material, edit)
    })
  })

  return edits
}
