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

import {
  isPresentationZoneName,
  type PresentationPart,
  type PresentationZone,
} from '@/lib/product/presentation'
import type { ZonePaintConfig } from '@/stores/presentationStore'

const MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const CHUNK_BIN = 0x004e4942 // 'BIN\0'

/** What a zone's paint becomes once it is expressed as glTF material factors. */
export interface MaterialEdit {
  /** Linear-sRGB, the space `baseColorFactor` is defined in. */
  color?: [number, number, number]
  metalness?: number
  roughness?: number
  clearcoat?: number
}

/** The glTF slots a swatch can reach in AR. Matches `SwatchSlot` on the page,
 *  minus `roughnessMap` — that one shares an image with metalness in glTF's
 *  packed `metallicRoughnessTexture`, so replacing it alone is not expressible. */
export type InjectableSlot = 'baseColorTexture' | 'normalTexture'

/**
 * A fabric to put into the served GLB, so the piece a customer places in their
 * room is the one they configured.
 *
 * Colours already travel — `editsFromZones` writes four numeric factors — but
 * an image is not a number, and naming a different one means adding it to the
 * file. @see patchGlbMaterials
 */
export interface InjectedMap {
  /**
   * Stable identity for these bytes — the manifest path they were read from.
   *
   * Load-bearing once more than one zone is dressed at a time, which is the
   * normal case: every fabric in the palette shares one normal map, and the
   * cushion and the couch may be wearing the same cloth. Appending it once per
   * zone would put three identical megabytes in a file a phone has to download.
   */
  source: string
  /** The `.ktx2` bytes. */
  bytes: Uint8Array
}

export interface TextureInjection {
  /**
   * Material indices to repoint, resolved from the swatch's material *names*.
   *
   * The page matches on `material.name` and this matches on index, which is two
   * rules over one asset and the obvious way for AR to end up dressing different
   * parts than the screen did. `materialIndicesByName` below is the shared
   * resolver; use it rather than a second walk.
   */
  materials: Set<number>
  /** The fabric, per slot. */
  maps: Partial<Record<InjectableSlot, InjectedMap>>
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

/** One primitive, and the zone the page would have dressed it in. */
interface PrimitiveClaim {
  node: number
  mesh: number
  primitive: number
  material: number
  zone: PresentationZone
}

/**
 * Every primitive in the file, with the zone it wears.
 *
 * The raw-JSON twin of `collectZoneTargets`, and it has to walk the node tree
 * for the same reason: a sofa GLB names the *group* — `fur-1`, `Cushion-3`,
 * `Struc-1` — and a match claims everything under it. A flat pass over
 * `json.meshes` cannot see that structure at all, because a mesh does not know
 * which node references it.
 *
 * Precedence matches the page exactly: `extras.zone` on the node or mesh, then a
 * part's `materials` rule, then the nearest named ancestor, then `fallback`.
 *
 * `extras` is where the override lives, because that is what `GLTFLoader` copies
 * into `userData`, which is what `zoneOverride` reads.
 */
function claimPrimitives(
  json: any,
  fallback: PresentationZone,
  parts?: PresentationPart[] | null
): PrimitiveClaim[] {
  const rules = parts ?? []
  const nodes: any[] = json.nodes ?? []
  const meshes: any[] = json.meshes ?? []
  const lower = (v: unknown) => String(v ?? '').toLowerCase()

  const readZone = (extras: any): PresentationZone | null => {
    const value = extras?.userdata?.zone ?? extras?.zone ?? extras?.userdata?.paintZone ?? extras?.paintZone
    return isPresentationZoneName(value) ? value : null
  }
  const partForName = (name: string) => {
    const haystack = lower(name)
    if (!haystack) return null
    return rules.find((part) => part.objects?.some((needle) => haystack.includes(lower(needle)))) ?? null
  }
  const partForMaterial = (name: string) => {
    const haystack = lower(name)
    if (!haystack) return null
    return rules.find((part) => part.materials?.some((needle) => haystack.includes(lower(needle)))) ?? null
  }

  const claims: PrimitiveClaim[] = []
  const seen = new Set<number>()
  const walk = (nodeIndex: number, inherited: PresentationZone) => {
    // Guard against a malformed file pointing a child back up its own chain.
    if (seen.has(nodeIndex)) return
    seen.add(nodeIndex)

    const node = nodes[nodeIndex]
    if (!node) return
    const here = readZone(node.extras) ?? partForName(node.name)?.zone ?? inherited

    if (typeof node.mesh === 'number') {
      const mesh = meshes[node.mesh]
      const meshZone = readZone(mesh?.extras) ?? partForName(mesh?.name)?.zone ?? here
      ;(mesh?.primitives ?? []).forEach((primitive: any, primitiveIndex: number) => {
        if (typeof primitive.material !== 'number') return
        const byMaterial = partForMaterial(json.materials?.[primitive.material]?.name)
        claims.push({
          node: nodeIndex,
          mesh: node.mesh,
          primitive: primitiveIndex,
          material: primitive.material,
          zone: byMaterial?.zone ?? meshZone,
        })
      })
    }

    ;(node.children ?? []).forEach((child: number) => walk(child, here))
  }

  const roots: number[] = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i)
  roots.forEach((root) => walk(root, fallback))
  return claims
}

