/**
 * Custom Hook: Swatch Texture Application
 *
 * Purpose: Puts the chosen fabric's maps on a layer's materials, and takes them
 *          back off when a plain colour swatch is picked
 * Pattern: Mirrors useZonePaint — same target set, same store, same one-shot
 *          invalidate() under frameloop="demand" — but nothing is damped here.
 *          A texture either is or is not; there is no lerping between two images.
 * Used By: SimpleViewer, FurnitureStack, CoverLayer — beside useZonePaint
 */
'use client'

import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { usePresentation, type ZonePaintConfig } from '@/stores/presentationStore'
import { useQuality } from '@/contexts/QualityContext'
import {
  applySwatchTextures,
  ensureSwatchMaps,
  evictSwatchTextures,
  peekSwatchMaps,
  releaseSwatchMaps,
  retainSwatchMaps,
  type SwatchMaps,
  type SwatchSpec,
} from '@/lib/three/swatchTextures'
import type { ZoneTarget } from '@/lib/three/layerMaterials'
import type { PresentationZone } from '@/lib/product/presentation'

/** The paint state for one zone, as a spec the texture layer understands. */
function specFor(paint: ZonePaintConfig, zone: PresentationZone): SwatchSpec | null {
  const zonePaint = paint[zone]
  if (!zonePaint?.maps) return null
  return {
    id: zonePaint.swatchId ?? '',
    maps: zonePaint.maps,
    materials: zonePaint.materials,
    uv: zonePaint.uv,
    normalScale: zonePaint.normalScale ?? undefined,
  }
}

/**
 * Dress freshly cloned materials from the cache, synchronously.
 *
 * The partner to `applyFirstCoat`, called from the same clone `useMemo` and for
 * the same reason: a layer that mounts while a fabric is already chosen must not
 * render one frame in the cloth its GLB shipped with. Cache-only by design —
 * nothing here can await, so a cold swatch simply stays authored until the
 * effect below lands, which is a frame, not a flash.
 */
export function applyFirstSwatch(targets: ZoneTarget[], paint: ZonePaintConfig, anisotropy: number) {
  const zones = new Set(targets.map((target) => target.zone))
  zones.forEach((zone) => {
    const zoneTargets = targets.filter((target) => target.zone === zone)
    applySwatchTextures(zoneTargets, specFor(paint, zone), anisotropy)
  })
}

/**
 * Keep a layer's maps in step with the chosen swatch.
 *
 * Three things it has to get right, each of which was a listed risk:
 *
 *  - **A load that resolves after the customer moved on** must not paint a
 *    fabric they are no longer looking at. Hence the request token: only the
 *    newest run is allowed to apply.
 *  - **A failure must not take the page down.** `ensureSwatchMaps` resolves
 *    rather than rejects, and a slot whose texture never arrived is left at its
 *    authored map — a missing fabric shows the wrong cloth, never a blank page.
 *  - **The demand loop.** One `invalidate()` per application, never per frame.
 *    `?debug` must still read 0 fps at idle.
 */
export function useSwatchTextures(targets: ZoneTarget[]) {
  const paint = usePresentation((s) => s.paint)
  const invalidate = useThree((s) => s.invalidate)
  const { settings } = useQuality()
  const anisotropy = settings.anisotropyLevel

  const tokenRef = useRef(0)
  /** What this layer currently pins against eviction, so it can let go exactly once. */
  const heldRef = useRef<SwatchMaps[]>([])

  useEffect(() => {
    if (!targets.length) return
    const token = ++tokenRef.current
    const zones = [...new Set(targets.map((target) => target.zone))]
    const specs = zones.map((zone) => ({ zone, spec: specFor(paint, zone) }))

    const apply = () => {
      if (tokenRef.current !== token) return
      specs.forEach(({ zone, spec }) => {
        applySwatchTextures(
          targets.filter((target) => target.zone === zone),
          spec,
          anisotropy
        )
      })

      // Retain before release, so a fabric held across the change never drops to
      // zero references and get evicted out from under the material showing it.
      const next = specs.map(({ spec }) => spec?.maps).filter((maps): maps is SwatchMaps => !!maps)
      next.forEach(retainSwatchMaps)
      heldRef.current.forEach(releaseSwatchMaps)
      heldRef.current = next
      evictSwatchTextures()

      invalidate()
    }

    const pending = specs.filter(({ spec }) => spec && !peekSwatchMaps(spec.maps))
    if (!pending.length) {
      // Already warm: apply in this commit rather than a microtask later. The
      // second tap on a swatch is the one people judge.
      apply()
      return
    }

    void Promise.all(pending.map(({ spec }) => ensureSwatchMaps(spec!.maps))).then(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, targets, anisotropy, invalidate])

  // Let go on unmount, so a layer swapped out stops pinning its fabric.
  useEffect(() => {
    const held = heldRef
    return () => {
      held.current.forEach(releaseSwatchMaps)
      held.current = []
    }
  }, [])
}
