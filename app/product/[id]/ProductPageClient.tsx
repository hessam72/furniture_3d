'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useEnvironment, useGLTF, useTexture } from '@react-three/drei'
import { QualityProvider } from '@/contexts/QualityContext'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { useDeviceClass } from '@/hooks/useDeviceClass'
import { usePresentation } from '@/stores/presentationStore'
import { arUsdzUrl, swatchIdsFromPaint } from '@/lib/ar/arSource'
import { useShop } from '@/stores/storeShopStore'
import { findCatalogItemBySceneObject } from '@/lib/store/catalog'
import catalog from '@/public/config/catalog.json'
import { isARCapable } from '@/lib/device-utils'
import {
  arModelPath,
  defaultPaint,
  openingSwatchMaps,
  restSwatchMaps,
  lowerTier,
  needsEnvironment,
  presentationQuality,
  requiredAssets,
  roomMode,
  type DeviceClass,
  type PresentationConfig,
  type ResolvedPresentation,
} from '@/lib/product/presentation'
import ProductSheet from '@/components/product/ProductSheet'
import PresentationTopBar from '@/components/product/PresentationTopBar'
import MissingAssetsNotice from '@/components/product/MissingAssetsNotice'
import { RendererStatsOverlay } from '@/components/three/RendererStatsOverlay'
import { useContextRecovery } from '@/hooks/useContextRecovery'
import { useGltfCacheEviction, useSwatchCacheEviction } from '@/hooks/useGltfCacheEviction'
import { preloadGltf } from '@/lib/three/gltfLoaders'
import { WEBGL_UNAVAILABLE_FA, webglUnavailable } from '@/lib/three/gpuClass'
import PresentationLoading from '@/components/product/PresentationLoading'
import type { Catalog } from '@/lib/store/catalog'

// DRACO's path, the KTX2 transcoder's path and the one-instance-each rule all
// live in lib/three/gltfLoaders now. @see extendGltfLoader

const PresentationScene = dynamic(() => import('@/components/product/PresentationScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[var(--surface-0)]" />,
})

const ARProductViewer = dynamic(() => import('@/components/store/ARProductViewer'), { ssr: false })

