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
import { arModelUrl } from '@/lib/ar/arSource'
import { AR_GLB_MAX_BYTES, AR_GLB_WARN_BYTES, AR_TRIANGLE_WARN, countTriangles } from '@/lib/ar/budget'
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
import { RendererStatsOverlay } from '@/components/three/RendererStats'
import { preloadGltf } from '@/lib/three/gltfLoaders'
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

    // Behind the transcoder, not racing it. @see preloadGltf
    let stopWarm = () => {}
    const warm = () => {
      stopWarm = preloadGltf(rest, useGLTF.preload)
    }
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1500)
    return () => {
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback
      if (idle && cancel) cancel(handle as number)
      else window.clearTimeout(handle as number)
      stopWarm()
    }
  }, [state, device, config, modelPath])

  // ── AR ────────────────────────────────────────────────────────────────
  const [showAR, setShowAR] = useState(false)
  const [arSupported, setArSupported] = useState(false)
  const [arBuilding, setArBuilding] = useState(false)
  /** Set when AR fell back to the product's published file, so the sheet can say
   *  the picked colour is not the one about to appear in the room. */
  const [arStale, setArStale] = useState(false)
  const [arUrl, setArUrl] = useState<string | null>(null)

  /** The raw cached GLB behind the canvas, published by the viewer. Nothing is
   *  serialised from it any more — it is read only to weigh the piece before
   *  handing it to Quick Look. @see AR_TRIANGLE_WARN */
  const source = useRef<THREE.Object3D | null>(null)

  useEffect(() => {
    setArSupported(isARCapable())
  }, [])

  /**
   * Open AR on the configured piece.
   *
   * There is no export here any more, and that is the fix. `/api/ar/...` is a
   * pure function of the product, the layer and the paint, so opening AR is a
   * URL to build rather than a 40MB GLB to serialise, hold in memory, and hand
   * to a second copy of three.js. The `HEAD` is what makes the fallback honest:
   * it proves the file exists on this deploy — `public/models` is gitignored —
   * and reports what it weighs before a phone has to carry it.
   */
  const openAR = useCallback(async () => {
    const layer = showingFrame ? 'frame' : coverId ?? 'default'
    const { paint } = usePresentation.getState()
    const url = arModelUrl(productKey, layer, zone, paint)
    const debug = new URLSearchParams(window.location.search).has('debug')

    setArBuilding(true)
    setArStale(false)
    try {
      const head = await fetch(url, { method: 'HEAD' })
      const size = Number(head.headers.get('content-length') ?? 0)
      const triangles = source.current ? countTriangles(source.current) : 0

      if (debug) {
        console.log(
          `[AR] ${arModelPath(config, layer)} → ${(size / 1048576).toFixed(1)} MB, ` +
            `${triangles ? triangles.toLocaleString() : '?'} triangles`
        )
      }
      if (!head.ok) throw new Error(`configured model unavailable (${head.status})`)
      if (size > AR_GLB_MAX_BYTES) throw new Error(`configured model is ${size} bytes`)
      if (size > AR_GLB_WARN_BYTES) console.warn('[AR] configured GLB is large for a phone', size)
      if (triangles > AR_TRIANGLE_WARN) {
        // Textures are capped for the USDZ, geometry cannot be: three writes it
        // as decimal text into a zip it does not compress. Past this the product
        // needs an authored `arPath`. @see arModelPath
        console.warn('[AR] piece is dense for Quick Look — author an arPath for it')
      }

      // Hand back what the sheet warmed but is not showing. The canvas is about
      // to unmount and model-viewer is about to build a second scene; on a phone
      // those two do not both fit alongside three parsed GLBs.
      if (device === 'phone') {
        config.layers.cover.variants
          .filter((v) => v.path !== modelPath)
          .forEach((v) => useGLTF.clear(v.path))
      }

      setArUrl(url)
      setShowAR(true)
    } catch (err) {
      // The published GLB stands in, and the sheet says the colour will not be
      // the picked one. With no published GLB either there is nothing to show,
      // so stay on the page rather than opening an empty viewer.
      console.error('[simple] AR source unavailable', err)
      setArStale(true)
      setArUrl(null)
      setShowAR(!!product.glbPath)
    } finally {
      setArBuilding(false)
    }
  }, [config, coverId, device, modelPath, product.glbPath, productKey, showingFrame, zone])

  /**
   * Leaving AR remounts the canvas: it was unmounted to give the overlay the
   * GPU, and a Canvas whose context went with it has to be rebuilt, not
   * re-rendered. The store is untouched, so the piece returns dressed exactly
   * as it left.
   */
  const closeAR = useCallback(() => {
    setShowAR(false)
    setArStale(false)
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
          label="simple"
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
          // Always: the configured model is a URL, not something that has to be
          // built first and can fail to be. `arLive` goes false only once a real
          // attempt has fallen back to the published file.
          arAvailable
          arCapable={arSupported}
          arLive={!arStale}
          arBuilding={arBuilding}
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

      {showAR && (
        <ARProductViewer
          glbPath={arUrl ?? product.glbPath ?? ''}
          // Omitted for the configured model: with no `ios-src`, model-viewer
          // generates the USDZ from the file it loaded, so Quick Look shows the
          // live configuration. It is safe to let it now that its texture cap is
          // set — left at model-viewer's `auto` default it bakes full-resolution
          // PNGs into an uncompressed zip. @see AR_USDZ_MAX_TEXTURE_SIZE
          usdzPath={arUrl ? undefined : product.usdzPath}
          productName={product.name}
          // Explicit rather than inherited: WebXR first so a capable Android
          // stays in the page, then Scene Viewer, which can now fetch the model
          // because it is a real URL and not a blob.
          arModes="webxr scene-viewer quick-look"
          arScale="fixed"
          onClose={closeAR}
        />
      )}

      <RendererStatsOverlay tier={simpleViewerQuality(config, device)} />
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
