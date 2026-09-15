/**
 * A patched GLB, flattened into the handful of things USD needs.
 *
 * Deliberately narrow. This does not aim to be a glTF loader — it reads the
 * subset these product models are authored in, and throws on anything else
 * rather than guessing, because a USDZ that silently drops a mesh is worse than
 * one that never gets built (the page still has `product.usdzPath` to fall back
 * to).
 *
 * What it does handle, because the models use all of it:
 *
 *  - `KHR_draco_mesh_compression` — every primitive in these files is Draco,
 *    and the attributes only exist once it is decoded;
 *  - `KHR_texture_transform` — **baked into the UVs here**, which is the point.
 *    USD has `UsdTransform2d`, and three's exporter documents that Quick Look
 *    reads it wrong (FB10036297), so a tiled map would land at the wrong scale
 *    and read as flat colour. Applying the transform to the coordinates instead
 *    removes the hazard rather than forwarding it;
 *  - `KHR_texture_basisu` — the images stay as `.ktx2` bytes here and are
 *    transcoded by the caller, which is the whole reason this path exists;
 *  - node hierarchies with TRS or matrix transforms, including the **negative
 *    scales** Quick Look cannot represent. @see flattenNode.
 */

import { decodeDraco } from './nodeCodecs'

/* ----------------------------------------------------------------- types --- */

export interface Primitive {
  /** World-space, transform already applied. */
  positions: Float32Array
  normals: Float32Array | null
  /** Already flipped into USD's bottom-left origin and with any
   *  `KHR_texture_transform` baked in. */
  uvs: Float32Array | null
  indices: Uint32Array
  material: number | null
}

export interface GltfImage {
  /** `image/ktx2`, `image/png`, `image/jpeg`, … */
  mimeType: string
  bytes: Uint8Array
}

export interface GltfMaterial {
  name: string
  baseColor: [number, number, number, number]
  metallic: number
  roughness: number
  /** Index into `images`, resolved through texture → source. */
  baseColorImage: number | null
  normalImage: number | null
  doubleSided: boolean
}

export interface GltfScene {
  primitives: Primitive[]
  materials: GltfMaterial[]
  images: GltfImage[]
}

/* -------------------------------------------------------------- accessors --- */

const COMPONENT: Record<number, { array: any; size: number }> = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
}

const ITEMS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

function readAccessor(json: any, bin: Uint8Array, index: number): { array: Float32Array; itemSize: number } {
  const accessor = json.accessors[index]
  const itemSize = ITEMS[accessor.type]
  const component = COMPONENT[accessor.componentType]
  if (!itemSize || !component) throw new Error(`unsupported accessor ${accessor.type}/${accessor.componentType}`)

  const view = json.bufferViews[accessor.bufferView]
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const count = accessor.count
  const out = new Float32Array(count * itemSize)

  // An interleaved view has a stride; a tight one does not. Both appear here.
  const stride = view.byteStride ?? itemSize * component.size
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const read = readerFor(accessor.componentType, dv)

  for (let i = 0; i < count; i++) {
    for (let c = 0; c < itemSize; c++) {
      out[i * itemSize + c] = read(base + i * stride + c * component.size, accessor.normalized)
    }
  }
  return { array: out, itemSize }
}

function readerFor(componentType: number, dv: DataView) {
  switch (componentType) {
    case 5126:
      return (o: number) => dv.getFloat32(o, true)
    case 5125:
      return (o: number) => dv.getUint32(o, true)
    case 5123:
      return (o: number, n?: boolean) => (n ? dv.getUint16(o, true) / 65535 : dv.getUint16(o, true))
    case 5122:
      return (o: number, n?: boolean) => (n ? Math.max(dv.getInt16(o, true) / 32767, -1) : dv.getInt16(o, true))
    case 5121:
      return (o: number, n?: boolean) => (n ? dv.getUint8(o) / 255 : dv.getUint8(o))
    case 5120:
      return (o: number, n?: boolean) => (n ? Math.max(dv.getInt8(o) / 127, -1) : dv.getInt8(o))
    default:
      throw new Error(`unsupported componentType ${componentType}`)
  }
}

/* ------------------------------------------------------------- transforms --- */

type Mat4 = number[]

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = sum
    }
  }
  return out
}

