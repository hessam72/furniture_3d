'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { Box, ChevronDown, Loader2, ShoppingBag, Smartphone } from 'lucide-react'
import { formatPrice } from '@/lib/store/catalog'
import { SpecDetails, SpecDimensions, SpecFabric } from '@/components/store/productSpecTabs'
import { usePresentation } from '@/stores/presentationStore'
import {
  coverPalette,
  coverSelection,
  findCoverVariant,
  isTextureSwatch,
  swatchPaint,
  totalPrice,
  type PresentationZone,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'
import { ensureSwatchMaps, peekSwatchMaps } from '@/lib/three/swatchTextures'
import SwatchRow from './SwatchRow'
import CoverVariantGrid from './CoverVariantGrid'
import LayerStepper from './LayerStepper'

const SPRING = { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 }

type Tab = 'specs' | 'colors' | 'layers' | 'ar'

/**
 * The swatch rows to show, in manifest order.
 *
 * A `parts` block is the piece describing its own anatomy — couch, cushions,
 * shawl — so it names the rows too. Two parts pointing at one zone collapse into
 * a single row, because they *are* a single control: they share a paint slot and
 * would otherwise render as two chips fighting over the same state.
 *
 * With no parts, this is the old behaviour exactly: wood and cover, plus cushion
 * where a soft layer exists to wear it.
 */
function swatchRows(
  config: ResolvedPresentation['config'],
  /** Fallback row labels, for a manifest with no `parts` block of its own. */
  zoneLabels: Record<PresentationZone, string>
): { zone: PresentationZone; label: string }[] {
  if (config.parts?.length) {
    const seen = new Set<PresentationZone>()
    return config.parts
      .filter((part) => (seen.has(part.zone) ? false : (seen.add(part.zone), true)))
      .filter((part) => (config.palettes[part.zone]?.length ?? 0) > 0)
      .map((part) => ({ zone: part.zone, label: part.label }))
  }
  const zones: PresentationZone[] = config.layers.soft ? ['wood', 'cover', 'cushion'] : ['wood', 'cover']
  return zones.map((zone) => ({ zone, label: zoneLabels[zone] }))
}

interface Props {
  presentation: ResolvedPresentation
  onViewAR: () => void
  onAddToCart: () => void
  arAvailable: boolean
  /** Whether this device can enter AR at all — steers the copy, not the button. */
  arCapable?: boolean
  /**
   * Whether AR will carry the customer's own configuration into the room.
   *
   * Left undefined by the surfaces that serve the authored file as-is, which
   * promise the chosen cover and nothing more. `/simple` builds its model
   * server-side, so it sets this true and flips it false once a real attempt has
   * fallen back to the product's published GLB. @see arModelUrl
   */
  arLive?: boolean
  /** The configured model is being weighed before AR opens. */
  arBuilding?: boolean
  /** False where there is no layer stack to pull apart — the plain viewer
   *  mounts one file at a time. @see LayerStepper */
  explodable?: boolean
  /** A line under the swatch rows. The plain viewer shows one layer at a
   *  time, so it says which view a given palette is visible on. */
  zoneNote?: string
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
  arLive,
  arBuilding = false,
  explodable = true,
  zoneNote,
  hidden = false,
}: Props) {
  const { product, config } = presentation
  const locale = useLocale()
  const t = useTranslations('product')
  const tc = useTranslations('common')
  const TABS: { id: Tab; label: string }[] = [
    { id: 'specs', label: t('tabSpecs') },
    { id: 'colors', label: t('tabColors') },
    { id: 'layers', label: t('tabLayers') },
    { id: 'ar', label: t('tabAR') },
  ]
  const zoneLabels: Record<PresentationZone, string> = {
    wood: t('zoneWood'),
    cover: t('zoneCover'),
    cushion: t('zoneCushion'),
    shawl: t('zoneShawl'),
  }

  // One row per named part, or the old zone list where a manifest has none.
  // A row whose palette is empty is dropped — swatches that paint nothing read
  // as a broken control rather than a deliberate one.
  const rows = useMemo(() => swatchRows(config, zoneLabels), [config, zoneLabels])
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
  // see the note in selectCover. `coverSelection` also reseeds the swatch where
  // the variant brings its own palette, so leather never opens wearing velvet.
  const pickCover = useCallback(
    (id: string) => {
      selectCover(id, coverSelection(config, id))
    },
    [config, selectCover]
  )

  /** The swatch whose textures are still in flight, for the chip's busy state. */
  const [pendingSwatch, setPendingSwatch] = useState<string | null>(null)


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

  /**
   * Fabric swatches inherit their surface character from the active cover
   * variant; only wood carries its own roughness. `swatchPaint` resolves the
   * rest — colour to white for a textured swatch, and `maps: null` for a plain
   * one so the previous cloth is actually cleared rather than merged over.
   *
   * The commit *waits* on the texture, rather than the render layer holding an
   * async state of its own: the store changing is what starts the ~400ms colour
   * damp, and a map that lands after the damp has finished reads as a flicker.
   * A warm swatch skips the await entirely — an `await` always costs a microtask
   * and another commit, and the second tap on a swatch is the one people judge.
   */
  const pick = (zone: PresentationZone) => async (swatch: ZoneSwatch) => {
    setActiveZone(zone)
    if (isTextureSwatch(swatch) && !peekSwatchMaps(swatch.maps!)) {
      setPendingSwatch(swatch.id)
      // Resolves even on a 404 — a fabric that will not load leaves the piece in
      // the cloth it was authored with rather than blocking the tap forever.
      await ensureSwatchMaps(swatch.maps!)
      setPendingSwatch(null)
    }
    setPaint(swatchPaint(swatch), zone)
  }

  /** Cover swatches follow the mounted variant where it brings its own. */
  const palettes = (zone: PresentationZone) =>
    zone === 'cover' ? coverPalette(config, variant) : config.palettes[zone] ?? []

  // Collapsing must not dismiss — this sheet is the page's primary UI.
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) setExpanded(false)
    else if (info.offset.y < -60 || info.velocity.y < -600) setExpanded(true)
  }

  return (
    <motion.div
      ref={sheetRef}
      dir={locale === 'fa' ? 'rtl' : 'ltr'}
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
        aria-label={expanded ? t('collapsePanel') : t('expandPanel')}
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
            {expanded ? tc('lessDetails') : tc('details')}
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
                  {rows.map(({ zone, label }) => (
                    <SwatchRow
                      key={zone}
                      zone={zone}
                      label={label}
                      swatches={palettes(zone)}
                      activeId={paint[zone].swatchId}
                      activeHex={paint[zone].color}
                      pendingId={pendingSwatch}
                      onPick={pick(zone)}
                    />
                  ))}
                  {zoneNote && (
                    <p className="text-[11px] leading-6 text-[var(--text-muted)]">{zoneNote}</p>
                  )}
                </div>
              )}

              {activeTab === 'layers' && (
                <div className="space-y-5">
                  <LayerStepper config={config} explode={explodable} />
                  <div className="space-y-2">
                    <span className="text-[12px] text-[var(--text-muted)]">{t('coverMaterial')}</span>
                    <CoverVariantGrid
                      variants={config.layers.cover.variants}
                      activeId={layerStep === 1 ? coverId : null}
                      errors={layerErrors}
                      onSelect={pickCover}
                    />
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {t('coverHint')}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'ar' && (
                <div className="space-y-3">
                  <p className="text-[13px] leading-7 text-[var(--text-secondary)]">
                    {!arCapable
                      ? t('arPreviewNote')
                      : arLive === true
                        ? t('arLiveNote')
                        : arLive === false
                          ? t('arFallbackNote')
                          : t('arDefaultNote')}
                  </p>
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
                        {t('preparingModel')}
                      </>
                    ) : arCapable ? (
                      <>
                        <Smartphone className="h-4 w-4" />
                        {tc('viewInAR')}
                      </>
                    ) : (
                      <>
                        <Box className="h-4 w-4" />
                        {t('preview3D')}
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
              {price ? formatPrice(price, locale) : tc('priceOnRequest')}
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
            {tc('add')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
