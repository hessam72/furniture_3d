import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ProductData } from '@/components/store/ProductInteraction'
import { findSceneObject } from '@/lib/store/sceneObject'

/**
 * Static batching for the walkthrough room.
 *
 * The room is assembled from library furniture — every leg, cushion and frame
 * its own mesh — and only the few pieces in products.json are ever touched at
 * runtime. Each of the rest was still its own draw call, and draw calls are
 * what Safari's WebGL spends the CPU side of a frame on. This merges them:
 * one mesh per material per grid cell, so frustum culling still works at
 * cell granularity instead of the whole room turning into one always-drawn
 * lump.
 *
 * Left exactly as authored, because something finds them by name or treats
 * them specially: the products (flight, paint, tap — resolved the same ways
 * those systems resolve them), lamps (LampLights reads their positions),
 * glass and anything transparent (needs per-object sorting), plus whatever
 * the merge can't represent (array materials, skinning, morphs, interleaved
 * buffers).
 */

/** Grid cell edge, world units — coarse enough to batch, fine enough to cull */
const CELL = 6
/** Tag on a root that has been batched; a remount re-clones from the cache */
const BATCHED = 'storeBatched'

export interface BatchReport {
  before: number
  after: number
}

/** Everything a product lookup anywhere in /store could resolve to. */
function productRoots(root: THREE.Object3D, products: Record<string, ProductData>): Set<THREE.Object3D> {
  const keep = new Set<THREE.Object3D>()
  const ids = new Set<string>()
  for (const [key, p] of Object.entries(products)) {
    ids.add(p.id.toLowerCase())
    // ProductFocusCamera: [key, id]; FurnitureColorApplier: [id || key]
    for (const names of [[key, p.id], [p.id], [key]]) {
      const hit = findSceneObject(root, names)
      if (hit) keep.add(hit)
    }
  }
  // ProductInteraction: exact id match anywhere up the hit's ancestry
  root.traverse((o) => {
    if (o.name && ids.has(o.name.toLowerCase())) keep.add(o)
  })
  return keep
}

function signature(geo: THREE.BufferGeometry): string | null {
  if (Object.keys(geo.morphAttributes).length > 0) return null
  const parts: string[] = [geo.index ? 'i' : 'n']
  for (const name of Object.keys(geo.attributes).sort()) {
    const a = geo.attributes[name]
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null
    const attr = a as THREE.BufferAttribute
    parts.push(`${name}:${attr.itemSize}:${attr.normalized ? 1 : 0}:${attr.array.constructor.name}`)
  }
  return parts.join('|')
}

function eligible(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh)
    return false
  if (Array.isArray(mesh.material) || mesh.geometry.groups.length > 1) return false
  const mat = mesh.material as THREE.MeshPhysicalMaterial
  if (mat.transparent || (mat.transmission ?? 0) > 0) return false
  if (mesh.userData.isLamp) return false
  if (mesh.name.toLowerCase().includes('glass')) return false
  return true
}

/** A CPU copy nothing reads after upload — raycasts go to products only. */
function dropArrayAfterUpload(this: { array: unknown }) {
  this.array = null
}

/**
 * Merge the static meshes under `root` in place. Idempotent per root. Returns
 * null when there was nothing to do.
 */
export function batchStaticMeshes(
  root: THREE.Object3D,
  products: Record<string, ProductData>
): BatchReport | null {
  if (root.userData[BATCHED]) return null
  root.userData[BATCHED] = true

  const keep = productRoots(root, products)
  root.updateMatrixWorld(true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()

  const groups = new Map<string, THREE.Mesh[]>()
  let before = 0
  const center = new THREE.Vector3()

  const visit = (obj: THREE.Object3D) => {
    if (keep.has(obj)) return
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) {
      before++
      const sig = eligible(mesh) ? signature(mesh.geometry) : null
      const mirrored = mesh.matrixWorld.determinant() < 0
      if (sig && !(mirrored && !mesh.geometry.index)) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        mesh.geometry.boundingBox!.getCenter(center).applyMatrix4(mesh.matrixWorld)
        const cell = `${Math.floor(center.x / CELL)},${Math.floor(center.z / CELL)}`
        const mat = mesh.material as THREE.Material
        const key = `${mat.uuid}|${+mesh.castShadow}${+mesh.receiveShadow}|${mesh.renderOrder}|${sig}|${cell}`
        const list = groups.get(key)
        if (list) list.push(mesh)
        else groups.set(key, [mesh])
      }
    }
    obj.children.forEach(visit)
  }
  root.children.forEach(visit)

  let merged = 0
  let removed = 0
  const rel = new THREE.Matrix4()
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue
    const parts = meshes.map((m) => {
      const g = m.geometry.clone()
      g.applyMatrix4(rel.multiplyMatrices(toRoot, m.matrixWorld))
      // A baked mirror flips the winding, which three otherwise corrects per
      // object from the matrix's sign — there is no such object any more.
      if (m.matrixWorld.determinant() < 0 && g.index) {
        const idx = g.index.array
        for (let i = 0; i < idx.length; i += 3) {
          const t = idx[i + 1]
          idx[i + 1] = idx[i + 2]
          idx[i + 2] = t
        }
      }
      return g
    })
    const geometry = mergeGeometries(parts, false)
    parts.forEach((g) => g.dispose())
    if (!geometry) continue

    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    for (const attr of Object.values(geometry.attributes)) (attr as THREE.BufferAttribute).onUpload(dropArrayAfterUpload)
    geometry.index?.onUpload(dropArrayAfterUpload)

    const first = meshes[0]
    const batch = new THREE.Mesh(geometry, first.material)
    batch.name = `__static_batch_${merged}`
    batch.userData.staticBatch = true
    batch.castShadow = first.castShadow
    batch.receiveShadow = first.receiveShadow
    batch.renderOrder = first.renderOrder
    root.add(batch)
    meshes.forEach((m) => m.removeFromParent())
    merged++
    removed += meshes.length
  }

  if (merged === 0) return null
  return { before, after: before - removed + merged }
}

/**
 * Free the GPU buffers of the batches under `root`. They are this clone's own
 * geometry — unlike the originals, which the loader cache shares — so nothing
 * else will ever dispose them.
 */
export function disposeStaticBatches(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o.userData.staticBatch) (o as THREE.Mesh).geometry.dispose()
  })
}
