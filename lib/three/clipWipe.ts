import * as THREE from 'three'

/** Distance the plane is pushed past the bounds so no sliver lingers. */
const PAD = 0.01
/** Where a finished plane parks: far enough away to always pass. */
export const PARKED_CONSTANT = 1e3

export interface WipeBounds {
  minY: number
  maxY: number
}

/**
 * Local-space Y bounds of a fresh, un-parented clone.
 *
 * Must be taken before the clone is added to the scene graph — at that point
 * its world matrix is identity, so the world box *is* the local box.
 */
export function localBoundsY(root: THREE.Object3D): WipeBounds {
  const box = new THREE.Box3().setFromObject(root)
  return { minY: box.min.y - PAD, maxY: box.max.y + PAD }
}

/**
 * A plane whose kept half-space is `y <= constant`.
 *
 * three keeps points where `normal · p + constant >= 0`; with normal (0,-1,0)
 * that reduces to `-y + constant >= 0`, i.e. `y <= constant`. Sweeping the
 * constant from minY to maxY therefore grows the material upward.
 */
export function makeClipPlane(constant: number): THREE.Plane {
  return new THREE.Plane(new THREE.Vector3(0, -1, 0), constant)
}

/**
 * Clipping planes are evaluated in WORLD space, so the plane has to be
 * re-derived from the layer's world matrix every frame the layer moves.
 * A pure Y spin leaves a Y-normal plane invariant, but the drag tilt and the
 * explode offset do not — without this the cover slices along the wrong axis.
 *
 * Materials hold a stable reference to `world`, so mutating it in place needs
 * no `needsUpdate` and costs nothing per material.
 */
export function syncPlaneToWorld(local: THREE.Plane, world: THREE.Plane, object: THREE.Object3D) {
  object.updateWorldMatrix(true, false)
  world.copy(local).applyMatrix4(object.matrixWorld)
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