/** glTF is plain JSON, so this is a deep copy — and it keeps the module free of
 *  `structuredClone`, which the browser half of it cannot count on. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Which glTF material index wears which zone — **splitting any material that
 * two zones share**, so each zone can be dressed on its own.
 *
 * This used to collapse to one zone per material index, first claim wins, and
 * dismissed the rest as a known limit that `/simple` could not reach. It reached
 * it. `Nilper-last.glb` carries the whole sofa on two materials: `Material__25`
 * is worn by the body (`fur-1`, cover) *and* the cushions (`Cushion-3`,
 * cushion), and `Material__26` by the legs (`Struc-1`, wood) *and* an unmatched
 * group that falls through to the fallback zone. With one zone per index the
 * cushion's cloth was dropped for having no materials of its own and the
 * cover's was injected into both — which is how the customer's green fabric
 * reached the room on the cushions and on the legs.
 *
 * The page never had the problem: `collectZoneTargets` clones the material per
 * mesh, so one glTF material becomes many three.js ones. This is that clone,
 * expressed in the JSON chunk — an appended `materials` entry and a rewritten
 * `primitive.material`, both of which leave BIN untouched, so Draco stays Draco
 * and KTX2 stays KTX2.
 *
 * **Mutates `json`**, which is why `patchGlbMaterials` takes the document back
 * as an argument rather than re-parsing the bytes: the caller's copy is now the
 * one the material indices belong to.
 *
 * A file whose materials each serve one zone — every other product in the
 * catalogue — is left exactly as it was, down to the byte.
 */
export function splitZonesByMaterial(
  json: any,
  fallback: PresentationZone,
  parts?: PresentationPart[] | null
): Map<number, PresentationZone> {
  const claims = claimPrimitives(json, fallback, parts)
  const materials: any[] = (json.materials ??= [])
  const meshes: any[] = (json.meshes ??= [])
  const nodes: any[] = json.nodes ?? []

  /**
   * Meshes first, because the material rewrite below edits a primitive in place.
   *
   * One `meshes[i]` referenced by two nodes in different zones would take the
   * edit for both, so the minority node gets its own copy of the mesh entry —
   * which re-references the same accessors, and so adds no geometry. Rare, and
   * a correctness hole if it is skipped.
   */
  const byMesh = new Map<number, PrimitiveClaim[]>()
  claims.forEach((claim) => {
    const list = byMesh.get(claim.mesh)
    if (list) list.push(claim)
    else byMesh.set(claim.mesh, [claim])
  })

  byMesh.forEach((list, meshIndex) => {
    const byNode = new Map<number, PrimitiveClaim[]>()
    list.forEach((claim) => {
      const at = byNode.get(claim.node)
      if (at) at.push(claim)
      else byNode.set(claim.node, [claim])
    })

    const signatures = new Map<string, PrimitiveClaim[]>()
    byNode.forEach((nodeClaims) => {
      const key = nodeClaims
        .map((claim) => `${claim.primitive}:${claim.zone}`)
        .sort()
        .join('|')
      const at = signatures.get(key)
      if (at) at.push(...nodeClaims)
      else signatures.set(key, [...nodeClaims])
    })
    if (signatures.size < 2) return

    let first = true
    signatures.forEach((group) => {
      // The first reading keeps the original mesh; the others are copied off it.
      if (first) {
        first = false
        return
      }
      meshes.push(cloneJson(meshes[meshIndex]))
      const cloneIndex = meshes.length - 1
      group.forEach((claim) => {
        if (nodes[claim.node]) nodes[claim.node].mesh = cloneIndex
        claim.mesh = cloneIndex
      })
    })
  })

  const zones = new Map<number, PresentationZone>()
  const byMaterial = new Map<number, PrimitiveClaim[]>()
  claims.forEach((claim) => {
    const list = byMaterial.get(claim.material)
    if (list) list.push(claim)
    else byMaterial.set(claim.material, [claim])
  })

  byMaterial.forEach((list, materialIndex) => {
    if (!materials[materialIndex]) return
    const worn = [...new Set(list.map((claim) => claim.zone))]
    // First claim keeps the original index, so a file that needs no split comes
    // out of here identical to what the old collapse produced.
    zones.set(materialIndex, worn[0])

    worn.slice(1).forEach((zone) => {
      materials.push(cloneJson(materials[materialIndex]))
      const cloneIndex = materials.length - 1
      zones.set(cloneIndex, zone)
      list.forEach((claim) => {
        if (claim.zone !== zone) return
        const primitive = meshes[claim.mesh]?.primitives?.[claim.primitive]
        if (primitive) primitive.material = cloneIndex
      })
    })
  })

  return zones
}

