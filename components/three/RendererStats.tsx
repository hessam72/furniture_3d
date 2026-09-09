'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  TEXTURE_VRAM_MAX_BYTES,
  TEXTURE_VRAM_WARN_BYTES,
  collectTextureCosts,
  formatBytes,
} from '@/lib/three/textureBudget'

/**
 * `?debug` — the GPU budget, on the screen of the device that is running out of it.
 *
 * Safari Web Inspector needs a Mac, and the phones that crash are not attached
 * to one. So the readout has to be legible from the handset itself: mount
 * `<RendererStatsProbe />` inside a Canvas and `<RendererStatsOverlay />` beside
 * it in the DOM, and the numbers appear over the corner of the page.
 *
 * The line that matters is **VRAM**. Everything else here — DPR, programs,
 * geometries — moves in tens of megabytes; textures move in hundreds, and are
 * invisible in every other tool because the *file* is small.
 * @see lib/three/textureBudget.ts
 *
 * The probe cannot render the overlay itself: inside a Canvas, React is
 * reconciling into three's scene graph, where a `<div>` is not a thing that
 * exists. Hence a module-level store and two components.
 */

export interface RendererSample {
  label: string
  fps: number
  dpr: number
  vram: number
  textures: number
  geometries: number
  programs: number
  calls: number
  triangles: number
  /** The three biggest maps, already formatted — the actionable part. */
  worst: string[]
}

/** Every live R3F root that mounted a probe, newest last. */
const samples = new Map<string, RendererSample>()
const listeners = new Set<() => void>()
let snapshot: RendererSample[] = []

function publish() {
  snapshot = [...samples.values()]
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isDebug(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
}

/**
 * Samples one renderer every two seconds. Mount inside a `<Canvas>`.
 *
 * The texture walk is the expensive part — a full scene traverse building a
 * Map — which is why it is on the same slow interval as the rest and not in
 * `useFrame`. At two seconds it costs nothing and still catches a leak on the
 * swap that caused it.
 */
export function RendererStatsProbe({ label }: { label: string }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const viewport = useThree((s) => s.viewport)
  const frames = useRef(0)

  useFrame(() => {
    frames.current += 1
  })

  useEffect(() => {
    const id = `${label}:${gl.domElement.dataset.statsId ?? (gl.domElement.dataset.statsId = String(Math.random()))}`

    const sample = () => {
      const costs = collectTextureCosts(scene)
      samples.set(id, {
        label,
        fps: frames.current / 2,
        dpr: viewport.dpr,
        vram: costs.reduce((total, cost) => total + cost.bytes, 0),
        textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries,
        programs: gl.info.programs?.length ?? 0,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        worst: costs
          .slice(0, 3)
          .map((cost) => `${cost.width}×${cost.height} ${formatBytes(cost.bytes)} ${cost.name.slice(0, 22)}`),
      })
      frames.current = 0
      publish()
    }

    sample()
    const interval = window.setInterval(sample, 2000)
    return () => {
      window.clearInterval(interval)
      samples.delete(id)
      publish()
    }
  }, [gl, scene, viewport.dpr, label])

  return null
}

/**
 * The readout. Mount in the page's DOM, outside the Canvas.
 *
 * One block per live renderer, so a page that is accidentally holding two —
 * an AR overlay over a canvas that was never unmounted, a route transition
 * that left the previous scene alive — says so by having two blocks. That is
 * the failure this overlay exists to make visible, and it has no other tell.
 */
export function RendererStatsOverlay({ tier }: { tier?: string }) {
  const rows = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  )

  if (!isDebug()) return null

  const total = rows.reduce((sum, row) => sum + row.vram, 0)
  const level = total > TEXTURE_VRAM_MAX_BYTES ? '#f87171' : total > TEXTURE_VRAM_WARN_BYTES ? '#fbbf24' : '#4ade80'
  const canvases = typeof document !== 'undefined' ? document.getElementsByTagName('canvas').length : 0

  return (
    <div
      dir="ltr"
      className="pointer-events-none fixed left-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[9999]
                 max-w-[min(22rem,92vw)] rounded-lg bg-black/80 px-2.5 py-2 font-mono text-[10px]
                 leading-[1.45] text-neutral-200 backdrop-blur-sm"
    >
      <div style={{ color: level }}>
        VRAM {formatBytes(total)}
        <span className="text-neutral-500">
          {' '}
          · {rows.length} renderer{rows.length === 1 ? '' : 's'} · {canvases} canvas
          {canvases === 1 ? '' : 'es'}
          {tier ? ` · ${tier}` : ''}
        </span>
      </div>

      {rows.map((row) => (
        <div key={row.label} className="mt-1 border-t border-white/10 pt-1">
          <div className="text-neutral-400">
            {row.label} · {row.fps.toFixed(0)}fps · dpr {row.dpr.toFixed(2)} · {formatBytes(row.vram)}
          </div>
          <div className="text-neutral-500">
            geo {row.geometries} · tex {row.textures} · prog {row.programs} · calls {row.calls} ·{' '}
            {(row.triangles / 1000).toFixed(0)}k tris
          </div>
          {row.worst.map((line) => (
            <div key={line} className="truncate text-neutral-600">
              {line}
            </div>
          ))}
        </div>
      ))}

      {rows.length > 1 && (
        <div className="mt-1 border-t border-white/10 pt-1 text-[#f87171]">
          ⚠ more than one live WebGL context
        </div>
      )}
    </div>
  )
}
