/**
 * Custom Hook: Multi-Zone Color Interpolation
 *
 * Purpose: Smooth color transitions for different material zones (wood/cover/cushion)
 * Pattern: useRef to avoid re-renders + useFrame for 60fps lerp + automatic settle detection
 * Why Hook: Each zone needs same logic, performance critical (60fps), reusable across layers
 * Performance: Animates via useRef (no React re-renders), invalidates only while moving
 * Used By: ProductCover, ProductFrame, ProductSoft components
 */
'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePresentation, type ZonePaint, type ZonePaintConfig } from '@/stores/presentationStore'
import type { ZoneTarget } from '@/lib/three/layerMaterials'

/** Applies the current zone colours to freshly cloned materials, synchronously.
 *  Called from the clone useMemo so a layer never renders one frame in its
 *  authored GLB colour before the effect below can correct it. */
export function applyFirstCoat(targets: ZoneTarget[], paint: ZonePaintConfig) {
  targets.forEach(({ material, zone }) => {
    const zoneConfig = paint[zone]
    if (!zoneConfig) return
    material.color.set(zoneConfig.color)
    material.metalness = zoneConfig.metalness
    material.roughness = zoneConfig.roughness
    if (material.clearcoat !== undefined) material.clearcoat = zoneConfig.clearcoat
    applySheen(material, zoneConfig)
  })
}

/** Never let a Physical material's actual sheen sit at exactly 0 once it is
 *  capable of sheen at all. @see applySheen */
const SHEEN_FLOOR = 0.02

/**
 * Sheen, set directly rather than through the damped loop below.
 *
 * three keys its `USE_SHEEN` shader define on `sheen > 0` at compile time. A
 * lerp that passes through exactly 0 on its way to a new value would toggle
 * that define and recompile the program mid-blend — the "climbing prog
 * count" the plan's verification section warns about. Snapping instead, and
 * flooring at `SHEEN_FLOOR` rather than a true 0, keeps `USE_SHEEN` compiled
 * in for the whole life of a material that can use it at all.
 *
 * `material.sheen === undefined` is the same guard `clearcoat` already uses:
 * this material was never upgraded to genuinely Physical (@see
 * lib/three/layerMaterials.ts's `physical` opt-in), so there is nothing to
 * set and nothing to floor.
 */
function applySheen(material: THREE.MeshPhysicalMaterial, paint: ZonePaint) {
  if (material.sheen === undefined) return
  material.sheen = Math.max(paint.sheen ?? 0, SHEEN_FLOOR)
  if (paint.sheenRoughness !== undefined) material.sheenRoughness = paint.sheenRoughness
  if (paint.sheenColor !== undefined) material.sheenColor.set(paint.sheenColor)
}

/**
 * Per-layer colour blending, ported from ConfigurableCar's paint pipeline.
 *
 * The first coat is `applyFirstCoat` above, run synchronously at clone time;
 * every later change blends over ~400ms here. Under frameloop="demand" the
 * blend must call invalidate() every frame it moves and stop when it settles,
 * or it either freezes mid-lerp or pins the loop at 60fps forever.
 */
export function useZonePaint(targets: ZoneTarget[]) {
  const paint = usePresentation((s) => s.paint)
  const invalidate = useThree((s) => s.invalidate)

  const firstPaintRef = useRef(true)
  const animatingRef = useRef(false)
  const scratchRef = useRef(new THREE.Color())

  useEffect(() => {
    if (!targets.length) return
    // The mount run is a no-op: applyFirstCoat already put these materials at
    // the current colour, so there is nothing to blend from.
    if (firstPaintRef.current) {
      firstPaintRef.current = false
      return
    }
    // Sheen snaps here, undamped — @see applySheen — while everything else
    // below enters the lerp.
    targets.forEach(({ material, zone }) => {
      const zoneConfig = paint[zone]
      if (zoneConfig) applySheen(material, zoneConfig)
    })
    animatingRef.current = true
    invalidate()
  }, [paint, targets, invalidate])

  useFrame((_, delta) => {
    if (!animatingRef.current) return
    const d = 1 - Math.exp(-10 * delta) // ~400ms blend
    const scratch = scratchRef.current
    let moving = false

    targets.forEach(({ material, zone }) => {
      const zoneConfig = paint[zone]
      scratch.set(zoneConfig.color)
      material.color.lerp(scratch, d)
      material.metalness = THREE.MathUtils.damp(material.metalness, zoneConfig.metalness, 10, delta)
      material.roughness = THREE.MathUtils.damp(material.roughness, zoneConfig.roughness, 10, delta)
      if (material.clearcoat !== undefined) {
        material.clearcoat = THREE.MathUtils.damp(material.clearcoat, zoneConfig.clearcoat, 10, delta)
      }

      if (
        Math.abs(material.color.r - scratch.r) > 0.004 ||
        Math.abs(material.color.g - scratch.g) > 0.004 ||
        Math.abs(material.color.b - scratch.b) > 0.004 ||
        Math.abs(material.metalness - zoneConfig.metalness) > 0.004 ||
        Math.abs(material.roughness - zoneConfig.roughness) > 0.004
      ) {
        moving = true
      } else {
        material.color.copy(scratch)
        material.metalness = zoneConfig.metalness
        material.roughness = zoneConfig.roughness
        if (material.clearcoat !== undefined) material.clearcoat = zoneConfig.clearcoat
      }
    })

    if (moving) invalidate()
    else animatingRef.current = false
  })
}
