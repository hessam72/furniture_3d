'use client'

import { useState, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import PaintControls from './PaintControls'
import SuspensionControls from './SuspensionControls'
import LightingControls from './LightingControls'
import PartsGrid from './PartsGrid'
import partsConfig from '@/public/config/car-parts.json'
import { useCarConfig } from '@/stores/carConfigStore'
import { useComparisonStore } from '@/stores/comparisonStore'
import './CustomizationPanel.css'
import { IoColorPalette, IoCarSport, IoClose, IoChevronBack } from 'react-icons/io5'
import {
  GiCarWheel, GiWingCloak, GiCarDoor,
  GiMirrorMirror,
  GiSmokingPipe,
  GiSteeringWheel,
  GiCarSeat,
  GiSpring
} from 'react-icons/gi'
import { TbCarSuv } from 'react-icons/tb'
import { MdLightbulb, MdLightbulbOutline } from 'react-icons/md'
import { FaCog } from 'react-icons/fa'

// Preload all parts in a category into the same drei cache the scene reads from
function preloadCategory(categoryId: string) {
  const parts = partsConfig[categoryId as keyof typeof partsConfig] || []
  parts.forEach((part: any) => {
    if (part.model_path) {
      try {
        useGLTF.preload(part.model_path)
      } catch (error) {
        console.warn(`[Preload] Failed to preload ${part.model_path}:`, error)
      }
    }
  })
}

const CATEGORIES = [
  { id: 'paint', name: 'Paint', icon: IoColorPalette },
  { id: 'suspension', name: 'Suspension', icon: GiSpring },
  { id: 'lighting', name: 'Lighting', icon: MdLightbulbOutline },
  { id: 'wheels', name: 'Wheels', icon: GiCarWheel },
  { id: 'spoilers', name: 'Spoilers', icon: GiWingCloak },
  { id: 'hoods', name: 'Hoods', icon: IoCarSport },
  { id: 'bumpers', name: 'Bumpers', icon: GiCarDoor },
  { id: 'mirrors', name: 'Mirrors', icon: GiMirrorMirror },
  { id: 'exhaust', name: 'Exhaust', icon: GiSmokingPipe },
  { id: 'side-skirts', name: 'Side Skirts', icon: TbCarSuv },
  { id: 'seats', name: 'Seats', icon: GiCarSeat },
  { id: 'steering-wheels', name: 'Steering', icon: GiSteeringWheel },
  { id: 'brake-calipers', name: 'Calipers', icon: FaCog },
  { id: 'headlights', name: 'Headlights', icon: MdLightbulb },
]

interface CustomizationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Right-side customization drawer (desktop) / bottom sheet (mobile).
 * Controlled by the page so the rest of the chrome can re-center over the
 * visible stage. Category rail is vertical on desktop, a strip on mobile.
 */
export default function CustomizationPanel({ open, onOpenChange }: CustomizationPanelProps) {
  const [activeTab, setActiveTab] = useState('paint')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const selectedParts = useCarConfig((s) => s.selectedParts)
  const paintConfig = useCarConfig((s) => s.paintConfig)
  const suspensionHeight = useCarConfig((s) => s.suspensionHeight)
  const loadingParts = useCarConfig((s) => s.loadingParts)
  const partLoadErrors = useCarConfig((s) => s.partLoadErrors)
  const setPartError = useCarConfig((s) => s.setPartError)

  const compareMode = useComparisonStore((s) => s.compareMode)
  const enableCompareMode = useComparisonStore((s) => s.enableCompareMode)

  const handleCompare = () => {
    enableCompareMode()
  }

  // Calculate total price
  const totalPrice = Object.entries(selectedParts).reduce((total, [category, partId]) => {
    const parts = partsConfig[category as keyof typeof partsConfig] || []
    const part = parts.find((p: any) => p.id === partId)
    return total + (part?.price || 0)
  }, 0)

  // Preload current category parts immediately on tab change
  useEffect(() => {
    if (activeTab !== 'paint' && activeTab !== 'suspension' && activeTab !== 'lighting') {
      preloadCategory(activeTab)
    }
  }, [activeTab])

  // Prefetch adjacent categories during idle time
  useEffect(() => {
    const categories = CATEGORIES.filter(
      (c) => c.id !== 'paint' && c.id !== 'suspension' && c.id !== 'lighting' && c.id !== activeTab
    ).map((c) => c.id)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleCallback = window.requestIdleCallback(
        () => {
          categories.forEach((cat) => preloadCategory(cat))
        },
        { timeout: 2000 }
      )

      return () => window.cancelIdleCallback(idleCallback)
    }
  }, [activeTab])

  // Escape closes the reset dialog
  useEffect(() => {
    if (!showResetConfirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowResetConfirm(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showResetConfirm])

  const anyLoading = Object.values(loadingParts).some(Boolean)
  const activeCategory = CATEGORIES.find((c) => c.id === activeTab)

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden"
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Desktop collapsed rail */}
      {!open && (
        <button
          onClick={() => onOpenChange(true)}
          className="fixed right-0 top-0 z-50 hidden h-screen w-16 flex-col items-center justify-center gap-4 border-l border-white/10 bg-black/50 backdrop-blur-xl transition-colors hover:bg-black/70 md:flex"
          aria-label="Open customization panel"
        >
          <IoChevronBack className="text-lg text-white/60" />
          <span
            className="text-[10px] uppercase tracking-[0.35em] text-white/45"
            style={{ writingMode: 'vertical-rl' }}
          >
            Customize
          </span>
        </button>
      )}

      {/* Main panel */}
      <div
        className={`cmpanel fixed z-50 flex flex-col border-white/10 bg-black/60 backdrop-blur-2xl transition-all duration-300 ease-in-out
          ${open
            ? 'bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl border-t md:max-h-none md:rounded-none md:border-t-0'
            : 'pointer-events-none bottom-[-100%] left-0 right-0'
          }
          md:bottom-0 md:left-auto md:right-0 md:top-0 md:h-screen md:border-l
          ${open ? 'md:w-96' : 'md:w-0 md:overflow-hidden md:border-l-0'}
        `}
      >
        {open && (
          <>
            {/* Mobile drag handle */}
            <div className="flex justify-center pb-1 pt-3 md:hidden">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pb-4 pt-3 md:px-6 md:pt-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-white/45">Customize</p>
                {anyLoading && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/50">
                    <div className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-transparent" />
                    Loading part…
                  </div>
                )}
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close customization panel"
              >
                <IoClose className="text-lg" />
              </button>
            </div>

            {/* Body */}
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {/* Mobile: horizontal category strip */}
              <div className="scrollbar-hide flex shrink-0 overflow-x-auto border-y border-white/10 md:hidden">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const active = activeTab === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveTab(cat.id)}
                      aria-current={active}
                      className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-xs font-medium tracking-wide transition-colors ${
                        active ? 'text-[#d4af37]' : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {loadingParts[cat.id] ? (
                        <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" />
                      ) : (
                        <Icon className="text-base" />
                      )}
                      {cat.name}
                      {active && <span className="absolute inset-x-4 bottom-0 h-px bg-[#d4af37]" />}
                    </button>
                  )
                })}
              </div>

              {/* Desktop: vertical category rail */}
              <div className="hidden w-14 shrink-0 flex-col gap-1 border-r border-white/10 py-2 md:flex">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const active = activeTab === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveTab(cat.id)}
                      aria-label={cat.name}
                      aria-current={active}
                      title={cat.name}
                      className={`relative mx-auto flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                        active
                          ? 'bg-[#d4af37]/10 text-[#d4af37]'
                          : 'text-white/50 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {loadingParts[cat.id] ? (
                        <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" />
                      ) : (
                        <Icon className="text-lg" />
                      )}
                      {active && (
                        <span className="absolute -left-[5px] top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-[#d4af37]" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Content */}
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 md:p-6"
                style={{ scrollBehavior: 'smooth' }}
              >
                <h3 className="mb-5 hidden text-xs font-medium uppercase tracking-[0.25em] text-white/70 md:block">
                  {activeCategory?.name}
                </h3>

                {/* Error Banner */}
                {partLoadErrors[activeTab] && (
                  <div className="mb-4 rounded-xl border border-red-400/25 bg-red-500/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="mb-1 text-sm font-medium text-red-300">Failed to load part</h4>
                        <p className="text-xs text-red-200/70">{partLoadErrors[activeTab]}</p>
                      </div>
                      <button
                        onClick={() => setPartError(activeTab, null)}
                        className="rounded-full border border-red-400/30 px-3 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'paint' ? (
                  <PaintControls />
                ) : activeTab === 'suspension' ? (
                  <SuspensionControls />
                ) : activeTab === 'lighting' ? (
                  <LightingControls />
                ) : (
                  <PartsGrid category={activeTab} />
                )}
              </div>
            </div>

            {/* Footer: price + actions */}
            <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-5 py-4 md:px-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Total</p>
                <p className="text-lg font-light tabular-nums tracking-wide text-white">
                  ${totalPrice.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {!compareMode && (
                  <button
                    onClick={handleCompare}
                    className="text-[11px] uppercase tracking-[0.2em] text-[#d4af37]/70 transition-colors hover:text-[#d4af37]"
                  >
                    Compare
                  </button>
                )}
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="text-[11px] uppercase tracking-[0.2em] text-white/50 transition-colors hover:text-white"
                >
                  Reset
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowResetConfirm(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-dialog-title"
            className="fixed left-1/2 top-1/2 z-[70] w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#0d0d12]/95 p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
          >
            <h3 id="reset-dialog-title" className="text-base font-medium tracking-wide text-white">
              Reset configuration?
            </h3>
            <p className="mt-2 text-sm text-white/50">
              All paint and part selections return to stock. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-2.5">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-white/35 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  useCarConfig.getState().resetConfig()
                  setShowResetConfirm(false)
                }}
                className="flex-1 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-red-300 transition-colors hover:bg-red-500/20"
              >
                Reset
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
