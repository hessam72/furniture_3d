'use client'
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import nipplejs from 'nipplejs'

// Frame-loop scratch — never allocate (or mutate a shared basis) inside the
// movement update
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _UP = new THREE.Vector3(0, 1, 0)

export function useJoystickControls(playerVelocity: React.RefObject<THREE.Vector3>) {
  const { camera } = useThree()
  const keysPressed = useRef<Record<string, boolean>>({})
  const joystickInput = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  /** Applies input to playerVelocity; returns whether any input is active */
  const updateMovement = (_delta: number): boolean => {
    const speed = 4 // units/second
    const keys = keysPressed.current

    // Get camera direction (ignore Y component for movement)
    camera.getWorldDirection(_forward)
    _forward.y = 0
    _forward.normalize()
    _right.crossVectors(_forward, _UP).normalize()

    // Reset horizontal velocity each frame (Rapier damping handles deceleration)
    if (playerVelocity.current) {
      playerVelocity.current.x = 0
      playerVelocity.current.z = 0
    }

    // addScaledVector never mutates the basis vectors — the old
    // add(forward.multiplyScalar(...)) chain corrupted them when opposing
    // keys (W+S / A+D) were held together
    let hasInput = false
    if (keys['w']) { playerVelocity.current?.addScaledVector(_forward, speed); hasInput = true }
    if (keys['s']) { playerVelocity.current?.addScaledVector(_forward, -speed); hasInput = true }
    if (keys['a']) { playerVelocity.current?.addScaledVector(_right, -speed); hasInput = true }
    if (keys['d']) { playerVelocity.current?.addScaledVector(_right, speed); hasInput = true }

    // Apply virtual joystick input
    const { x, y } = joystickInput.current
    if (x !== 0 || y !== 0) {
      playerVelocity.current?.addScaledVector(_right, x * speed)
      playerVelocity.current?.addScaledVector(_forward, y * speed)
      hasInput = true
    }
    return hasInput
  }

  return { updateMovement, joystickInput }
}

/** Shared by the CSS transition and the reposition timeout that follows it */
const LIFT_TRANSITION_MS = 320

// Virtual joystick component for mobile
export function VirtualJoystick({
  joystickInput,
  onActivity,
  hidden,
  liftPx = 0
}: {
  joystickInput: React.RefObject<{ x: number; y: number }>
  onActivity?: () => void
  hidden?: boolean
  /** Raises the zone so the stick clears the product sheet. Any change here
   *  must be followed by manager.reposition() — see the effect below. */
  liftPx?: number
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const isTouchActiveRef = useRef(false)
  const lastActivityRef = useRef(0)
  const managerRef = useRef<ReturnType<typeof nipplejs.create> | null>(null)

  useEffect(() => {
    if (!zoneRef.current) return

    const manager = nipplejs.create({
      zone: zoneRef.current,
      mode: 'static',
      position: { left: '80px', bottom: '80px' },
      color: '#2a2a2a',
      size: 100,
    })
    managerRef.current = manager

    manager.on('start', () => {
      isTouchActiveRef.current = true
      // Trigger activity on touch start
      onActivity?.()
      lastActivityRef.current = Date.now()
    })

    manager.on('move', (evt) => {
      if (!evt.data?.angle) return
      const angle = evt.data.angle.radian
      const force = Math.min(evt.data.force, 2) / 2
      const x = Math.cos(angle) * force
      const y = Math.sin(angle) * force

      // Write directly to ref (same as WASD keyboard input)
      if (joystickInput.current) {
        joystickInput.current.x = x
        joystickInput.current.y = y
      }

      // Throttle activity marks to ~10Hz instead of 60Hz
      const now = Date.now()
      if (now - lastActivityRef.current > 100) {
        onActivity?.()
        lastActivityRef.current = now
      }
    })

    manager.on('end', () => {
      // Reset to zero (same as WASD key release)
      if (joystickInput.current) {
        joystickInput.current.x = 0
        joystickInput.current.y = 0
      }
      isTouchActiveRef.current = false
    })

    return () => {
      managerRef.current = null
      // Wait for touch to end before destroying
      if (isTouchActiveRef.current) {
        manager.on('end', () => manager.destroy())
      } else {
        manager.destroy()
      }
    }
  }, [joystickInput, onActivity])

  // nipplejs caches the stick's centre as a *page coordinate* at creation, and
  // measures every touch against it — a stale centre 168px away reports full
  // deflection from a finger that never moved. It only refreshes that cache on
  // its zone ResizeObserver (size changes) or a window resize, so lifting the
  // zone with `bottom` slips past it entirely. reposition() is nipplejs's own
  // remedy, and the light one: `dynamicPage: true` fixes it too but re-measures
  // on every move event, which is a forced layout read per pointermove.
  //
  // Twice: once now for changes that don't animate (the `display` toggle), and
  // once after the slide settles, since an immediate call would measure the
  // start of the transition rather than its end.
  useEffect(() => {
    const manager = managerRef.current
    if (!manager) return
    manager.reposition()
    const id = setTimeout(() => managerRef.current?.reposition(), LIFT_TRANSITION_MS + 60)
    return () => clearTimeout(id)
  }, [liftPx, hidden])

  return (
    <div
      ref={zoneRef}
      className="fixed right-0 w-40 h-40 pointer-events-auto z-[60]"
      style={{
        touchAction: 'none',
        display: hidden ? 'none' : 'block',
        bottom: liftPx,
        transition: `bottom ${LIFT_TRANSITION_MS}ms var(--ease-cinematic)`
      }}
    >
      <style jsx>{`
        div :global(.back) {
          background: rgba(20, 20, 20, 0.4) !important;
          border: 2px solid rgba(238, 194, 0, 0.67) !important;
        }
        div :global(.front) {
          background: rgba(255, 221, 0, 0.62) !important;
          border: 2px solid rgba(255, 255, 255, 0) !important;
        }
      `}</style>
    </div>
  )
}