/** Which material indices carry a name matching any of these substrings.
 *  The shared resolver, so AR dresses exactly what the page dressed. */
export function materialIndicesByName(json: any, names?: string[] | null): Set<number> {
  const materials: any[] = json.materials ?? []
  const needles = names?.map((name) => name.toLowerCase()) ?? []
  const out = new Set<number>()
  materials.forEach((material, index) => {
    const haystack = String(material?.name ?? '').toLowerCase()
    if (!needles.length || needles.some((needle) => haystack.includes(needle))) out.add(index)
  })
  return out
}

/** The reference object a slot's texture lives on, or null where the material
 *  has none — which is the case this must not try to fill. */
function textureRef(material: any, slot: InjectableSlot): any | null {
  const ref = slot === 'baseColorTexture' ? material?.pbrMetallicRoughness?.baseColorTexture : material?.normalTexture
  return typeof ref?.index === 'number' ? ref : null
}

/**
 * Add one image to the document and point the named materials at it.
 *
 * Everything here is an append: a `bufferViews` entry over bytes added to the
 * end of BIN, an `images` entry, a `textures` entry, and a rewritten `index` on
 * each material's existing texture reference. Nothing already in the file moves,
 * so Draco stays Draco and every authored texture stays exactly where it was.
 *
 * The `extensions` object on that reference is deliberately left alone, and it
 * is doing real work: `KHR_texture_transform` lives on the *reference*, not the
 * texture, so repointing `index` and nothing else reproduces the page's inherit
 * rule for free — `vray_rene_sofa_012` keeps its 90° rotation, `fabric_03` its
 * 3×3 — with no second copy of that logic to drift.
 *
 * `byPath` is what keeps a three-zone configuration from carrying three copies
 * of one cloth: an image already appended under this `source` is pointed at
 * again rather than added a second time. The sampler comes from the first
 * reference that claimed it, which is the same sampler in practice — these
 * exports carry exactly one.
 *
 * Returns the bytes to append to the BIN chunk, or null when there was nothing
 * to do or nothing to add.
 */
