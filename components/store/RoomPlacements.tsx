'use client'
import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { useLoader, useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody, interactionGroups } from '@react-three/rapier'
import { useQuality } from '@/contexts/QualityContext'
import { applyAnisotropy } from '@/lib/three/prepareCarMaterial'
import { extendGltfLoader } from '@/lib/three/gltfLoaders'
import { findAnchor, footprintOf, slotPose, type RoomRoot, type SlotPose } from '@/lib/store/roomAnchors'
import { PartErrorBoundary } from '@/components/three/PartErrorBoundary'
import { markStoreActivity } from './activityGovernor'
import type { RoomPlacement } from './hooks/useStoreConfig'

/**
 * Placed pieces are their own collision group, so the focus flight's
 * obstruction cast can look past them. Without it, tapping a sofa from behind
 * would clamp the landing short of the sofa's back instead of bringing the
 * visitor round to its front. The player still collides with them.
 * @see ProductFocusCamera
 */
const PLACED_PIECE = 1
const PLACED_PIECE_GROUPS = interactionGroups(PLACED_PIECE)
/** Query filter for "the room only" — everything except placed pieces. */
export const ROOM_ONLY_QUERY = interactionGroups(0, 0)

/** A rug or a mat is walked over, not around. */
const MIN_COLLIDER_HEIGHT = 0.15
/** Bounds past this are a stray node or a baked ground plane, not furniture —
 *  a collider that size would wall the visitor in. */
const MAX_COLLIDER_EXTENT = 8

type RoomPlacementsProps = {
  placements: RoomPlacement[]
  /** The mounted room files. @see ModelLoader onRoomRoot */
  roots: RoomRoot[]
  /** Product slug → raycast name (`ProductData.id`), for click matching */
  raycastNames: Record<string, string>
}

/**
 * The showroom's products, each standing on its numbered slot.
 *
 * Mounted once the room is: a slot's position is read from the loaded room
 * GLB, never from the payload. The GLBs themselves are preloaded alongside
 * the room (@see Scene), so by now most are already parsed.
 *
 * Each piece suspends and fails on its own. One missing or corrupt product
 * file costs that piece, not the room.
 */
export function RoomPlacements({ placements, roots, raycastNames }: RoomPlacementsProps) {
  const standing = useMemo(
    () =>
      placements.flatMap((placement) => {
        const anchor = findAnchor(roots, placement.anchor)
        if (!anchor) {
          console.warn(
            `[RoomPlacements] Slot ${placement.slot}: no node named "${placement.anchor}" in the room — ` +
              `"${placement.product}" is not placed.`
          )
          return []
        }
        return [{ placement, pose: slotPose(anchor) }]
      }),
    [placements, roots]
  )

  return (
    <>
      {standing.map(({ placement, pose }) => (
        <PartErrorBoundary key={`${placement.slot}:${placement.glbPath}`} category={`slot ${placement.slot}`}>
          <Suspense fallback={null}>
            <PlacedPiece placement={placement} pose={pose} raycastName={raycastNames[placement.product]} />
          </Suspense>
        </PartErrorBoundary>
      ))}
    </>
  )
}

function PlacedPiece({
  placement,
  pose,
  raycastName,
}: {
  placement: RoomPlacement
  pose: SlotPose
  raycastName?: string
}) {
  const { settings } = useQuality()
  const invalidate = useThree((s) => s.invalidate)
  const gltf = useLoader(GLTFLoader, placement.glbPath, extendGltfLoader)

  const { object, footprint } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
    return { object: clone, footprint: footprintOf(clone) }
  }, [gltf.scene])

  // Texture sharpening follows the quality tier, as the room's does
  useEffect(() => {
    object.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => applyAnisotropy(mat, settings.anisotropyLevel))
      }
    })
  }, [object, settings.anisotropyLevel])

  // The loop runs on demand: a piece that lands while the visitor stands
  // still would otherwise not be drawn until they move
  useEffect(() => {
    markStoreActivity()
    invalidate()
  }, [invalidate])

  const [w, h, d] = footprint?.size ?? [0, 0, 0]
  const collides = footprint !== null && h >= MIN_COLLIDER_HEIGHT && Math.max(w, h, d) <= MAX_COLLIDER_EXTENT

  return (
    <RigidBody type="fixed" colliders={false} position={pose.position} rotation={[0, pose.yaw, 0]}>
      {/* Named by slug — the key the catalogue and the focus flight resolve
          by — and tagged, so a click can name the product without guessing */}
      <group name={placement.product} userData={{ productKey: placement.product, slot: placement.slot }}>
        {/* Named by raycast name — what a click and the colour applier match */}
        <group name={raycastName ?? ''} position={footprint?.offset ?? [0, 0, 0]}>
          <primitive object={object} />
        </group>
      </group>
      {collides && (
        <CuboidCollider
          args={[w / 2, h / 2, d / 2]}
          position={[0, h / 2, 0]}
          collisionGroups={PLACED_PIECE_GROUPS}
        />
      )}
    </RigidBody>
  )
}