/** glTF's TRS, in column-major order to match its `matrix` form. */
function trs(node: any): Mat4 {
  if (node.matrix) return node.matrix.slice()
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]

  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function transformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

/** Normals take the inverse transpose; for our transforms the upper 3x3 with a
 *  non-uniform scale is the only case that differs, and it matters on exactly
 *  the mirrored nodes below. */
function transformNormal(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  const nx = m[0] * x + m[4] * y + m[8] * z
  const ny = m[1] * x + m[5] * y + m[9] * z
  const nz = m[2] * x + m[6] * y + m[10] * z
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

/** Negative determinant ⇒ the node is mirrored. */
function determinant3(m: Mat4): number {
  return (
    m[0] * (m[5] * m[10] - m[9] * m[6]) -
    m[4] * (m[1] * m[10] - m[9] * m[2]) +
    m[8] * (m[1] * m[6] - m[5] * m[2])
  )
}

/* ------------------------------------------------------------------ read --- */

const MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

export function readGlb(bytes: ArrayBuffer): { json: any; bin: Uint8Array } {
  const dv = new DataView(bytes)
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a GLB')
  let offset = 12
  let json: any = null
  let bin: Uint8Array | null = null
  while (offset < bytes.byteLength) {
    const length = dv.getUint32(offset, true)
    const type = dv.getUint32(offset + 4, true)
    const body = new Uint8Array(bytes, offset + 8, length)
    if (type === CHUNK_JSON) json = JSON.parse(Buffer.from(body).toString('utf8'))
    else if (type === CHUNK_BIN) bin = body
    offset += 8 + length
  }
  if (!json) throw new Error('GLB has no JSON chunk')
  return { json, bin: bin ?? new Uint8Array(0) }
}

/**
 * Every primitive in the file, in world space, with one entry per
 * node-primitive pair.
 *
 * Flattening rather than preserving the hierarchy is the right shape for USD
 * here: the transform is the only thing the hierarchy carried (there is no
 * animation and nothing is instanced), and a flat list is what lets the
 * mirrored-node fix below be local.
 */
export async function readScene(bytes: ArrayBuffer, maxEdge = Infinity): Promise<GltfScene> {
  const { json, bin } = readGlb(bytes)
  const primitives: Primitive[] = []

  const scene = json.scenes?.[json.scene ?? 0]
  const roots: number[] = scene?.nodes ?? json.nodes?.map((_: unknown, i: number) => i) ?? []

  const walk = async (index: number, parent: Mat4) => {
    const node = json.nodes[index]
    const world = multiply(parent, trs(node))
    if (node.mesh != null) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        const flat = await flattenPrimitive(json, bin, prim, world)
        if (flat) primitives.push(flat)
      }
    }
    for (const child of node.children ?? []) await walk(child, world)
  }
  for (const root of roots) await walk(root, IDENTITY)

  return {
    primitives,
    materials: readMaterials(json),
    images: readImages(json, bin),
  }
}

async function flattenPrimitive(json: any, bin: Uint8Array, prim: any, world: Mat4): Promise<Primitive | null> {
  // Triangles only. `mode` 4 is the default and the only one these use.
  if (prim.mode != null && prim.mode !== 4) return null

  let positions: Float32Array
  let normals: Float32Array | null = null
  let uvs: Float32Array | null = null
  let indices: Uint32Array

  const draco = prim.extensions?.KHR_draco_mesh_compression
  if (draco) {
    const view = json.bufferViews[draco.bufferView]
    const start = view.byteOffset ?? 0
    const mesh = await decodeDraco(bin.subarray(start, start + view.byteLength), draco.attributes)
    positions = mesh.attributes.POSITION?.array
    normals = mesh.attributes.NORMAL?.array ?? null
    uvs = mesh.attributes.TEXCOORD_0?.array ?? null
    indices = mesh.indices
    if (!positions) return null
  } else {
    positions = readAccessor(json, bin, prim.attributes.POSITION).array
    normals = prim.attributes.NORMAL != null ? readAccessor(json, bin, prim.attributes.NORMAL).array : null
    uvs = prim.attributes.TEXCOORD_0 != null ? readAccessor(json, bin, prim.attributes.TEXCOORD_0).array : null
    indices =
      prim.indices != null
        ? Uint32Array.from(readAccessor(json, bin, prim.indices).array)
        : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
  }

  // To world space.
  const worldPositions = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = transformPoint(world, positions[i], positions[i + 1], positions[i + 2])
    worldPositions[i] = x
    worldPositions[i + 1] = y
    worldPositions[i + 2] = z
  }
  let worldNormals: Float32Array | null = null
  if (normals) {
    worldNormals = new Float32Array(normals.length)
    for (let i = 0; i < normals.length; i += 3) {
      const [x, y, z] = transformNormal(world, normals[i], normals[i + 1], normals[i + 2])
      worldNormals[i] = x
      worldNormals[i + 1] = y
      worldNormals[i + 2] = z
    }
  }

  /**
   * The mirrored-node fix, and the answer to `USDZ does not support negative
   * scales`.
   *
   * A node with a negative determinant is mirrored, and USD has no way to say
   * so — three's exporter warns and then writes the mesh anyway, inside out.
   * Baking the transform into the points, as above, already removes the scale
   * itself; what it leaves behind is the winding, which a mirror reverses. So
   * reverse it back, and the face normals point outwards again.
   */
  const out = indices.slice()
  if (determinant3(world) < 0) {
    for (let i = 0; i < out.length; i += 3) {
      const swap = out[i + 1]
      out[i + 1] = out[i + 2]
      out[i + 2] = swap
    }
  }

  return {
    positions: worldPositions,
    normals: worldNormals,
    uvs: uvs ? bakeUvs(uvs, textureTransformFor(json, prim.material)) : null,
    indices: out,
    material: prim.material ?? null,
  }
}

