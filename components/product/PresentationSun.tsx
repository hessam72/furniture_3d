'use client'

import { memo, useMemo } from 'react'
import * as THREE from 'three'
import { ShadowSystem } from '@/components/store/ShadowSystem'
import { SunLight, DEFAULT_SUN } from '@/components/store/SunLight'
import type { PartialSun } from '@/components/store/hooks/useStoreConfig'

/** Slack around the fitted frustum, metres. Covers the piece standing in the
 *  room, and the fact that the box is fitted once, from bounds measured before
 *  anything animates. */
const FIT_MARGIN = 1.5

/** The four bounds are all-or-nothing: a manifest that names them is hand-tuned
 *  and is left alone, one that names none is fitted. */
function hasBounds(sun: PartialSun): boolean {
  const s = sun.shadow
  return (
    s !== undefined &&
    s.left !== undefined &&
    s.right !== undefined &&
    s.top !== undefined &&
    s.bottom !== undefined
  )
}

/**
 * Fit the directional light's orthographic shadow frustum around a box.
 *
 * The box is measured in world space and the frustum lives in the light's, so
 * this projects all eight corners through the light's view matrix and takes the
 * extents there — the textbook fit, and the only one that holds for a sun
 * aimed diagonally across a room rather than down one of its axes.
 */
function fitToBox(box: THREE.Box3, position: THREE.Vector3, target: THREE.Vector3) {
  const view = new THREE.Matrix4()
    .lookAt(position, target, THREE.Object3D.DEFAULT_UP)
    .setPosition(position)
    .invert()

  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  const corner = new THREE.Vector3()
  for (let i = 0; i < 8; i++) {
    corner
      .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
      .applyMatrix4(view)
    min.min(corner)
    max.max(corner)
  }

  // three's cameras look down -Z, so a corner's depth from the light is -z.
  return {
    left: min.x - FIT_MARGIN,
    right: max.x + FIT_MARGIN,
    bottom: min.y - FIT_MARGIN,
    top: max.y + FIT_MARGIN,
    near: Math.max(0.1, -max.z - FIT_MARGIN),
    far: -min.z + FIT_MARGIN,
  }
}

/**
 * /store's window sun, on the presentation page.
 *
 * The light, the PCSS softening and the dev tuner are /store's own components,
 * imported rather than forked, so the two pages cannot drift apart and a
 * `?sundebug=1` printout is valid in either manifest.
 *
 * What is new here is the frustum. /store's box is hand-tuned per store, and
 * getting it wrong is that feature's defining failure: drei's PCSS shader
 * early-returns *fully lit* for any fragment outside the box, so an undersized
 * one does not clip the shadow, it pours sunlight through the walls. This page
 * already measures its room — PresentationRoom publishes the box the camera
 * clamps against — so the frustum is solved from those bounds instead of
 * guessed, in the same spirit as the gallery rig above it. A manifest that
 * names the four bounds itself still wins, and a product with no modelled room
 * falls back to /store's defaults.
 */
function PresentationSun({
  sun,
  roomBox,
}: {
  sun: PartialSun
  /** The measured room, once PresentationRoom has loaded it. */
  roomBox?: THREE.Box3 | null
}) {
  const fitted = useMemo<PartialSun>(() => {
    if (!roomBox || hasBounds(sun)) return sun

    const position = new THREE.Vector3(...(sun.position ?? DEFAULT_SUN.position))
    // With no aim point given, light the middle of the room rather than the
    // origin — the room is placed by `room.offset`, so the two are not the same.
    const target = sun.target
      ? new THREE.Vector3(...sun.target)
      : roomBox.getCenter(new THREE.Vector3())

    return {
      ...sun,
      target: target.toArray() as [number, number, number],
      // Manifest bias/normalBias survive: only the six frustum planes are solved.
      shadow: { ...sun.shadow, ...fitToBox(roomBox, position, target) },
    }
  }, [sun, roomBox])

  return (
    <>
      {/* Mounted alongside the light, as in /store: SoftShadows patches the
          global shadow shader chunk, and both room and furniture stream in
          afterwards and compile against the patched version. */}
      <ShadowSystem
        size={sun.soft?.size ?? DEFAULT_SUN.soft.size}
        samples={sun.soft?.samples ?? DEFAULT_SUN.soft.samples}
        focus={sun.soft?.focus ?? DEFAULT_SUN.soft.focus}
      />
      <SunLight sun={fitted} />
    </>
  )
}

/** @see the note on the memo in PresentationScene. */
export default memo(PresentationSun)
