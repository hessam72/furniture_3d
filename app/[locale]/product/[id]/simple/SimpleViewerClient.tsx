'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { ChevronRight, Loader2, Scan } from 'lucide-react'
import type * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { QualityProvider } from '@/contexts/QualityContext'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { useDeviceClass } from '@/hooks/useDeviceClass'
import { usePresentation } from '@/stores/presentationStore'
import { isARCapable } from '@/lib/device-utils'
import { arModelUrl, arUsdzUrl, swatchIdsFromPaint } from '@/lib/ar/arSource'
import { AR_GLB_MAX_BYTES, AR_GLB_WARN_BYTES, AR_TRIANGLE_WARN, countTriangles } from '@/lib/ar/budget'
import {
  arModelPath,
  defaultPaint,
  openingSwatchMaps,
  restSwatchMaps,
  findCoverVariant,
  finishedPiecePath,
  simpleViewer,
  simpleViewerQuality,
  type DeviceClass,
  type PresentationZone,
  type ResolvedPresentation,
} from '@/lib/product/presentation'
import { RendererStatsOverlay } from '@/components/three/RendererStatsOverlay'
import { useContextRecovery, type ContextRecovery } from '@/hooks/useContextRecovery'
import { useGltfCacheEviction, useSwatchCacheEviction } from '@/hooks/useGltfCacheEviction'
import { preloadGltf } from '@/lib/three/gltfLoaders'
import { webglUnavailable } from '@/lib/three/gpuClass'
import ViewerDock from '@/components/product/ViewerDock'
import QualityChips from '@/components/product/QualityChips'

const SimpleViewer = dynamic(() => import('@/components/product/SimpleViewer'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
})

const ARProductViewer = dynamic(() => import('@/components/store/ARProductViewer'), { ssr: false })

/**
 * A stripped viewer for the same piece the presentation page dresses.
 *
 * One GLB on white under an HDR, turned and dollied by hand — no room, no sun,
 * no reflection and no post — so the piece can be judged on its own and the
 * page runs the same everywhere.
 *
 * Where `/product/[id]` is a product page with a 3D view in it, this is the
 * piece itself with the fewest controls that still let you configure it: pick a
 * cloth for each part, look inside, put it in your room. @see ViewerDock, which
 * is why this page no longer mounts `ProductSheet` — the two answer to different
 * layouts and different priorities, and one component serving both would need a
 * mode flag on every tab.
 */
export default function SimpleViewerClient({ presentation }: { presentation: ResolvedPresentation }) {
  const { config } = presentation

  /** Which tier the viewer opens on. Only a seed — the picker below owns it
   *  from the first tap, up to this device's ceiling. @see SURFACE_POLICY */
  const device = useDeviceClass()

  // Held here rather than in `Viewer` so the rungs a lost context costs reach
  // the provider that resolves the tier. @see useContextRecovery
  const recovery = useContextRecovery({ surface: 'viewer' })

  return (
    <QualityProvider
      surface="viewer"
      preset={simpleViewerQuality(config, device)}
      downgrades={recovery.downgrades}
    >
      <Viewer presentation={presentation} device={device} recovery={recovery} />
    </QualityProvider>
  )
}

