'use client'

import { useEffect } from 'react'

/**
 * Registers the asset cache worker. @see public/sw.js for what it stores and why.
 *
 * Mounted once at the locale layout rather than on the 3D routes, because the
 * point is the *second* page: a visitor who reads the store and then opens a
 * product should not pay for `/basis/`, `/draco/` and the HDR twice, and by the
 * time they reach the viewer it is too late to start. Nothing is precached, so
 * a visitor who never opens a 3D page pays for the registration and nothing
 * else.
 *
 * Registration waits for `load`. A service worker install competes for the same
 * connections as the page it is installing on, and on the one route where that
 * matters the page is already asking for a multi-megabyte GLB.
 *
 * `?sw=off` is the way out: it unregisters and empties the store, which is what
 * you want if a bad worker ever ships, and is worth having precisely because a
 * service worker outlives the deploy that installed it.
 */
export default function AssetCache() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // Secure-context only. Safari refuses registration on plain http anyway;
    // failing quietly here keeps the console clean on a LAN dev host.
    if (!window.isSecureContext) return

    const disabled = new URLSearchParams(window.location.search).get('sw') === 'off'

    if (disabled) {
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
        if ('caches' in window) {
          const names = await caches.keys()
          await Promise.all(
            names.filter((name) => name.startsWith('furniture-assets-')).map((name) => caches.delete(name))
          )
        }
        console.info('[assets] worker unregistered and cache emptied')
      })()
      return
    }

    let cancelled = false
    const register = () => {
      if (cancelled) return
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        // Not fatal by construction: without the worker every request simply
        // goes to the network, which is what this page did before it existed.
        console.warn('[assets] worker registration failed', error)
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', register)
    }
  }, [])

  return null
}
