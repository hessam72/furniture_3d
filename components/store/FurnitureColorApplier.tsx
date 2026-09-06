'use client'

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useFurnitureConfig } from '@/stores/furnitureConfigStore'
import { findSceneObject, describeSceneNames } from '@/lib/store/sceneObject'
import * as THREE from 'three'

interface PaintTarget {
  material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial
  initialColor: THREE.Color
  meshName: string
}

export function FurnitureColorApplier() {
  const { scene, invalidate } = useThree()
  const selectedFurnitureId = useFurnitureConfig((s) => s.selectedFurnitureId)
  const currentColor = useFurnitureConfig((s) => s.currentColor)
  const colorInitialized = useFurnitureConfig((s) => s.colorInitialized)
  const setColorTransitioning = useFurnitureConfig((s) => s.setColorTransitioning)
  const setOriginalColor = useFurnitureConfig((s) => s.setOriginalColor)
  const setColor = useFurnitureConfig((s) => s.setColor)

  const paintTargetsRef = useRef<PaintTarget[]>([])
  const firstPaintRef = useRef(true)
  const paintAnimatingRef = useRef(false)
  const paintScratchRef = useRef(new THREE.Color())

  // Collect paintable materials when furniture is selected
  useEffect(() => {
    if (!selectedFurnitureId) {
      paintTargetsRef.current = []
      console.log('[FurnitureColorApplier] No furniture ID selected')
      return
    }

    // Shared tolerant resolver: the room is authored on names that don't always
    // equal the products.json key, and an exact match here used to fail
    // silently — leaving the furniture unpainted with no way to tell why
    console.log(`[FurnitureColorApplier] Searching for object with name: "${selectedFurnitureId}"`)

    const furnitureObject = findSceneObject(scene, [selectedFurnitureId])

    if (!furnitureObject) {
      console.warn(
        `[FurnitureColorApplier] Furniture object "${selectedFurnitureId}" not found in scene. Scene names:`,
        describeSceneNames(scene)
      )
      paintTargetsRef.current = []
      return
    }

    console.log(
      `[FurnitureColorApplier] Found object: "${furnitureObject.name}" (type: ${furnitureObject.type})`
    )

    const targets: PaintTarget[] = []
    let meshCount = 0
    let colorableCount = 0
    let totalChildren = 0

    console.log('[FurnitureColorApplier] Processing furniture:', selectedFurnitureId, 'Found object:', furnitureObject.name)
    console.log('[FurnitureColorApplier] Object hierarchy:')

    // Log hierarchy first to understand structure
    const logHierarchy = (obj: THREE.Object3D, depth = 0) => {
      const indent = '  '.repeat(depth)
      const isMesh = obj instanceof THREE.Mesh
      console.log(`${indent}- ${obj.name} (${obj.type})${isMesh ? ' [MESH]' : ''}`)
      obj.children.forEach(child => logHierarchy(child, depth + 1))
    }
    logHierarchy(furnitureObject)

    // Traverse ONLY this furniture object and find colorable meshes
    furnitureObject.traverse((child: THREE.Object3D) => {
      totalChildren++
      if (child instanceof THREE.Mesh) {
        meshCount++
        const childName = child.name.toLowerCase()

        // ONLY check mesh name for colorable keywords
        const isColorable =
          childName.includes('fabric') ||
          childName.includes('cushion') ||
          childName.includes('upholstery') ||
          childName.includes('seat')

        // Find parent chain for debugging
        let parentChain = child.name
        let parent = child.parent
        while (parent && parent !== furnitureObject) {
          parentChain = `${parent.name} > ${parentChain}`
          parent = parent.parent
        }

        console.log(`  Mesh: ${child.name}, Path: ${parentChain}, colorable: ${isColorable}`)

        if (isColorable) {
          colorableCount++
          // Clone material to avoid affecting other instances
          if (!child.userData.originalMaterial) {
            child.userData.originalMaterial = child.material
            child.material = (child.material as THREE.Material).clone()
          }

          const material = child.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial
          targets.push({
            material,
            initialColor: material.color.clone(),
            meshName: child.name,
          })
          console.log(`    -> Added to color targets (depth: ${parentChain.split('>').length})`)
        }
      }
    })

    console.log(
      `[FurnitureColorApplier] Found ${meshCount} meshes, ${colorableCount} colorable, ${targets.length} targets`
    )

    // Fallback: if no specific children found, color entire furniture
    if (targets.length === 0 && meshCount > 0) {
      console.log('[FurnitureColorApplier] No specific colorable children found, applying to all meshes (fallback)')
      furnitureObject.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material) {
          if (!child.userData.originalMaterial) {
            child.userData.originalMaterial = child.material
            child.material = (child.material as THREE.Material).clone()
          }
          const material = child.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial
          targets.push({
            material,
            initialColor: material.color.clone(),
            meshName: child.name,
          })
          console.log(`    -> Added ${child.name} to fallback targets`)
        }
      })
      console.log(`[FurnitureColorApplier] Fallback added ${targets.length} targets`)
    }

    // Store original color from first target and set it as current color
    if (targets.length > 0) {
      const originalColorHex = `#${targets[0].initialColor.getHexString()}`
      console.log('[FurnitureColorApplier] Original color:', originalColorHex)
      setOriginalColor(originalColorHex)
      // Set original color as the current/active color on initial load
      setColor(originalColorHex)
    }

    paintTargetsRef.current = targets
    firstPaintRef.current = true
  }, [selectedFurnitureId, scene, setOriginalColor, setColor])

  // Apply color change
  useEffect(() => {
    if (!colorInitialized || !currentColor || paintTargetsRef.current.length === 0) {
      console.log(
        '[FurnitureColorApplier] Color change skipped:',
        'initialized:',
        colorInitialized,
        'color:',
        currentColor,
        'targets:',
        paintTargetsRef.current.length
      )
      return
    }

    console.log(`[FurnitureColorApplier] Applying color ${currentColor} to ${paintTargetsRef.current.length} targets`)

    paintTargetsRef.current.forEach(({ material, meshName }) => {
      if (firstPaintRef.current) {
        // Instant first coat
        material.color.set(currentColor)
        console.log(`  -> Set ${meshName} to ${currentColor}`)
      }
    })

    if (firstPaintRef.current) {
      firstPaintRef.current = false
    } else {
      paintAnimatingRef.current = true
      setColorTransitioning(true)
    }
    invalidate()
  }, [currentColor, colorInitialized, invalidate, setColorTransitioning])

  // Smooth color transition
  useFrame((_, delta) => {
    if (!paintAnimatingRef.current || !currentColor || paintTargetsRef.current.length === 0) return

    const d = 1 - Math.exp(-10 * delta) // ~400ms blend
    const scratch = paintScratchRef.current
    let moving = false

    paintTargetsRef.current.forEach(({ material }) => {
      scratch.set(currentColor)
      material.color.lerp(scratch, d)

      if (
        Math.abs(material.color.r - scratch.r) > 0.004 ||
        Math.abs(material.color.g - scratch.g) > 0.004 ||
        Math.abs(material.color.b - scratch.b) > 0.004
      ) {
        moving = true
      } else {
        material.color.copy(scratch)
      }
    })

    if (moving) {
      invalidate()
    } else {
      paintAnimatingRef.current = false
      setColorTransitioning(false)
    }
  })

  return null
}
