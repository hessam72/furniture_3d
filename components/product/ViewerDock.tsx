'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { Box, Check, ChevronLeft, FileText, Layers, Palette, ShoppingBag, Sparkles } from 'lucide-react'
import { usePresentation } from '@/stores/presentationStore'
import { useShop } from '@/stores/storeShopStore'
import { formatPrice, findCatalogItemBySceneObject, type Catalog } from '@/lib/store/catalog'
import catalog from '@/public/config/catalog.json'
import {
  coverPalette,
  coverSurface,
  findCoverVariant,
  isTextureSwatch,
  swatchPaint,
  totalPrice,
  type PresentationZone,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'
import SwatchGrid from './SwatchGrid'
import ColorDots from './ColorDots'
import MaterialTiles from './MaterialTiles'
import DockSpecs from './DockSpecs'

/**
 * The controls for the plain viewer: a dock on the side, a sheet at the bottom.
 *
 * Three things drive the shape of this.
 *
 * **It must not cover the piece.** A panel that hides the sofa while you change
 * the sofa is a panel that makes you close it to see what you did. On a wide
 * screen it takes the trailing edge and the camera slides the piece clear of it
 * — @see `dockCoverage`, measured here and framed by SimpleViewer. On a phone
 * there is no width to give away, so it becomes a bottom sheet and the camera
 * lifts the piece instead.
 *
 * **It is one column, so it has to be tabbed.** `/product/[id]`'s bottom drawer
 * settled this argument already: a configurator has more to say than fits on a
 * screen, and the honest answer is three named places rather than one long
 * scroll where the price falls below the fold. The split is by *question* —
 * what cloth, what frame, what are the numbers — not by data type.
 *
 * **It must be obvious to someone who has never used one.** Cloth you pick by
 * looking at it, the chosen one shown large enough to judge, one price and one
 * primary action always in view. No sliders, no swatch codes to decode.
 *
 * Deliberately not `ProductSheet`. That one serves `/product/[id]`, where the
 * layer stepper, the cover grid and the spec tabs answer to a drawer over a
 * room. Reusing it here would mean one component serving two layouts and two
 * sets of priorities, with a mode flag on every tab.
 */

/** Below this the dock becomes a bottom sheet. Matches Tailwind's `md`. */
const DOCK_QUERY = '(min-width: 768px)'

const SPRING = { type: 'spring' as const, damping: 32, stiffness: 340, mass: 0.7 }

type DockTab = 'finish' | 'structure' | 'specs'

const TAB_ICONS: Record<DockTab, typeof Palette> = { finish: Palette, structure: Box, specs: FileText }

interface Props {
  presentation: ResolvedPresentation
  /** Whether the AR button in the page header is mid-flight, so the dock can
   *  keep its copy in step. Purely informational — the dock does not open AR. */
  arBuilding?: boolean
  /** Slides the whole thing away while the AR overlay owns the screen. Kept
   *  mounted, so the open tab and the measured coverage survive the round trip. */
  hidden?: boolean
  /**
   * Whether the chips may fetch their photographs yet.
   *
   * The dock mounts with the canvas, so its chips would otherwise start
   * downloading alongside the piece and take six HTTP/1.1 connections off it.
   * Held false until the piece is on screen, the chips are their own `hex` —
   * which is the fallback SwatchGrid is built around either way. @see
   * SwatchGrid's `images`
   */
  images?: boolean
}

export default function ViewerDock({
  presentation,
  arBuilding = false,
  hidden = false,
  images = true,
}: Props) {
  const { key: productKey, product, config } = presentation
  const locale = useLocale()
  const t = useTranslations('product')
  const tc = useTranslations('common')
  const TABS: { id: DockTab; label: string; Icon: typeof Palette }[] = [
    { id: 'finish', label: t('tabFinish'), Icon: TAB_ICONS.finish },
    { id: 'structure', label: t('tabStructure'), Icon: TAB_ICONS.structure },
    { id: 'specs', label: t('tabSpecs'), Icon: TAB_ICONS.specs },
  ]

  const paint = usePresentation((s) => s.paint)
  const setPaint = usePresentation((s) => s.setPaint)
  const setActiveZone = usePresentation((s) => s.setActiveZone)
  const coverId = usePresentation((s) => s.coverId)
  const selectCover = usePresentation((s) => s.selectCover)
  const layerStep = usePresentation((s) => s.layerStep)
  const setLayerStep = usePresentation((s) => s.setLayerStep)
  const setDockCoverage = usePresentation((s) => s.setDockCoverage)
  const setSheetCoverage = usePresentation((s) => s.setSheetCoverage)

  const variant = findCoverVariant(config, coverId)

  /**
   * One sub-tab per soft group in the piece — the couch, its cushions, the
   * shawl. Read straight off `config.parts`, so they are whatever the product
   * actually has rather than a fixed list.
   *
   * `wood` is excluded and gets the *Structure* tab instead: a frame finish is
   * not a fabric, and offering oak in the same row as bouclé is the fastest way
   * to make a customer think the sofa body can be made of wood. A part whose
   * palette is empty is dropped entirely — a tab that offers nothing reads as
   * broken, not as deliberate.
   */
  const parts = useMemo(() => {
    const palette = (zone: PresentationZone) =>
      zone === 'cover' ? coverPalette(config, variant) : config.palettes[zone] ?? []
    const source = config.parts?.length
      ? config.parts.map((part) => ({ zone: part.zone, label: part.label }))
      : [{ zone: 'cover' as PresentationZone, label: config.layers.cover.label ?? t('coverMaterial') }]

    const seen = new Set<PresentationZone>()
    return source
      .filter((part) => part.zone !== 'wood')
      .filter((part) => (seen.has(part.zone) ? false : (seen.add(part.zone), true)))
      .map((part) => ({ ...part, swatches: palette(part.zone) }))
      .filter((part) => part.swatches.length > 0)
  }, [config, variant, t])

  const woodSwatches = config.palettes.wood ?? []
  const variants = config.layers.cover.variants

  const [tab, setTab] = useState<DockTab>('finish')
  const [activePart, setActivePart] = useState<PresentationZone>(() => parts[0]?.zone ?? 'cover')
  const [open, setOpen] = useState(true)
  const [pendingSwatch, setPendingSwatch] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const [wide, setWide] = useState(false)

  // A product whose parts changed under us must not leave a sub-tab selected
  // that no longer exists — the panel would render empty with no way back.
  useEffect(() => {
    if (parts.length && !parts.some((part) => part.zone === activePart)) setActivePart(parts[0].zone)
  }, [parts, activePart])

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

  /**
   * Put a swatch on a zone.
   *
   * The await is the whole reason this is not a one-liner: the cloth is fetched
   * *before* the store moves, so the map and the ~400ms colour damp start
   * together instead of the fabric popping in a beat after the tint.
   */
  const pick = useCallback(
    async (zone: PresentationZone, swatch: ZoneSwatch) => {
      setActiveZone(zone)
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
    [setActiveZone, setPaint]
  )

  /** Switching the cover variant swaps the whole GLB, so the variant's surface
   *  has to land in the paint state too — @see selectCover. */
  const pickVariant = useCallback(
    (id: string) => selectCover(id, coverSurface(config, findCoverVariant(config, id))),
    [config, selectCover]
  )

  const catalogId = useMemo(
    () => findCatalogItemBySceneObject(catalog as Catalog, productKey)?.id ?? null,
    [productKey]
  )
  const addToCart = useShop((s) => s.addToCart)
  const handleAdd = useCallback(() => {
    if (!catalogId) return
    addToCart(catalogId)
    setAdded(true)
  }, [addToCart, catalogId])
  useEffect(() => {
    if (!added) return
    const timer = window.setTimeout(() => setAdded(false), 1800)
    return () => window.clearTimeout(timer)
  }, [added])

  const showingFrame = layerStep === 0
  const part = parts.find((p) => p.zone === activePart) ?? parts[0]
  const partPaint = part ? paint[part.zone] : undefined
  const activeSwatch = part?.swatches.find((swatch) => swatch.id === partPaint?.swatchId)
  const cloths = part?.swatches.filter(isTextureSwatch) ?? []
  const tints = part?.swatches.filter((swatch) => !isTextureSwatch(swatch)) ?? []
  const price = totalPrice(product, variant)

  if (!part) return null

  return (
    <>
      {/* The way back in. Only rendered while collapsed, so there is never a
          stray control floating over the piece. */}
      {!open && !hidden && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-12
                     items-center gap-2 rounded-full border border-white/10 bg-[#0b0f16]/90 px-5
                     text-[13.5px] font-medium text-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)]
                     backdrop-blur-xl transition-transform duration-300 hover:scale-[1.03]
                     active:scale-95 md:bottom-1/2 md:translate-y-1/2 md:rounded-l-2xl
                     md:rounded-r-none md:border-r-0 md:pl-4 md:pr-5"
        >
          <Sparkles className="h-4 w-4 text-blue-400" />
          {t('customize')}
        </button>
      )}

      {/* A frame the panel is laid out *in*, rather than four sets of inset
          utilities on the panel itself. It is what lets the dock be as tall as
          its content and still sit centred on a desktop — the alternative,
          centring with a transform, fights the transform that slides it away. */}
      <div
        aria-hidden={hidden}
        /* Top-anchored on a desktop rather than centred, because the panel is
           as tall as its content and the content changes with the tab: anchored,
           only its bottom edge moves; centred, the whole card walks up the
           screen every time you switch. */
        className="pointer-events-none fixed inset-0 z-30 flex items-end justify-stretch
                   md:items-start md:justify-start md:p-3"
      >
        <aside
          ref={panelRef}
          dir={locale === 'fa' ? 'rtl' : 'ltr'}
          aria-label={t('customizeAria')}
          /* `translate` rather than unmounting: the measured box survives, so
             reopening does not re-solve the camera from scratch.

             The sheet caps well under MAX_PANEL_COVERAGE (0.5) in SimpleViewer,
             which is the ceiling the camera will actually reframe around — a
             taller sheet silently leaves the piece standing behind it, and even
             at the ceiling a wide sectional on a portrait phone is framed into a
             strip. The panel scrolls instead, and the handle, the tabs and the
             footer stay put around it. */
          className={`pointer-events-auto relative flex max-h-[50vh] w-full flex-col overflow-hidden
                      rounded-t-[26px] border-t border-white/[0.07] bg-[#0a0e15]/85 text-white
                      shadow-[0_-20px_60px_-25px_rgb(0_0_0/0.95)] backdrop-blur-2xl
                      transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]
                      md:max-h-full md:w-[var(--dock-w)] md:rounded-[26px] md:border
                      md:shadow-[0_30px_80px_-30px_rgb(0_0_0/0.95)]
                      ${hidden ? 'translate-y-full md:translate-x-[calc(100%+1.5rem)] md:translate-y-0' : ''}
                      ${!hidden && !open ? 'translate-y-[calc(100%+1rem)] md:translate-x-[calc(100%+1.5rem)] md:translate-y-0' : ''}`}
        >
        {/* A single hairline of light along the top edge — the one piece of
            ornament here, and what keeps a dark panel on a dark page from
            reading as a hole rather than a surface. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-l
                       from-transparent via-white/25 to-transparent"
          />

          {/* A grab bar on the sheet, because that is the shape a phone reader
              already knows how to dismiss. The dock gets a chevron instead: a
              handle on a side panel promises a drag that does not exist. */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('closePanel')}
            className="group flex w-full shrink-0 justify-center pb-1 pt-3 md:hidden"
          >
            <span className="h-1 w-10 rounded-full bg-white/25 transition-colors group-hover:bg-white/45" />
          </button>

          <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-2 md:pt-4">
            <div className="min-w-0">
              <p className="text-[10.5px] uppercase tracking-[0.22em] text-blue-400/80">{t('customize')}</p>
              <h2 className="mt-1 truncate text-[15px] font-semibold tracking-tight">{product.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('closePanel')}
              className="-mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full
                         text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </header>

          {/* The three questions, as three places. @see the note on this file. */}
          <div role="tablist" aria-label={t('sectionsAria')} className="flex gap-1 px-4">
            {TABS.map(({ id, label, Icon }) => {
              const selected = tab === id
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(id)}
                  className={`relative flex flex-1 flex-col items-center gap-1 rounded-t-xl px-1 pb-2.5 pt-1
                              text-[11.5px] transition-colors duration-200 ${
                                selected ? 'text-white' : 'text-white/40 hover:text-white/70'
                              }`}
                >
                  <Icon className={`h-[17px] w-[17px] ${selected ? 'text-blue-400' : ''}`} strokeWidth={1.8} />
                  {label}
                  {selected && (
                    <motion.span
                      aria-hidden
                      layoutId="dock-tab-underline"
                      transition={SPRING}
                      className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-blue-500"
                    />
                  )}
                </button>
              )
            })}
          </div>
          <div aria-hidden className="h-px bg-white/[0.07]" />

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {tab === 'finish' && (
              <div className="space-y-4 md:space-y-5">
                {/* The cloth family. Each one is a different GLB, so this is the
                    coarsest choice on the page and belongs above the swatches it
                    changes. Hidden when there is only one — a segmented control
                    with a single segment is a label pretending to be a control. */}
                {variants.length > 1 && (
                  <section className="space-y-2">
                    <Legend>{t('coverMaterial')}</Legend>
                    <div role="radiogroup" aria-label={t('coverMaterial')} className="flex gap-1 rounded-2xl bg-white/[0.05] p-1">
                      {variants.map((entry) => {
                        const selected = entry.id === coverId
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => pickVariant(entry.id)}
                            className={`relative flex-1 rounded-[13px] px-2 py-1.5 text-[12.5px] font-medium md:py-2
                                        transition-colors duration-200 ${
                                          selected ? 'text-white' : 'text-white/50 hover:text-white/80'
                                        }`}
                          >
                            {selected && (
                              <motion.span
                                aria-hidden
                                layoutId="dock-variant-pill"
                                transition={SPRING}
                                className="absolute inset-0 rounded-[13px] bg-blue-500
                                           shadow-[0_4px_14px_-4px_rgb(59_130_246/0.8)]"
                              />
                            )}
                            <span className="relative">{entry.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* Which part of the piece is being dressed. */}
                {parts.length > 1 && (
                  <section className="space-y-2">
                    <Legend>{t('part')}</Legend>
                    <div role="tablist" aria-label={t('partsAria')} className="flex gap-1.5">
                      {parts.map((entry) => {
                        const selected = entry.zone === activePart
                        return (
                          <button
                            key={entry.zone}
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setActivePart(entry.zone)}
                            className={`flex-1 rounded-xl px-2 py-1.5 text-[12px] font-medium md:py-2
                                        transition-colors duration-200 ${
                                          selected
                                            ? 'bg-white/[0.13] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)]'
                                            : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/80'
                                        }`}
                          >
                            {entry.label}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* The chosen cloth, big enough to actually decide on. The grid
                    below is for finding one; this is for judging it. */}
                {/* Desktop only: on a phone this card is 85px between the
                    customer and the fabrics, and the only thing it says that the
                    grid does not is the name — which the legend below carries. */}
                {activeSwatch && (
                  <div className="hidden items-stretch gap-3 rounded-2xl bg-white/[0.05] p-2.5
                                  shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] md:flex">
                    <span
                      aria-hidden
                      className="h-[62px] w-[78px] shrink-0 rounded-[13px] bg-cover bg-center
                                 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]"
                      style={{
                        backgroundColor: activeSwatch.hex,
                        ...(activeSwatch.thumbnail ? { backgroundImage: `url(${activeSwatch.thumbnail})` } : {}),
                      }}
                    />
                    <div className="flex min-w-0 flex-col justify-center gap-1">
                      <p className="truncate text-[14.5px] font-semibold">{activeSwatch.name}</p>
                      <p className="truncate text-[11.5px] text-white/40">
                        {part.label} · <span className="font-mono tracking-wide">{activeSwatch.id.toUpperCase()}</span>
                      </p>
                    </div>
                  </div>
                )}

                {cloths.length > 0 && (
                  <section className="space-y-2.5">
                    <Legend value={activeSwatch?.name}>{t('fabricOf', { part: part.label })}</Legend>
                    <SwatchGrid
                      label={t('fabricOf', { part: part.label })}
                      swatches={cloths}
                      activeId={partPaint?.swatchId}
                      pendingId={pendingSwatch}
                      onPick={(swatch) => pick(part.zone, swatch)}
                      images={images}
                    />
                  </section>
                )}

                {tints.length > 0 && (
                  <section className="space-y-2.5">
                    <Legend>{t('colorOf', { part: part.label })}</Legend>
                    <ColorDots
                      label={t('colorOf', { part: part.label })}
                      swatches={tints}
                      activeId={partPaint?.swatchId}
                      onPick={(swatch) => pick(part.zone, swatch)}
                      images={images}
                    />
                  </section>
                )}
              </div>
            )}

            {tab === 'structure' && (
              <div className="space-y-5">
                {woodSwatches.length > 0 && (
                  <section className="space-y-2.5">
                    <Legend>{t('woodFinish')}</Legend>
                    <MaterialTiles
                      label={t('woodFinish')}
                      swatches={woodSwatches}
                      activeId={paint.wood?.swatchId}
                      onPick={(swatch) => pick('wood', swatch)}
                    />
                  </section>
                )}

                {/* The X-ray. Its own row rather than a footer button, because it
                    is a way of *looking* at the piece, not a way of changing it. */}
                <button
                  type="button"
                  onClick={() => setLayerStep(showingFrame ? 1 : 0)}
                  aria-pressed={showingFrame}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-right
                              transition-colors duration-200 ${
                                showingFrame
                                  ? 'bg-blue-500/15 shadow-[inset_0_0_0_1px_rgb(59_130_246/0.5)]'
                                  : 'bg-white/[0.05] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] hover:bg-white/[0.09]'
                              }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      showingFrame ? 'bg-blue-500 text-white' : 'bg-white/[0.08] text-white/70'
                    }`}
                  >
                    <Layers className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{t('showFrame')}</span>
                    <span className="block truncate text-[11.5px] text-white/40">
                      {showingFrame ? t('showingFrame') : t('frameDesc')}
                    </span>
                  </span>
                </button>

                {!woodSwatches.length && (
                  <p className="text-[12.5px] leading-7 text-white/40">
                    {t('noWoodFinish')}
                  </p>
                )}
              </div>
            )}

            {tab === 'specs' && <DockSpecs product={product} />}
          </div>

          {/* Price and the one thing to do with it, always in view — which is the
              other half of why this panel is tabbed rather than scrolled. */}
          <footer className="border-t border-white/[0.07] bg-white/[0.02] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] text-white/35">
                  {arBuilding ? t('preparingAR') : variant ? variant.name : t('price')}
                </p>
                <p className="persian-number truncate text-[17px] font-bold leading-tight text-white">
                  {price ? formatPrice(price, locale) : tc('priceOnRequest')}
                </p>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!catalogId}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-2xl px-5 text-[13px] font-semibold
                            transition-[background-color,transform] duration-200 active:scale-[0.98]
                            disabled:cursor-not-allowed disabled:opacity-40 ${
                              added
                                ? 'bg-emerald-500 text-white'
                                : 'bg-blue-500 text-white shadow-[0_10px_28px_-10px_rgb(59_130_246/0.9)] hover:bg-blue-400'
                            }`}
              >
                {added ? <Check className="h-[18px] w-[18px]" strokeWidth={3} /> : <ShoppingBag className="h-[18px] w-[18px]" />}
                {added ? tc('added') : tc('addToCart')}
              </button>
            </div>
          </footer>
        </aside>
      </div>
    </>
  )
}

/**
 * One typographic rule for every section heading in the dock, so the eye can
 * find the next group without reading it.
 *
 * `value` names the current choice on the same line. It is what lets the big
 * preview card be desktop-only: on a phone that card is 85px between the
 * customer and the fabrics, and the only thing it says that the grid does not
 * is the name.
 */
function Legend({ children, value }: { children: React.ReactNode; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-white/35">{children}</p>
      {value && <p className="truncate text-[11.5px] text-white/60 md:hidden">{value}</p>}
    </div>
  )
}
