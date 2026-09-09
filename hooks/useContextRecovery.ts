'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RenderSurface } from '@/lib/config/deviceTier'

/**
 * What a page does when the GPU takes its context away.
 *
 * Generalised from `/product`'s ladder, which was the only one that worked and
 * the only page that had one. `/simple` and `/showroom` swallowed the event
 * (a `preventDefault()` and nothing else), and `/store` never listened for it,
 * so on those three a lost context is a frozen frame with no notice, no retry
 * and no change of tier — the customer sees a still image of a sofa and decides
 * the site is broken.
 *
 * Three things have to happen together, and doing any two is worse than useless:
 *
 *  1. **Unmount the Canvas**, not just draw a notice over it. The next render of
 *     the R3F tree calls into `EffectComposer` against the dead context and
 *     throws out of React, replacing the page with "Application error: a
 *     client-side exception". That was the visible crash on /product.
 *  2. **Drop a rung.** The context went because the device ran out of room for
 *     what we asked it to draw, so coming back at the same tier asks for it
 *     again. That is the loop: crash, reload, crash.
 *  3. **Offer a way back.** A remount with a fresh context, at the lower tier.
 *
 * The rung count is kept in `sessionStorage`, which is the part `/product`'s
 * version was missing. Its counter died with the tab — and on iOS the tab is
 * reloaded *by the OS*, so every crash came back at full tier and crashed
 * again. Per-tab is the right lifetime, and it is cleared after a minute of
 * survival so one bad afternoon does not permanently dim the page.
 */

export interface ContextRecovery {
  /** True from the moment the GPU drops the buffer until `retry`. Gate the
   *  Canvas on `!lost`. */
  lost: boolean
  /** Remount token for the Canvas — a context that died has to be rebuilt, not
   *  re-rendered. Bumped by `retry` and by `remount`. */
  canvasKey: number
  /** Rungs surrendered this page view. Hand to `<QualityProvider downgrades>`. */
  downgrades: number
  /** False once the ladder has run out; show a dead end rather than a button
   *  that will fail the same way. */
  retryable: boolean
  /** Wire to the canvas host's `onContextLost`. */
  handleContextLost: () => void
  /** Clear the loss and remount. `purge` runs first, for file-level failures
   *  only — @see the note on the callback. */
  retry: (purge?: () => void) => void
  /** Remount without counting a failure — the AR return path. */
  remount: () => void
}

/** Long enough to mean the lower tier is holding, short enough that a customer
 *  who comes back tomorrow is not still paying for it. */
const FORGIVE_AFTER_MS = 60_000

const storageKey = (surface: RenderSurface) => `furniture:downgrades:${surface}`

function readDowngrades(surface: RenderSurface): number {
  if (typeof window === 'undefined') return 0
  try {
    return Number(window.sessionStorage.getItem(storageKey(surface))) || 0
  } catch {
    return 0
  }
}

function writeDowngrades(surface: RenderSurface, value: number): void {
  try {
    if (value > 0) window.sessionStorage.setItem(storageKey(surface), String(value))
    else window.sessionStorage.removeItem(storageKey(surface))
  } catch {
    /* private mode: the ladder is per-page-view instead of per-tab */
  }
}

export function useContextRecovery(options: {
  surface: RenderSurface
  /** Rungs to drop per loss. 0 for a page with nothing to give up. */
  step?: number
  /** Losses before the page stops offering a retry. */
  limit?: number
  /** Told about every loss, for the page's own notice copy. */
  onLost?: (losses: number) => void
}): ContextRecovery {
  const { surface, step = 1, limit = 2, onLost } = options

  const [lost, setLost] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)
  const [downgrades, setDowngrades] = useState(0)
  const [losses, setLosses] = useState(0)

  // Read after mount, not in the initialiser: this hook is used by components
  // that DO server-render (the page shell around the canvas), and a tier that
  // differs between the server and client HTML is a hydration mismatch.
  useEffect(() => {
    const stored = readDowngrades(surface)
    if (stored) setDowngrades(stored)
  }, [surface])

  const lostAt = useRef(0)

  const handleContextLost = useCallback(() => {
    lostAt.current = Date.now()
    setLost(true)
    setLosses((n) => {
      onLost?.(n + 1)
      return n + 1
    })
    setDowngrades((n) => {
      const next = n + step
      writeDowngrades(surface, next)
      return next
    })
  }, [onLost, step, surface])

  const retry = useCallback((purge?: () => void) => {
    // The purge is the caller's, deliberately. Clearing the GLB cache is right
    // when the *files* are the problem — a 404, or a GLB that will not parse —
    // and wrong for a lost context, where the files are fine and only the GPU's
    // copy of them is gone. Clearing there re-suspends every layer, and on
    // /product the stack never republishes its framing, which leaves the camera
    // rig with nothing to solve from: an unsolved camera over a black stage.
    purge?.()
    setLost(false)
    setCanvasKey((n) => n + 1)
  }, [])

  const remount = useCallback(() => setCanvasKey((n) => n + 1), [])

  // Survived a minute at the lower tier: forget the rung for the next visit.
  // The current page view keeps it — moving the tier back up under a customer
  // who is looking at the piece is its own kind of broken.
  useEffect(() => {
    if (!downgrades || lost) return
    const timer = window.setTimeout(() => writeDowngrades(surface, 0), FORGIVE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [downgrades, lost, surface])

  return {
    lost,
    canvasKey,
    downgrades,
    retryable: losses < limit,
    handleContextLost,
    retry,
    remount,
  }
}
