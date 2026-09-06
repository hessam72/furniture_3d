'use client'

import { useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import * as THREE from 'three'

interface RotatableCarProps {
  modelPath: string
}

export default function RotatableCar({ modelPath }: RotatableCarProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const isDragging = useRef(false)
  const previousPointer = useRef({ x: 0, y: 0 })

  // Target rotation and position
  const targetRotationY = useRef(0)
  const targetPositionY = useRef(0)

  // Load model with DRACO
  const gltf = useLoader(GLTFLoader, modelPath, (loader) => {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')
    loader.setDRACOLoader(dracoLoader)
  })

  // Apply materials and setup
  const model = gltf.scene.clone()
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true

      if (mesh.material) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.envMapIntensity = 1.5
        mat.metalness = 0.9
        mat.roughness = 0.3
      }
    }
  })

  // Center model
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  model.position.sub(center)

  const handlePointerDown = (e: any) => {
    isDragging.current = true
    previousPointer.current = { x: e.clientX, y: e.clientY }
    e.stopPropagation()

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }

  const handlePointerMove = (e: PointerEvent | any) => {
    if (!isDragging.current) return

    const deltaX = e.clientX - previousPointer.current.x
    const deltaY = e.clientY - previousPointer.current.y

    // Horizontal drag → Y-axis rotation (vitrine spin)
    targetRotationY.current += deltaX * 0.01

    // Vertical drag → Y-axis position (up/down movement) - clamped
    const newPositionY = targetPositionY.current - deltaY * 0.05
    targetPositionY.current = THREE.MathUtils.clamp(
      newPositionY,
      0,   // floor level (prevent going through floor at -0.8)
      1.5  // max up
    )

    previousPointer.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = () => {
    isDragging.current = false

    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)
  }

  // Smooth damping
  useFrame(() => {
    if (!groupRef.current) return

    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      targetRotationY.current,
      0.1
    )

    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      targetPositionY.current,
      0.1
    )
  })

  return (
    <group
      ref={groupRef}
      onPointerDown={handlePointerDown}
    >
      <primitive object={model} />
    </group>
  )
}