function injectTexture(
  json: any,
  binLength: number,
  slot: InjectableSlot,
  map: InjectedMap,
  materialIndices: Set<number>,
  byPath: Map<string, number>
): Uint8Array | null {
  const materials: any[] = json.materials ?? []
  const refs = [...materialIndices]
    .map((index) => textureRef(materials[index], slot))
    // A material with nothing in this slot has no sampler to inherit and no
    // reference to repoint. It keeps what it has — the same guard the page uses
    // to avoid flipping a shader variant. @see lib/three/swatchTextures.ts
    .filter((ref): ref is { index: number } => !!ref)
  if (!refs.length) return null

  const repoint = (textureIndex: number) => {
    refs.forEach((ref) => {
      ref.index = textureIndex
    })
  }

  const already = byPath.get(map.source)
  if (already !== undefined) {
    repoint(already)
    return null
  }

  const bufferViews: any[] = (json.bufferViews ??= [])
  const images: any[] = (json.images ??= [])
  const textures: any[] = (json.textures ??= [])
  const buffers: any[] = (json.buffers ??= [{ byteLength: 0 }])
  const ktx2 = map.bytes

  // glTF requires 4-byte alignment on a bufferView's offset.
  const padding = (4 - (binLength % 4)) % 4
  const byteOffset = binLength + padding

  bufferViews.push({ buffer: 0, byteOffset, byteLength: ktx2.byteLength })
  images.push({ mimeType: 'image/ktx2', bufferView: bufferViews.length - 1 })
  textures.push({
    // The displaced texture's sampler, so wrap and filter match what the file
    // was authored for. A standalone KTX2 has no sampler of its own.
    sampler: textures[refs[0].index]?.sampler,
    extensions: { KHR_texture_basisu: { source: images.length - 1 } },
  })

  const textureIndex = textures.length - 1
  byPath.set(map.source, textureIndex)
  repoint(textureIndex)

  buffers[0].byteLength = byteOffset + ktx2.byteLength

  // The injected texture carries no uncompressed fallback `source`, so the spec
  // makes this required rather than merely used. These assets already require
  // it; the guards stop it accumulating on every request.
  const used: string[] = (json.extensionsUsed ??= [])
  if (!used.includes('KHR_texture_basisu')) used.push('KHR_texture_basisu')
  const required: string[] = (json.extensionsRequired ??= [])
  if (!required.includes('KHR_texture_basisu')) required.push('KHR_texture_basisu')

  const out = new Uint8Array(padding + ktx2.byteLength)
  out.set(ktx2, padding)
  return out
}

/**
 * Rewrite the named materials' factors and re-emit the container.
 *
 * Everything after the JSON chunk — the BIN chunk, and any extra chunk a tool
 * may have appended — is copied through untouched, except for the fabric bytes
 * `injections` add to the end of BIN.
 *
 * One injection per zone, because a customer dresses the couch, its cushions and
 * the shawl separately and all three have to arrive. Distinct cloths append
 * distinct images; a cloth two zones share, or the normal map the whole palette
 * shares, is appended once. @see injectTexture
 */
export function patchGlbMaterials(
  bytes: ArrayBuffer,
  edits: Map<number, MaterialEdit>,
  injections?: TextureInjection[],
  /**
   * The document to emit, when the caller already has one.
   *
   * `splitZonesByMaterial` appends materials and rewrites `primitive.material`
   * on the JSON it was handed, and `edits` and `injections` are keyed on the
   * indices that produced. Re-parsing the bytes here would throw all of that
   * away and write those indices into the original material list. Omitted, this
   * reads the document out of `bytes` as it always did.
   */
  doc?: any
): ArrayBuffer {
  const chunks = readChunks(bytes)
  const json = doc ?? JSON.parse(new TextDecoder().decode(chunks[0].data))
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

  /**
   * The fabric bytes, to go on the end of BIN.
   *
   * Found by chunk *type*, not by position: `readChunks` tolerates a trailing
   * chunk some tool appended, and picking `chunks[1]` would put the texture in
   * whatever that happened to be. A file with no BIN chunk cannot carry an
   * injected image at all, so the JSON edits are simply emitted alone.
   */
  const binIndex = chunks.findIndex((chunk) => chunk.type === CHUNK_BIN)
  const appended: Uint8Array[] = []
  if (injections?.length && binIndex > 0) {
    let binLength = chunks[binIndex].data.byteLength
    // Source path → the texture index it was appended as, across every zone.
    const byPath = new Map<string, number>()
    injections.forEach((injection) => {
      ;(['baseColorTexture', 'normalTexture'] as InjectableSlot[]).forEach((slot) => {
        const map = injection.maps[slot]
        if (!map) return
        const chunk = injectTexture(json, binLength, slot, map, injection.materials, byPath)
        // Null is the already-appended case as well as the nothing-to-do one;
        // either way the references are repointed and no bytes are added.
        if (!chunk) return
        appended.push(chunk)
        binLength += chunk.byteLength
      })
    })
  }
  const appendedLength = appended.reduce((sum, chunk) => sum + chunk.byteLength, 0)

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4

  let total = 12 + 8 + jsonBytes.byteLength + jsonPadding
  for (let i = 1; i < chunks.length; i++) {
    const length = chunks[i].data.byteLength + (i === binIndex ? appendedLength : 0)
    total += 8 + length + ((4 - (length % 4)) % 4)
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
    const extra = i === binIndex ? appendedLength : 0
    const length = data.byteLength + extra
    const padding = (4 - (length % 4)) % 4
    view.setUint32(offset, length + padding, true)
    view.setUint32(offset + 4, type, true)
    write.set(data, offset + 8)
    // Each appended block already carries its own leading alignment padding, so
    // the offsets written into `bufferViews` land where they were promised.
    let at = offset + 8 + data.byteLength
    if (extra) {
      appended.forEach((chunk) => {
        write.set(chunk, at)
        at += chunk.byteLength
      })
    }
    offset += 8 + length + padding
  }

  return out
}

