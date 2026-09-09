'use client'

import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'

/**
 * Let go of a page's GLBs when the visitor leaves it.
 *
 * Nothing did. drei's cache is keyed on the URL and lives for the life of the
 * tab, so walking `/showroom → /product/test → /product/test/simple` left every
 * parsed GLB from all three resident — geometry, textures and all — with no
 * eviction path short of a reload. `/showroom` was the worst of them: it
 * re-probes and re-parses on every layer toggle and never cleared anything, so
 * a visitor flicking between three covers ended up holding three.
 *
 * **At page unmount, not canvas unmount.** The distinction is the whole design:
 * a Canvas is torn down and rebuilt constantly here — an AR round trip, a
 * context-loss retry, a StrictMode double-mount — and every one of those wants
 * the cache warm on the way back. `ProductPageClient`'s `retry` says so
 * explicitly: clearing on a remount re-suspends every layer and the stack never
 * republishes its framing, which leaves the camera with nothing to solve from.
 *
 * The paths are read from a ref at cleanup time, so a page whose layer set
 * changes while it is open still evicts what it actually loaded, not what it
 * started with.
 */
export function useGltfCacheEviction(paths: string[]): void {
  const held = useRef(new Set<string>())
  paths.filter(Boolean).forEach((path) => held.current.add(path))

  useEffect(() => {
    const set = held.current
    return () => {
      set.forEach((path) => {
        try {
          useGLTF.clear(path)
        } catch {
          // A path that was never actually loaded — a probe that failed, a
          // layer nobody opened. Nothing to release.
        }
      })
      set.clear()
    }
  }, [])
}