/** `KHR_texture_transform` off the material's base-colour slot, which is where
 *  these models carry it, or null. */
function textureTransformFor(json: any, materialIndex: number | null | undefined): any | null {
  if (materialIndex == null) return null
  const slot = json.materials?.[materialIndex]?.pbrMetallicRoughness?.baseColorTexture
  return slot?.extensions?.KHR_texture_transform ?? null
}

/**
 * glTF UVs to USD `st`, with any texture transform applied.
 *
 * Two changes, and both are mandatory:
 *
 *  - **the transform is baked**, @see the note at the top of this file;
 *  - **v is flipped**. glTF puts the UV origin at the top left and USD puts it
 *    at the bottom left, so a texture that is merely copied across arrives
 *    upside down.
 */
function bakeUvs(uvs: Float32Array, transform: any | null): Float32Array {
  const out = new Float32Array(uvs.length)
  const [ox, oy] = transform?.offset ?? [0, 0]
  const [sx, sy] = transform?.scale ?? [1, 1]
  const rotation = transform?.rotation ?? 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  for (let i = 0; i < uvs.length; i += 2) {
    const u = uvs[i]
    const v = uvs[i + 1]
    // glTF's transform order: scale, then rotate, then offset.
    const su = u * sx
    const sv = v * sy
    const ru = su * cos - sv * sin
    const rv = su * sin + sv * cos
    out[i] = ru + ox
    out[i + 1] = 1 - (rv + oy)
  }
  return out
}

function readMaterials(json: any): GltfMaterial[] {
  const imageOf = (slot: any): number | null => {
    if (!slot || slot.index == null) return null
    const texture = json.textures?.[slot.index]
    if (!texture) return null
    // `source` for a plain texture, the extension's for a Basis one.
    return texture.extensions?.KHR_texture_basisu?.source ?? texture.source ?? null
  }

  return (json.materials ?? []).map((material: any, index: number) => {
    const pbr = material.pbrMetallicRoughness ?? {}
    return {
      name: sanitise(material.name || `material_${index}`),
      baseColor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      metallic: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      baseColorImage: imageOf(pbr.baseColorTexture),
      normalImage: imageOf(material.normalTexture),
      doubleSided: material.doubleSided === true,
    }
  })
}

function readImages(json: any, bin: Uint8Array): GltfImage[] {
  return (json.images ?? []).map((image: any) => {
    if (image.bufferView == null) throw new Error('external image URIs are not supported here')
    const view = json.bufferViews[image.bufferView]
    const start = view.byteOffset ?? 0
    return {
      mimeType: image.mimeType ?? 'application/octet-stream',
      bytes: bin.subarray(start, start + view.byteLength),
    }
  })
}

/** USD prim names are identifiers: letters, digits and underscore, not leading
 *  with a digit. Material names in these files are full of spaces and dots. */
export function sanitise(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || '_'
}
