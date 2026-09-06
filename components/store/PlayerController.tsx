'use client'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { usePhysics } from './PhysicsSystem'
import { useJoystickControls } from './Joystick'
import { markStoreActivity } from './activityGovernor'
import { useRef } from 'react'

export function usePlayerPhysics(
  physics: ReturnType<typeof usePhysics>,
  startPosition: [number, number, number] = [24, 1.5, 12],
  cameraHeight: number = 1.3,
  frozen: boolean = false
) {
  const initTime = useRef(Date.now())
  const isInitialized = useRef(false)

  useFrame((state, delta) => {
    const { rigidBodyRef, playerVelocity } = physics

    if (!rigidBodyRef.current) return

    // A camera flight owns the camera outright. Writing the body position here
    // would overwrite the tween every frame, and letting the body keep its
    // velocity would slide it across the room while the view is elsewhere.
    if (frozen) {
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      playerVelocity.current.set(0, 0, 0)
      return
    }

    // Grace period: lock position briefly on spawn to prevent fall-through
    const elapsed = Date.now() - initTime.current
    if (elapsed < 200 && !isInitialized.current) {
      rigidBodyRef.current.setTranslation({ x: startPosition[0], y: startPosition[1], z: startPosition[2] }, true)
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      state.camera.position.set(startPosition[0], startPosition[1] + cameraHeight, startPosition[2])
      isInitialized.current = true
      return
    }

    // Get current velocity from Rapier
    const currentVel = rigidBodyRef.current.linvel()
    playerVelocity.current.set(currentVel.x, currentVel.y, currentVel.z)

    // Update camera to follow rigid body with offset
    const pos = rigidBodyRef.current.translation()
    state.camera.position.set(pos.x, pos.y + cameraHeight, pos.z)

    // Safety: teleport if fallen
    if (pos.y < -5) {
      rigidBodyRef.current.setTranslation({ x: startPosition[0], y: startPosition[1], z: startPosition[2] }, true)
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      state.camera.position.set(startPosition[0], startPosition[1] + cameraHeight, startPosition[2])
    }
  })
}

export function usePlayerController(
  physics: ReturnType<typeof usePhysics>,
  startPosition?: [number, number, number],
  cameraHeight?: number,
  frozen: boolean = false
) {
  const { updateMovement, joystickInput } = useJoystickControls(physics.playerVelocity)

  usePlayerPhysics(physics, startPosition, cameraHeight, frozen)

  useFrame((state, delta) => {
    const { rigidBodyRef, playerVelocity } = physics
    if (!rigidBodyRef.current) return

    // A held joystick must not fight the flight
    if (frozen) return

    // Apply WASD/joystick input
    const hasInput = updateMovement(delta)

    // While moving: keep the demand loop alive (covers a joystick held
    // still, which emits no DOM events) and let AdaptiveDpr trade
    // resolution for frame rate — same idiom OrbitControls gives /car
    if (hasInput) {
      markStoreActivity()
      state.performance.regress()
    }

    // Apply computed velocity to Rapier rigid body
    rigidBodyRef.current.setLinvel(
      {
        x: playerVelocity.current.x,
        y: rigidBodyRef.current.linvel().y, // Preserve gravity Y
        z: playerVelocity.current.z
      },
      true
    )
  })

  return { joystickInput }
}
