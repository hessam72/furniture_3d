'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  easeInOutCubic,
  localBoundsY,
  makeClipPlane,
  PARKED_CONSTANT,
  syncPlaneToWorld,
  type WipeBounds,
} from '@/lib/three/clipWipe'
import type { ZoneTarget } from '@/lib/three/layerMaterials'

export type WipeDirection = 'in' | 'out' | null

interface UseClipWipeArgs {
  /** The group whose world matrix positions this layer (spin + tilt + explode). */
  groupRef: React.RefObject<THREE.Object3D>
  targets: ZoneTarget[]
  bounds: WipeBounds
  /** Which way to sweep. `null` parks the plane wide open. */
  direction: WipeDirection
  /** Full sweep duration in ms. */
  durationMs: number
  onComplete?: () => void
}

/**
 * Bottom-up clipping-plane reveal.
 *
 * The plane lives in the layer's local space and is re-projected into world
 * space every frame the layer can have moved — `material.clippingPlanes` is
 * evaluated in world space, so a fixed plane would slice along the wrong axis
 * the moment the piece is tilted or exploded.
 *
 * On completion the plane is *parked* (constant pushed far past the bounds)
 * rather than detached: setting `clippingPlanes = null` flips the shader
 * variant and forces a program recompile on every cover swap.
 */
export function useClipWipe({
  groupRef,
  targets,
  bounds,
  direction,
  durationMs,
  onComplete,
}: UseClipWipeArgs) {
  const invalidate = useThree((s) => s.invalidate)

  const { localPlane, worldPlane } = useMemo(
    () => ({ localPlane: makeClipPlane(bounds.minY), worldPlane: makeClipPlane(bounds.minY) }),
    [bounds.minY]
  )

  const progressRef = useRef(0)
  const directionRef = useRef<WipeDirection>(null)
  /** The plane the effect below has already set an initial constant on. */
  const initialised = useRef<THREE.Plane | null>(null)
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete

  // Attach the plane to every material this layer owns. One shared Plane
  // instance, so mutating its constant needs no per-material bookkeeping.
  //
  // useLayoutEffect, not useEffect: R3F draws on invalidate() rather than in
  // step with React's commit, and a layout effect lands before the next draw —
  // so a freshly mounted cover is never painted unclipped for one frame.
  useLayoutEffect(() => {
    targets.forEach(({ material }) => {
      material.clippingPlanes = [worldPlane]
      material.clipShadows = false
      material.needsUpdate = true
    })
    if (groupRef.current) syncPlaneToWorld(localPlane, worldPlane, groupRef.current)
    return () => {
      targets.forEach(({ material }) => {
        material.clippingPlanes = null
      })
    }
  }, [targets, worldPlane, localPlane, groupRef])

  // A direction change restarts the sweep. Reversing mid-flight keeps the
  // progress already covered so a fast double-tap does not jump.
  //
  // The park below must also run for a plane this effect has not set a constant
  // on yet — a mount, or a bounds change that rebuilt it. `directionRef` starts
  // null, so a layer mounted with no wipe in flight matched the change guard and
  // returned before parking, leaving the plane at the closed constant it was
  // constructed with, forever. Harmless while every cover mounts behind a
  // `wipeIn`, and fatal the moment the scene remounts at rest — returning from
  // AR, or rebuilding after a lost context.
  useLayoutEffect(() => {
    const changed = direction !== directionRef.current
    const fresh = initialised.current !== localPlane
    if (!changed && !fresh) return
    initialised.current = localPlane

    if (changed) {
      if (direction && directionRef.current) progressRef.current = 1 - progressRef.current
      else progressRef.current = 0
      directionRef.current = direction
    }

    if (!direction) {
      localPlane.constant = PARKED_CONSTANT
      // Projected here rather than left to useFrame, so the first drawn frame is
      // already open — the attach effect above ran with the closed value.
      if (groupRef.current) syncPlaneToWorld(localPlane, worldPlane, groupRef.current)
    }
    invalidate()
  }, [direction, localPlane, worldPlane, groupRef, invalidate])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    const dir = directionRef.current
    if (!dir) {
      // Parked, but the layer may still be spinning — keep the world plane
      // in sync so it stays wide open rather than drifting into the geometry.
      syncPlaneToWorld(localPlane, worldPlane, group)
      return
    }

    progressRef.current = Math.min(1, progressRef.current + (delta * 1000) / durationMs)
    const e = easeInOutCubic(progressRef.current)
    localPlane.constant =
      dir === 'in'
        ? THREE.MathUtils.lerp(bounds.minY, bounds.maxY, e)
        : THREE.MathUtils.lerp(bounds.maxY, bounds.minY, e)

    syncPlaneToWorld(localPlane, worldPlane, group)
    invalidate()

    if (progressRef.current >= 1) {
      progressRef.current = 0
      directionRef.current = null
      // Park a finished reveal wide open. A finished wipe-out stays at minY —
      // the layer is about to unmount anyway.
      if (dir === 'in') {
        localPlane.constant = PARKED_CONSTANT
        syncPlaneToWorld(localPlane, worldPlane, group)
      }
      completeRef.current?.()
    }
  })
}

export { localBoundsY }