export default function ProductPageClient({ presentation }: { presentation: ResolvedPresentation }) {
  const { key, product, config } = presentation
  const [showAR, setShowAR] = useState(false)
  const [arSupported, setArSupported] = useState(false)
  const [probeKey, setProbeKey] = useState(0)
  /** A GLB that exists but fails to parse never reaches the probe — the error
   *  boundaries in the scene report it here so it still gets a way out. */
  const [layerError, setLayerError] = useState<string | null>(null)
  /** Raised by the scene once the piece and room are actually drawn — the probe
   *  below only proves the files exist. */
  const [sceneReady, setSceneReady] = useState(false)
  /** The lost-context ladder — unmount, drop a rung, offer a retry. Shared
   *  with /simple, /showroom, /view and /store. @see useContextRecovery */
  const recovery = useContextRecovery({
    surface: 'presentation',
    onLost: () => setLayerError('نمایش سه‌بعدی متوقف شد — حافظه گرافیکی دستگاه پر شد'),
  })
  const { lost: contextLost, canvasKey } = recovery

  const initProduct = usePresentation((s) => s.initProduct)
  const reset = usePresentation((s) => s.reset)
  /** Which cover the sheet has selected — the file AR shows. @see arPath */
  const coverId = usePresentation((s) => s.coverId)
  const addToCart = useShop((s) => s.addToCart)

  /**
   * Tier, pinned from the manifest instead of guessed from the viewport.
   *
   * Resolved on the client only — reading `innerWidth` during render would
   * disagree with the server's HTML — so the first paint uses the manifest's
   * desktop tier and a phone with a `quality.mobile` override settles onto it
   * before the canvas mounts behind the splash.
   */
  const device = useDeviceClass()
  /** What the manifest asks for, capped to the device. The rungs a lost context
   *  has cost are applied by the provider. @see resolveTier */
  const qualityPreset = useMemo(() => presentationQuality(config, device), [config, device])

  const assets = useMemo(() => requiredAssets(config), [config])

  // Everything this page parsed goes back when the visitor leaves it.
  useGltfCacheEviction(assets.filter((path) => path.endsWith('.glb')))
  useSwatchCacheEviction()
  const { state, missing } = useAssetProbe(useMemo(() => assets, [assets, probeKey]))

  const catalogId = useMemo(() => {
    const item = findCatalogItemBySceneObject(catalog as Catalog, key)
    return item?.id ?? null
  }, [key])

  useEffect(() => setArSupported(isARCapable()), [])

  /**
   * No WebGL2 on this device at all — three 0.180 dropped the WebGL1 path in
   * r163, so there is no renderer to build and no tier low enough to save it.
   * Distinct from `layerError`'s lost-context copy on purpose: that one says
   * the device ran out of room and offers a retry, and here there is nothing to
   * retry. Read in an effect because this shell server-renders and a value that
   * differed between the two would be a hydration mismatch. @see readGpuClass
   */
  const [noWebgl, setNoWebgl] = useState(false)
  useEffect(() => setNoWebgl(webglUnavailable()), [])

  // Kills iOS pull-to-refresh over this page. @see .viewport-locked
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('viewport-locked')
    return () => root.classList.remove('viewport-locked')
  }, [])

  /**
   * The file AR shows: the cover variant the customer picked, served straight
   * from `public/models`.
   *
   * It used to be serialised in the browser from the live scene, colours baked
   * in — and that is what crashed real phones. Building it walks the whole
   * scene, clones every material, and holds the finished GLB in memory as an
   * ArrayBuffer *and* as a Blob while a second WebGL context (model-viewer's)
   * is starting up, on a device that had just been rendering a room. What the
   * customer got for it was a spinner and, often, a reloaded tab.
   *
   * A static URL has none of that: nothing is built, nothing is held, the
   * browser streams the same file it already cached for the page and every AR
   * path works with it — Scene Viewer included, which refuses blob URLs
   * outright. The cost is that the swatch colours do not travel to AR; the
   * *material* the customer chose does, which is the choice that changes the
   * shape of what they are placing in the room.
   */
  const arPath = useMemo(() => arModelPath(config, coverId) ?? product.glbPath ?? null, [
    config,
    coverId,
    product.glbPath,
  ])

  /**
   * The same piece as a USDZ, for Quick Look, carrying the live configuration.
   *
   * `arPath` above is a static file, chosen for the reasons written over it, and
   * it is the right `src` for Scene Viewer. iOS cannot use it: model-viewer has
   * to convert a GLB to USDZ itself when no `ios-src` is given, and it throws on
   * the first Basis texture with nowhere for the failure to go — the black
   * screen. @see app/api/ar/[key]/model.usdz/route.ts
   *
   * Built at open time rather than on every paint change: this URL is only read
   * when the overlay mounts, and the store's paint is what it should reflect at
   * that moment.
   */
  const [arUsdz, setArUsdz] = useState<string | null>(null)

  const openAR = useCallback(() => {
    const { paint } = usePresentation.getState()
    const layer = coverId ?? 'default'
    setArUsdz(arUsdzUrl(key, layer, 'cover', paint, swatchIdsFromPaint(paint)))
    setShowAR(true)
  }, [key, coverId])

  useEffect(() => {
    initProduct(key, defaultPaint(config), config.layers.cover.default, config.layers.startStep ?? 1)
    return () => reset()
  }, [key, config, initProduct, reset])

  // Warm drei's cache before the scene mounts, then pull the non-default cover
  // variants on idle so a swap never suspends mid-wipe.
  useEffect(() => {
    if (state !== 'ready') return
    // Only the GLBs go through drei's loader cache; the backdrop image is a
    // plain texture and the HDR has its own loader.
    // Waits on the transcoder rather than racing it: a KTX2 texture parsed
    // before `detectSupport` throws, and it throws into a Suspense boundary,
    // where it reads as a model that simply never arrives. @see preloadGltf
    const stopPreload = preloadGltf(
      assets.filter((path) => path.endsWith('.glb')),
      useGLTF.preload
    )
    if (needsEnvironment(config) && config.room.hdr) {
      useEnvironment.preload({ files: config.room.hdr })
    }
    // Only the backdrop actually in use — a manifest can carry both an image
    // and a room GLB so `room.mode` can switch between them.
    if (roomMode(config) === 'image' && config.room.image) useTexture.preload(config.room.image)

    // The opening fabric, warmed with the GLBs rather than on idle: it is what
    // the page renders with, so a late arrival is a visible change of cloth
    // rather than a swap that was already going to animate.
    const opening = openingSwatchMaps(config)
    let stopSwatches = () => {}
    if (opening.length) {
      void import('@/lib/three/swatchTextures').then(({ preloadSwatchMaps }) => {
        stopSwatches = preloadSwatchMaps(opening)
      })
    }

    // Desktop only. Warming the other covers buys a swap that never suspends,
    // and pays for it in exactly the currency touch hardware has least of:
    // every warmed variant is a second full GLB parsed and held in drei's
    // cache, on a device already at its ceiling with the one it is showing.
    // There the swap suspends behind the wipe instead, which is what the wipe
    // is for. This read `phone`, and so exempted every tablet — which is not a
    // device class with memory to spare, only one with a wider window.
    if (device !== 'desktop') {
      return () => {
        stopSwatches()
        stopPreload()
      }
    }

    const rest = config.layers.cover.variants
      .filter((v) => v.id !== config.layers.cover.default)
      .map((v) => v.path)
    let stopWarm = () => {}
    const warm = () => {
      stopWarm = preloadGltf(rest, useGLTF.preload)
      // The rest of the palette, on the same terms as the rest of the covers:
      // a courtesy bought with desktop memory, and one a phone does not get.
      void import('@/lib/three/swatchTextures').then(({ preloadSwatchMaps }) => {
        preloadSwatchMaps(restSwatchMaps(config))
      })
    }

    const idle = (window as any).requestIdleCallback
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1500)
    return () => {
      const cancel = (window as any).cancelIdleCallback
      if (idle && cancel) cancel(handle)
      else window.clearTimeout(handle as number)
      stopWarm()
      stopSwatches()
      stopPreload()
    }
  }, [state, assets, config, device])

  const retry = useCallback(() => {
    setLayerError(null)
    // The purge runs only when the *files* are the problem — a 404, or a GLB
    // that would not parse. @see the note on `retry` in useContextRecovery for
    // what clearing on a lost context costs.
    recovery.retry(
      contextLost
        ? undefined
        : () => {
            assets.filter((path) => path.endsWith('.glb')).forEach((path) => useGLTF.clear(path))
            setProbeKey((n) => n + 1)
          }
    )
    // `sceneReady` is deliberately left true. The splash exists to hide the
    // first load's pop-in; here the assets are warm and the error notice was
    // already covering the canvas. Clearing it made the page wait on a fresh
    // SceneReady signal that a rebuilt scene does not always send, which parked
    // the splash until the 20s failsafe.
  }, [assets, contextLost, recovery])

  const handleLayerError = useCallback((category: string, error: Error) => {
    setLayerError(`${category}: ${error.message}`)
  }, [])

  /**
   * Leaving AR is a fresh start on the piece.
   *
   * The Canvas is gated on `!showAR`, so this remount is unavoidable — and the
   * store is not, since `reset()` is bound to the page's unmount, which does not
   * happen. Re-running `initProduct` puts the scene back at the manifest's
   * defaults *and* sets `coverPhase: 'wipeIn'`, so the return plays the same
   * bottom-up reveal a first load does rather than snapping into place. Both
   * updates land in one batch, so the scene mounts already knowing to wipe in.
   */
  const closeAR = useCallback(() => {
    setShowAR(false)
    initProduct(key, defaultPaint(config), config.layers.cover.default, config.layers.startStep ?? 1)
  }, [initProduct, key, config])

  // Failsafe. The splash is dismissed by the scene reporting itself drawn, and
  // an asset that resolves but never measures — a frame GLB with no geometry,
  // say — would otherwise leave it up for good. A half-dressed scene beats a
  // splash that never lifts.
  useEffect(() => {
    if (state !== 'ready' || sceneReady) return
    const t = window.setTimeout(() => {
      console.warn('[presentation] scene never reported ready — revealing anyway')
      setSceneReady(true)
    }, 20000)
    return () => window.clearTimeout(t)
  }, [state, sceneReady])

  return (
    <QualityProvider surface="presentation" preset={qualityPreset} downgrades={recovery.downgrades}>
      {/* `viewport-fill`, not `h-screen`: iOS reads `100vh` as the height with
          the address bar retracted, so a full-screen container is taller than
          the screen. Here that only cost the canvas ~13% of its pixels to draw
          behind the bar, but it is the same bug that cropped the simple
          viewer's controls. */}
      <div className="viewport-fill relative w-screen overflow-hidden bg-[var(--surface-0)]">
        {/* Unmounted while AR is open: model-viewer takes a WebGL context of
            its own, and two live contexts plus the exported GLB is what tips a
            phone over. Remounting is cheap — the GLBs stay in drei's cache. */}
        {state === 'ready' && !showAR && !contextLost && !noWebgl && (
          <PresentationScene
            key={canvasKey}
            config={config}
            onLayerError={handleLayerError}
            onReady={() => setSceneReady(true)}
            onContextLost={recovery.handleContextLost}
          />
        )}

        {/* Covers the probe *and* the streaming behind it. The canvas has to be
            mounted and rendering to load its own assets, so the splash is held
            over it and faded, rather than shown in its place. */}
        {!layerError && state !== 'missing' && !noWebgl && (
          <PresentationLoading productName={product.name} ready={state === 'ready' && sceneReady} />
        )}

        {/* The AR overlay owns the screen and carries its own close button —
            the back link here would leave the page outright. */}
        {!showAR && <PresentationTopBar productName={product.name} catalogId={catalogId} />}

        {state === 'ready' && sceneReady && (
          <ProductSheet
            presentation={presentation}
            // Not gated on the device: the viewer is a 3D preview of the
            // configured piece everywhere, and AR is the extra it adds when the
            // device supports it. `arCapable` only steers the copy.
            arAvailable={!!arPath}
            arCapable={arSupported}
            hidden={showAR}
            onViewAR={openAR}
            onAddToCart={() => addToCart(catalogId ?? product.id)}
          />
        )}

        {(state === 'missing' || layerError || noWebgl) && (
          <MissingAssetsNotice
            productName={product.name}
            kind={layerError || noWebgl ? 'error' : 'missing'}
            missing={noWebgl ? [WEBGL_UNAVAILABLE_FA] : layerError ? [layerError] : missing}
            // Nothing to retry on a browser that cannot build a renderer.
            onRetry={noWebgl ? undefined : retry}
          />
        )}

        {showAR && arPath && (
          <ARProductViewer
            glbPath={arPath}
            /**
             * Always, not only when the GLB is the catalogue model.
             *
             * The old condition read as a fidelity choice — hand Quick Look the
             * authored USDZ where it matches, let model-viewer build one from
             * the variant otherwise — and it silently became the iOS AR bug the
             * moment `arModelPath` started returning `/ktx-optimized/…`: the
             * paths stopped being equal, so `ios-src` was dropped on every
             * cover, and model-viewer cannot export a Basis-compressed model to
             * USDZ. It fails with no error and Quick Look opens on the page
             * itself. @see the note on ARProductViewer's `usdzPath`.
             *
             * It now points at the conversion route, so Quick Look shows the
             * piece as configured rather than as authored. `product.usdzPath`
             * stays as the floor beneath it: what the route redirects to if a
             * conversion fails, and what this uses before one is built.
             */
            usdzPath={arUsdz ?? product.usdzPath}
            arScale="fixed"
            productName={product.name}
            onClose={closeAR}
          />
        )}

        <RendererStatsOverlay tier={lowerTier(qualityPreset, recovery.downgrades)} />
      </div>
    </QualityProvider>
  )
}
