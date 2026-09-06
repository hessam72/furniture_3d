'use client'

import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { preparePresentationObject } from '@/lib/three/layerMaterials'
import { useQuality } from '@/contexts/QualityContext'
import type { StageMeta } from '@/lib/product/presentation'

/**
 * The plinth the piece stands on.
 *
 * Centred in X/Z and seated in Y, the same two rules the piece itself follows —
 * a stage is only ever *under* the piece, so an authored origin somewhere else
 * is a mistake to correct rather than an intention to honour. `offset` is the
 * escape hatch for a stage that really is meant to sit off to one side.
 *
 * What it deliberately does not do is as important as what it does. It runs no
 * `collectZoneTargets`, so no mesh of its can be picked up as a paint target
 * however it is named or tagged in Blender, and it is never written to
 * `ExportSources`, so the AR build has no way to include it. Both exclusions
 * are structural: there is no flag to get wrong.
 *
 * It is not matted either. `matte` exists to stop the environment tinting the
 * colours a customer picks; the stage has none, so it keeps its authored look.
 */
export default function PresentationStage({
  meta,
  floorY,
  shadows,
  onHeight,
}: {
  meta: StageMeta
  floorY: number
  /** Enrol in the sun's shadow pass — the piece should cast onto the plinth. */
  shadows: boolean
  /** The stage's top, measured from `floorY`. Drives `liftPiece`. */
  onHeight?: (height: number) => void
}) {
  const gltf = useGLTF(meta.path)
  const invalidate = useThree((s) => s.invalidate)
  const { settings } = useQuality()

  const { scene, height } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    preparePresentationObject(clone, {
      envMapIntensity: meta.envIntensity ?? 1,
      anisotropy: settings.anisotropyLevel,
      shadows,
    })

    clone.scale.setScalar(meta.scale ?? 1)
    const box = new THREE.Box3().setFromObject(clone)
    const centre = box.getCenter(new THREE.Vector3())
    clone.position.set(
      -centre.x + (meta.offset?.[0] ?? 0),
      floorY - box.min.y + (meta.offset?.[1] ?? 0),
      -centre.z + (meta.offset?.[2] ?? 0)
    )

    const top = box.max.y - box.min.y + (meta.offset?.[1] ?? 0)

    if (process.env.NODE_ENV !== 'production') {
      const size = box.getSize(new THREE.Vector3())
      console.log(
        `[PresentationStage] ${meta.path} · ${size.toArray().map((n) => n.toFixed(2)).join(' x ')}m` +
          ` · deck ${top.toFixed(3)}m over floorY${meta.liftPiece ? ' (piece lifted onto it)' : ''}`
      )
      if (size.y > 1) {
        console.warn(
          `[PresentationStage] the stage is ${size.y.toFixed(2)}m tall — that is a podium, not a` +
            ' plinth. Check the Blender unit scale, or set layers.stage.scale.'
        )
      }
    }

    return { scene: clone, height: Math.max(0, top) }
  }, [gltf.scene, meta.path, meta.scale, meta.offset, meta.envIntensity, meta.liftPiece, floorY, shadows, settings.anisotropyLevel])

  useEffect(() => {
    onHeight?.(height)
    invalidate()
  }, [height, onHeight, invalidate])

  return <primitive object={scene} name="presentation-stage" />
}
