'use client'

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/** How long after the last input/movement before the demand loop parks */
export const IDLE_COOLDOWN_MS = 1500

// Module-level activity clock so DOM handlers (Scene) and the frame loop
// (PlayerController) can both stamp it without prop plumbing
const activity = { last: Date.now() }

export function markStoreActivity() {
  activity.last = Date.now()
}

interface ActivityGovernorProps {
  /** Never park (loading/transition phases, gyro look, kill-switch off) */
  forceActive: boolean
  /** Reported when the loop parks/wakes — Scene pauses physics on idle */
  onIdleChange: (idle: boolean) => void
}

/**
 * Drives the demand frameloop like /car's invalidate() discipline, adapted
 * for a walkable scene: while there has been input (keys, joystick, drag,
 * movement) within the cooldown, every rendered frame requests the next;
 * once quiet, rendering stops entirely (0 GPU at rest). DOM handlers wake
 * the loop with markStoreActivity() + invalidate().
 */
export function ActivityGovernor({ forceActive, onIdleChange }: ActivityGovernorProps) {
  const invalidate = useThree((s) => s.invalidate)
  const idleRef = useRef(false)

  useFrame(() => {
    const active = forceActive || Date.now() - activity.last < IDLE_COOLDOWN_MS
    if (active) {
      if (idleRef.current) {
        idleRef.current = false
        onIdleChange(false)
      }
      invalidate()
    } else if (!idleRef.current) {
      idleRef.current = true
      onIdleChange(true)
      // no invalidate — the loop parks after this frame
    }
  })

  return null
}
