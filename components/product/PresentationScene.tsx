'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type RootState } from '@react-three/fiber'
import { ACESFilmicToneMapping, NeutralToneMapping, type Box3 } from 'three'
import { PerfLadder } from '@/components/three/PerfLadder'
import { PartErrorBoundary } from '@/components/car/PartErrorBoundary'
import { clampDprToBudget } from '@/lib/three/dprBudget'
import { useQuality } from '@/contexts/QualityContext'
import {
  lightingMode,
  needsEnvironment,
  roomMode,
  STORE_RENDER,
  sunEnabled,
  type PresentationConfig,
} from '@/lib/product/presentation'
import type { ExportSources } from '@/lib/three/exportConfigured'
import PresentationEnvironment from './PresentationEnvironment'
import PresentationLighting from './PresentationLighting'
import PresentationRoom, { type RoomBounds } from './PresentationRoom'
import PresentationSun from './PresentationSun'
import PresentationFloor from './PresentationFloor'
import PresentationBackdrop from './PresentationBackdrop'
import PresentationGestures from './PresentationGestures'
import { PresentationPostProcessing } from './PresentationPostProcessing'
import FurnitureStack, { type StackControls, type StackFraming } from './FurnitureStack'
import PresentationDiagnostics from './PresentationDiagnostics'
import { SceneReady } from './PresentationLoading'

interface Props {
  config: PresentationConfig
  onLayerError?: (category: string, error: Error) => void
  /** Raised once the piece is measured, the room is in, and the programs are
   *  compiled — the page holds its splash until then. @see SceneReady */
  onReady?: () => void
  /** The GPU dropped the drawing buffer. Not a React error, so no error
   *  boundary can see it — the page has to be told. @see the handler on
   *  ProductPageClient for why it must unmount this Canvas. */
  onContextLost?: () => void
  /** Owned by the page so the AR export, which lives outside the Canvas, can
   *  reach the loaded GLTFs. Same ref-passing idiom as `controls`/`framing`. */
  sources?: React.MutableRefObject<ExportSources>
}

/**
 * Why the static half of this tree is memoised.
 *
 * Everything below except the furniture is fixed for the life of the page: the
 * room GLB, the environment, the rig, the sun and the reflective floor never
 * change once they have loaded. Only the piece moves, and it moves through refs
 * and per-frame damping rather than through React.
 *
 * This component, though, re-renders for reasons that have nothing to do with
 * any of that — `perfScale` steps whenever PerformanceMonitor decides the frame
 * rate has moved, and `roomBox` lands when the room resolves. Without memos
 * every one of those walked the whole scene again. Two of the children pay real
 * money for that: the floor rebuilds its reflection render targets (see the
 * note on NO_BLUR in PresentationFloor — 10MB a time, undisposed), and the
 * composer re-enters EffectComposer.
 *
 * So the props below are all stable by construction — `config` comes from the
 * server payload, the refs and `setRoomBox` are identities React guarantees —
 * and each child is wrapped in `memo`. The children still re-render for the
 * things that genuinely concern them: a quality-tier change through
 * `useQuality`, `roomBox` arriving, the store for the ones that read it.
 */
