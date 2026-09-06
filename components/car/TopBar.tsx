'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, SlidersHorizontal } from 'lucide-react'
import { MdOutlineViewInAr } from 'react-icons/md'
import QualitySelector from './QualitySelector'
import { usePhotoMode } from '@/stores/photoModeStore'

const isDesktop = () =>
  typeof window !== 'undefined' &&
  window.innerWidth >= 1024 &&
  !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

interface TopBarProps {
  carName: string
  arSupported: boolean
  onOpenAR: () => void
  /** Desktop customization drawer state — the bar re-centers over the visible stage */
  panelOpen: boolean
}

const GHOST_BTN =
  'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition-colors duration-200 hover:border-white/30 hover:text-white'

/**
 * Single thin chrome strip: car identity on the left, quiet icon actions
 * (photo mode, AR, quality popover) on the right. Replaces the old floating
 * name overlay + always-open quality card + scattered action buttons.
 */
export default function TopBar({ carName, arSupported, onOpenAR, panelOpen }: TopBarProps) {
  const [desktop, setDesktop] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const qualityRef = useRef<HTMLDivElement>(null)
  const photoActive = usePhotoMode((s) => s.active)
  const setPhotoActive = usePhotoMode((s) => s.setActive)

  useEffect(() => setDesktop(isDesktop()), [])

  useEffect(() => {
    if (!qualityOpen) return
    const onPointer = (e: PointerEvent) => {
      if (qualityRef.current && !qualityRef.current.contains(e.target as Node)) {
        setQualityOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQualityOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [qualityOpen])

  return (
    <header
      className={`pointer-events-none absolute left-0 right-0 top-0 z-30 transition-[right] duration-300 ease-in-out ${
        panelOpen ? 'md:right-96' : 'md:right-16'
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />

      <div className="relative flex items-start justify-between px-5 pt-4 md:px-8 md:pt-6">
        <div className="pointer-events-auto select-none">
          <p className="mb-1 text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">Configurator</p>
          <h1 className="text-xl font-extralight uppercase leading-tight tracking-[0.18em] text-white md:text-2xl">
            {carName}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {/* {desktop && !photoActive && (
            <button
              onClick={() => setPhotoActive(true)}
              className={GHOST_BTN}
              aria-label="Photo mode"
              title="Photo mode — path-traced beauty shot"
            >
              <Camera className="h-[18px] w-[18px]" />
            </button>
          )} */}

          {arSupported && (
            <button onClick={onOpenAR} className={GHOST_BTN} aria-label="View in AR" title="View in AR">
              <MdOutlineViewInAr className="h-5 w-5" />
            </button>
          )}

          <div className="relative" ref={qualityRef}>
            <button
              onClick={() => setQualityOpen((v) => !v)}
              className={`${GHOST_BTN} ${qualityOpen ? 'border-[#d4af37]/50 text-[#d4af37]' : ''}`}
              aria-label="Graphics quality"
              aria-expanded={qualityOpen}
              title="Graphics quality"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </button>

            {qualityOpen && (
              <div className="pointer-events-auto absolute right-0 top-12 w-60 rounded-2xl border border-white/10 bg-black/75 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
                <QualitySelector />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
