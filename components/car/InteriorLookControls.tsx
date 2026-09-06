'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface InteriorLookControlsProps {
  sensitivity?: number
  pitchLimit?: number
}

// Below this yaw+pitch delta the easing is done — snap and let the demand
// loop go idle instead of invalidating forever
const SETTLE_EPSILON = 1e-4

// Frame-loop scratch — never allocate inside useFrame
const _lookDir = new THREE.Vector3()
const _lookTarget = new THREE.Vector3()

export default function InteriorLookControls({
  sensitivity = 0.003,
  pitchLimit = Math.PI / 3 // 60 degrees
}: InteriorLookControlsProps) {
  const { camera, gl, invalidate } = useThree()
  const isDragging = useRef(false)
  const previousPosition = useRef({ x: 0, y: 0 })
  const rotation = useRef({ yaw: 0, pitch: 0 })
  const smoothedRotation = useRef({ yaw: 0, pitch: 0 })
  const settledRef = useRef(true)

  // Ease the camera toward the target rotation, then park. Frames are pumped
  // only while easing — pointer input restarts the loop via invalidate().
  useFrame(() => {
    const rot = rotation.current
    const smoothed = smoothedRotation.current
    const dYaw = rot.yaw - smoothed.yaw
    const dPitch = rot.pitch - smoothed.pitch
    const settled = Math.abs(dYaw) + Math.abs(dPitch) < SETTLE_EPSILON

    if (settled && settledRef.current) return // idle — nothing to do

    if (settled) {
      // Final frame of the ease: snap exactly onto the target and stop
      smoothed.yaw = rot.yaw
      smoothed.pitch = rot.pitch
      settledRef.current = true
    } else {
      const lerpFactor = 0.15
      smoothed.yaw += dYaw * lerpFactor
      smoothed.pitch += dPitch * lerpFactor
      settledRef.current = false
      invalidate()
    }

    _lookDir
      .set(
        Math.sin(smoothed.yaw) * Math.cos(smoothed.pitch),
        Math.sin(smoothed.pitch),
        Math.cos(smoothed.yaw) * Math.cos(smoothed.pitch)
      )
      .normalize()
    _lookTarget.copy(camera.position).addScaledVector(_lookDir, 5)
    camera.lookAt(_lookTarget)
  })

  useEffect(() => {
    const domElement = gl.domElement

    const handlePointerDown = (e: PointerEvent | TouchEvent) => {
      isDragging.current = true
      const point = 'touches' in e ? e.touches[0] : e
      previousPosition.current = { x: point.clientX, y: point.clientY }
      domElement.style.cursor = 'grabbing'
    }

    const handlePointerMove = (e: PointerEvent | TouchEvent) => {
      if (!isDragging.current) return

      const point = 'touches' in e ? e.touches[0] : e
      const deltaX = point.clientX - previousPosition.current.x
      const deltaY = point.clientY - previousPosition.current.y

      // Update rotation (reversed: drag left = look right, drag up = look down)
      rotation.current.yaw += deltaX * sensitivity
      rotation.current.pitch += deltaY * sensitivity

      // Apply pitch limit only (allow 360° yaw)
      rotation.current.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, rotation.current.pitch))

      previousPosition.current = { x: point.clientX, y: point.clientY }

      // Demand frameloop: wake the render loop so useFrame eases toward the
      // new rotation (it parks itself once settled)
      invalidate()
    }

    const handlePointerUp = () => {
      isDragging.current = false
      domElement.style.cursor = 'grab'
    }

    // Set initial cursor
    domElement.style.cursor = 'grab'

    // Add event listeners
    domElement.addEventListener('pointerdown', handlePointerDown)
    domElement.addEventListener('pointermove', handlePointerMove)
    domElement.addEventListener('pointerup', handlePointerUp)
    domElement.addEventListener('pointerleave', handlePointerUp)

    // Touch events
    domElement.addEventListener('touchstart', handlePointerDown, { passive: true })
    domElement.addEventListener('touchmove', handlePointerMove, { passive: true })
    domElement.addEventListener('touchend', handlePointerUp)

    return () => {
      domElement.style.cursor = 'auto'
      domElement.removeEventListener('pointerdown', handlePointerDown)
      domElement.removeEventListener('pointermove', handlePointerMove)
      domElement.removeEventListener('pointerup', handlePointerUp)
      domElement.removeEventListener('pointerleave', handlePointerUp)
      domElement.removeEventListener('touchstart', handlePointerDown)
      domElement.removeEventListener('touchmove', handlePointerMove)
      domElement.removeEventListener('touchend', handlePointerUp)
    }
  }, [camera, gl, sensitivity, pitchLimit, invalidate])

  return null
}
