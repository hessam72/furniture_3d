'use client'

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { OrbitControls } from '@react-three/drei'
import { useCameraStore } from '@/stores/cameraStore'
import { useSpring, config } from '@react-spring/three'
import * as THREE from 'three'

interface CameraControlsProps {
  disableInteraction?: boolean
}

export default function CameraControls({ disableInteraction = false }: CameraControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null!)
  const { camera } = useThree()
  const invalidate = useThree((s) => s.invalidate)

  const { targetPosition, targetLookAt, autoRotate, autoRotateSpeed, clearTransition, activePreset } = useCameraStore()

  // Animated camera transition with react-spring
  const [{ position, lookAt }, api] = useSpring(() => ({
    position: camera.position.toArray(),
    lookAt: [0, 0.5, 0],
    config: { tension: 120, friction: 14 }
  }))

  // Trigger animation when target changes
  useEffect(() => {
    if (targetPosition && targetLookAt && controlsRef.current) {
      api.start({
        position: targetPosition.toArray(),
        lookAt: targetLookAt.toArray(),
        onRest: () => {
          clearTransition()
        }
      })
    }
  }, [targetPosition, targetLookAt, api, clearTransition])

  // Force clear transition for interior mode
  useEffect(() => {
    if (activePreset === 'interior' && targetPosition) {
      const timer = setTimeout(() => clearTransition(), 300)
      return () => clearTimeout(timer)
    }
  }, [activePreset, targetPosition, clearTransition])

  // Apply animated values to camera and controls only during transitions
  useFrame(() => {
    if (controlsRef.current && (targetPosition || targetLookAt)) {
      // Apply spring animation for all presets (including interior)
      // @ts-ignore - react-spring animated values
      camera.position.set(...position.get())
      // @ts-ignore
      controlsRef.current.target.set(...lookAt.get())
      controlsRef.current.update()
      // Keep frames coming until the spring settles (frameloop="demand")
      invalidate()
    }
  })

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const maxDistance = isMobile ? 20 : 12
  const isInteriorMode = activePreset === 'interior'

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      regress
      enableDamping
      dampingFactor={0.05}
      minDistance={2}
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2}
      autoRotate={autoRotate && !isInteriorMode}
      autoRotateSpeed={autoRotateSpeed}
      target={[0, 0.5, 0]}
      enableRotate={!isInteriorMode && !disableInteraction}
      enablePan={!isInteriorMode && !disableInteraction}
      enableZoom={!isInteriorMode && !disableInteraction}
    />
  )
}
