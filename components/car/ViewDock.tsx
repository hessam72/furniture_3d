'use client'

import { useEffect, useRef, useState } from 'react'
import { Home, RotateCcw } from 'lucide-react'
import {
  MdOutlineViewInAr,
  MdOutlineZoomIn,
  MdArrowUpward,
  MdAirlineSeatReclineNormal,
  MdTune,
} from 'react-icons/md'
import { TbCarSuv } from 'react-icons/tb'
import { IoCarSportOutline } from 'react-icons/io5'
import { GiCarDoor } from 'react-icons/gi'
import { useCameraStore, CAMERA_PRESETS, PresetName } from '@/stores/cameraStore'
import { useCarConfig } from '@/stores/carConfigStore'

const PRESETS: PresetName[] = ['front', 'rear', 'sideLeft', 'sideRight', 'top', 'detail', 'interior']

const presetIcons: Partial<Record<PresetName, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>> = {
  front: (p) => <IoCarSportOutline {...p} />,
  rear: (p) => <IoCarSportOutline {...p} style={{ transform: 'rotate(180deg)' }} />,
  sideLeft: (p) => <TbCarSuv {...p} style={{ transform: 'scaleX(-1)' }} />,
  sideRight: (p) => <TbCarSuv {...p} />,
  top: (p) => <MdArrowUpward {...p} />,
  detail: (p) => <MdOutlineZoomIn {...p} />,
  interior: (p) => <MdAirlineSeatReclineNormal {...p} />,
}

const DOOR_LABELS: Record<string, string> = {
  car_door_left: 'Left Door',
  car_door_right: 'Right Door',
  car_door_back_left: 'Left Rear',
  car_door_back_right: 'Right Rear',
  car_caput: 'Hood',
  car_trunk: 'Trunk',
}

const DOCK_BTN =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200'

interface ViewDockProps {
  /** Desktop customization drawer state — the dock re-centers over the visible stage */
  panelOpen: boolean
  /** Mobile: opens the customization bottom sheet */
  onOpenPanel: () => void
}

/**
 * Bottom-center control dock: camera presets, auto-rotate, reset and the
 * doors popover in one quiet pill. Replaces the full-height left rail and
 * the bottom-right parts-toggle grid.
 */
export default function ViewDock({ panelOpen, onOpenPanel }: ViewDockProps) {
  const { activePreset, setPreset, autoRotate, setAutoRotate } = useCameraStore()
  const openParts = useCarConfig((s) => s.openParts)
  const togglePart = useCarConfig((s) => s.togglePart)
  const openAllParts = useCarConfig((s) => s.openAllParts)
  const closeAllParts = useCarConfig((s) => s.closeAllParts)

  const [doorsOpen, setDoorsOpen] = useState(false)
  const dockRef = useRef<HTMLDivElement>(null)

  const anyDoorOpen = Object.values(openParts).some(Boolean)
  const allOpen = Object.values(openParts).every(Boolean)
  const allClosed = Object.values(openParts).every((v) => !v)

  useEffect(() => {
    if (!doorsOpen) return
    const onPointer = (e: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setDoorsOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDoorsOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [doorsOpen])

  return (
    <div
      className={`pointer-events-none absolute bottom-4 left-0 right-0 z-30 flex justify-center px-3 transition-[right] duration-300 ease-in-out md:bottom-6 ${
        panelOpen ? 'md:right-96' : 'md:right-16'
      }`}
    >
      <div ref={dockRef} className="pointer-events-auto relative">
        {/* Doors popover */}
        {doorsOpen && (
          <div className="absolute bottom-14 left-1/2 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/75 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
            <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-white/45">Doors &amp; Body</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(DOOR_LABELS).map(([partName, label]) => (
                <button
                  key={partName}
                  onClick={() => togglePart(partName)}
                  aria-pressed={!!openParts[partName]}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    openParts[partName]
                      ? 'border-[#d4af37]/60 bg-[#d4af37]/10 text-[#d4af37]'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <button
                onClick={openAllParts}
                disabled={allOpen}
                className="text-[11px] font-medium uppercase tracking-[0.15em] text-white/60 transition-colors hover:text-white disabled:cursor-default disabled:text-white/25"
              >
                Open All
              </button>
              <button
                onClick={closeAllParts}
                disabled={allClosed}
                className="text-[11px] font-medium uppercase tracking-[0.15em] text-white/60 transition-colors hover:text-white disabled:cursor-default disabled:text-white/25"
              >
                Close All
              </button>
            </div>
          </div>
        )}

        {/* Dock row: scrollable pill + always-visible Customize (mobile) */}
        <div className="flex max-w-[94vw] items-center gap-2">
        <div className="scrollbar-hide flex min-w-0 max-w-[680px] items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-black/50 px-2 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {PRESETS.map((preset) => {
            const Icon = presetIcons[preset] ?? ((p: any) => <MdOutlineViewInAr {...p} />)
            const active = activePreset === preset
            return (
              <button
                key={preset}
                onClick={() => setPreset(preset)}
                className={`${DOCK_BTN} ${active ? 'text-[#d4af37]' : 'text-white/60 hover:text-white'}`}
                aria-label={CAMERA_PRESETS[preset].label}
                aria-pressed={active}
                title={CAMERA_PRESETS[preset].label}
              >
                <Icon className="h-5 w-5" />
                {active && <span className="absolute bottom-0.5 h-[3px] w-[3px] rounded-full bg-[#d4af37]" />}
              </button>
            )
          })}

          <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />

          <button
            onClick={() => setDoorsOpen((v) => !v)}
            className={`${DOCK_BTN} ${doorsOpen || anyDoorOpen ? 'text-[#d4af37]' : 'text-white/60 hover:text-white'}`}
            aria-label="Doors and body panels"
            aria-expanded={doorsOpen}
            title="Doors & body"
          >
            <GiCarDoor className="h-5 w-5" />
            {anyDoorOpen && <span className="absolute bottom-0.5 h-[3px] w-[3px] rounded-full bg-[#d4af37]" />}
          </button>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`${DOCK_BTN} ${autoRotate ? 'text-[#d4af37]' : 'text-white/60 hover:text-white'}`}
            aria-label="Auto rotate"
            aria-pressed={autoRotate}
            title="Auto rotate"
          >
            <RotateCcw className="h-[18px] w-[18px]" />
            {autoRotate && <span className="absolute bottom-0.5 h-[3px] w-[3px] rounded-full bg-[#d4af37]" />}
          </button>

          <button
            onClick={() => setPreset('home')}
            className={`${DOCK_BTN} text-white/60 hover:text-white`}
            aria-label="Reset camera"
            title="Reset camera"
          >
            <Home className="h-[18px] w-[18px]" />
          </button>

        </div>

        {/* Mobile: customization entry — outside the scroll area so it can
            never be hidden by horizontal overflow (no floating FAB) */}
        <button
          onClick={onOpenPanel}
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#d4af37] text-black shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition-colors hover:bg-[#e2c25a] md:hidden"
          aria-label="Open customization panel"
        >
          <MdTune className="h-5 w-5" />
        </button>
        </div>
      </div>
    </div>
  )
}
