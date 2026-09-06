'use client'
import { useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface POVCameraProps {
  gyroEnabled?: boolean
  /** Suspends the look easing while something else owns the camera */
  frozen?: boolean
  /** Bump to adopt the camera's current orientation as the new look target */
  resyncKey?: number
}

// Frame-loop scratch — never allocate inside useFrame
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

// Sensor-handler scratch — same rule, deviceorientation fires ~60Hz
const _zee = new THREE.Vector3(0, 0, 1)
const _q0 = new THREE.Quaternion()
// -90° about X: maps the device frame (screen-up = +Y) onto three's world-up
const _q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
const _devEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const _devQuat = new THREE.Quaternion()
const _out = new THREE.Euler(0, 0, 0, 'YXZ')

const DEG = Math.PI / 180
// Stop short of straight up/down: past ±90° the YXZ euler inverts
const PITCH_LIMIT = 85 * DEG

// Below this yaw+pitch delta the look-easing is done — snap and stop
// requesting frames (matters under the demand frameloop)
const SETTLE_EPSILON = 1e-4

// Time constant of the look ease. The gyro stream is already fused by the OS,
// so it only needs enough damping to kill jitter (~33ms); drag needs more.
const GYRO_DAMPING = 30
const DRAG_DAMPING = 15

function screenAngleRad() {
  const angle =
    screen?.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0
  return angle * DEG
}

export function usePOVCamera(props?: POVCameraProps) {
  const { gyroEnabled = false, frozen = false, resyncKey = 0 } = props || {}
  const { camera, gl } = useThree()
  const regress = useThree((s) => s.performance.regress)
  const invalidate = useThree((s) => s.invalidate)
  const targetYaw = useRef(0)
  const targetPitch = useRef(0)
  const currentYaw = useRef(0)
  const currentPitch = useRef(0)
  const isDragging = useRef(false)
  const settledRef = useRef(true)
  const previousMouse = useRef({ x: 0, y: 0 })
  // Gyro yaw is tracked relative to the heading at the moment gyro was enabled:
  // the compass is unreliable indoors, and an absolute anchor would snap the
  // view away from wherever the user was already looking.
  const yawBase = useRef(0)
  const yawAccum = useRef(0)
  const prevRawYaw = useRef<number | null>(null)

  // Adopt whatever orientation the camera was left in — after a camera flight
  // the refs still hold the pre-flight heading, and the first unfrozen frame
  // would snap the view back to it. Read in the same YXZ order the frame loop
  // writes with, so no sign correction is needed.
  useEffect(() => {
    if (!resyncKey) return
    _euler.setFromQuaternion(camera.quaternion, 'YXZ')
    targetYaw.current = currentYaw.current = _euler.y
    targetPitch.current = currentPitch.current = _euler.x
    prevRawYaw.current = null
    yawAccum.current = 0
    settledRef.current = true
  }, [resyncKey, camera])

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true
      previousMouse.current = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
    }

    const onPointerUp = (e: PointerEvent) => {
      isDragging.current = false
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (gyroEnabled || frozen) return
      if (!isDragging.current) return

      const deltaX = e.clientX - previousMouse.current.x
      const deltaY = e.clientY - previousMouse.current.y

      const sensitivity = 0.002
      targetYaw.current += deltaX * sensitivity
      targetPitch.current += deltaY * sensitivity

      // Clamp pitch to prevent flipping
      targetPitch.current = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetPitch.current))

      previousMouse.current = { x: e.clientX, y: e.clientY }

      // Trade resolution for frame rate while look-dragging (AdaptiveDpr)
      regress()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointercancel', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [gl, gyroEnabled, frozen, regress])

  // Gyroscope controls — absolute device attitude, not integrated deltas.
  // Deltas drift, lose fast motion, and blow up at the euler singularities;
  // composing the raw angles into a quaternion is exact at every hold angle.
  useEffect(() => {
    if (!gyroEnabled) {
      prevRawYaw.current = null
      yawAccum.current = 0
      return
    }

    let orient = screenAngleRad()
    const onScreenRotate = () => {
      orient = screenAngleRad()
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null || event.beta === null || event.gamma === null) return

      // Device attitude → world attitude (three's DeviceOrientationControls math)
      _devEuler.set(event.beta * DEG, event.alpha * DEG, -event.gamma * DEG)
      _devQuat.setFromEuler(_devEuler)
      _devQuat.multiply(_q1)
      _devQuat.multiply(_q0.setFromAxisAngle(_zee, -orient))

      // .z is device roll — discarded so the horizon stays level while walking
      _out.setFromQuaternion(_devQuat, 'YXZ')

      // Yaw: unwrapped so the ease never takes the long way round the circle
      if (prevRawYaw.current === null) {
        yawBase.current = targetYaw.current
        yawAccum.current = 0
      } else {
        let d = _out.y - prevRawYaw.current
        if (d > Math.PI) d -= 2 * Math.PI
        else if (d < -Math.PI) d += 2 * Math.PI
        yawAccum.current += d
      }
      prevRawYaw.current = _out.y
      targetYaw.current = yawBase.current + yawAccum.current

      // Pitch: absolute — gravity is a real reference, unlike the compass
      targetPitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, _out.x))

      invalidate()
    }

    window.addEventListener('deviceorientation', handleOrientation, { passive: true })
    screen.orientation?.addEventListener('change', onScreenRotate)
    window.addEventListener('orientationchange', onScreenRotate)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
      screen.orientation?.removeEventListener('change', onScreenRotate)
      window.removeEventListener('orientationchange', onScreenRotate)
    }
  }, [gyroEnabled, invalidate])

  useFrame((_, delta) => {
    if (frozen) return

    const dYaw = targetYaw.current - currentYaw.current
    const dPitch = targetPitch.current - currentPitch.current

    if (Math.abs(dYaw) + Math.abs(dPitch) < SETTLE_EPSILON) {
      if (settledRef.current) return // parked — nothing to do
      // Final frame of the ease: snap exactly onto the target
      currentYaw.current = targetYaw.current
      currentPitch.current = targetPitch.current
      settledRef.current = true
    } else {
      // Smooth damping factor (higher = snappier, lower = smoother)
      const dampingFactor = gyroEnabled ? GYRO_DAMPING : DRAG_DAMPING
      const t = 1 - Math.exp(-dampingFactor * delta)
      currentYaw.current += dYaw * t
      currentPitch.current += dPitch * t
      settledRef.current = false
    }

    // Apply smoothed rotation to camera
    _euler.set(currentPitch.current, currentYaw.current, 0)
    camera.quaternion.setFromEuler(_euler)
  })
}
