import * as THREE from 'three'

/**
 * Free the GPU resources a subtree's own geometries, materials and textures
 * hold — buffers, programs, compressed-texture backing stores.
 *
 * Not a general unmount hook. Disposing a geometry or material that a loader
 * cache still owns races whatever else expects to reuse it — the exact bug
 * `lib/three/releaseRenderer.ts`'s own header warns about ("add a
 * `scene.traverse(dispose)` here and the AR return path comes back to an
 * empty stage"). Call this only on a subtree whose geometries/materials have
 * just become genuinely unreferenced — e.g. right after evicting its loader
 * cache entry, not on every component unmount.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  const seenGeometries = new Set<THREE.BufferGeometry>()
  const seenMaterials = new Set<THREE.Material>()

  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return

    if (mesh.geometry && !seenGeometries.has(mesh.geometry)) {
      seenGeometries.add(mesh.geometry)
      mesh.geometry.dispose()
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => {
      if (!material || seenMaterials.has(material)) return
      seenMaterials.add(material)
      disposeMaterialTextures(material)
      material.dispose()
    })
  })
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'envMap',
] as const

function disposeMaterialTextures(material: THREE.Material): void {
  const mat = material as unknown as Record<string, unknown>
  TEXTURE_SLOTS.forEach((slot) => {
    const texture = mat[slot]
    if (texture instanceof THREE.Texture) texture.dispose()
  })
}
