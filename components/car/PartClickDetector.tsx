'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useCarConfig } from '@/stores/carConfigStore'
import * as THREE from 'three'

export default function PartClickDetector() {
  const { gl, camera, scene } = useThree()
  const togglePart = useCarConfig((s) => s.togglePart)

  useEffect(() => {
    const downPos: { x: number; y: number } | null = { x: 0, y: 0 }
    const CLICK_THRESHOLD = 5 // pixels

    const handlePointerDown = (e: PointerEvent) => {
      downPos.x = e.clientX
      downPos.y = e.clientY
    }

    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault()

      // Check if it's a drag or a click
      if (downPos) {
        const dx = e.clientX - downPos.x
        const dy = e.clientY - downPos.y
        const dist = Math.hypot(dx, dy)

        if (dist > CLICK_THRESHOLD) {
          return // It's a drag, not a click
        }
      }

      // Get canvas rect for proper coordinate mapping
      const rect = gl.domElement.getBoundingClientRect()

      // Normalize to device coords (-1 to +1)
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      // Raycast
      const mouse = new THREE.Vector2(x, y)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(scene.children, true)

      if (intersects.length > 0) {
        const clickedObject = intersects[0].object
        const meshName = clickedObject.name

        // Check if it's a car part that can be toggled
        const toggleableParts = [
          'car_door_left',
          'car_door_right',
          'car_door_back_left',
          'car_door_back_right',
          'car_caput',
          'car_trunk',
        ]

        if (toggleableParts.includes(meshName)) {
          console.log('[PartClickDetector] Toggling:', meshName)
          togglePart(meshName)
        }
      }
    }

    const canvas = gl.domElement
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false })
    canvas.addEventListener('pointerup', handlePointerUp, { passive: false })

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
    }
  }, [gl, camera, scene, togglePart])

  return null
}
