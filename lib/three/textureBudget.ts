/**
 * What the textures in a scene actually cost the GPU.
 *
 * The number nobody was measuring, and the one that was killing the phones. A
 * GLB's file size says nothing about it: WebP squeezes a 4000×4000 map into
 * 850KB on disk, and the driver then unpacks it to `4000 × 4000 × 4` bytes plus
 * a third again for the mip chain — 81MB, from a file that looked like a
 * rounding error. `public/test-models/final-scene.glb` is 19.5MB of download and
 * **740MB of texture memory**; the sofa beside it is another 284MB. iOS Safari
 * gives a tab somewhere near 1.5GB in total and, on several versions, caps
 * canvas-backed memory at 256MB — so the room alone is over budget before a
 * single pixel is drawn.
 *
 * Everything the tier system argues over — DPR, MSAA, shadow resolution — is
 * worth tens of megabytes on a phone. This is worth hundreds. Measure it first.
 *
 * @see scripts/glb-budget.mjs, which computes the same figure from a .glb on
 *      disk, before it is ever loaded.
 */

import * as THREE from 'three'

/** Bytes per pixel for the compressed formats KTX2/Basis transcodes into. */
const COMPRESSED_BYTES_PER_PIXEL: Record<number, number> = {
  // ASTC 4×4 — what an iPhone gets. 128 bits per 4×4 block.
  [THREE.RGBA_ASTC_4x4_Format]: 1,
  // BC7 / DXT5 — desktop. Also 128 bits per 4×4 block.
  [THREE.RGBA_BPTC_Format]: 1,
  [THREE.RGBA_S3TC_DXT5_Format]: 1,
  // ETC2 RGBA — Android fallback.
  [THREE.RGBA_ETC2_EAC_Format]: 1,
  // Half-rate formats: 64 bits per 4×4 block.
  [THREE.RGB_S3TC_DXT1_Format]: 0.5,
  [THREE.RGBA_S3TC_DXT1_Format]: 0.5,
  [THREE.RGB_ETC2_Format]: 0.5,
  [THREE.RGB_ETC1_Format]: 0.5,
}

/** Bytes per channel, by three's texture type. Uncompressed only. */
function bytesPerChannel(type: THREE.TextureDataType): number {
  if (type === THREE.HalfFloatType) return 2
  if (type === THREE.FloatType) return 4
  return 1
}

export interface TextureCost {
  /** `image.width × image.height`, or 0 where the image never resolved. */
  pixels: number
  width: number
  height: number
  /** Resident bytes, mip chain included. */
  bytes: number
  compressed: boolean
  /** The map slot it was found in, for the readout — `map`, `normalMap`, … */
  slot: string
  name: string
}

/**
 * The resident size of one texture.
 *
 * Mips add a third: the chain is 1 + 1/4 + 1/16 + … which converges on 4/3.
 * `generateMipmaps` is three's default and every GLB texture keeps it, so the
 * multiplier is the norm rather than the exception.
 */
function textureBytes(texture: THREE.Texture): { bytes: number; width: number; height: number; compressed: boolean } {
  const image = texture.image as { width?: number; height?: number } | undefined
  const width = image?.width ?? 0
  const height = image?.height ?? 0
  if (!width || !height) return { bytes: 0, width, height, compressed: false }

  const compressed = (texture as THREE.CompressedTexture).isCompressedTexture === true
  const perPixel = compressed
    ? COMPRESSED_BYTES_PER_PIXEL[texture.format] ?? 1
    : 4 * bytesPerChannel(texture.type)

  const mips = texture.generateMipmaps || (texture.mipmaps?.length ?? 0) > 1 ? 4 / 3 : 1
  return { bytes: Math.round(width * height * perPixel * mips), width, height, compressed }
}

/** Every map slot a `MeshPhysicalMaterial` can carry a texture in. */
const MAP_SLOTS = [
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
  'specularMap',
  'specularColorMap',
  'specularIntensityMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'anisotropyMap',
  'lightMap',
  'envMap',
] as const

/**
 * Walk an object and price every distinct texture under it.
 *
 * Deduped by `Texture.uuid`, because that is what the driver dedupes by: one
 * image shared across twelve materials is uploaded once. Counting per-material
 * would report the room at several times its real cost and make the readout
 * useless for deciding what to resize.
 */
export function collectTextureCosts(root: THREE.Object3D): TextureCost[] {
  const seen = new Map<string, TextureCost>()

  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.material) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

    for (const material of materials) {
      for (const slot of MAP_SLOTS) {
        const texture = (material as unknown as Record<string, THREE.Texture | null>)[slot]
        if (!texture?.isTexture || seen.has(texture.uuid)) continue
        const { bytes, width, height, compressed } = textureBytes(texture)
        seen.set(texture.uuid, {
          pixels: width * height,
          width,
          height,
          bytes,
          compressed,
          slot,
          name: texture.name || texture.source?.data?.src?.split('/').pop() || '(unnamed)',
        })
      }
    }
  })

  return [...seen.values()].sort((a, b) => b.bytes - a.bytes)
}

/** Total resident texture bytes under `root`. The headline number. */
export function estimateTextureVram(root: THREE.Object3D): number {
  return collectTextureCosts(root).reduce((total, cost) => total + cost.bytes, 0)
}

/**
 * The largest map in a scene, capped at this, is a texture set a phone can hold.
 *
 * 1024² as RGBA8 with mips is 5.6MB; 2048² is 22MB and 4096² is 87MB. A piece
 * of furniture on a 390pt-wide screen cannot show more than the first, so
 * anything past it is memory spent on detail the panel cannot resolve.
 */
export const TEXTURE_MAX_EDGE_PHONE = 1024

/** The budgets and the byte formatter live in components/three/rendererStatsStore,
 *  which imports nothing — so the DOM overlay can read them without dragging
 *  `three` into a marketing page's bundle. */
export { TEXTURE_VRAM_MAX_BYTES, TEXTURE_VRAM_WARN_BYTES, formatBytes } from '@/components/three/rendererStatsStore'
