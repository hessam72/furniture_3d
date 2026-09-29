import * as THREE from 'three'

/**
 * Where the room's numbered slots are, and how a piece stands on one.
 *
 * A slot's position is never in the payload: the 3D team drops an empty named
 * `stage_3` into the room GLB, the backend only stores that name, and the
 * loaded file is the one source of where it is. @see RoomSlot
 */

/** One loaded room file, as the anchor lookup sees it. */
export interface RoomRoot {
  url: string
  object: THREE.Object3D
  isCollider: boolean
  priority: number
}

/**
 * The node a slot names, in the loaded room, or null.
 *
 * Exact first — the backend checks anchors against the name three.js gives a
 * node (sanitised, de-duplicated), so that is the one that should hit — then
 * case-insensitive, which is how the backend matches them itself. Visual files
 * before the collider: an artist who left the empties in both would otherwise
 * get whichever copy traversal met first.
 */
export function findAnchor(roots: RoomRoot[], name: string): THREE.Object3D | null {
  const ordered = [...roots].sort(
    (a, b) => Number(a.isCollider) - Number(b.isCollider) || a.priority - b.priority
  )

  for (const root of ordered) {
    const hit = root.object.getObjectByName(name)
    if (hit) return hit
  }

  const wanted = name.toLowerCase()
  for (const root of ordered) {
    let hit: THREE.Object3D | null = null
    root.object.traverse((child) => {
      if (!hit && child.name.toLowerCase() === wanted) hit = child
    })
    if (hit) return hit
  }

  return null
}

/** Where a piece stands, in world space. */
export interface SlotPose {
  position: [number, number, number]
  /** Heading about the vertical, radians — same convention as `rotation.y`. */
  yaw: number
}

const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _fwd = new THREE.Vector3()

/**
 * The anchor's world position and heading.
 *
 * Heading only: furniture stands upright whatever the empty's tilt. Scale is
 * dropped too — an empty's scale is its display size in Blender, or the room's
 * own unit conversion, and a product GLB is already at real scale.
 *
 * Read after the room is mounted, so the visual file's re-base to Y = 0
 * (@see ModelLoader) is part of the answer rather than an offset under it.
 */
export function slotPose(anchor: THREE.Object3D): SlotPose {
  anchor.updateWorldMatrix(true, false)
  anchor.matrixWorld.decompose(_pos, _quat, _scale)

  _fwd.set(0, 0, 1).applyQuaternion(_quat)
  const yaw = Math.hypot(_fwd.x, _fwd.z) > 1e-6 ? Math.atan2(_fwd.x, _fwd.z) : 0

  return { position: [_pos.x, _pos.y, _pos.z], yaw }
}

/** How a piece sits on its slot, in its own frame. */
export interface Footprint {
  /** Puts the bounds' bottom-centre on the slot — a GLB's origin is not
   *  trusted to be there, the same rule every product viewer here applies. */
  offset: [number, number, number]
  size: [number, number, number]
}

/** Null for a GLB with no geometry: nothing to stand, nothing to collide. */
export function footprintOf(object: THREE.Object3D): Footprint | null {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return null

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  return {
    offset: [-center.x, -box.min.y, -center.z],
    size: [size.x, size.y, size.z],
  }
}
