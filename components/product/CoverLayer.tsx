'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { applyMatte, collectZoneTargets, disposeTargets, preparePresentationObject } from '@/lib/three/layerMaterials'
import { localBoundsY } from '@/lib/three/clipWipe'
import { useClipWipe, type WipeDirection } from '@/hooks/useClipWipe'
import { applyFirstCoat, useZonePaint } from '@/hooks/useZonePaint'
import { usePresentation } from '@/stores/presentationStore'
import { useQuality } from '@/contexts/QualityContext'
import type { CoverVariant } from '@/lib/product/presentation'

interface CoverLayerProps {
  variant: CoverVariant
  direction: WipeDirection
  durationMs: number
  /** Strip reflections. This layer is the one the buyer is actually judging,
   *  so it was the worst place to have missed it. */
  matte: boolean
  /** Enrol in the sun's shadow pass — see `sunEnabled`. */
  shadows: boolean
  onWipeComplete: () => void
}

/**
 * One cover material variant. Mounted with `key={variant.id}` so a swap creates
 * a fresh instance whose clip plane starts fully closed — the incoming cover
 * never flashes at full size before its reveal begins.
 */
export default function CoverLayer({ variant, direction, durationMs, matte, shadows, onWipeComplete }: CoverLayerProps) {
  const gltf = useGLTF(variant.path)
  const groupRef = useRef<THREE.Group>(null)
  const { settings } = useQuality()

  const { scene, targets, bounds } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    preparePresentationObject(clone, {
      envMapIntensity: matte ? 0 : settings.envIntensity,
      anisotropy: settings.anisotropyLevel,
      shadows,
    })

    // The whole layer is clipped, so every material must be cloned — not just
    // the painted ones. Bounds are read here, before the clone is parented,
    // while its world matrix is still identity.
    const collected = collectZoneTargets(clone, { zone: 'cover' })
    applyFirstCoat(collected, usePresentation.getState().paint)

    // Per-variant surface character (leather vs velvet vs polyurethane).
    collected.forEach(({ material }) => {
      if (variant.material?.roughness !== undefined) material.roughness = variant.material.roughness
      if (variant.material?.metalness !== undefined) material.metalness = variant.material.metalness
      if (variant.material?.clearcoat !== undefined && material.clearcoat !== undefined) {
        material.clearcoat = variant.material.clearcoat
      }
    })

    if (matte) applyMatte(collected)

    return { scene: clone, targets: collected, bounds: localBoundsY(clone) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, variant.path, matte, shadows])

  useZonePaint(targets)
  useClipWipe({ groupRef, targets, bounds, direction, durationMs, onComplete: onWipeComplete })

  useEffect(() => () => disposeTargets(targets), [targets])

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  )
}
