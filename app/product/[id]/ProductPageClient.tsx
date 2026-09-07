'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useEnvironment, useGLTF, useTexture } from '@react-three/drei'
import { QualityProvider } from '@/contexts/QualityContext'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { usePresentation } from '@/stores/presentationStore'
import { useShop } from '@/stores/storeShopStore'
import { findCatalogItemBySceneObject } from '@/lib/store/catalog'
import catalog from '@/public/config/catalog.json'
import { isARCapable } from '@/lib/device-utils'
import {
  arModelPath,
  defaultPaint,
  lowerTier,
  needsEnvironment,
  PHONE_QUERY,
  presentationQuality,
  readDeviceClass,
  requiredAssets,
  roomMode,
  TOUCH_QUERY,
  type DeviceClass,
  type PresentationConfig,
  type ResolvedPresentation,
} from '@/lib/product/presentation'
import ProductSheet from '@/components/product/ProductSheet'
import PresentationTopBar from '@/components/product/PresentationTopBar'
import MissingAssetsNotice from '@/components/product/MissingAssetsNotice'
import PresentationLoading from '@/components/product/PresentationLoading'
import type { Catalog } from '@/lib/store/catalog'

// Must run before any preload in this chunk — drei otherwise reaches for its
// CDN decoder. Same reason CarPageClient sets it at module scope.
useGLTF.setDecoderPath('/draco/')

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
  /** Bumped by `retry` to force a fresh WebGL context — a Canvas whose context
   *  died has to be remounted, not re-rendered. */
  const [canvasKey, setCanvasKey] = useState(0)
  /** Set the instant the GPU drops the context; gates the Canvas out of the
   *  tree. @see handleContextLost */
  const [contextLost, setContextLost] = useState(false)
  /** A GLB that exists but fails to parse never reaches the probe — the error
   *  boundaries in the scene report it here so it still gets a way out. */
  const [layerError, setLayerError] = useState<string | null>(null)
  /** Raised by the scene once the piece and room are actually drawn — the probe
   *  below only proves the files exist. */
  const [sceneReady, setSceneReady] = useState(false)
  /**
   * How many rungs the tier has been dropped by lost contexts this session.
   *
   * A context is lost because the device ran out of room for what we asked it
   * to draw, so coming back at the same tier asks for it again — which is the
   * loop the page was stuck in on iPhones: crash, reload, crash. Each loss
   * costs a rung, permanently for this page view.
   */
  const [downgrades, setDowngrades] = useState(0)

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
  const [device, setDevice] = useState<DeviceClass>('desktop')
  const phone = device === 'phone'
  useEffect(() => {
    const queries = [window.matchMedia(PHONE_QUERY), window.matchMedia(TOUCH_QUERY)]
    const apply = () => setDevice(readDeviceClass())
    apply()
    // matchMedia rather than a resize listener: this only ever needs to know
    // which side of the query we are on, and a resize handler would re-render
    // the page on every frame of a window drag. It also keeps up with a phone
    // being turned, which the query is written to answer either way round.
    queries.forEach((mq) => mq.addEventListener('change', apply))
    return () => queries.forEach((mq) => mq.removeEventListener('change', apply))
  }, [])
  const qualityPreset = useMemo(
    () => lowerTier(presentationQuality(config, device), downgrades),
    [config, device, downgrades]
  )

  const assets = useMemo(() => requiredAssets(config), [config])
  const { state, missing } = useAssetProbe(useMemo(() => assets, [assets, probeKey]))

  const catalogId = useMemo(() => {
    const item = findCatalogItemBySceneObject(catalog as Catalog, key)
    return item?.id ?? null
  }, [key])

  useEffect(() => setArSupported(isARCapable()), [])

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

  const openAR = useCallback(() => setShowAR(true), [])

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
    assets
      .filter((path) => path.endsWith('.glb'))
      .forEach((path) => useGLTF.preload(path))
    if (needsEnvironment(config) && config.room.hdr) {
      useEnvironment.preload({ files: config.room.hdr })
    }
    // Only the backdrop actually in use — a manifest can carry both an image
    // and a room GLB so `room.mode` can switch between them.
    if (roomMode(config) === 'image' && config.room.image) useTexture.preload(config.room.image)

    // Not on a phone. Warming the other covers buys a swap that never suspends,
    // and pays for it in exactly the currency a phone has least of: every warmed
    // variant is a second full GLB parsed and held in drei's cache, on a device
    // already at its ceiling with the one it is showing. There the swap
    // suspends behind the wipe instead, which is what the wipe is for.
    if (phone) return

    const rest = config.layers.cover.variants
      .filter((v) => v.id !== config.layers.cover.default)
      .map((v) => v.path)
    const warm = () => rest.forEach((path) => useGLTF.preload(path))

    const idle = (window as any).requestIdleCallback
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1500)
    return () => {
      const cancel = (window as any).cancelIdleCallback
      if (idle && cancel) cancel(handle)
      else window.clearTimeout(handle as number)
    }
  }, [state, assets, config, phone])

  const retry = useCallback(() => {
    // Purge the cache only when the *files* are the problem — a 404, or a GLB
    // that would not parse. A lost context is the opposite case: the files are
    // fine and only the GPU's copy of them is gone, so a remount re-uploads
    // them. Clearing there re-suspends every layer and the stack never
    // republishes `framing`, which leaves the camera rig with nothing to solve
    // from — an unsolved camera and a black stage.
    if (!contextLost) {
      assets.filter((path) => path.endsWith('.glb')).forEach((path) => useGLTF.clear(path))
      setProbeKey((n) => n + 1)
    }
    setLayerError(null)
    setContextLost(false)
    setCanvasKey((n) => n + 1)
    // `sceneReady` is deliberately left true. The splash exists to hide the
    // first load's pop-in; here the assets are warm and the error notice was
    // already covering the canvas. Clearing it made the page wait on a fresh
    // SceneReady signal that a rebuilt scene does not always send, which parked
    // the splash until the 20s failsafe.
  }, [assets, contextLost])

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

  /**
   * A lost context is not a React error, so no error boundary sees it — and
   * drawing a notice over the live Canvas is not enough. The next render of the
   * R3F tree calls into EffectComposer against the dead context, which throws
   * out of React and replaces the whole page with "Application error: a
   * client-side exception". That was the visible crash. Unmounting the Canvas
   * in the same state update means React tears the subtree down instead of
   * re-rendering it, and `retry` builds a new one.
   */
  const handleContextLost = useCallback(() => {
    setContextLost(true)
    // Whatever we asked for was too much for this GPU, so `retry` must not ask
    // for it again. @see downgrades
    setDowngrades((n) => n + 1)
    setLayerError('نمایش سه‌بعدی متوقف شد — حافظه گرافیکی دستگاه پر شد')
  }, [])

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
    <QualityProvider preset={qualityPreset}>
      {/* `viewport-fill`, not `h-screen`: iOS reads `100vh` as the height with
          the address bar retracted, so a full-screen container is taller than
          the screen. Here that only cost the canvas ~13% of its pixels to draw
          behind the bar, but it is the same bug that cropped the simple
          viewer's controls. */}
      <div className="viewport-fill relative w-screen overflow-hidden bg-[var(--surface-0)]">
        {/* Unmounted while AR is open: model-viewer takes a WebGL context of
            its own, and two live contexts plus the exported GLB is what tips a
            phone over. Remounting is cheap — the GLBs stay in drei's cache. */}
        {state === 'ready' && !showAR && !contextLost && (
          <PresentationScene
            key={canvasKey}
            config={config}
            onLayerError={handleLayerError}
            onReady={() => setSceneReady(true)}
            onContextLost={handleContextLost}
          />
        )}

        {/* Covers the probe *and* the streaming behind it. The canvas has to be
            mounted and rendering to load its own assets, so the splash is held
            over it and faded, rather than shown in its place. */}
        {!layerError && state !== 'missing' && (
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

        {(state === 'missing' || layerError) && (
          <MissingAssetsNotice
            productName={product.name}
            kind={layerError ? 'error' : 'missing'}
            missing={layerError ? [layerError] : missing}
            onRetry={retry}
          />
        )}

        {showAR && arPath && (
          <ARProductViewer
            glbPath={arPath}
            // Only meaningful when the file on screen is the catalogue model the
            // USDZ was authored from; for a cover variant model-viewer builds
            // Quick Look's USDZ from the GLB itself.
            usdzPath={arPath === product.glbPath ? product.usdzPath : undefined}
            arScale="fixed"
            productName={product.name}
            onClose={closeAR}
          />
        )}
      </div>
    </QualityProvider>
  )
}
