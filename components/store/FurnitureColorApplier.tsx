'use client'

import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePresentation } from '@/stores/presentationStore'
import { useFurnitureConfig } from '@/stores/furnitureConfigStore'
import { findSceneObject, describeSceneNames } from '@/lib/store/sceneObject'
import { collectZoneTargets, disposeTargets, type ZoneTarget } from '@/lib/three/layerMaterials'
import { applyFirstCoat, useZonePaint } from '@/hooks/useZonePaint'
import { applyFirstSwatch, useSwatchTextures } from '@/hooks/useSwatchTextures'
import { unconfiguredPaint, hasPresentation } from '@/lib/product/presentation'
import { useQuality } from '@/contexts/QualityContext'
import { isDebug } from '@/components/three/rendererStatsStore'

interface FurnitureColorApplierProps {
  /** products.json / manifest key for the selected piece — @see focusedKey in
   *  Scene.tsx. Distinct from selectedFurnitureId, which names the mesh in
   *  the scene graph rather than the product in the manifest. */
  productKey: string | null
}

/**
 * Put a mesh back exactly as collectZoneTargets found it.
 *
 * collectZoneTargets never does this itself — it's written for a page that
 * clones a fresh GLB per mount, so there's nothing to restore. /store's room
 * is one persistent, shared scene a shopper repeatedly selects pieces in and
 * out of: without this, a reselect would clone *last* selection's already-
 * cloned material instead of the authored one, compounding rather than
 * repainting, and every selection after the first would leak the one before.
 */
function restoreMeshes(meshes: THREE.Mesh[]) {
  meshes.forEach((mesh) => {
    const original = mesh.userData.originalMaterial as THREE.Material | THREE.Material[] | undefined
    if (original) {
      mesh.material = original
      delete mesh.userData.originalMaterial
    }
  })
}

/**
 * Real zone-painting and fabric-texture swapping for /store, reusing the same
 * engine `/simple` and `/product` run — `collectZoneTargets`, `useZonePaint`,
 * `useSwatchTextures` — rather than the old solid-tint-only implementation.
 * /store only ever dresses the `cover` zone (no wood/cushion/shawl split).
 *
 * Paint state is the shared `usePresentation` store, not a shape of our own —
 * `useZonePaint`/`useSwatchTextures` read it directly and are not written to
 * take an injected source, so reusing them here at all means reusing that
 * store too. Its other fields (`coverId`, `layerStep`, wipe timing) are
 * /product's layered-presentation state; unused here, and harmless.
 */
export function FurnitureColorApplier({ productKey }: FurnitureColorApplierProps) {
  const { scene, invalidate } = useThree()
  const selectedFurnitureId = useFurnitureConfig((s) => s.selectedFurnitureId)
  const { preset, settings } = useQuality()
  const initProduct = usePresentation((s) => s.initProduct)
  const resetPaint = usePresentation((s) => s.reset)

  const [targets, setTargets] = useState<ZoneTarget[]>([])
  const meshesRef = useRef<THREE.Mesh[]>([])

  useEffect(() => {
    if (!selectedFurnitureId) {
      setTargets([])
      return
    }

    const furnitureObject = findSceneObject(scene, [selectedFurnitureId])
    if (!furnitureObject) {
      if (isDebug()) {
        console.warn(
          `[FurnitureColorApplier] "${selectedFurnitureId}" not found in scene. Scene names:`,
          describeSceneNames(scene)
        )
      }
      setTargets([])
      return
    }

    // No manifest entry for this product → nothing to configure. Leave every
    // mesh on its authored material rather than cloning for no reason.
    if (!productKey || !hasPresentation(productKey)) {
      setTargets([])
      return
    }

    // Back up every mesh's authored material before collectZoneTargets clones
    // over it — restored by this effect's own cleanup, below.
    const meshes: THREE.Mesh[] = []
    furnitureObject.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && mesh.material && !mesh.userData.originalMaterial) {
        mesh.userData.originalMaterial = mesh.material
        meshes.push(mesh)
      }
    })
    meshesRef.current = meshes

    const collected = collectZoneTargets(furnitureObject, { zone: 'cover', physical: preset !== 'low' })

    // unconfiguredPaint, not defaultPaint: the piece shows exactly what its
    // GLB was exported with until the shopper picks a swatch — same as
    // /simple. @see ZonePaint.authored
    initProduct(productKey, unconfiguredPaint(), '', 1)
    const paint = usePresentation.getState().paint
    applyFirstCoat(collected, paint)
    applyFirstSwatch(collected, paint, settings.anisotropyLevel)
    invalidate()

    setTargets(collected)

    return () => {
      disposeTargets(collected)
      restoreMeshes(meshesRef.current)
      meshesRef.current = []
      resetPaint()
      invalidate()
    }
  }, [selectedFurnitureId, productKey, scene, preset, settings.anisotropyLevel, initProduct, resetPaint, invalidate])

  useZonePaint(targets)
  useSwatchTextures(targets)

  return null
}
