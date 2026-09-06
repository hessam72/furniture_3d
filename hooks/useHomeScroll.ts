import { useEffect, useRef } from 'react'
import { MotionValue } from 'framer-motion'
import { useCameraStore } from '@/stores/cameraStore'
import { useCarConfig } from '@/stores/carConfigStore'
import { paintForProgress } from '@/lib/homeChapters'

// Light intro duration: lights turn on 0-10%, car integration starts at 10%
const LIGHT_INTRO_END = 0.10

export function useHomeScroll(scrollYProgress: MotionValue<number>) {
  const { setPreset, setAutoRotate, clearTransition } = useCameraStore()
  const { selectPart, setPaintConfig } = useCarConfig()

  // Track auto-rotate state only (parts are range-based)
  const triggeredRef = useRef({
    autoRotate: false
  })

  // Throttle scroll updates to 60fps max
  const lastUpdateRef = useRef(0)

  // Track previous states to prevent redundant updates
  const prevStateRef = useRef({
    camera: 'home_initial',
    color: '#ff0000',
    wheel: 'wheel-stock',
    spoiler: 'spoiler-none'
  })

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (v) => {
      // Throttle to 16ms (60fps)
      const now = Date.now()
      if (now - lastUpdateRef.current < 16) return
      lastUpdateRef.current = now
      // Auto-rotate control: enable at 100%, disable when leaving finale
      if (v >= 1.00) {
        if (!triggeredRef.current.autoRotate) {
          setAutoRotate(true)
          triggeredRef.current.autoRotate = true
        }
      } else if (v < 1.00) {
        if (triggeredRef.current.autoRotate) {
          setAutoRotate(false)
          triggeredRef.current.autoRotate = false
        }
      }

      // Camera: journey (LIGHT_INTRO_END→1.00) is driven continuously by ScrollCameraRig.
      // Only the finale still uses a preset (spring + auto-rotate handoff).
      if (v >= 1.00) {
        if (prevStateRef.current.camera !== 'home_finale') {
          setPreset('home_finale')
          prevStateRef.current.camera = 'home_finale'
        }
      } else if (prevStateRef.current.camera === 'home_finale') {
        // Back into scrub territory — stop the preset spring so it
        // doesn't fight the rig
        clearTransition()
        prevStateRef.current.camera = 'home_initial'
      }

      // Bidirectional color changes: thresholds shared with ScrollChapters3D orbs
      const stop = paintForProgress(v)
      if (stop.color !== prevStateRef.current.color) {
        setPaintConfig(
          { color: stop.color, metalness: stop.metalness, roughness: stop.roughness, clearcoat: stop.clearcoat },
          'body'
        )
        prevStateRef.current.color = stop.color
      }

      // Bidirectional wheel swap: stock2 from 45-80%, stock below 45%
      let newWheel = prevStateRef.current.wheel
      if (v >= 0.45 && v < 0.80) {
        newWheel = 'wheel-stock2'
      } else if (v < 0.45) {
        newWheel = 'wheel-stock'
      }
      if (newWheel !== prevStateRef.current.wheel) {
        selectPart('wheels', newWheel)
        prevStateRef.current.wheel = newWheel
      }

      // Bidirectional spoiler swap: add at 80%+, remove below 80%
      let newSpoiler = prevStateRef.current.spoiler
      if (v >= 0.80) {
        newSpoiler = 'spoiler-stock'
      } else if (v < 0.80) {
        newSpoiler = 'spoiler-none'
      }
      if (newSpoiler !== prevStateRef.current.spoiler) {
        selectPart('spoilers', newSpoiler)
        prevStateRef.current.spoiler = newSpoiler
      }
    })

    return unsubscribe
  }, [scrollYProgress, setPreset, setAutoRotate, selectPart, clearTransition])
}
