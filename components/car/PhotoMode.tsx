'use client'

import { Suspense, lazy } from 'react'
import { usePhotoMode } from '@/stores/photoModeStore'

// three-gpu-pathtracer (+ three-mesh-bvh) is heavy and only needed while a
// beauty shot is being rendered — the session component lives in its own
// chunk and downloads on first activation.
const PhotoModeSession = lazy(() => import('./PhotoModeSession'))

/**
 * Progressive path-traced "beauty shot" of the current tuned car. While
 * active, the r3f loop is frozen (frameloop: 'never') and the path tracer
 * owns the canvas, accumulating samples with physically correct reflections,
 * soft shadows and GI. Exiting restores the realtime renderer untouched.
 */
export default function PhotoMode() {
  const active = usePhotoMode((s) => s.active)
  if (!active) return null
  return (
    <Suspense fallback={null}>
      <PhotoModeSession />
    </Suspense>
  )
}
