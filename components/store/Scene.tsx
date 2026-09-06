'use client'
import { Canvas, useLoader, useFrame } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Suspense, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Physics } from '@react-three/rapier'
import { useStoreConfig } from './hooks/useStoreConfig'
import { ModelLoader } from './ModelLoader'
import { usePhysics } from './PhysicsSystem'
import { usePlayerController } from './PlayerController'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import { VirtualJoystick } from './Joystick'
import { usePOVCamera } from './POVCamera'
import { ReflectiveFloor } from './ReflectiveFloor'
import { PostProcessing } from './PostProcessing'
import { ShadowSystem } from './ShadowSystem'
import { SunLight } from './SunLight'
import { LampLights } from './LampLights'
import { useState, useEffect, useCallback, useRef } from 'react'
import ProductInteraction, { type ProductData } from './ProductInteraction'
import ProductDrawer from './ProductDrawer'
import { ProductFocusCamera, type FocusPose } from './ProductFocusCamera'
import StoreTopBar from './StoreTopBar'
import StoreSidebar from './StoreSidebar'
import CategoryBar from './CategoryBar'
import {
  resolveCatalogItem,
  findCatalogItemBySceneObject,
  type Catalog,
  type CatalogItem,
  type FocusOverride
} from '@/lib/store/catalog'
import { useShop } from '@/stores/storeShopStore'
import ARProductViewer from './ARProductViewer'
import { FurnitureColorApplier } from './FurnitureColorApplier'
import { useFurnitureConfig } from '@/stores/furnitureConfigStore'
import { LoadingScreen } from './LoadingScreen'
import { ModelsLoadingIndicator } from './ModelsLoadingIndicator'
import { AudioPlayer } from './AudioPlayer'
import { GyroToggle } from './GyroToggle'
import { SceneTransition } from './SceneTransition'
import { CameraTransition } from './CameraTransition'
import { ParticleReveal } from './ParticleReveal'
import { ActivityGovernor, markStoreActivity } from './activityGovernor'
import { PerfLadder } from '@/components/three/PerfLadder'
import { clampDprToBudget } from '@/lib/three/dprBudget'
import { useQuality } from '@/contexts/QualityContext'
import { PartErrorBoundary } from '@/components/car/PartErrorBoundary'

// Demand frameloop with idle physics pause — the /car performance model
// adapted for a walkable scene. Kill-switch: set to false to restore
// frameloop="always" + variable timestep (all other quality wiring stays).
const IDLE_DEMAND = true

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-red-500">
      <div className="text-center">
        <div className="text-xl mb-2">Error</div>
        <div>{message}</div>
      </div>
    </div>
  )
}

