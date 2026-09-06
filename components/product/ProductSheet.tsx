'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { Box, ChevronDown, Loader2, ShoppingBag, Smartphone } from 'lucide-react'
import { faPrice } from '@/lib/store/catalog'
import { SpecDetails, SpecDimensions, SpecFabric } from '@/components/store/productSpecTabs'
import { usePresentation } from '@/stores/presentationStore'
import {
  coverSurface,
  findCoverVariant,
  totalPrice,
  type PresentationZone,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'
import SwatchRow from './SwatchRow'
import CoverVariantGrid from './CoverVariantGrid'
import LayerStepper from './LayerStepper'

const SPRING = { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 }

type Tab = 'specs' | 'colors' | 'layers' | 'ar'

const TABS: { id: Tab; label: string }[] = [
  { id: 'specs', label: 'مشخصات' },
  { id: 'colors', label: 'رنگ‌ها' },
  { id: 'layers', label: 'لایه‌ها' },
  { id: 'ar', label: 'واقعیت افزوده' },
]

const ZONE_LABELS: Record<PresentationZone, string> = {
  wood: 'چوب بدنه',
  cover: 'رویه',
  cushion: 'کوسن',
}

interface Props {
  presentation: ResolvedPresentation
  onViewAR: () => void
  onAddToCart: () => void
  arAvailable: boolean
  /** Whether this device can enter AR at all — steers the copy, not the button. */
  arCapable?: boolean
  /** True when AR will show the live configuration rather than the stock model. */
  arLive?: boolean
  arBuilding?: boolean
  arError?: boolean
  /** Slides the sheet off-screen while the AR overlay owns the display. Kept
   *  mounted so the open tab, the expanded state and the reported screen
   *  coverage all survive — closing AR returns you exactly where you were. */
  hidden?: boolean
}

export default function ProductSheet({
  presentation,
  onViewAR,
  onAddToCart,
  arAvailable,
  arCapable = false,
  arLive = false,
  arBuilding = false,
  arError = false,
  hidden = false,
}: Props) {
  const { product, config } = presentation

  // No cushion row without a soft layer — the swatches would paint nothing.
  const zones = useMemo<PresentationZone[]>(
    () => (config.layers.soft ? ['wood', 'cover', 'cushion'] : ['wood', 'cover']),
    [config.layers.soft]
  )
  const [activeTab, setActiveTab] = useState<Tab>('specs')
  // Opens collapsed: the piece is the hero, details are one tap away.
  const [expanded, setExpanded] = useState(false)

  const paint = usePresentation((s) => s.paint)
  const setPaint = usePresentation((s) => s.setPaint)
  const setActiveZone = usePresentation((s) => s.setActiveZone)
  const coverId = usePresentation((s) => s.coverId)
  const selectCover = usePresentation((s) => s.selectCover)
  const layerStep = usePresentation((s) => s.layerStep)
  const layerErrors = usePresentation((s) => s.layerErrors)
  const exploded = usePresentation((s) => s.exploded)
  const setSheetCoverage = usePresentation((s) => s.setSheetCoverage)

  // Push the chosen variant's surface into the paint state as well as the id —
  // see the note in selectCover.
  const pickCover = useCallback(
    (id: string) => {
      selectCover(id, coverSurface(config, findCoverVariant(config, id)))
    },
    [config, selectCover]
  )


  // Exploding is a look-at-the-piece gesture — get out of its way.
  useEffect(() => {
    if (exploded) setExpanded(false)
  }, [exploded])

  // Report how much of the screen this sheet hides so the camera rig can frame
  // the piece in the band that is actually visible.
  //
  // Only its *resting* height counts — the sheet minus the panel that expands.
  // Reporting the live height re-framed the camera every time a tab opened, so
  // the whole scene slid up the screen and back down again; expanding is meant
  // to draw the panel over the viewport, not move what is behind it.
  const sheetRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const report = () => {
      const panel = panelRef.current?.getBoundingClientRect().height ?? 0
      const resting = el.getBoundingClientRect().height - panel
      setSheetCoverage(resting / window.innerHeight)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    if (panelRef.current) observer.observe(panelRef.current)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      setSheetCoverage(0)
    }
  }, [setSheetCoverage])

  const variant = findCoverVariant(config, coverId)
  const price = totalPrice(product, variant)

  // Fabric swatches inherit their surface character from the active cover
  // variant; only wood carries its own roughness.
  const pick = (zone: PresentationZone) => (swatch: ZoneSwatch) => {
    setActiveZone(zone)
    setPaint(
      swatch.roughness !== undefined ? { color: swatch.hex, roughness: swatch.roughness } : { color: swatch.hex },
      zone
    )
  }

  // Collapsing must not dismiss — this sheet is the page's primary UI.
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) setExpanded(false)
    else if (info.offset.y < -60 || info.velocity.y < -600) setExpanded(true)
  }

  return (
    <motion.div
      ref={sheetRef}
      dir="rtl"
      drag={hidden ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.04, bottom: 0.25 }}
      onDragEnd={handleDragEnd}
      initial={{ y: '110%' }}
      animate={{ y: hidden ? '110%' : 0 }}
      transition={SPRING}
      aria-hidden={hidden}
      className={`font-persian fixed bottom-0 left-0 right-0 z-[99] mx-auto flex max-w-[560px]
                 flex-col overflow-hidden rounded-t-[28px] border-t border-white/[0.06]
                 bg-[var(--surface-2)]/85 backdrop-blur-2xl ${hidden ? 'pointer-events-none' : ''}`}
      style={{ boxShadow: '0 -18px 50px -20px rgb(0 0 0 / 80%)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px
                   bg-gradient-to-l from-transparent via-[var(--gold-line-hi)] to-transparent"
      />

      <button
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'جمع کردن' : 'باز کردن'}
        aria-expanded={expanded}
        className="flex w-full cursor-grab justify-center pt-3 pb-1.5 active:cursor-grabbing"
      >
        <span className="h-1 w-10 rounded-full bg-white/25 transition-colors hover:bg-white/40" />
      </button>

      <div className="px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
            {product.name}
          </h1>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px]
                       text-[var(--text-secondary)] transition-colors hover:bg-white/[0.06]
                       hover:text-[var(--gold-primary)]"
          >
            {expanded ? 'کمتر' : 'جزییات'}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div className="mt-3 border-t border-white/[0.06] pt-2">
          <div className="scrollbar-hide flex gap-4 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setExpanded(true)
                }}
                className={`relative shrink-0 pb-2 pt-1 text-[13px] transition-colors ${
                  activeTab === tab.id && expanded
                    ? 'text-[var(--gold-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && expanded && (
                  <motion.span
                    layoutId="presentation-tab-underline"
                    transition={SPRING}
                    className="absolute inset-x-0 bottom-0 h-px bg-[var(--gold-primary)]"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <motion.div
          ref={panelRef}
          initial={false}
          animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div>
            <div className="scrollbar-hide max-h-[34vh] overflow-y-auto overscroll-contain py-3 md:max-h-[30vh]">
              {activeTab === 'specs' && (
                <div className="space-y-4">
                  <SpecDetails product={product} />
                  <SpecDimensions product={product} />
                  <SpecFabric product={product} />
                </div>
              )}

              {activeTab === 'colors' && (
                <div className="space-y-5">
                  {zones.map((zone) => (
                    <SwatchRow
                      key={zone}
                      zone={zone}
                      label={ZONE_LABELS[zone]}
                      swatches={config.palettes[zone] ?? []}
                      activeHex={paint[zone].color}
                      onPick={pick(zone)}
                    />
                  ))}
                </div>
              )}

              {activeTab === 'layers' && (
                <div className="space-y-5">
                  <LayerStepper config={config} />
                  <div className="space-y-2">
                    <span className="text-[12px] text-[var(--text-muted)]">جنس رویه</span>
                    <CoverVariantGrid
                      variants={config.layers.cover.variants}
                      activeId={layerStep === 1 ? coverId : null}
                      errors={layerErrors}
                      onSelect={pickCover}
                    />
                    <p className="text-[11px] text-[var(--text-muted)]">
                      با انتخاب جنس رویه، اسکلت چوبی پنهان می‌شود.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'ar' && (
                <div className="space-y-3">
                  <p className="text-[13px] leading-7 text-[var(--text-secondary)]">
                    {!arCapable
                      ? 'پیش‌نمایش سه‌بعدی از همین چیدمان انتخابی شما باز می‌شود. برای قرار دادن آن در فضای واقعی، صفحه را روی گوشی یا تبلت باز کنید.'
                      : arLive
                        ? 'همین چیدمان — جنس رویه و هر سه رنگ انتخابی شما — در فضای واقعی اتاقتان قرار می‌گیرد. آماده‌سازی مدل چند ثانیه طول می‌کشد.'
                        : 'مرورگر این دستگاه از نمایش مدل ساخته‌شده پشتیبانی نمی‌کند؛ مدل پیش‌فرض محصول نمایش داده می‌شود.'}
                  </p>
                  {arError && (
                    <p className="text-[12px] leading-6 text-red-400">
                      ساخت مدل واقعیت افزوده ناموفق بود. دوباره تلاش کنید.
                    </p>
                  )}
                  <button
                    onClick={onViewAR}
                    disabled={!arAvailable || arBuilding}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border
                               border-[var(--border-default)] py-2.5 text-[13px]
                               text-[var(--gold-primary)] transition-colors
                               hover:bg-[var(--gold-primary)]/10 disabled:opacity-40"
                  >
                    {arBuilding ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        در حال آماده‌سازی مدل…
                      </>
                    ) : arCapable ? (
                      <>
                        <Smartphone className="h-4 w-4" />
                        مشاهده در واقعیت افزوده
                      </>
                    ) : (
                      <>
                        <Box className="h-4 w-4" />
                        پیش‌نمایش سه‌بعدی
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <div className="flex min-w-0 flex-col">
            {variant && (
              <span className="truncate text-[11px] text-[var(--text-muted)]">{variant.name}</span>
            )}
            <span className="persian-number text-[17px] font-bold leading-tight text-[var(--gold-primary)]">
              {price ? faPrice(price) : 'استعلام قیمت'}
            </span>
          </div>

          <button
            onClick={onAddToCart}
            className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-l
                       from-[var(--gold-primary)] to-[var(--gold-warm)] px-5 text-[13px]
                       font-bold text-black shadow-lg shadow-[var(--gold-primary)]/20
                       transition-transform duration-200 active:scale-[0.97]"
          >
            <ShoppingBag className="h-4 w-4" />
            افزودن
          </button>
        </div>
      </div>
    </motion.div>
  )
}
