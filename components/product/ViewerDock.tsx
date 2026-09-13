'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, ChevronLeft, ChevronUp, Smartphone, Sparkles } from 'lucide-react'
import { usePresentation } from '@/stores/presentationStore'
import {
  coverPalette,
  findCoverVariant,
  isTextureSwatch,
  swatchPaint,
  type PresentationZone,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'
import FabricRow from './FabricRow'

/**
 * The controls for the plain viewer: a dock on the side, a sheet at the bottom.
 *
 * Two things drive the shape of this.
 *
 * **It must not cover the piece.** A panel that hides the sofa while you change
 * the sofa is a panel that makes you close it to see what you did. On a wide
 * screen it takes the right edge and the camera slides the piece clear of it —
 * @see `dockCoverage`, which is measured here and framed by SimpleViewer. On a
 * phone there is no width to give away, so it becomes a bottom sheet and the
 * camera lifts the piece instead, which is the mechanism that was already here.
 *
 * **It must be obvious to someone who has never used one.** So: one row of cloth
 * you pick by looking at it, the chosen one shown large enough to judge, and two
 * plainly-labelled buttons. No sliders, no swatch codes to decode, nothing that
 * needs a legend.
 *
 * Deliberately not `ProductSheet`. That one serves `/product/[id]`, where the
 * layer stepper, the cover grid and the spec tabs all earn their place. Reusing
 * it here would mean one component answering to two layouts and two sets of
 * priorities, and the tabs would have to grow a mode flag apiece.
 */

/** Below this the dock becomes a bottom sheet. Matches Tailwind's `md`. */
const DOCK_QUERY = '(min-width: 768px)'

interface Props {
  presentation: ResolvedPresentation
  onViewAR: () => void
  /** Whether this device can enter AR at all — steers the copy, not the button. */
  arCapable?: boolean
  /** The configured model is being weighed before AR opens. */
  arBuilding?: boolean
  /** Slides the whole thing away while the AR overlay owns the screen. Kept
   *  mounted, so the open tab and the measured coverage survive the round trip. */
  hidden?: boolean
}

export default function ViewerDock({
  presentation,
  onViewAR,
  arCapable = false,
  arBuilding = false,
  hidden = false,
}: Props) {
  const { config } = presentation

  const paint = usePresentation((s) => s.paint)
  const setPaint = usePresentation((s) => s.setPaint)
  const setActiveZone = usePresentation((s) => s.setActiveZone)
  const coverId = usePresentation((s) => s.coverId)
  const layerStep = usePresentation((s) => s.layerStep)
  const setLayerStep = usePresentation((s) => s.setLayerStep)
  const setDockCoverage = usePresentation((s) => s.setDockCoverage)
  const setSheetCoverage = usePresentation((s) => s.setSheetCoverage)

  const variant = findCoverVariant(config, coverId)

  /**
   * One tab per named group in the piece — the couch, its cushions, the shawl.
   *
   * Read straight off `config.parts`, so the tabs are whatever the product
   * actually has rather than a fixed list. A part whose palette is empty is
   * dropped: a tab that offers nothing reads as broken, not as deliberate.
   */
  const tabs = useMemo(() => {
    const palette = (zone: PresentationZone) =>
      zone === 'cover' ? coverPalette(config, variant) : config.palettes[zone] ?? []
    const source = config.parts?.length
      ? config.parts.map((part) => ({ zone: part.zone, label: part.label }))
      : [{ zone: 'cover' as PresentationZone, label: config.layers.cover.label ?? 'رویه' }]

    const seen = new Set<PresentationZone>()
    return source
      .filter((tab) => (seen.has(tab.zone) ? false : (seen.add(tab.zone), true)))
      .map((tab) => ({ ...tab, swatches: palette(tab.zone) }))
      .filter((tab) => tab.swatches.length > 0)
  }, [config, variant])

  const [activeTab, setActiveTab] = useState<PresentationZone>(() => tabs[0]?.zone ?? 'cover')
  // A product whose parts changed under us must not leave a tab selected that no
  // longer exists — the panel would render empty with no way back.
  useEffect(() => {
    if (tabs.length && !tabs.some((tab) => tab.zone === activeTab)) setActiveTab(tabs[0].zone)
  }, [tabs, activeTab])

  const tab = tabs.find((t) => t.zone === activeTab) ?? tabs[0]
  const active = tab?.swatches.find((swatch) => swatch.id === paint[tab.zone]?.swatchId)

  const [open, setOpen] = useState(true)
  const [pendingSwatch, setPendingSwatch] = useState<string | null>(null)
  const [wide, setWide] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(DOCK_QUERY)
    const sync = () => setWide(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  /**
   * Tell the camera how much of the screen this is standing on.
   *
   * Measured rather than assumed, because the dock's width is a `clamp()` and
   * the sheet's height is its content — both are numbers only the browser knows.
   * Whichever axis is not in play is zeroed, or a rotation from landscape to
   * portrait would leave the piece offset for a panel that is no longer there.
   */
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const report = () => {
      if (hidden || !open) {
        setDockCoverage(0)
        setSheetCoverage(0)
        return
      }
      const box = el.getBoundingClientRect()
      if (wide) {
        setDockCoverage(box.width / window.innerWidth)
        setSheetCoverage(0)
      } else {
        setDockCoverage(0)
        setSheetCoverage(box.height / window.innerHeight)
      }
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [wide, open, hidden, setDockCoverage, setSheetCoverage])

  // Nothing to frame around once the panel is gone.
  useEffect(
    () => () => {
      setDockCoverage(0)
      setSheetCoverage(0)
    },
    [setDockCoverage, setSheetCoverage]
  )

  const pick = useCallback(
    async (swatch: ZoneSwatch) => {
      const zone = tab?.zone
      if (!zone) return
      setActiveZone(zone)
      // Wait on the cloth before the store moves, so the map and the ~400ms
      // colour damp start together instead of the fabric popping in after it.
      if (isTextureSwatch(swatch)) {
        const { ensureSwatchMaps, peekSwatchMaps } = await import('@/lib/three/swatchTextures')
        if (!peekSwatchMaps(swatch.maps!)) {
          setPendingSwatch(swatch.id)
          await ensureSwatchMaps(swatch.maps!)
          setPendingSwatch(null)
        }
      }
      setPaint(swatchPaint(swatch), zone)
    },
    [tab?.zone, setActiveZone, setPaint]
  )

  const showingFrame = layerStep === 0

  if (!tab) return null

  return (
    <>
      {/* The way back in. Only rendered while collapsed, so there is never a
          stray control floating over the piece. */}
      {!open && !hidden && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-12
                     items-center gap-2 rounded-full bg-slate-900/92 px-5 text-[13.5px] font-medium
                     text-white shadow-xl shadow-black/25 backdrop-blur-md transition-transform
                     duration-300 hover:scale-[1.03] active:scale-95
                     md:bottom-1/2 md:translate-y-1/2 md:rounded-l-2xl md:rounded-r-none md:pl-4 md:pr-5"
        >
          <Sparkles className="h-4 w-4 text-sky-300" />
          انتخاب پارچه
        </button>
      )}

      <aside
        ref={panelRef}
        dir="rtl"
        aria-label="تنظیم پارچه"
        /* `translate` rather than unmounting: the measured box survives, so
           reopening does not re-solve the camera from scratch.

           The sheet caps at 50vh, not more, because MAX_PANEL_COVERAGE in
           SimpleViewer is the ceiling the camera will actually reframe around —
           a taller sheet silently leaves the piece standing behind it. The
           content area scrolls instead. */
        className={`fixed z-30 flex flex-col bg-slate-900/92 text-white shadow-2xl shadow-black/30
                    backdrop-blur-xl transition-transform duration-[420ms]
                    ease-[cubic-bezier(0.22,1,0.36,1)]
                    inset-x-0 bottom-0 max-h-[50vh] rounded-t-3xl
                    md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[clamp(20rem,30vw,25rem)]
                    md:rounded-l-3xl md:rounded-tr-none
                    ${hidden ? 'translate-y-full md:translate-x-full md:translate-y-0' : ''}
                    ${!hidden && !open ? 'translate-y-[calc(100%+1rem)] md:translate-x-[calc(100%+1rem)] md:translate-y-0' : ''}`}
      >
        {/* Header: what this panel is, and the way out of it. */}
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4 md:pt-6">
          <h2 className="text-[15px] font-semibold tracking-tight">انتخاب پارچه</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="بستن پنل"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60
                       transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronUp className="h-5 w-5 md:hidden" />
            <ChevronLeft className="hidden h-5 w-5 md:block" />
          </button>
        </div>

        {/* Which part of the piece is being dressed. Hidden for a product with
            only one, where a single tab is a label pretending to be a control. */}
        {tabs.length > 1 && (
          <div role="tablist" aria-label="بخش‌های مبل" className="flex gap-1.5 px-5 pb-1 pt-2">
            {tabs.map((entry) => {
              const selected = entry.zone === activeTab
              return (
                <button
                  key={entry.zone}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(entry.zone)}
                  className={`flex-1 rounded-xl px-2 py-2 text-[12.5px] font-medium transition-colors
                              duration-200 ${
                                selected
                                  ? 'bg-sky-500/90 text-white shadow-sm shadow-sky-500/30'
                                  : 'bg-white/[0.07] text-white/65 hover:bg-white/[0.12] hover:text-white/90'
                              }`}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-1 pt-3">
          <FabricRow
            label={`پارچه ${tab.label}`}
            swatches={tab.swatches}
            activeId={paint[tab.zone]?.swatchId}
            pendingId={pendingSwatch}
            onPick={pick}
          />

          {/* The chosen cloth, big enough to actually judge. The row above is for
              finding one; this is for deciding. */}
          {active && (
            <div className="mt-4 flex items-stretch gap-3 rounded-2xl bg-white/[0.06] p-2.5">
              <div
                className="h-[74px] w-[92px] shrink-0 rounded-xl bg-cover bg-center shadow-inner"
                style={{
                  backgroundColor: active.hex,
                  ...(active.thumbnail ? { backgroundImage: `url(${active.thumbnail})` } : {}),
                }}
                aria-hidden
              />
              <div className="flex min-w-0 flex-col justify-center gap-1">
                <p className="truncate text-[15px] font-semibold">{active.name}</p>
                <p className="truncate text-[12px] text-white/55">{tab.label}</p>
              </div>
            </div>
          )}
        </div>

        {/* The two things worth doing once the cloth is chosen. */}
        <div className="flex flex-col gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 md:pb-6">
          <button
            type="button"
            onClick={() => setLayerStep(showingFrame ? 1 : 0)}
            aria-pressed={showingFrame}
            className={`flex h-12 items-center justify-center gap-2 rounded-2xl text-[13.5px]
                        font-medium transition-colors duration-200 ${
                          showingFrame
                            ? 'bg-white text-slate-900'
                            : 'bg-white/[0.09] text-white/85 hover:bg-white/[0.15] hover:text-white'
                        }`}
          >
            <Box className="h-[18px] w-[18px]" />
            {showingFrame ? 'بازگشت به نمای نهایی' : 'نمایش سازه داخلی'}
          </button>

          <button
            type="button"
            onClick={onViewAR}
            disabled={arBuilding}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-500 text-[13.5px]
                       font-semibold text-white shadow-lg shadow-sky-500/25 transition-[background-color,transform]
                       duration-200 hover:bg-sky-400 active:scale-[0.99] disabled:opacity-60"
          >
            <Smartphone className="h-[18px] w-[18px]" />
            {arBuilding ? 'در حال آماده‌سازی…' : arCapable ? 'مشاهده در فضای شما' : 'مشاهده با موبایل'}
          </button>
        </div>
      </aside>
    </>
  )
}