/**
 * A zone map, as the material factors the patch writes.
 *
 * This is `collectZoneTargets` + `applyFirstCoat` (lib/three/layerMaterials.ts,
 * hooks/useZonePaint.ts) restated against the raw JSON. It has to agree with
 * them exactly or AR shows a colour the page never displayed.
 *
 * Takes the map rather than the document because the zones come from
 * `splitZonesByMaterial`, which appends materials as it resolves them: walking
 * the document a second time here would meet the clones and claim them afresh.
 */
export function editsFromZones(
  zones: Map<number, PresentationZone>,
  paint: ZonePaintConfig
): Map<number, MaterialEdit> {
  const edits = new Map<number, MaterialEdit>()
  zones.forEach((zone, materialIndex) => {
    const p = paint[zone]
    // A zone with no paint in this configuration leaves its materials as
    // authored, rather than falling back to another zone's colour.
    if (!p) return
    edits.set(materialIndex, {
      color: hexToLinearRgb(p.color),
      metalness: p.metalness,
      roughness: p.roughness,
      clearcoat: p.clearcoat,
    })
  })
  return edits
}

/**
 * What each AR runtime drops on the floor, keyed by the glTF extension that
 * triggers it.
 *
 * None of these is an error anywhere. Scene Viewer and three's `USDZExporter`
 * both carry on and render *something*, which is how a piece can come back from
 * AR wearing a finish the page never showed with nothing in the console to say
 * so — the same silence that let one zone's fabric travel and the other two's
 * stay behind for as long as it did.
 *
 * The patcher cannot remove any of them: preserving the file byte for byte is
 * the whole point of it. They are a property of how the asset was authored and
 * exported, so this reports them and the fix is upstream.
 */
export const AR_HAZARDS: Record<string, string> = {
  KHR_texture_transform:
    'Quick Look mis-maps transformed textures — three writes a UsdTransform2d and documents that Quick Look reads it wrong (FB10036297), so a tiled or rotated map lands at the wrong scale and reads as flat colour. Export those materials with the transform baked into their UVs.',
  KHR_texture_basisu:
    'breaks BOTH AR runtimes, and the iOS half of that was found the hard way. Scene Viewer has no Basis transcoder, so an Android phone without WebXR cannot open the file at all. On iOS it is worse than a refusal: model-viewer has to build the USDZ itself whenever no `ios-src` is given, its exporter must decompress every Basis texture through a throwaway WebGLRenderer first, and `openIOSARQuickLook` has no try/catch around it — a failure there leaves the anchor pointing at the current page, so Quick Look opens on the HTML document and the customer gets a black screen with no camera and no error. It needs a PNG/JPEG twin, or an authored USDZ.',
  EXT_texture_webp: 'Scene Viewer cannot decode WebP; it needs a PNG/JPEG twin.',
  EXT_mesh_gpu_instancing:
    'neither AR runtime reads it, and it is only ever listed in extensionsUsed — so every instance but the first vanishes without an error. Export the copies as real nodes.',
  KHR_materials_sheen: 'USDZ has no sheen; the cloth reads flatter in Quick Look',
  KHR_materials_specular: 'USDZ has no specular extension; Quick Look uses the base PBR values',
  KHR_materials_iridescence: 'dropped by the USDZ exporter',
  KHR_materials_anisotropy: 'dropped by the USDZ exporter',
  KHR_materials_transmission: 'dropped by the USDZ exporter; glass reads opaque',
  KHR_materials_volume: 'dropped by the USDZ exporter',
}

/**
 * The hazards a GLB actually declares — the gap between what the page renders
 * and what AR will.
 *
 * Read off the JSON chunk the route has already parsed in order to patch it, so
 * it costs nothing. An empty array means the file says the same thing in both
 * places.
 */
export function arHazards(json: any): string[] {
  const declared = new Set<string>([...(json?.extensionsUsed ?? []), ...(json?.extensionsRequired ?? [])])
  return Object.keys(AR_HAZARDS).filter((name) => declared.has(name))
}
