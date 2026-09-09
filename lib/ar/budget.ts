/**
 * What AR can carry, and how to tell before shipping it.
 *
 * These replace the console-only check that used to sit in ProductPageClient —
 * it warned past 40MB and then handed the file over anyway, which is how a
 * customer got a crashed Quick Look instead of a message.
 */

import type * as THREE from 'three'

const MB = 1048576

/** Comfortable, and the point past which the debug readout is worth reading. */
export const AR_GLB_WARN_BYTES = 15 * MB
/** Past this the configured file is not offered at all; the static one stands in. */
export const AR_GLB_MAX_BYTES = 30 * MB

/**
 * Textures model-viewer is allowed to bake into the USDZ it generates for Quick
 * Look.
 *
 * model-viewer defers to three's `USDZExporter`, whose own default is 1024 — but
 * it overrides that from the `ar-usdz-max-texture-size` attribute, which defaults
 * to the string `'auto'`, and `isNaN('auto')` sends it to **Infinity**. So the
 * out-of-the-box behaviour is: re-encode every texture at full resolution as PNG
 * at quality 1, into a zip written with `level: 0` — no compression at all. On a
 * 4K PBR set that is enough to take Safari down on its own, whatever the GLB
 * weighs. Naming the cap is the fix.
 */
export const AR_USDZ_MAX_TEXTURE_SIZE = 1024

/**
 * Where a piece is too dense for Quick Look regardless of its textures.
 *
 * three's USDZ exporter writes points, normals and UVs as decimal *text* into
 * that same uncompressed zip, so triangles cost far more there than they do in a
 * GLB. Past this an authored `arPath` (@see arModelPath) is not an optimisation,
 * it is the only thing that will work.
 */
export const AR_TRIANGLE_WARN = 150_000

export function countTriangles(root: THREE.Object3D): number {
  let total = 0
  root.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry
    if (!geometry?.attributes?.position) return
    total += (geometry.index?.count ?? geometry.attributes.position.count) / 3
  })
  return Math.round(total)
}
