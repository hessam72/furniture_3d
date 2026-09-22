'use client'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Shadow maps drawn once, not every frame.
 *
 * Nothing in the walkthrough moves a shadow: the room is static, the sun and
 * the lamps are static, and the player is a capsule with no mesh. Yet with
 * three's default `autoUpdate` every drawn frame re-rendered the whole room
 * into the sun's map — plus six cube faces per shadow-casting lamp — for a
 * result identical to the frame before. On a phone that was most of the
 * frame's geometry work.
 *
 * So the maps are frozen, and whatever *can* change them (a model mounting,
 * the sun's resolution or bounds, a lamp gaining or moving its shadow) asks
 * for exactly one redraw through `requestShadowUpdate()`.
 */

// Module-level, like `markStoreActivity` — callers sit in several components
// and the renderer is one per page.
let request: (() => void) | null = null

/** Redraw every shadow map on the next frame, once. */
export function requestShadowUpdate() {
  request?.()
}

export function StaticShadows() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const shadowMap = gl.shadowMap
    shadowMap.autoUpdate = false
    request = () => {
      shadowMap.needsUpdate = true
      invalidate()
    }
    // Whatever mounted before this took its map on the default path; draw once.
    request()
    return () => {
      request = null
      shadowMap.autoUpdate = true
    }
  }, [gl, invalidate])

  return null
}