export default function PresentationScene({ config, onLayerError, onReady, onContextLost, sources }: Props) {
  const { settings } = useQuality()
  const backdrop = roomMode(config)
  const needsIBL = needsEnvironment(config)
  // A room GLB is authored and checked under /store's renderer. Its materials
  // only read correctly through the same tone-mapping curve and exposure, so
  // store mode brings both across rather than re-grading the asset by hand.
  const store = lightingMode(config) === 'store'
  // The page's only shadow map, and only when a product asks for it.
  const sun = sunEnabled(config)
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
  const [perfScale, setPerfScale] = useState(1)

  // Spin/tilt targets live in a ref shared with the gesture layer — writing
  // them to zustand at 60Hz would re-render the bottom sheet every frame.
  const controls = useRef<StackControls>({ yaw: 0, pitch: 0 })
  // Written by the stack once it has measured the frame layer, read by the
  // camera rig to compute a distance that actually fits this canvas.
  const framing = useRef<StackFraming | null>(null)
  // The walls, when there are any — the rig clamps against these so a re-frame
  // cannot reverse the camera through the back of the room.
  const roomBounds = useRef<RoomBounds | null>(null)
  // The same box again, as state: the gallery rig is JSX and has to re-render
  // when the room resolves. The ref stays because the camera polls it per frame.
  const [roomBox, setRoomBox] = useState<Box3 | null>(null)

  // Registered in onCreated; R3F disposes the renderer on unmount but leaves
  // listeners we added to its canvas.
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])

  /**
   * Context loss is what is left once the memory budget is under control: a
   * backgrounded tab, another page taking a context, a driver reset.
   * `preventDefault()` is what makes it recoverable at all — without it the
   * browser never fires `restored`.
   */
  const handleCreated = useCallback(
    ({ gl, invalidate }: RootState) => {
      gl.localClippingEnabled = true

      const canvas = gl.domElement
      const lost = (event: Event) => {
        event.preventDefault()
        onContextLost?.()
      }
      // Repaints where the browser gives us a restore; the page's retry covers
      // the browsers that never do.
      const restored = () => invalidate()

      canvas.addEventListener('webglcontextlost', lost, false)
      canvas.addEventListener('webglcontextrestored', restored, false)
      cleanupRef.current = () => {
        canvas.removeEventListener('webglcontextlost', lost)
        canvas.removeEventListener('webglcontextrestored', restored)
      }
    },
    [onContextLost]
  )

  const dpr = useMemo<[number, number]>(() => {
    const [min, max] = clampDprToBudget(settings.dpr)
    return [min, Math.max(min, +(max * perfScale).toFixed(2))]
  }, [settings.dpr, perfScale])

  return (
    <div
      className="h-full w-full"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
    >
      <Canvas
        /* Off unless the product configures a sun: with no `sun` block this
           page still renders with no shadow maps at all. */
        shadows={sun}
        frameloop="demand"
        dpr={dpr}
        style={{ touchAction: 'none' }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: store ? ACESFilmicToneMapping : NeutralToneMapping,
          toneMappingExposure: store ? STORE_RENDER.exposure : 1.0,
        }}
        camera={{
          // A placeholder only — PresentationGestures re-frames from the
          // piece's measured bounds before the first drawn frame.
          position: [0, 1.2, 4],
          fov: config.camera.fov,
          near: config.camera.near ?? 0.1,
          // The stage is a booth — 40 rather than 1000 keeps depth precision
          // tight, which is what N8AO reads from.
          far: config.camera.far ?? 40,
        }}
        onCreated={handleCreated}
      >
        <PerfLadder onScale={setPerfScale} adaptive={settings.adaptiveDpr} />

        {/* Matte does NOT mean "no environment" — it means the *furniture*
            takes none, and that is enforced per-material (envMapIntensity 0),
            so it holds whether or not an environment exists. A room GLB is
            authored to be lit by one, so dropping it renders the room black.
            Hence: IBL whenever a modelled room needs it, or matte is off. */}
        {/* Suspense-wrapped on its own: `useEnvironment` suspends while the HDR
            downloads, and without a boundary of its own that unmounts the whole
            canvas subtree until it lands. */}
        <Suspense fallback={null}>
          {needsIBL && <PresentationEnvironment config={config} />}
        </Suspense>
        {/* The studio rig is authored in absolute metres around a piece at the
            origin; a modelled room needs fixtures scaled to the room itself, or
            everything past the spot cones renders black. */}
        <PresentationLighting config={config} roomBox={roomBox} />

        {/* Sun through the room's window + PCSS soft shadows. Its frustum is
            fitted to `roomBox`, so it mounts before the room and re-solves once
            the bounds arrive. */}
        {sun && <PresentationSun sun={config.sun!} roomBox={roomBox} />}

        {/* Reflection laid over the room's own floor, sized from the same
            bounds. After the room in the tree only for readability — it draws
            in the transparent pass regardless. */}
        <PresentationFloor config={config} roomBox={roomBox} />

        <Suspense fallback={null}>
          <PartErrorBoundary category="room" onError={onLayerError}>
            {backdrop === 'image' && <PresentationBackdrop config={config} framing={framing} />}
            {backdrop === 'model' && (
              <PresentationRoom
                config={config as PresentationConfig & { room: { path: string } }}
                bounds={roomBounds}
                onBounds={setRoomBox}
              />
            )}
          </PartErrorBoundary>
        </Suspense>

        <Suspense fallback={null}>
          <PartErrorBoundary category="furniture" onError={onLayerError}>
            <FurnitureStack
              config={config}
              controls={controls}
              framing={framing}
              sources={sources}
              debug={debug}
            />
          </PartErrorBoundary>
        </Suspense>

        <PresentationGestures
          config={config}
          controls={controls}
          framing={framing}
          roomBounds={roomBounds}
        />

        {onReady && (
          <SceneReady
            framing={framing}
            needsRoom={backdrop === 'model'}
            roomBox={roomBox}
            onReady={onReady}
          />
        )}

        <PresentationPostProcessing config={config} />

        {debug && <PresentationDiagnostics />}
      </Canvas>
    </div>
  )
}