function Viewer({
  presentation,
  device,
  recovery,
}: {
  presentation: ResolvedPresentation
  device: DeviceClass
  recovery: ContextRecovery
}) {
  const { key: productKey, product, config } = presentation
  const locale = useLocale()
  const t = useTranslations('product')
  const tc = useTranslations('common')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasKey = recovery.canvasKey

  /**
   * No WebGL2 on this device at all — three 0.180 dropped the WebGL1 path in
   * r163, so there is no renderer to build and no tier low enough to save it.
   *
   * Read in an effect rather than the initialiser, unlike the tier: this is
   * page chrome that *does* server-render, and a value that differs between the
   * server's HTML and the client's first render is a hydration mismatch. The
   * effect runs before paint and the canvas is gated behind the asset probe
   * anyway, so nothing is allocated in the gap. @see readGpuClass
   */
  const [noWebgl, setNoWebgl] = useState(false)
  useEffect(() => setNoWebgl(webglUnavailable()), [])

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
  /** And how much of the width, once the dock is open on a screen wide enough to
   *  give it any. The camera slides the piece clear rather than shrinking it. */
  const dockCoverage = usePresentation((s) => s.dockCoverage)

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
  /** The splash plate and the page root both painted a flat `view.background`
   *  before ViewerBackdrop existed; now the canvas draws a gradient, so the
   *  handoff between the two needs to match it or the edges flash. Plain CSS,
   *  no vignette — the splash is on screen for a moment, not the point. */
  const splashGradient = `linear-gradient(to top, ${view.backdrop.bottom}, ${view.backdrop.top})`
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

  // The layer set this page can reach, released when the visitor leaves it.
  useGltfCacheEviction(probeAssets.filter((path) => path.endsWith('.glb')))
  useSwatchCacheEviction()

  // The opening fabric, warmed before the canvas rather than on idle: it is what
  // this page renders with, and nothing here animates a swap to hide a late one.
  useEffect(() => {
    if (state !== 'ready') return
    const opening = openingSwatchMaps(config)
    if (!opening.length) return
    let stop = () => {}
    void import('@/lib/three/swatchTextures').then(({ preloadSwatchMaps }) => {
      stop = preloadSwatchMaps(opening)
    })
    return () => stop()
  }, [state, config])

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
  // a blank stage. Desktop only: every warmed file is a second GLB parsed and
  // held on a device already at its ceiling with the one it is showing, and
  // that argument was never about phones — it was about the memory a touch
  // device has, which a tablet does not have appreciably more of. The tablet
  // was skipping it on a technicality: an iPad's short side is exactly 768, so
  // PHONE_QUERY misses it and it warmed a second and third full GLB.
  useEffect(() => {
    if (state !== 'ready' || device !== 'desktop') return
    const rest = [
      config.layers.frame.path,
      ...config.layers.cover.variants.map((v) => v.path),
    ].filter((path) => path !== modelPath)

    // Behind the transcoder, not racing it. @see preloadGltf
    let stopWarm = () => {}
    const warm = () => {
      stopWarm = preloadGltf(rest, useGLTF.preload)
      // The rest of the palette, on the same terms as the rest of the covers.
      void import('@/lib/three/swatchTextures').then(({ preloadSwatchMaps }) => {
        preloadSwatchMaps(restSwatchMaps(config))
      })
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
  /** The same configuration as a USDZ, for Quick Look. @see arUsdzUrl */
  const [arUsdz, setArUsdz] = useState<string | null>(null)

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
    // Every zone's swatch id travels beside the paint, so the route can put each
    // chosen fabric in the file — the couch's, the cushions', the shawl's. It
    // used to send only the active zone's, which is why colour reached the room
    // and cloth did not. Zones wearing a plain colour contribute nothing.
    const swatches = swatchIdsFromPaint(paint)
    const url = arModelUrl(productKey, layer, zone, paint, swatches)
    const usdz = arUsdzUrl(productKey, layer, zone, paint, swatches)
    const debug = new URLSearchParams(window.location.search).has('debug')

    setArBuilding(true)
    setArStale(false)
    try {
      const head = await fetch(url, { method: 'HEAD' })
      const size = Number(head.headers.get('content-length') ?? 0)
      const triangles = source.current ? countTriangles(source.current) : 0
      // What the route found in the file AR is about to be handed. `ok` means
      // the room shows what this canvas shows; anything else is a list of
      // extensions Scene Viewer or Quick Look drop without an error, and the
      // reason to look at how the asset was exported. @see arHazards
      const compat = head.headers.get('x-ar-compat')

      if (debug) {
        console.log(
          `[AR] ${arModelPath(config, layer)} → ${(size / 1048576).toFixed(1)} MB, ` +
            `${triangles ? triangles.toLocaleString() : '?'} triangles, compat ${compat ?? '?'}`
        )
      }
      if (compat && compat !== 'ok') {
        console.warn(`[AR] this file cannot reach AR unchanged — ${compat}`)
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
      // to unmount and model-viewer is about to build a second scene; on touch
      // hardware those two do not both fit alongside three parsed GLBs — on a
      // tablet as much as on a phone.
      if (device !== 'desktop') {
        config.layers.cover.variants
          .filter((v) => v.path !== modelPath)
          .forEach((v) => useGLTF.clear(v.path))
      }

      setArUrl(url)
      setArUsdz(usdz)
      setShowAR(true)
    } catch (err) {
      // The published GLB stands in, and the sheet says the colour will not be
      // the picked one. With no published GLB either there is nothing to show,
      // so stay on the page rather than opening an empty viewer.
      console.error('[simple] AR source unavailable', err)
      setArStale(true)
      setArUrl(null)
      setArUsdz(null)
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
    // A remount, not a failure: nothing was lost, the canvas was given up.
    recovery.remount()
  }, [recovery])

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
      /* `--dock-w` is declared here rather than inside the dock because two
         things need to agree on it: the dock's own width, and the padding that
         keeps the header's controls from sliding underneath it. */
      style={{ background: splashGradient, ['--dock-w' as string]: 'clamp(20rem, 29vw, 25rem)' }}
    >
      {live && !showAR && !recovery.lost && !noWebgl && (
        <SimpleViewer
          label="simple"
          key={canvasKey}
          config={viewConfig}
          coverage={coverage}
          dockCoverage={dockCoverage}
          zone={zone}
          sourceRef={source}
          onReady={handleReady}
          onError={handleError}
          onContextLost={recovery.handleContextLost}
          onDemote={recovery.demote}
        />
      )}

      {/* The page's own name lives in the dock, where it is already shown at the
          head of the panel. Repeating it over the piece would be a second title
          competing with the product for the only part of the screen the piece
          has. Here it stays for the document outline and for a screen reader. */}
      <h1 className="sr-only">{product.name}</h1>

      {/* Every control up here is a dark glass pill rather than a tinted one:
          `simple.background` is a manifest value and may be white for the next
          product, and a dark pill is the one treatment that reads on both. */}
      <header
        /* On a wide screen the dock owns the trailing edge, so the header stops
           short of it — a back link tucked behind a panel is a back link the
           customer does not have. On a phone the dock is a bottom sheet and the
           whole width is free. */
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between
                   gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]
                   md:ps-[calc(var(--dock-w)+1.5rem)]"
      >
        <Link
          href={`/product/${productKey}`}
          aria-label={t('fullViewAria')}
          className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full border border-white/10
                     bg-[#0a0e15]/70 px-3.5 text-[12px] text-white/70 backdrop-blur-xl
                     transition-colors duration-200 hover:border-white/20 hover:text-white
                     md:h-10 md:px-4 md:text-[12.5px]"
        >
          <ChevronRight className={locale === 'en' ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
          {t('fullView')}
        </Link>

        <div className="flex flex-col items-end gap-2">
          {live && !showAR && !noWebgl && (
            <button
              type="button"
              onClick={openAR}
              disabled={arBuilding}
              className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-white/10
                         bg-[#0a0e15]/70 py-1 pe-3.5 ps-1 text-[12px] font-medium text-white
                         backdrop-blur-xl transition-colors duration-200 hover:border-blue-400/40
                         disabled:opacity-60 md:h-10 md:pe-4 md:text-[12.5px]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white md:h-8 md:w-8">
                {arBuilding ? (
                  <Loader2 className="h-[15px] w-[15px] animate-spin" />
                ) : (
                  <Scan className="h-[15px] w-[15px]" strokeWidth={2} />
                )}
              </span>
              {arBuilding ? t('preparingEllipsis') : arSupported ? t('viewAtHome') : t('preview3D')}
            </button>
          )}
          {/* A render-quality picker over a page that cannot render. */}
          {live && !showAR && !noWebgl && <QualityChips />}
        </div>
      </header>

      {live && (
        <ViewerDock presentation={presentation} arBuilding={arBuilding} hidden={showAR} />
      )}

      {(blocked.length > 0 || error || recovery.lost || noWebgl) && (
        <Notice
          productName={product.name}
          detail={
            // Ordered by how final each is. An unsupported browser outranks
            // everything else: nothing else that is wrong can be fixed on it.
            noWebgl
              ? tc('webglUnavailable')
              : recovery.lost
                ? t('gpuLost')
                : error ?? t('filesNotFound', { list: blocked.join(locale === 'fa' ? '، ' : ', ') })
          }
          productKey={productKey}
          onRetry={
            !noWebgl && recovery.lost && recovery.retryable ? () => recovery.retry() : undefined
          }
        />
      )}

      {/* Held over the canvas rather than shown in its place: the canvas has to
          be mounted and rendering to load its own model at all. */}
      {!error && !blocked.length && !noWebgl && (
        <div
          aria-hidden={ready}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-500"
          style={{
            background: splashGradient,
            opacity: ready ? 0 : 1,
            visibility: ready ? 'hidden' : 'visible',
          }}
        >
          <span className="text-[11px] tracking-[0.4em] text-neutral-400">{t('loadingLabel')}</span>
        </div>
      )}

      {showAR && (
        <ARProductViewer
          glbPath={arUrl ?? product.glbPath ?? ''}
          /**
           * The configured piece, converted for Quick Look.
           *
           * Never omitted. model-viewer will try to build a USDZ itself when
           * `ios-src` is absent, and on these models it throws on the first
           * Basis texture with nowhere for the failure to go — which is the
           * black screen. @see the note on ARProductViewer's `usdzPath`.
           *
           * `arUsdz` carries the same query as `arUrl`, so the cloth the
           * customer picked reaches the room on iOS exactly as it does on
           * Android. The static `product.usdzPath` remains as the floor: it is
           * what the route redirects to if a conversion ever fails, and what
           * this falls back to before one has been built.
           */
          usdzPath={arUsdz ?? product.usdzPath}
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
  onRetry,
}: {
  productName: string
  detail: string
  productKey: string
  /** Present only for a lost context, and only while the tier has rungs left to
   *  give up — a retry that comes back at the same tier crashes the same way. */
  onRetry?: () => void
}) {
  const t = useTranslations('product')
  const tc = useTranslations('common')
  // Transparent: the page root behind it already carries the ground colour.
  // Its own dark card rather than bare text on the page root: `simple.background`
  // is a manifest value, and a message that is only legible on one of the two
  // grounds it may be drawn over is not a message.
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
      <div
        className="max-w-sm space-y-3 rounded-3xl border border-white/10 bg-[#0a0e15]/85 p-7 text-center
                   shadow-[0_30px_80px_-30px_rgb(0_0_0/0.95)] backdrop-blur-2xl"
      >
        <h2 className="text-[15px] font-semibold text-white">{productName}</h2>
        <p className="text-[13px] leading-7 text-white/55">{t('notAvailable3D')}</p>
        <p className="break-all text-[11px] leading-6 text-white/30">{detail}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-xl bg-blue-500 px-4 py-2 text-[13px] font-medium text-white
                         transition-colors hover:bg-blue-400"
            >
              {tc('retry')}
            </button>
          )}
          <Link
            href={`/product/${productKey}`}
            className="inline-block rounded-xl border border-white/15 px-4 py-2 text-[13px] text-white/75
                       transition-colors hover:border-white/30 hover:text-white"
          >
            {t('fullViewAria')}
          </Link>
        </div>
      </div>
    </div>
  )
}
