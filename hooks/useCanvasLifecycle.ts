'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { RootState } from '@react-three/fiber'
import { releaseRenderer } from '@/lib/three/releaseRenderer'
import { primeGltfLoaders } from '@/lib/three/gltfLoaders'
import { isDebug } from '@/components/three/rendererStatsStore'

/**
 * Everything a `<Canvas>` has to do at both ends of its life, in one place.
 *
 * On create: prime the KTX2 transcoder, attach the context-loss pair, and hand
 * the host whatever else it needs the renderer for. On destroy: release the
 * context properly (@see releaseRenderer).
 *
 * The listener half is `PresentationScene`'s, moved: it was the only complete
 * `webglcontextlost`/`webglcontextrestored` pair in the codebase — with the
 * `preventDefault()` that makes a restore possible at all, and a cleanup.
 * `SimpleViewer` had a partial copy that added a listener it never removed,
 * with no restore and no way to tell the page. `/store` had none.
 *
 * ## Why the teardown is a macrotask from the host's cleanup
 *
 * It cannot live in `onCreated`'s return value: R3F calls `onCreated(state)`
 * and discards what comes back. It cannot be a `useThree` child inside the
 * Canvas either — React 18 tears a deleted subtree down parent-first, so a
 * child that disposed the renderer would do it while `EffectComposer`,
 * `OrbitControls` and drei's `Environment` still have cleanups pending, each of
 * which touches renderer-owned state on the way out. And it cannot run
 * synchronously in the host's own cleanup, which is one level further up and
 * therefore even earlier.
 *
 * A `setTimeout(…, 0)` scheduled from the host's cleanup is the first moment
 * after every child cleanup and after the canvas has left the DOM — and
 * comfortably inside the 500ms window before R3F's own teardown runs.
 */
export function useCanvasLifecycle(options: {
  /** Names this canvas in the `?debug` teardown line. */
  label: string
  /** The GPU dropped the buffer. Not a React error — no boundary sees it. */
  onContextLost?: () => void
  /** Runs last inside `onCreated`, for whatever else the host needs `gl` for. */
  onCreated?: (state: RootState) => void
}) {
  const { label, onContextLost, onCreated } = options
  const stateRef = useRef<RootState | null>(null)
  const detachRef = useRef<(() => void) | null>(null)
  /** True from the first line of teardown, so the loss we cause ourselves is
   *  not mistaken for the device running out of room. */
  const tearingDown = useRef(false)

  const handleCreated = useCallback(
    (state: RootState) => {
      stateRef.current = state
      // The KTX2 transcoder cannot pick a target format without a renderer to
      // ask, and every Canvas is an equally good one to ask. @see primeGltfLoaders
      primeGltfLoaders(state.gl)

      const canvas = state.gl.domElement
      const lost = (event: Event) => {
        // Without this the context is gone for good — the browser only offers a
        // restore to a page that declined the default.
        event.preventDefault()
        if (!tearingDown.current) onContextLost?.()
      }
      // Repaints where the browser gives us a restore; the page's retry covers
      // the browsers that never do.
      const restored = () => state.invalidate()

      canvas.addEventListener('webglcontextlost', lost, false)
      canvas.addEventListener('webglcontextrestored', restored, false)
      detachRef.current = () => {
        canvas.removeEventListener('webglcontextlost', lost)
        canvas.removeEventListener('webglcontextrestored', restored)
      }

      onCreated?.(state)
    },
    [onContextLost, onCreated]
  )

  useEffect(() => {
    return () => {
      const state = stateRef.current
      const detach = detachRef.current
      stateRef.current = null
      detachRef.current = null
      if (!state) return

      /**
       * A StrictMode double-mount is not an unmount.
       *
       * The App Router defaults `reactStrictMode` to true, so in development
       * every Canvas mounts, unmounts and remounts — and R3F reuses the **same
       * `<canvas>` element**, which has exactly one WebGL context. Force-losing
       * it for the first root would kill the second root's context and leave a
       * black canvas in dev only. A real unmount removes R3F's wrapper div, so
       * the element leaves the document; a StrictMode remount keeps it.
       */
      if (state.gl.domElement.isConnected) return

      tearingDown.current = true
      const debug = isDebug()
      window.setTimeout(() => releaseRenderer(state, { label, detachListeners: detach ?? undefined, debug }), 0)
    }
  }, [label])

  return handleCreated
}
