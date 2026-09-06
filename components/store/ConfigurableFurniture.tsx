'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { useFurnitureConfig } from '@/stores/furnitureConfigStore'
import { prepareCarObject } from '@/lib/three/prepareCarMaterial'
import * as THREE from 'three'

useGLTF.setDecoderPath('/draco/')

interface ConfigurableFurnitureProps {
  modelPath: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
}

interface PaintTarget {
  material: THREE.MeshPhysicalMaterial
}

export default function ConfigurableFurniture({
  modelPath,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: ConfigurableFurnitureProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const invalidate = useThree((s) => s.invalidate)

  const currentColor = useFurnitureConfig((s) => s.currentColor)
  const colorInitialized = useFurnitureConfig((s) => s.colorInitialized)
  const setColorTransitioning = useFurnitureConfig((s) => s.setColorTransitioning)

  const gltf = useGLTF(modelPath)

  // Clone model and collect paintable materials
  const { furnitureModel, paintTargets } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    const targets: PaintTarget[] = []

    // Center model
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    clone.position.sub(center)

    const getUserData = (mesh: any, key: string) => {
      return mesh.userData?.userdata?.[key] ?? mesh.userData?.[key]
    }

    // Shadow flags + env boost
    prepareCarObject(clone)

    // Collect paintable materials
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const paintableValue = getUserData(child, 'paintable')
        const isPaintable = paintableValue === true || paintableValue === 1

        // Consider mesh paintable if:
        // 1. Has paintable userData flag
        // 2. Material/mesh name suggests it's colorable (exclude glass, metal fixtures, etc.)
        const nameMatch =
          child.material?.name?.toLowerCase().includes('fabric') ||
          child.material?.name?.toLowerCase().includes('cushion') ||
          child.material?.name?.toLowerCase().includes('upholstery') ||
          child.material?.name?.toLowerCase().includes('paint') ||
          child.name?.toLowerCase().includes('cushion') ||
          child.name?.toLowerCase().includes('seat')

        if (isPaintable || nameMatch) {
          child.material = (child.material as THREE.Material).clone()
          targets.push({ material: child.material as THREE.MeshPhysicalMaterial })
        }
      }
    })

    // Fallback: if no specific colorable parts found, apply to all meshes
    if (targets.length === 0) {
      console.log('[ConfigurableFurniture] No specific colorable parts found, applying to all meshes (fallback)')
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material = (child.material as THREE.Material).clone()
          targets.push({ material: child.material as THREE.MeshPhysicalMaterial })
        }
      })
      console.log(`[ConfigurableFurniture] Fallback added ${targets.length} targets`)
    }

    return { furnitureModel: clone, paintTargets: targets }
  }, [gltf.scene])

  const firstPaintRef = useRef(true)
  const paintAnimatingRef = useRef(false)
  const paintScratchRef = useRef(new THREE.Color())

  // Apply color change
  useEffect(() => {
    if (!colorInitialized || !currentColor) return

    paintTargets.forEach(({ material }) => {
      if (firstPaintRef.current) {
        // Instant first coat
        material.color.set(currentColor)
      }
    })

    if (firstPaintRef.current) {
      firstPaintRef.current = false
    } else {
      paintAnimatingRef.current = true
      setColorTransitioning(true)
    }
    invalidate()
  }, [currentColor, paintTargets, colorInitialized, invalidate, setColorTransitioning])

  // Smooth color transition
  useFrame((_, delta) => {
    if (!paintAnimatingRef.current || !currentColor) return

    const d = 1 - Math.exp(-10 * delta) // ~400ms blend
    const scratch = paintScratchRef.current
    let moving = false

    paintTargets.forEach(({ material }) => {
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

  // Dispose cloned materials
  useEffect(() => {
    return () => {
      paintTargets.forEach(({ material }) => material.dispose())
    }
  }, [paintTargets])

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={furnitureModel} />
    </group>
  )
}
