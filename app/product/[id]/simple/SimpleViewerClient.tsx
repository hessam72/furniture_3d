'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { QualityProvider, useQuality } from '@/contexts/QualityContext'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { usePresentation } from '@/stores/presentationStore'
import { QUALITY_PRESETS, type QualityPreset } from '@/lib/config/quality'
import {
  defaultPaint,
  PHONE_QUERY,
  readDeviceClass,
  simpleViewer,
  simpleViewerQuality,
  TOUCH_QUERY,
  type DeviceClass,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'

const SimpleViewer = dynamic(() => import('@/components/product/SimpleViewer'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
})

const QUALITY_LABELS: Record<QualityPreset, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
  ultra: 'حداکثر',
}

const TIERS = Object.keys(QUALITY_PRESETS) as QualityPreset[]

/**
 * A stripped viewer for the same piece the presentation page dresses.
 *
 * One GLB on white under an HDR, turned and dollied by hand, with the cover
 * palette and the render tier as the only controls. It exists so the piece can
 * be judged on its own — no room, no sun, no reflection and no post — and so
 * there is a page that runs the same everywhere.
 *
 * The colour lives in the shared presentation store, so a finish picked here is
 * the finish the full page opens on.
 */
export default function SimpleViewerClient({ presentation }: { presentation: ResolvedPresentation }) {
  const { key, product, config } = presentation

  /** Which tier the viewer opens on. Only a seed — the picker below owns it
   *  from the first tap. @see SIMPLE_VIEWER_QUALITY */
  const [device, setDevice] = useState<DeviceClass>('desktop')
  useEffect(() => {
    const queries = [window.matchMedia(PHONE_QUERY), window.matchMedia(TOUCH_QUERY)]
    const apply = () => setDevice(readDeviceClass())
    apply()
    queries.forEach((mq) => mq.addEventListener('change', apply))
    return () => queries.forEach((mq) => mq.removeEventListener('change', apply))
  }, [])

  return (
    <QualityProvider preset={simpleViewerQuality(config, device)}>
      <Viewer presentation={presentation} productKey={key} productName={product.name} config={config} />
    </QualityProvider>
  )
}

