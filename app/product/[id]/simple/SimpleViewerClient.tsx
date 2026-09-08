'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { QualityProvider } from '@/contexts/QualityContext'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { usePresentation } from '@/stores/presentationStore'
import { useShop } from '@/stores/storeShopStore'
import { findCatalogItemBySceneObject, type Catalog } from '@/lib/store/catalog'
import catalog from '@/public/config/catalog.json'
import { isARCapable } from '@/lib/device-utils'
import {
  arModelPath,
  defaultPaint,
  findCoverVariant,
  finishedPiecePath,
  PHONE_QUERY,
  readDeviceClass,
  simpleViewer,
  simpleViewerQuality,
  TOUCH_QUERY,
  type DeviceClass,
  type PresentationZone,
  type ResolvedPresentation,
} from '@/lib/product/presentation'
import ProductSheet from '@/components/product/ProductSheet'
import QualityChips from '@/components/product/QualityChips'

const SimpleViewer = dynamic(() => import('@/components/product/SimpleViewer'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
})

const ARProductViewer = dynamic(() => import('@/components/store/ARProductViewer'), { ssr: false })

/** Said once in the sheet, because a swatch that paints nothing on the layer
 *  currently mounted reads as a broken control rather than a deliberate one. */
const ZONE_NOTE =
  'این نما هر بار یک لایه را نشان می‌دهد: رنگ چوب روی «اسکلت چوبی» و رنگ رویه روی نمای نهایی دیده می‌شود.'

/**
 * A stripped viewer for the same piece the presentation page dresses.
 *
 * One GLB on white under an HDR, turned and dollied by hand — no room, no sun,
 * no reflection and no post — so the piece can be judged on its own and the
 * page runs the same everywhere.
 *
 * What it is *not* is a lesser product page: it carries the presentation
 * page's own bottom sheet, so every fact, swatch, layer and the AR button are
 * where a customer already knows to find them. The sheet writes to the shared
 * presentation store, which is what makes that possible — this page only has
 * to answer the store's state with the right file on screen.
 */
export default function SimpleViewerClient({ presentation }: { presentation: ResolvedPresentation }) {
  const { config } = presentation

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
      <Viewer presentation={presentation} device={device} />
    </QualityProvider>
  )
}

