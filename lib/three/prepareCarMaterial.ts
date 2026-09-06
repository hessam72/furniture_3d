import * as THREE from 'three'

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
] as const

export interface CarMaterialOptions {
  envMapIntensity?: number
  anisotropy?: number
}

/** Sharpen all texture slots of a material at grazing angles */
export function applyAnisotropy(material: THREE.Material, level: number) {
  const mat = material as unknown as Record<string, unknown>
  TEXTURE_SLOTS.forEach((slot) => {
    const texture = mat[slot]
    if (texture instanceof THREE.Texture && texture.anisotropy !== level) {
      texture.anisotropy = level
      texture.needsUpdate = true
    }
  })
}

/**
 * Single source of truth for car-surface material prep so the base body and
 * swapped-in parts (DynamicPart clones) always match: env reflections boost +
 * texture anisotropy.
 */
export function prepareCarMaterial(material: THREE.Material, options: CarMaterialOptions = {}) {
  const { envMapIntensity = 1.5, anisotropy } = options
  const std = material as THREE.MeshStandardMaterial
  if ('envMapIntensity' in std) {
    std.envMapIntensity = envMapIntensity
  }
  if (anisotropy && anisotropy > 1) {
    applyAnisotropy(material, anisotropy)
  }
}

/** Prep every mesh under `root`: shadow flags + material prep */
export function prepareCarObject(root: THREE.Object3D, options: CarMaterialOptions = {}) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((mat: THREE.Material) => mat && prepareCarMaterial(mat, options))
    }
  })
}