function PhysicsManager({
  onJoystickInputReady,
  gyroEnabled,
  playerStart,
  cameraHeight,
  focusTarget,
  focusId,
  focusFallbackPoint,
  focusOverride,
  absolutePose,
  onFocusArrive,
  onFocusMiss,
  selectedProduct,
  playerStartPosRef,
  movementThreshold,
  onCloseProduct
}: {
  onJoystickInputReady: (ref: React.RefObject<{ x: number; y: number }>) => void
  gyroEnabled: boolean
  playerStart: [number, number, number]
  cameraHeight?: number
  focusTarget: string | null
  focusId?: string
  focusFallbackPoint?: [number, number, number]
  focusOverride?: FocusOverride
  absolutePose?: {
    position: [number, number, number]
    lookAt: [number, number, number]
  }
  onFocusArrive: () => void
  onFocusMiss: () => void
  selectedProduct: ProductData | null
  playerStartPosRef: React.MutableRefObject<{ x: number; z: number } | null>
  movementThreshold: number
  onCloseProduct: () => void
}) {
  const physics = usePhysics()
  // Both per-frame camera writers stand down while a flight owns the camera
  const { joystickInput } = usePlayerController(physics, playerStart, cameraHeight, !!focusTarget)
  const [resyncKey, setResyncKey] = useState(0)
  usePOVCamera({ gyroEnabled, frozen: !!focusTarget, resyncKey })

  useEffect(() => {
    onJoystickInputReady(joystickInput)
  }, [joystickInput, onJoystickInputReady])

  // Capture player position when drawer opens (after flight completes)
  useEffect(() => {
    if (!selectedProduct || focusTarget || !physics.rigidBodyRef.current) {
      return
    }
    // Flight completed, drawer is open - capture start position
    const pos = physics.rigidBodyRef.current.translation()
    playerStartPosRef.current = { x: pos.x, z: pos.z }
  }, [selectedProduct, focusTarget, physics.rigidBodyRef, playerStartPosRef])

  // Monitor movement and auto-close drawer if threshold exceeded
  useFrame(() => {
    if (!selectedProduct || !playerStartPosRef.current || !physics.rigidBodyRef.current) {
      return
    }

    const currentPos = physics.rigidBodyRef.current.translation()
    const dx = currentPos.x - playerStartPosRef.current.x
    const dz = currentPos.z - playerStartPosRef.current.z
    const distance = Math.sqrt(dx * dx + dz * dz)

    if (distance > movementThreshold) {
      playerStartPosRef.current = null
      onCloseProduct()
    }
  })

  // Landing hand-off: teleport the body under the camera, then let the look
  // easing adopt the landed orientation. Order matters — resyncing before the
  // body moves would still leave the camera snapping back on the next frame.
  const handleArrive = useCallback(
    (pose: FocusPose) => {
      const h = cameraHeight ?? 1.3
      physics.rigidBodyRef.current?.setTranslation(
        { x: pose.position.x, y: pose.position.y - h, z: pose.position.z },
        true
      )
      physics.rigidBodyRef.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)
      setResyncKey((k) => k + 1)
      onFocusArrive()
    },
    [physics, cameraHeight, onFocusArrive]
  )

  return (
    <>
      <ProductFocusCamera
        targetName={focusTarget}
        targetId={focusId}
        fallbackPoint={focusFallbackPoint}
        focus={focusOverride}
        absolutePose={absolutePose}
        playerBody={physics.rigidBodyRef}
        onArrive={handleArrive}
        onMiss={onFocusMiss}
      />
      <RigidBody
        ref={physics.rigidBodyRef}
        type="dynamic"
        position={playerStart}
        enabledRotations={[false, true, false]}
        lockRotations
        linearDamping={2.5}
        angularDamping={10}
        canSleep={false}
      >
        <CapsuleCollider args={[0.6, 0.35]} />
      </RigidBody>
    </>
  )
}

type LoadingPhase = 'loading' | 'transitioning' | 'ready'

/**
 * One flight, two entry points. A menu pick carries the catalogue entry (its
 * name and price override the room's product); a direct tap carries the product
 * and the mesh it actually hit. Everything after take-off is identical, so both
 * go through the same value rather than two near-duplicate paths.
 */
type PendingFocus = {
  /** products.json key — the resolver's primary name */
  sceneObject: string
  /** product id — the resolver's second name, since the room may use it */
  id?: string
  fallbackPoint?: [number, number, number]
  /** Authored pose override from catalog.json (`focus.azimuthDeg` etc.) */
  focus?: FocusOverride
  /** Absolute target position and lookAt — bypasses relative calculations */
  absolutePose?: {
    position: [number, number, number]
    lookAt: [number, number, number]
  }
  item?: CatalogItem
  product?: ProductData
  object?: THREE.Object3D | null
}

