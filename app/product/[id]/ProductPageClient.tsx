'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useEnvironment, useGLTF, useTexture } from '@react-three/drei'
import { QualityProvider } from '@/contexts/QualityContext'
import { useAssetProbe } from '@/hooks/useAssetProbe'
import { usePresentation, type ZonePaintConfig } from '@/stores/presentationStore'
import { useShop } from '@/stores/storeShopStore'
import { findCatalogItemBySceneObject } from '@/lib/store/catalog'
import catalog from '@/public/config/catalog.json'
import { isARCapable, supportsBlobAR } from '@/lib/device-utils'
import {
  emptyExportSources,
  exportConfiguredGLB,
  exportSignature,
  type ExportSources,
} from '@/lib/three/exportConfigured'
import {
  coverSurface,
  findCoverVariant,
  isMatte,
  needsEnvironment,
  PHONE_QUERY,
  presentationQuality,
  requiredAssets,
  roomMode,
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

/** Seeds every zone from the first swatch of its palette, so the piece opens in
 *  a real, sellable finish rather than whatever the GLB happened to ship with. */
function defaultPaint(config: PresentationConfig): ZonePaintConfig {
  const cover = findCoverVariant(config, config.layers.cover.default)
  // Same helper selectCover uses, so the opening finish and every later swap
  // are described the same way.
  const surface = coverSurface(config, cover)
  const first = (zone: 'wood' | 'cover' | 'cushion') => config.palettes[zone]?.[0]

  return {
    wood: {
      color: first('wood')?.hex ?? '#c8a06a',
      roughness: first('wood')?.roughness ?? 0.55,
      metalness: 0,
      clearcoat: 0,
    },
    cover: { color: first('cover')?.hex ?? '#36454f', ...surface },
    cushion: {
      color: first('cushion')?.hex ?? '#e8e0d2',
      roughness: 0.8,
      metalness: 0,
      clearcoat: 0,
    },
  }
}

export default function ProductPageClient({ presentation }: { presentation: ResolvedPresentation }) {
  const { key, product, config } = presentation
  const [showAR, setShowAR] = useState(false)
  const [arSupported, setArSupported] = useState(false)
  /** False only on Android without WebXR, where Scene Viewer is the sole AR
   *  path and it refuses blob URLs — there AR falls back to the static asset. */
  const [liveARPossible, setLiveARPossible] = useState(true)
  const [arBuilding, setArBuilding] = useState(false)
  const [arError, setArError] = useState(false)
  const [arUrl, setArUrl] = useState<string | null>(null)
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

  const initProduct = usePresentation((s) => s.initProduct)
  const reset = usePresentation((s) => s.reset)
  const addToCart = useShop((s) => s.addToCart)

  /**
   * Tier, pinned from the manifest instead of guessed from the viewport.
   *
   * Resolved on the client only — reading `innerWidth` during render would
   * disagree with the server's HTML — so the first paint uses the manifest's
   * desktop tier and a phone with a `quality.mobile` override settles onto it
   * before the canvas mounts behind the splash.
   */
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const apply = () => setPhone(mq.matches)
    apply()
    // matchMedia rather than a resize listener: this only ever needs to know
    // which side of the query we are on, and a resize handler would re-render
    // the page on every frame of a window drag. It also keeps up with a phone
    // being turned, which the query is written to answer either way round.
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const qualityPreset = useMemo(() => presentationQuality(config, phone), [config, phone])

  const assets = useMemo(() => requiredAssets(config), [config])
  const { state, missing } = useAssetProbe(useMemo(() => assets, [assets, probeKey]))

  const catalogId = useMemo(() => {
    const item = findCatalogItemBySceneObject(catalog as Catalog, key)
    return item?.id ?? null
  }, [key])

  /** Written by FurnitureStack with the raw cached GLTFs — the AR export lives
   *  out here, outside the Canvas, and has no other way to reach them. */
  const sources = useRef<ExportSources>(emptyExportSources())
  /** The last built model, keyed by the config that produced it. Re-opening AR
   *  without touching a swatch reuses it instead of re-serialising. */
  const arCache = useRef<{ signature: string; url: string } | null>(null)

  useEffect(() => {
    setArSupported(isARCapable())
    supportsBlobAR().then(setLiveARPossible)
  }, [])

  // Object URLs outlive React state, so the last one has to be released by hand.
  useEffect(
    () => () => {
      if (arCache.current) URL.revokeObjectURL(arCache.current.url)
      arCache.current = null
    },
    []
  )

  /**
   * Serialise what is on screen — chosen cover variant, all three zone colours —
   * and hand model-viewer the result. With no `ios-src` alongside it, Quick Look
   * gets a USDZ generated from this same file, so iOS matches Android.
   */
  const openAR = useCallback(async () => {
    if (!liveARPossible) {
      setShowAR(true)
      return
    }

    const { paint, coverId } = usePresentation.getState()
    const signature = exportSignature(paint, coverId)

    if (arCache.current?.signature === signature) {
      setArUrl(arCache.current.url)
      setShowAR(true)
      return
    }

    setArBuilding(true)
    setArError(false)
    try {
      const blob = await exportConfiguredGLB(
        sources.current,
        paint,
        findCoverVariant(config, coverId),
        { softMatch: config.layers.soft?.zoneMatch, matte: isMatte(config) }
      )
      const url = URL.createObjectURL(blob)
      if (arCache.current) URL.revokeObjectURL(arCache.current.url)
      arCache.current = { signature, url }
      setArUrl(url)
      setShowAR(true)

      if (new URLSearchParams(window.location.search).has('debug')) {
        console.log(`[AR] configured GLB ${(blob.size / 1048576).toFixed(1)} MB`)
      }
      if (blob.size > 40 * 1048576) {
        console.warn('[AR] configured GLB exceeds 40MB — Quick Look may struggle')
      }
    } catch (error) {
      console.error('[AR] export failed', error)
      setArError(true)
    } finally {
      setArBuilding(false)
    }
  }, [config, liveARPossible])

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
  }, [state, assets, config])

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
   *
   * The exported blob goes too on a phone: the scene is about to take its
   * context back, and holding it is dead weight on the devices that can least
   * spare it.
   */
  const closeAR = useCallback(() => {
    setShowAR(false)
    initProduct(key, defaultPaint(config), config.layers.cover.default, config.layers.startStep ?? 1)
    if (!phone) return
    if (arCache.current) URL.revokeObjectURL(arCache.current.url)
    arCache.current = null
    setArUrl(null)
  }, [phone, initProduct, key, config])

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
      <div className="relative h-screen w-screen overflow-hidden bg-[var(--surface-0)]">
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
            sources={sources}
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
            arAvailable={liveARPossible || !!product.glbPath}
            arCapable={arSupported}
            arLive={liveARPossible}
            arBuilding={arBuilding}
            arError={arError}
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

        {showAR && (arUrl || product.glbPath) && (
          <ARProductViewer
            // The configured build when we have one; `ios-src` is deliberately
            // left off so Quick Look regenerates from it instead of the stale
            // catalogue USDZ. WebXR first, so Android never reaches Scene
            // Viewer with a blob it cannot fetch.
            glbPath={arUrl ?? product.glbPath!}
            usdzPath={arUrl ? undefined : product.usdzPath}
            arModes={arUrl ? 'webxr quick-look scene-viewer' : undefined}
            arScale="fixed"
            productName={product.name}
            onClose={closeAR}
          />
        )}
      </div>
    </QualityProvider>
  )
}
