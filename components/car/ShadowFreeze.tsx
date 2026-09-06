'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useCarConfig } from '@/stores/carConfigStore'
import { useQuality } from '@/contexts/QualityContext'

// Rendered-frame window that covers the accumulative shadow bake (~50
// frames), the cube reflection capture (~60 frames), and a full 1.2s door
// animation even at 120Hz (~144 frames)
const UPDATE_WINDOW_FRAMES = 150

/**
 * Shadow maps normally re-render every frame, but light and car are static
 * while orbiting — that's a wasted 2048² depth pass per frame on high/ultra.
 * This freezes shadow updates (shadowMap.autoUpdate = false) and re-enables
 * them only for a frame-counted window after events that actually change
 * shadow content: mount, part swaps, door animations, quality changes.
 * The AccumulativeShadows bake (RandomizedLight shadow maps) runs inside
 * those same windows, so it is unaffected.
 */
export default function ShadowFreeze() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const pendingRef = useRef(UPDATE_WINDOW_FRAMES)

  const selectedParts = useCarConfig((s) => s.selectedParts)
  const openParts = useCarConfig((s) => s.openParts)
  const { settings } = useQuality()

  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])

  const openWindow = () => {
    pendingRef.current = UPDATE_WINDOW_FRAMES
    invalidate()
  }
  const openWindowRef = useRef(openWindow)
  openWindowRef.current = openWindow

  // Part swaps: fade runs ~0.7s, shadow re-bake follows — extend the window
  // after the transition settles
  useEffect(() => {
    openWindowRef.current()
    const t = setTimeout(() => openWindowRef.current(), 950)
    return () => clearTimeout(t)
  }, [selectedParts])

  // Doors/hood/trunk: shadows must track the 1.2s animation and the re-bake
  useEffect(() => {
    openWindowRef.current()
    const t = setTimeout(() => openWindowRef.current(), 1450)
    return () => clearTimeout(t)
  }, [openParts])

  // Quality changes swap shadow map resolution → force a re-render window
  useEffect(() => {
    openWindowRef.current()
  }, [settings])

  useFrame(() => {
    if (pendingRef.current > 0) {
      pendingRef.current -= 1
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
  })

  return null
}