export default function Scene() {
  const { config, loading, error } = useStoreConfig()
  const { settings } = useQuality()
  const [joystickInputRef, setJoystickInputRef] = useState<React.RefObject<{ x: number; y: number }> | null>(null)
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('loading')
  const [loadedCount, setLoadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null)
  const [selectedObjectPosition, setSelectedObjectPosition] = useState<[number, number, number] | null>(null)
  const [showAR, setShowAR] = useState(false)
  const [arProduct, setArProduct] = useState<ProductData | null>(null)
  const [gyroEnabled, setGyroEnabled] = useState(false)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [modelsKey, setModelsKey] = useState(0)

  // Browsing layer: catalogue tree, sidebar, and the camera flight
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [products, setProducts] = useState<Record<string, ProductData>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null)
  const [focusedName, setFocusedName] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  /** products.json key for the focused piece — the only place it survives past
   *  pendingFocus, and what /product/[id] is keyed on. */
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  const { selectFurniture, initializeColor, currentColor, originalColor } = useFurnitureConfig()
  const addToCart = useShop((s) => s.addToCart)

  // Sustained-FPS ladder scale (same mechanism as /car)
  const [perfScale, setPerfScale] = useState(1)
  const dpr = useMemo<[number, number]>(() => {
    const [min, max] = clampDprToBudget(settings.dpr)
    return [min, Math.max(min, +(max * perfScale).toFixed(2))]
  }, [settings.dpr, perfScale])

  // Demand-loop idle state: physics pauses while parked
  const [idle, setIdle] = useState(false)
  const r3fRef = useRef<RootState | null>(null)

  // Auto-close drawer when player moves beyond threshold
  const playerStartPosRef = useRef<{ x: number; z: number } | null>(null)
  const MOVEMENT_THRESHOLD = 2.5

  // DOM-side wake: stamp activity and kick one frame; the governor keeps
  // the loop alive from there
  const wake = useCallback(() => {
    markStoreActivity()
    r3fRef.current?.invalidate()
  }, [])

  useEffect(() => {
    if (!IDLE_DEMAND) return
    window.addEventListener('keydown', wake)
    return () => window.removeEventListener('keydown', wake)
  }, [wake])

  const handleModelsLoaded = useCallback(() => {
    setLoadingPhase('transitioning')
  }, [])

  const handleTransitionComplete = useCallback(() => {
    setLoadingPhase('ready')
  }, [])

  const handleGalleryError = useCallback((_category: string, err: Error) => {
    setGalleryError(err.message || 'Failed to load the gallery model')
  }, [])

  const retryGallery = useCallback(() => {
    // Purge the cached rejections, then remount the loader block
    config?.files.forEach((f) => useLoader.clear(GLTFLoader, f.url))
    setLoadedCount(0)
    setGalleryError(null)
    setModelsKey((k) => k + 1)
    wake()
  }, [config, wake])

  useEffect(() => {
    if (config) {
      setTotalCount(config.files.length)
    }
  }, [config])

  // The catalogue tree and the room's products. ProductInteraction fetches
  // products.json too, but that copy lives inside the Canvas and drives the
  // raycast; the HUD needs its own to resolve a catalogue pick.
  useEffect(() => {
    Promise.all([
      fetch('/config/catalog.json').then((r) => r.json()),
      fetch('/config/products.json').then((r) => r.json())
    ])
      .then(([cat, prods]) => {
        setCatalog(cat)
        setProducts(prods)
      })
      .catch((err) => console.error('Failed to load catalog:', err))
  }, [])

  /** Take off — shared by menu picks and direct taps */
  const beginFocus = useCallback(
    (pending: PendingFocus) => {
      setSelectedProduct(null)
      setFocusedName(null)
      setFocusedId(null)
      setFocusedKey(null)
      setPendingFocus(pending)
      setFocusTarget(pending.sceneObject)
      wake()
    },
    [wake]
  )

  /** Menu pick → fly the camera to the product's mesh */
  const handleCatalogSelect = useCallback(
    (item: CatalogItem) => {
      if (!products[item.sceneObject]) {
        console.warn(
          `[Scene] Catalogue item "${item.id}" points at sceneObject "${item.sceneObject}", ` +
            'which is not in products.json. Known keys:',
          Object.keys(products)
        )
        return
      }
      const base = products[item.sceneObject]
      beginFocus({
        sceneObject: item.sceneObject,
        id: base.id,
        fallbackPoint: base.billboardPosition,
        focus: item.focus,
        item
      })
    },
    [products, beginFocus]
  )

  /** Open the drawer and show the name chip. Shared by the landed and the
   *  couldn't-fly paths so a failed flight is never a dead end. */
  const revealProduct = useCallback(
    (pending: PendingFocus) => {
      const resolved = pending.item
        ? resolveCatalogItem(pending.item, products)
        : pending.product
      if (!resolved) return

      selectFurniture(pending.id || pending.sceneObject, pending.object ?? null)
      initializeColor()
      setSelectedProduct(resolved)
      setFocusedName(pending.item?.name ?? resolved.name)
      setFocusedKey(pending.sceneObject)
      // Likes are per catalogue entry; a direct tap has no catalogue identity
      setFocusedId(pending.item?.id ?? null)
    },
    [products, selectFurniture, initializeColor]
  )

  /** Flight landed */
  const handleFocusArrive = useCallback(() => {
    setFocusTarget(null)
    const pending = pendingFocus
    setPendingFocus(null)
    if (pending) revealProduct(pending)
  }, [pendingFocus, revealProduct])

  /** No flight was possible — reveal the product where the player stands */
  const handleFocusMiss = useCallback(() => {
    setFocusTarget(null)
    const pending = pendingFocus
    setPendingFocus(null)
    if (pending) revealProduct(pending)
  }, [pendingFocus, revealProduct])

  const closeProduct = useCallback(() => {
    setSelectedProduct(null)
    setSelectedObjectPosition(null)
    setFocusedName(null)
    setFocusedId(null)
    setFocusedKey(null)
    playerStartPosRef.current = null
  }, [])

  const resetCameraAndView = useCallback(() => {
    closeProduct()
    const playerStart = config?.camera?.playerStart ?? [0, 2, 5]
    const lookAtEnd = config?.camera?.lookAtEnd ?? [playerStart[0], playerStart[1], playerStart[2] - 5]

    beginFocus({
      sceneObject: '__HOME__',
      absolutePose: {
        position: playerStart as [number, number, number],
        lookAt: lookAtEnd as [number, number, number]
      }
    })
  }, [closeProduct, beginFocus, config])

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen message={error} />
  if (!config) return <ErrorScreen message="No store config found" />

  return (
    <>
      {/* Pointer input (look-drag, product clicks) wakes the demand loop */}
      <div
        className="h-full w-full"
        onPointerDownCapture={wake}
        onPointerMoveCapture={(e) => {
          if (e.buttons !== 0) wake()
        }}
      >
      <Canvas
        shadows
        style={{ touchAction: 'none' }}
        frameloop={IDLE_DEMAND ? 'demand' : 'always'}
        dpr={dpr}
        gl={{
          // AA lives in the EffectComposer (multisampling/SMAA per quality
          // tier) — canvas MSAA was paid for but never displayed
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.3,
        }}
        camera={{ position: config.camera?.playerStart ?? [0, 2, 5], fov: 60, near: 0.1, far: 200 }}
        onCreated={(state) => {
          r3fRef.current = state
        }}
      >
        <Physics
          gravity={[0, -30, 0]}
          timeStep={IDLE_DEMAND ? 1 / 60 : 'vary'}
          paused={IDLE_DEMAND && idle && loadingPhase === 'ready'}
        >
          {/* Sustained-FPS ladder + adaptive DPR during movement/look input
              (shared with the /car scene) */}
          <PerfLadder onScale={setPerfScale} adaptive={settings.adaptiveDpr} />

          {/* Demand-loop governor: frames flow while there is input or a
              transition; the loop parks (0 GPU) when the player stands still */}
          <ActivityGovernor
            forceActive={!IDLE_DEMAND || loadingPhase !== 'ready' || gyroEnabled || !!focusTarget}
            onIdleChange={setIdle}
          />

          {/* HDRI lighting — cubemap resolution follows the quality tier */}
          <Suspense fallback={null}>
            <Environment
              files="/hdr/main_hdr.exr"
              background={false}
              environmentIntensity={.8}
              resolution={settings.envResolution}
            />
          </Suspense>

          {/* Vitrine spotlight — kept shadowless on purpose (PCSS is global) */}
          <pointLight position={[0, 10, -1.5]} intensity={5} distance={20} decay={.7} color="#ffffff" />

          {/* Sun through the window + PCSS soft shadows — per-store on/off in
              stores.json. SoftShadows patches the global shadow shader chunk;
              mounting it here (Canvas is up only after config resolves) means
              GLB materials stream in and compile against the patched chunk. */}
          {config.sun?.enabled && (
            <>
              <ShadowSystem
                size={config.sun.soft?.size ?? 20}
                samples={config.sun.soft?.samples ?? 16}
                focus={config.sun.soft?.focus ?? 0}
              />
              <SunLight sun={config.sun} />
            </>
          )}

          {/* Lamps — meshes named *lamp* become real point lights + emissive
              glow. Glow is all-tier; real lights/shadows follow the quality tier.
              Re-collects anchors on gallery retry via modelsKey. */}
          <LampLights active={loadingPhase !== 'loading'} revision={modelsKey} config={config.lamps} />

          {/* Load models from config. A 404ing/corrupt gallery GLB is caught
              here instead of blanking the page. */}
          <Suspense fallback={null} key={modelsKey}>
            <PartErrorBoundary category="gallery" onError={handleGalleryError}>
              <ModelLoader files={config.files} onModelsLoaded={handleModelsLoaded} onProgress={setLoadedCount} />
            </PartErrorBoundary>
          </Suspense>

          {/* Scene transition effects */}
          <SceneTransition
            isTransitioning={loadingPhase === 'transitioning'}
            onComplete={handleTransitionComplete}
          />
          <CameraTransition
            isTransitioning={loadingPhase === 'transitioning'}
            targetPosition={config.camera?.transitionTarget ?? [24, 2.8, 12]}
            startPosition={config.camera?.transitionStart}
            lookAtStart={config.camera?.lookAtStart}
            lookAtEnd={config.camera?.lookAtEnd}
          />
          <ParticleReveal isTransitioning={loadingPhase === 'transitioning'} />


          {/* Physics system - only after transition ready */}
          {loadingPhase === 'ready' && (
            <PhysicsManager
              onJoystickInputReady={setJoystickInputRef}
              gyroEnabled={gyroEnabled}
              playerStart={config.camera?.playerStart ?? [0, 2, 5]}
              cameraHeight={config.camera?.cameraHeight}
              focusTarget={focusTarget}
              focusId={pendingFocus?.id}
              focusFallbackPoint={pendingFocus?.fallbackPoint}
              focusOverride={pendingFocus?.focus}
              absolutePose={pendingFocus?.absolutePose}
              onFocusArrive={handleFocusArrive}
              onFocusMiss={handleFocusMiss}
              selectedProduct={selectedProduct}
              playerStartPosRef={playerStartPosRef}
              movementThreshold={MOVEMENT_THRESHOLD}
              onCloseProduct={closeProduct}
            />
          )}

          {/* Product click interaction */}
          {loadingPhase === 'ready' && (
            <ProductInteraction
              onProductClick={(product, position, clickedObject, productKey) => {
                if (!product) return
                setSelectedObjectPosition(position || null)
                // Lookup catalog item to unify behavior with category selection
                const catalogItem = catalog
                  ? findCatalogItemBySceneObject(catalog, productKey || product.id)
                  : null
                // Same flight as a menu pick: tapping a sofa you're standing
                // behind should still bring you round to its front
                beginFocus({
                  sceneObject: productKey || product.id,
                  id: product.id,
                  fallbackPoint: product.billboardPosition,
                  focus: catalogItem?.focus,
                  item: catalogItem ?? undefined,
                  product,
                  object: clickedObject || null
                })
              }}
            />
          )}



          {/* Furniture color applier - applies colors to scene furniture */}
          {loadingPhase === 'ready' && <FurnitureColorApplier />}

          {/* Reflective Floor — resolution/off-switch follow the quality tier
              (the reflection pass re-renders the scene every drawn frame) */}
          {/* <ReflectiveFloor
            opacity={.1}
            size={30}
            mixStrength={.4}
            blur={0.5

            }
            roughness={.8}
            resolution={settings.floorReflectionResolution}
            enabled={settings.floorReflectionsEnabled}
            receiveShadow={config.sun?.enabled ?? false}
          />  
          */}
          {/* Post-Processing (tier-driven; SSGI lazy on ultra opt-in) */}
          <PostProcessing />
        </Physics>
      </Canvas>
      </div>

      {/* Product Drawer - 2D bottom sheet. No backdrop: the canvas below stays
          interactive so look-drag and the joystick keep working while it's open */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductDrawer
            key={focusedId ?? selectedProduct.id}
            product={selectedProduct}
            productKey={focusedKey}
            onClose={closeProduct}
            onViewAR={() => {
              setArProduct(selectedProduct)
              setShowAR(true)
              setSelectedProduct(null)
            }}
            onAddToCart={() => addToCart(focusedId ?? selectedProduct.id)}
          />
        )}
      </AnimatePresence>

      {/* AR Product Viewer - outside Canvas */}
      {showAR && arProduct?.glbPath && (
        <ARProductViewer
          glbPath={arProduct.glbPath}
          usdzPath={arProduct.usdzPath || ''}
          productName={arProduct.name}
          onClose={() => {
            setShowAR(false)
            setArProduct(null)
          }}
        />
      )}

      {/* Loading indicator while models load */}
      {loadingPhase !== 'ready' && !galleryError && (
        <ModelsLoadingIndicator
          fadeOut={loadingPhase === 'transitioning'}
          loadedCount={loadedCount}
          totalCount={totalCount}
        />
      )}

      {/* Gallery model failed — styled recovery instead of a dead black stage */}
      {galleryError && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-[#060608]/95 px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">Gallery</p>
          <h2 className="text-xl font-extralight uppercase tracking-[0.2em] text-white">
            Gallery could not be loaded
          </h2>
          <p className="max-w-sm text-sm text-white/40">{galleryError}</p>
          <button
            onClick={retryGallery}
            className="mt-2 rounded-full border border-white/15 px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-white/70 transition-colors hover:border-white/40 hover:text-white"
          >
            Try again
          </button>
        </div>
      )}

      {/* Virtual joystick for mobile - only after ready */}
      {loadingPhase === 'ready' && joystickInputRef && (
        <VirtualJoystick
          joystickInput={joystickInputRef}
          onActivity={wake}
          hidden={showAR || !!focusTarget}
          liftPx={selectedProduct ? 168 : 0}
        />
      )}

      {/* Top HUD + category browser. The container is pointer-transparent so
          look-drag still reaches the canvas in the gaps between controls. */}
      {loadingPhase === 'ready' && (
        <>
          <div
            dir="rtl"
            className="font-persian pointer-events-none fixed inset-x-0 top-0 z-30
                       px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6 md:pt-5"
          >
            {/* Full-bleed: the bar's controls must hug the real screen corners,
                not a centred column */}
            <StoreTopBar
              onOpenMenu={() => setSidebarOpen(true)}
              productName={focusTarget ? null : focusedName}
              productId={focusedId}
            >
              {loadingPhase === 'ready' && <GyroToggle onGyroChange={setGyroEnabled} />}
            </StoreTopBar>

            {/* The drill-down stays a readable column, anchored to the RTL
                start edge under the menu button */}
            <div className="md:max-w-[420px]">
              <CategoryBar
                catalog={catalog}
                onSelect={handleCatalogSelect}
                collapsed={!!focusTarget}
              />
            </div>
          </div>

          <StoreSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onResetCamera={resetCameraAndView}
          />
        </>
      )}

      {/* Background audio */}
      <AudioPlayer />


      {/* Bottom-left logo */}
      <div style={{
    left:' 1rem',
    maxWidth: '8rem',
    height: 'auto',
    bottom: '1rem',

      }} className="fixed bottom-6 left-6 md:bottom-8 md:left-8 z-10 pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/Furnitures OC LOGO.png"
          alt="OC furniture logo"
          className="h-16 md:h-20 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300"
          style={{
            filter: "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3))",
          }}
        />
      </div>
    </>
  )
}
