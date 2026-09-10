'use client'

import { useSyncExternalStore } from 'react'
import {
  TEXTURE_VRAM_MAX_BYTES,
  TEXTURE_VRAM_WARN_BYTES,
  formatBytes,
  isDebug,
  readSamples,
  subscribeSamples,
} from './rendererStatsStore'

/**
 * `?debug` — the GPU budget, on the screen of the device that is running out of
 * it. Safari Web Inspector needs a Mac, and the phones that crash are not
 * attached to one.
 *
 * The line that matters is **VRAM**. Everything else here — DPR, programs,
 * geometries — moves in tens of megabytes; textures move in hundreds, and are
 * invisible in every other tool because the *file* is small.
 * @see lib/three/textureBudget.ts
 *
 * Imports nothing from `three`, deliberately: this renders at page level, and a
 * transitive dependency on the library would land the whole of it in the bundle
 * of every page that mounts it.
 */
export function RendererStatsOverlay({ tier }: { tier?: string }) {
  const rows = useSyncExternalStore(subscribeSamples, readSamples, readSamples)

  if (!isDebug()) return null

  const total = rows.reduce((sum, row) => sum + row.vram, 0)
  const level = total > TEXTURE_VRAM_MAX_BYTES ? '#f87171' : total > TEXTURE_VRAM_WARN_BYTES ? '#fbbf24' : '#4ade80'
  const canvases = typeof document !== 'undefined' ? document.getElementsByTagName('canvas').length : 0

  return (
    <div
      dir="ltr"
      className="pointer-events-none fixed right-2 top-[max(4rem,env(safe-area-inset-top))] z-[9999]
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