function Viewer({
  presentation,
  device,
}: {
  presentation: ResolvedPresentation
  device: DeviceClass
}) {
  const { key: productKey, product, config } = presentation
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canvasKey, setCanvasKey] = useState(0)

  const initProduct = usePresentation((s) => s.initProduct)
  const reset = usePresentation((s) => s.reset)
  const layerStep = usePresentation((s) => s.layerStep)
  const coverId = usePresentation((s) => s.coverId)
  const coverPhase = usePresentation((s) => s.coverPhase)
  const commitCover = usePresentation((s) => s.commitCover)
  const finishWipe = usePresentation((s) => s.finishWipe)
  /**
   * How much of the screen the sheet stands on, so the camera frames the piece
   * into the band above it. Reported by the sheet itself — the same number the
   * full presentation page's rig reads.
   */
  const coverage = usePresentation((s) => s.sheetCoverage)

  const addToCart = useShop((s) => s.addToCart)
  const catalogId = useMemo(
    () => findCatalogItemBySceneObject(catalog as Catalog, productKey)?.id ?? null,
    [productKey]
  )

  /**
   * The cover swap is a clip-plane wipe on the full page, played by the scene.
   * Nothing plays it here — one file is unmounted and the next is mounted — so
   * the phases are stepped through as they arrive, or `coverId` would never
   * leave the variant the page opened on.
   */
  useEffect(() => {
    if (coverPhase === 'wipeOut') commitCover()
    else if (coverPhase === 'wipeIn') finishWipe()
  }, [coverPhase, commitCover, finishWipe])

  const showingFrame = layerStep === 0
  const variant = findCoverVariant(config, coverId)
  /** One file at a time: the bare frame, or the chosen cover. */
  const modelPath = showingFrame
    ? config.layers.frame.path
    : variant?.path ?? finishedPiecePath(config)
  const zone: PresentationZone = showingFrame ? 'wood' : 'cover'

  const view = useMemo(() => simpleViewer(config), [config])
  /** The manifest with the shown layer swapped in — `simpleViewer()` reads
   *  `simple.model`, so this override is the whole layer switch. */
  const viewConfig = useMemo(
    () => ({ ...config, simple: { ...config.simple, model: modelPath } }),
    [config, modelPath]
  )

  /**
   * Every file the sheet can switch to, probed once.
   *
   * `public/models` is gitignored, so without the probe a mis-typed manifest
   * path white-screens behind a Suspense fallback that never resolves. Probing
   * the whole set rather than the file currently on screen is what keeps the
   * sheet on screen: a per-layer probe re-enters `checking` on every switch,
   * and the sheet would blink out of existence mid-tap.
   */
  const probeAssets = useMemo(() => {
    const paths = [config.layers.frame.path, ...config.layers.cover.variants.map((v) => v.path)]
    if (view.hdr) paths.push(view.hdr)
    return Array.from(new Set(paths))
  }, [config, view.hdr])
  const { state, missing } = useAssetProbe(probeAssets)

  /** Only what *this* view needs has to be present — a missing variant is the
   *  sheet's problem to report, not a reason to blank the page. */
  const blocked = useMemo(
    () => missing.filter((path) => path === modelPath || path === view.hdr),
    [missing, modelPath, view.hdr]
  )

  useEffect(() => {
    initProduct(productKey, defaultPaint(config), config.layers.cover.default, config.layers.startStep ?? 1)
    return () => reset()
  }, [productKey, config, initProduct, reset])

  // Same full-screen, non-scrolling shape as the full page, so it needs the
  // same guard: an iOS swipe that misses the canvas is a pull-to-refresh
  // otherwise. @see .viewport-locked
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('viewport-locked')
    return () => root.classList.remove('viewport-locked')
  }, [])

  // Warm the layers the sheet can switch to, so a swap does not suspend behind
  // a blank stage. Not on a phone: every warmed file is a second GLB parsed and
  // held on a device already at its ceiling with the one it is showing.
  useEffect(() => {
    if (state !== 'ready' || device === 'phone') return
    const rest = [
      config.layers.frame.path,
      ...config.layers.cover.variants.map((v) => v.path),
    ].filter((path) => path !== modelPath)

    const warm = () => rest.forEach((path) => useGLTF.preload(path))
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1500)
    return () => {
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback
      if (idle && cancel) cancel(handle as number)
      else window.clearTimeout(handle as number)
    }
  }, [state, device, config, modelPath])

  // ── AR ────────────────────────────────────────────────────────────────
  const [showAR, setShowAR] = useState(false)
  const [arSupported, setArSupported] = useState(false)

  /**
   * The file AR shows: the selected cover's own GLB, served as-is.
   *
   * Nothing is built at tap time any more. The old path serialised the live
   * scene to a GLB in the browser — colours baked in — and that is what fell
   * over on real devices: the whole scene walked and cloned, the result held as
   * an ArrayBuffer *and* a Blob, while model-viewer spins up a second WebGL
   * context on a phone that was already rendering. A static URL is instant,
   * needs no memory of ours, and every AR path accepts it, Scene Viewer
   * included — it refuses blob URLs outright.
   */
  const arPath = useMemo(
    () => arModelPath(config, coverId) ?? product.glbPath ?? null,
    [config, coverId, product.glbPath]
  )

  /** The raw cached GLB behind the canvas, published by the viewer. Kept for
   *  the viewer's own use — AR no longer reads it. */
  const source = useRef<THREE.Object3D | null>(null)

  useEffect(() => setArSupported(isARCapable()), [])

  const openAR = useCallback(() => setShowAR(true), [])

  /**
   * Leaving AR remounts the canvas: it was unmounted to give the overlay the
   * GPU, and a Canvas whose context went with it has to be rebuilt, not
   * re-rendered. The store is untouched, so the piece returns dressed exactly
   * as it left.
   */
  const closeAR = useCallback(() => {
    setShowAR(false)
    setCanvasKey((n) => n + 1)
  }, [])

  const handleReady = useCallback(() => setReady(true), [])
  const handleError = useCallback((_category: string, err: Error) => setError(err.message), [])

  const live = state !== 'checking' && !blocked.length && !error

  return (
    // `viewport-fill`, not `h-screen`: on iOS `100vh` is the height with the
    // address bar retracted, so a container that tall puts everything anchored
    // to its bottom — the whole sheet — behind the bar.
    <div
      dir="rtl"
      className="font-persian viewport-fill relative w-screen overflow-hidden"
      style={{ background: view.background }}
    >
      {live && !showAR && (
        <SimpleViewer
          key={canvasKey}
          config={viewConfig}
          coverage={coverage}
          zone={zone}
          sourceRef={source}
          onReady={handleReady}
          onError={handleError}
        />
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex flex-col items-start gap-2">
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
          {live && !showAR && <QualityChips />}
        </div>

        <h1 className="max-w-[55%] truncate pt-1 text-right text-[15px] font-semibold text-neutral-900">
          {product.name}
        </h1>
      </header>

      {live && (
        <ProductSheet
          presentation={presentation}
          onViewAR={openAR}
          onAddToCart={() => catalogId && addToCart(catalogId)}
          arAvailable={!!arPath}
          arCapable={arSupported}
          // One file on screen at a time — there is no stack to pull apart,
          // and each palette shows on the layer it belongs to.
          explodable={false}
          zoneNote={ZONE_NOTE}
          hidden={showAR}
        />
      )}

      {(blocked.length > 0 || error) && (
        <Notice
          productName={product.name}
          detail={error ?? `فایل‌های یافت‌نشده: ${blocked.join('، ')}`}
          productKey={productKey}
        />
      )}

      {/* Held over the canvas rather than shown in its place: the canvas has to
          be mounted and rendering to load its own model at all. */}
      {!error && !blocked.length && (
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

      {showAR && arPath && (
        <ARProductViewer
          glbPath={arPath}
          // Only for the catalogue model the USDZ was authored from; for a
          // cover variant, model-viewer builds Quick Look's USDZ from the GLB.
          usdzPath={arPath === product.glbPath ? product.usdzPath : undefined}
          productName={product.name}
          arScale="fixed"
          onClose={closeAR}
        />
      )}
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
