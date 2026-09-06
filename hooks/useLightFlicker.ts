import { useState, useEffect, useRef } from 'react'
import { MotionValue } from 'framer-motion'
import { useFrame, useThree } from '@react-three/fiber'

// Time-based flicker sequence modeling a real HID/fluorescent strike:
// weak sputter → collapse → dark gap → second strike → stuttering
// climb → brightness sag → recover → stable. Times MUST be monotonic.
const FLICKER_KEYFRAMES = [
  { time: 0.00, intensity: 0.0 },   // Complete darkness
  { time: 0.30, intensity: 0.0 },   // Still dark
  { time: 0.34, intensity: 0.55 },  // First strike (weak)
  { time: 0.38, intensity: 0.05 },  // Collapses — tube didn't catch
  { time: 0.55, intensity: 0.0 },   // Dark gap
  { time: 0.62, intensity: 0.85 },  // Second strike (stronger)
  { time: 0.66, intensity: 0.15 },  // Partial collapse
  { time: 0.72, intensity: 0.65 },  // Stuttering climb
  { time: 0.78, intensity: 0.25 },
  { time: 0.90, intensity: 0.90 },  // Catches
  { time: 1.05, intensity: 0.55 },  // Brightness sag (ballast settling)
  { time: 1.25, intensity: 0.95 },  // Recovers
  { time: 1.45, intensity: 0.85 },  // Last wobble
  { time: 1.80, intensity: 1.0 },   // Fully stable
]

// Total duration covers the slowest (most-lagged) light: 1.8s keyframes + 0.55s max lag
const FLICKER_DURATION = 2.4
const SHIMMER_END = 1.45     // High-frequency instability stops here

// Per-light timing offsets in seconds (creates "rolling" gallery effect —
// each fixture strikes at its own moment, like a real hall)
const LIGHT_OFFSETS = {
  key: 0.0,      // Key light strikes first
  fill: -0.25,   // Fill lags behind
  bounce: -0.40, // Ground bounce later
  rim: -0.55,    // Rim light last
}

// High-frequency shimmer during the strike phase — the micro-instability
// of a real discharge lamp. Deterministic (sin-based), decays to 0.
function shimmer(t: number): number {
  if (t <= 0.30 || t >= SHIMMER_END) return 1
  const decay = 1 - (t - 0.30) / (SHIMMER_END - 0.30)
  return 1 + 0.12 * Math.sin(t * 47) * Math.sin(t * 23) * decay
}

/**
 * Maps scroll threshold to time-based light flicker animation
 *
 * @param scrollYProgress - Framer Motion scroll value (0→1)
 * @returns Intensity multipliers for each light type (0→1)
 */
export function useLightFlicker(scrollYProgress: MotionValue<number>) {
  const [intensities, setIntensities] = useState({
    key: 0,
    fill: 0,
    rim: 0,
    bounce: 0,
    ambient: 0,
  })

  const prefersReducedMotion = useRef(false)
  const flickerStartTime = useRef<number | null>(null)
  const isFlickering = useRef(false)
  const hasFlickered = useRef(false)

  const invalidate = useThree((state) => state.invalidate)

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.current = mediaQuery.matches

    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  useFrame((state) => {
    const scroll = scrollYProgress.get()
    const currentTime = state.clock.elapsedTime

    // Early return if flicker already completed and lights are at full brightness
    if (hasFlickered.current && scroll >= 0.02) {
      return
    }

    // Calculate intensity for each light with timing offset
    const getIntensityAtTime = (elapsedSeconds: number): number => {
      // Clamp to animation duration
      const clampedTime = Math.max(0, Math.min(FLICKER_DURATION, elapsedSeconds))

      // Find surrounding keyframes
      let lowerFrame = FLICKER_KEYFRAMES[0]
      let upperFrame = FLICKER_KEYFRAMES[FLICKER_KEYFRAMES.length - 1]

      for (let i = 0; i < FLICKER_KEYFRAMES.length - 1; i++) {
        if (clampedTime >= FLICKER_KEYFRAMES[i].time && clampedTime <= FLICKER_KEYFRAMES[i + 1].time) {
          lowerFrame = FLICKER_KEYFRAMES[i]
          upperFrame = FLICKER_KEYFRAMES[i + 1]
          break
        }
      }

      // Linear interpolation between keyframes
      const frameSpan = upperFrame.time - lowerFrame.time
      if (frameSpan === 0) return lowerFrame.intensity

      const localProgress = (clampedTime - lowerFrame.time) / frameSpan
      return lowerFrame.intensity + (upperFrame.intensity - lowerFrame.intensity) * localProgress
    }

    // Below threshold: darkness, reset flicker state
    if (scroll < 0.03) {
      flickerStartTime.current = null
      isFlickering.current = false
      hasFlickered.current = false
      setIntensities({ key: 0, fill: 0, rim: 0, bounce: 0, ambient: 0 })
      return
    }

    // Above threshold: trigger flicker if not already started
    if (scroll >= 0.02 && !hasFlickered.current) {
      if (!isFlickering.current) {
        // Start flicker animation
        flickerStartTime.current = currentTime
        isFlickering.current = true
      }

      // Calculate elapsed time since flicker started
      const elapsedTime = currentTime - (flickerStartTime.current ?? currentTime)

      // Reduced motion: instant fade instead of flicker
      if (prefersReducedMotion.current) {
        const fadeProgress = Math.min(elapsedTime / 0.5, 1) // 0.5s fade
        const intensity = fadeProgress
        const ambient = fadeProgress * 0.3
        setIntensities({ key: intensity, fill: intensity, rim: intensity, bounce: intensity, ambient })

        if (fadeProgress >= 1) {
          hasFlickered.current = true
          isFlickering.current = false
        }
        return
      }

      // Time-based flicker animation
      if (elapsedTime < FLICKER_DURATION) {
        // Still flickering - force continuous rendering
        invalidate()

        const ambientIntensity = Math.min(elapsedTime / FLICKER_DURATION, 1) * 0.3

        // Per-light lag + high-frequency shimmer during the strike phase
        const lightIntensity = (offset: number) => {
          const t = elapsedTime + offset
          return getIntensityAtTime(t) * shimmer(t)
        }

        setIntensities({
          key: lightIntensity(LIGHT_OFFSETS.key),
          fill: lightIntensity(LIGHT_OFFSETS.fill),
          bounce: lightIntensity(LIGHT_OFFSETS.bounce),
          rim: lightIntensity(LIGHT_OFFSETS.rim),
          ambient: ambientIntensity,
        })
      } else {
        // Flicker complete: full brightness
        hasFlickered.current = true
        isFlickering.current = false
        setIntensities({ key: 1, fill: 1, rim: 1, bounce: 1, ambient: 0.3 })
      }
    }
  })

  return { intensities, isComplete: hasFlickered.current }
}
