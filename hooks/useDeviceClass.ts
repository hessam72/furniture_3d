'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { PHONE_QUERY, TOUCH_QUERY, readDeviceClass, type DeviceClass } from '@/lib/config/deviceTier'

/**
 * What class of hardware is drawing this page, correct on the first render.
 *
 * There were four copies of this, one per surface, all written the same way:
 * `useState('desktop')` plus an effect that corrects it. Which means the first
 * value every `QualityProvider` saw on a phone was the *desktop* tier, and the
 * canvas below it could mount, size its buffers and compile its programs
 * against that before the correction landed. `PresentationScene` alone avoided
 * it, by reading `readDeviceClass()` synchronously in a `useState` initialiser
 * — safe there because the component is `ssr: false`.
 *
 * `useSyncExternalStore` generalises that: the server snapshot is `desktop`,
 * which is what the server paints anyway, and the client's first render already
 * has the real answer. It also picks up an orientation change for free, which
 * matters here — PHONE_QUERY tests the *short* side, so rotating a handset can
 * legitimately change nothing while rotating a small tablet changes everything.
 */
export function useDeviceClass(): DeviceClass {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
    const queries = [window.matchMedia(PHONE_QUERY), window.matchMedia(TOUCH_QUERY)]
    queries.forEach((query) => query.addEventListener('change', onChange))
    return () => queries.forEach((query) => query.removeEventListener('change', onChange))
  }, [])

  return useSyncExternalStore(subscribe, readDeviceClass, () => 'desktop' as const)
}