function Viewer({
  presentation,
  productKey,
  productName,
  config,
}: {
  presentation: ResolvedPresentation
  productKey: string
  productName: string
  config: ResolvedPresentation['config']
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * How much of the screen the control panel stands on, so the camera can frame
   * the piece into the band above it rather than into the whole canvas.
   *
   * Measured rather than assumed: the panel's height moves with the number of
   * swatches, the font the browser actually loaded, and the safe-area inset on
   * a notched phone. Quantised, because this drives a re-frame.
   *
   * Taken against the page's own root rather than `window.innerHeight` — the
   * root is what the canvas fills, and on iOS those two are different numbers.
   * @see .viewport-fill
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coverage, setCoverage] = useState(0)
  useEffect(() => {
    const panel = panelRef.current
    const root = rootRef.current
    if (!panel || !root) return
    const measure = () => {
      const height = root.clientHeight
      if (!height) return
      // Plus the wrapper's padding, which the panel's own box does not carry.
      const fraction = (panel.getBoundingClientRect().height + 32) / height
      setCoverage((previous) => {
        const next = Math.round(Math.min(fraction, 0.6) * 40) / 40
        return next === previous ? previous : next
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    observer.observe(root)
    return () => observer.disconnect()
  }, [ready])

  const initProduct = usePresentation((s) => s.initProduct)
  const reset = usePresentation((s) => s.reset)
  const setPaint = usePresentation((s) => s.setPaint)
  const activeHex = usePresentation((s) => s.paint.cover.color)

  // The two files this page needs. `public/models` is gitignored, so without
  // the probe a mis-typed manifest path white-screens behind a Suspense
  // fallback that never resolves.
  const view = useMemo(() => simpleViewer(config), [config])
  const assets = useMemo(
    () => [view.model, view.hdr].filter((p): p is string => !!p),
    [view]
  )
  const { state, missing } = useAssetProbe(assets)

  useEffect(() => {
    initProduct(productKey, defaultPaint(config), config.layers.cover.default)
    return () => reset()
  }, [productKey, config, initProduct, reset])

  // Same full-screen, non-scrolling shape as the full page, so it needs the same
  // guard: an iOS swipe that misses the canvas is a pull-to-refresh otherwise.
  // @see .viewport-locked
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('viewport-locked')
    return () => root.classList.remove('viewport-locked')
  }, [])

  const handleReady = useCallback(() => setReady(true), [])
  const handleError = useCallback(
    (_category: string, err: Error) => setError(err.message),
    []
  )

  // Cover swatches carry no roughness of their own — that comes from the
  // variant's material and must survive a colour change. @see coverSurface
  const pick = useCallback((swatch: ZoneSwatch) => setPaint({ color: swatch.hex }, 'cover'), [setPaint])

  const swatches = config.palettes.cover ?? []

  return (
    // `viewport-fill`, not `h-screen`: on iOS `100vh` is the height with the
    // address bar retracted, so a container that tall puts everything anchored
    // to its bottom — the whole control panel — behind the bar.
    <div
      ref={rootRef}
      dir="rtl"
      className="font-persian viewport-fill relative w-screen overflow-hidden"
      style={{ background: view.background }}
    >
      {state === 'ready' && !error && (
        <SimpleViewer
          config={config}
          coverage={coverage}
          onReady={handleReady}
          onError={handleError}
        />
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link
          href={`/product/${productKey}`}
          aria-label="نمای کامل محصول"
          className="pointer-events-auto flex h-9 items-center gap-1 rounded-full border border-neutral-200
                     bg-white/85 px-3 text-[13px] text-neutral-700 backdrop-blur-sm transition-colors
                     hover:border-neutral-300 hover:text-neutral-900"
        >
          <ChevronRight className="h-4 w-4" />
          نمای کامل
        </Link>

        <h1 className="max-w-[55%] truncate pt-1 text-right text-[15px] font-semibold text-neutral-900">
          {productName}
        </h1>
      </header>

      {/* Controls: the finish, and how hard the device works to draw it. */}
      {state === 'ready' && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div
            ref={panelRef}
            className="pointer-events-auto w-full max-w-[420px] space-y-3 rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-[0_8px_32px_-12px_rgb(0_0_0/0.25)] backdrop-blur-sm"
          >
            <Swatches swatches={swatches} activeHex={activeHex} onPick={pick} />
            <QualityRow />
          </div>
        </div>
      )}

      {(state === 'missing' || error) && (
        <Notice
          productName={productName}
          detail={error ?? `فایل‌های یافت‌نشده: ${missing.join('، ')}`}
          productKey={productKey}
        />
      )}

      {/* Held over the canvas rather than shown in its place: the canvas has to
          be mounted and rendering to load its own model at all. */}
      {!error && state !== 'missing' && (
        <div
          aria-hidden={ready}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-500"
          style={{
            background: view.background,
            opacity: ready ? 0 : 1,
            visibility: ready ? 'hidden' : 'visible',
          }}
        >
          <span className="text-[11px] tracking-[0.4em] text-neutral-400">در حال بارگذاری</span>
        </div>
      )}
    </div>
  )
}

function Swatches({
  swatches,
  activeHex,
  onPick,
}: {
  swatches: ZoneSwatch[]
  activeHex: string
  onPick: (swatch: ZoneSwatch) => void
}) {
  if (!swatches.length) return null
  const activeName = swatches.find((s) => s.hex.toLowerCase() === activeHex.toLowerCase())?.name

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-neutral-500">رنگ</span>
        {activeName && <span className="text-[12px] text-neutral-800">{activeName}</span>}
      </div>
      <div role="radiogroup" aria-label="رنگ" className="scrollbar-hide flex items-center gap-3 overflow-x-auto py-1">
        {swatches.map((swatch) => {
          const active = swatch.hex.toLowerCase() === activeHex.toLowerCase()
          return (
            <button
              key={swatch.id}
              role="radio"
              aria-checked={active}
              aria-label={swatch.name}
              title={swatch.name}
              onClick={() => onPick(swatch)}
              className={`h-8 w-8 shrink-0 rounded-full ring-1 ring-inset ring-black/10 transition
                          hover:scale-110 active:scale-95 ${
                            active ? 'outline outline-2 outline-offset-2 outline-neutral-900' : ''
                          }`}
              style={{ backgroundColor: swatch.hex }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** The render tier, exposed as a control rather than pinned. Nothing here
 *  allocates a shadow map, a reflection target or a composer buffer, so the
 *  tier only moves DPR and anisotropy and every rung is safe to offer. */
function QualityRow() {
  const { preset, setPreset } = useQuality()

  return (
    <div className="space-y-1.5 border-t border-neutral-200 pt-2.5">
      <span className="text-[12px] text-neutral-500">کیفیت نمایش</span>
      <div role="radiogroup" aria-label="کیفیت نمایش" className="grid grid-cols-4 gap-1.5">
        {TIERS.map((tier) => (
          <button
            key={tier}
            role="radio"
            aria-checked={preset === tier}
            onClick={() => setPreset(tier)}
            className={`rounded-lg border px-2 py-1.5 text-[12px] transition-colors ${
              preset === tier
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'
            }`}
          >
            {QUALITY_LABELS[tier]}
          </button>
        ))}
      </div>
    </div>
  )
}

function Notice({
  productName,
  detail,
  productKey,
}: {
  productName: string
  detail: string
  productKey: string
}) {
  // Transparent: the page root behind it already carries the ground colour.
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <h2 className="text-[15px] font-semibold text-neutral-900">{productName}</h2>
        <p className="text-[13px] leading-7 text-neutral-500">نمایش سه‌بعدی این محصول در دسترس نیست.</p>
        <p className="break-all text-[11px] leading-6 text-neutral-400">{detail}</p>
        <Link
          href={`/product/${productKey}`}
          className="inline-block rounded-lg border border-neutral-300 px-4 py-2 text-[13px] text-neutral-700 transition-colors hover:border-neutral-500"
        >
          نمای کامل محصول
        </Link>
      </div>
    </div>
  )
}
