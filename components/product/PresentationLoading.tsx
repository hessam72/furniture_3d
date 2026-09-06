'use client'

import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import type * as THREE from 'three'
import type { StackFraming } from './FurnitureStack'

/**
 * Fires once the scene is genuinely on screen, not merely mounted.
 *
 * The asset probe that gates the canvas only HEAD-checks the manifest's URLs —
 * it says the files exist, which is a different question from whether they have
 * downloaded, parsed and drawn. Everything after it happens inside
 * `Suspense fallback={null}`, so the page went from blank, to a room, to a
 * piece, in whatever order the network delivered.
 *
 * Readiness is taken from the scene's own products rather than from a loader
 * count: the stack publishes `framing` when it has measured the piece, and the
 * room publishes its bounds when it has loaded — the two things the camera
 * needs before its first solve means anything. `useProgress` is only used for
 * the number on screen, because it cannot answer this: it reports 0 of 0 both
 * before the first request starts and after a warm cache serves everything.
 *
 * Then one more drawn frame, after a `compile`, so the reveal is not the frame
 * that pays for shader compilation.
 */

/**
 * How often the waiting phase asks the demand loop for a frame, in ms.
 *
 * This used to be `invalidate()` from inside `useFrame`, which is a loop that
 * feeds itself: the canvas ran flat out at 60fps for the whole load. Nothing is
 * watching — the splash covers the canvas until `onReady` — and it is the most
 * expensive moment of the page's life to be doing it in, since the room and the
 * piece are still downloading and parsing on the same device. Frames are only
 * needed here to notice that the stack has measured itself and the room has
 * landed, and both of those already call `invalidate` when they happen; this is
 * the safety net under them, not the mechanism.
 */
const WAIT_PUMP_MS = 120

export function SceneReady({
  framing,
  needsRoom,
  roomBox,
  onReady,
}: {
  framing: React.MutableRefObject<StackFraming | null>
  /** Whether a modelled room is expected — an image backdrop has none. */
  needsRoom: boolean
  roomBox: THREE.Box3 | null
  onReady: () => void
}) {
  const { gl, scene, camera, invalidate } = useThree()
  const done = useRef(false)
  const compiled = useRef(false)
  const [waiting, setWaiting] = useState(true)

  useEffect(() => {
    if (!waiting) return
    invalidate()
    const id = window.setInterval(invalidate, WAIT_PUMP_MS)
    return () => window.clearInterval(id)
  }, [waiting, invalidate])

  useFrame(() => {
    if (done.current) return
    if (!framing.current) return
    if (needsRoom && !roomBox) return

    if (!compiled.current) {
      compiled.current = true
      // Warm every program while the overlay still covers the canvas, so the
      // first frame the user sees is not the one that stalls compiling them.
      gl.compile(scene, camera)
      invalidate()
      return
    }

    done.current = true
    setWaiting(false)
    onReady()
  })

  return null
}

/**
 * Full-bleed splash over the canvas, in the language of /store's LoadingScreen
 * and the /car overlay — dark stage, gold hairline, tracked micro-labels.
 *
 * Held over the mounted canvas rather than shown instead of it: the scene has
 * to be rendering to load its own assets and report itself ready, and a fade
 * out of an opaque cover is also the only way to avoid showing the pop-in this
 * exists to hide.
 */
export default function PresentationLoading({
  productName,
  ready,
}: {
  productName: string
  ready: boolean
}) {
  const { progress, active } = useProgress()
  const [gone, setGone] = useState(false)

  // Unmounted only after the fade, so the canvas underneath is never composited
  // against a layer that is still painting.
  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => setGone(true), 520)
    return () => window.clearTimeout(t)
  }, [ready])

  if (gone) return null

  // 0 of 0 items reads as 0%, which looks stuck. Only trust the number while
  // the manager actually has something in flight.
  const pct = active ? Math.round(progress) : ready ? 100 : null

  return (
    <div
      aria-hidden={ready}
      className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 bg-[#060608] transition-opacity duration-500"
      style={{ opacity: ready ? 0 : 1 }}
    >
      <div className="flex flex-col items-center gap-2 px-6 text-center">
        <span className="text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">Atelier</span>
        <h1
          className="font-[family-name:var(--font-vazir)] text-2xl font-light tracking-wide text-white md:text-3xl"
          dir="rtl"
        >
          {productName}
        </h1>
        <p className="font-[family-name:var(--font-vazir)] mt-1 text-sm text-white/35" dir="rtl">
          در حال آماده‌سازی نمای سه‌بعدی...
        </p>
      </div>

      <div className="relative h-px w-64 overflow-hidden bg-white/10">
        {pct === null ? (
          <div
            className="absolute h-full w-1/3 animate-[presentation-sweep_1.4s_ease-in-out_infinite]"
            style={{ background: 'linear-gradient(to right, #b8860b, #d4af37, #f5e6b8)' }}
          />
        ) : (
          <div
            className="absolute left-0 h-full transition-[width] duration-300"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(to right, #b8860b, #d4af37, #f5e6b8)',
            }}
          />
        )}
      </div>

      <style jsx>{`
        @keyframes presentation-sweep {
          0% { left: -33%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}
