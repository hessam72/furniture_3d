'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/** How long after the last input/movement before the demand loop parks */
export const IDLE_COOLDOWN_MS = 1500

// Module-level activity clock so DOM handlers (Scene) and the frame loop
// (PlayerController) can both stamp it without prop plumbing
const activity = { last: Date.now() }

export function markStoreActivity() {
  activity.last = Date.now()
}

/**
 * Whether the display refreshes well above 60Hz, measured once per tab from a
 * handful of bare rAF intervals (median, so one janky tick can't decide it).
 * Resolves `false` until measured — the cap below only ever engages late,
 * never wrongly.
 */
let highRefresh = false
let measured = false
function measureRefresh() {
  if (measured || typeof window === 'undefined') return
  measured = true
  const stamps: number[] = []
  const tick = (t: number) => {
    stamps.push(t)
    if (stamps.length < 12) {
      requestAnimationFrame(tick)
      return
    }
    const gaps = stamps.slice(1).map((v, i) => v - stamps[i]).sort((a, b) => a - b)
    highRefresh = gaps[Math.floor(gaps.length / 2)] < 10
  }
  requestAnimationFrame(tick)
}

interface ActivityGovernorProps {
  /** Never park (loading/transition phases, gyro look, kill-switch off) */
  forceActive: boolean
  /** Reported when the loop parks/wakes — Scene pauses physics on idle */
  onIdleChange: (idle: boolean) => void
  /**
   * Hold a 120Hz touch screen to 60fps. Android flagships run rAF at the
   * panel's rate, so an active walkthrough drew twice as many frames as
   * anyone can use and hit thermal throttling within a minute — the "smooth,
   * then laggy" pattern. 60 and 90Hz panels are left alone: 90 has no clean
   * divisor near 60, and neither is the throttling case.
   */
  capHighRefresh?: boolean
}

/**
 * Drives the demand frameloop like /car's invalidate() discipline, adapted
 * for a walkable scene: while there has been input (keys, joystick, drag,
 * movement) within the cooldown, every rendered frame requests the next;
 * once quiet, rendering stops entirely (0 GPU at rest). DOM handlers wake
 * the loop with markStoreActivity() + invalidate().
 */
export function ActivityGovernor({ forceActive, onIdleChange, capHighRefresh = false }: ActivityGovernorProps) {
  const invalidate = useThree((s) => s.invalidate)
  const idleRef = useRef(false)

  useEffect(() => {
    if (capHighRefresh) measureRefresh()
  }, [capHighRefresh])

  useFrame(() => {
    const active = forceActive || Date.now() - activity.last < IDLE_COOLDOWN_MS
    if (active) {
      if (idleRef.current) {
        idleRef.current = false
        onIdleChange(false)
      }
      // Skip one vsync before asking for the next frame: every other tick
      if (capHighRefresh && highRefresh) requestAnimationFrame(() => invalidate())
      else invalidate()
    } else if (!idleRef.current) {
      idleRef.current = true
      onIdleChange(true)
      // no invalidate — the loop parks after this frame
    }
  })

  return null
}
