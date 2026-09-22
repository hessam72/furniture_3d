'use client'
import { useEffect } from 'react'

interface SceneTransitionProps {
  isTransitioning: boolean
  onComplete: () => void
  duration?: number
}

/**
 * Ends the intro after `duration`.
 *
 * It used to also mount a `<fogExp2>` — for exactly one frame: it rendered only
 * while `progress === 0`, and a 16ms `setInterval` moved progress off zero at
 * once. The fade it was meant to animate never showed, but fog is part of every
 * material's program key, so adding it and taking it away recompiled the whole
 * room twice, right as the camera fly-in started. The interval also drove a
 * React state update 60 times a second for the full four seconds. The intro's
 * visuals are CameraTransition and ParticleReveal; this is only its clock.
 */
export function SceneTransition({ isTransitioning, onComplete, duration = 4000 }: SceneTransitionProps) {
  useEffect(() => {
    if (!isTransitioning) return
    const id = window.setTimeout(onComplete, duration)
    return () => window.clearTimeout(id)
  }, [isTransitioning, duration, onComplete])

  return null
}
