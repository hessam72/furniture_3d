'use client'

import { usePhotoMode } from '@/stores/photoModeStore'

/**
 * Photo-mode overlay: progress, save and exit while the path tracer works.
 * The overlay blocks scene/tuning interaction so the traced snapshot stays
 * consistent. The entry button lives in TopBar.
 */
export default function PhotoModeUI() {
  const active = usePhotoMode((s) => s.active)
  const status = usePhotoMode((s) => s.status)
  const buildProgress = usePhotoMode((s) => s.buildProgress)
  const samples = usePhotoMode((s) => s.samples)
  const setActive = usePhotoMode((s) => s.setActive)
  const requestSave = usePhotoMode((s) => s.requestSave)

  if (!active) return null

  const statusText =
    status === 'building'
      ? `Building scene… ${Math.round(buildProgress * 100)}%`
      : status === 'rendering'
        ? `Refining · ${samples} samples`
        : 'Preparing…'

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto">
      <div className="absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-black/75 py-2 pl-5 pr-2 backdrop-blur-2xl">
        <span className="text-[11px] uppercase tracking-[0.2em] text-white/70 tabular-nums">
          {statusText}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={requestSave}
            disabled={status !== 'rendering'}
            className="rounded-full bg-[#d4af37] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-black transition-colors hover:bg-[#e2c25a] disabled:cursor-default disabled:opacity-40"
          >
            Save PNG
          </button>
          <button
            onClick={() => setActive(false)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-white/25 hover:text-white"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}
