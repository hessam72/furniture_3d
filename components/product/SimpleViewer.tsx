'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type RootState } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { NeutralToneMapping } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerfLadder } from '@/components/three/PerfLadder'
import { RendererStatsProbe } from '@/components/three/RendererStatsProbe'
import { isDebug } from '@/components/three/rendererStatsStore'
import { extendGltfLoader } from '@/lib/three/gltfLoaders'
import { useCanvasLifecycle } from '@/hooks/useCanvasLifecycle'
import { PartErrorBoundary } from '@/components/three/PartErrorBoundary'
import { clampDprToBudget } from '@/lib/three/dprBudget'
import { useQuality } from '@/contexts/QualityContext'
import { collectZoneTargets, disposeTargets, preparePresentationObject } from '@/lib/three/layerMaterials'
import { applyAnisotropy } from '@/lib/three/prepareCarMaterial'
import { applyFirstCoat, useZonePaint } from '@/hooks/useZonePaint'
import { usePresentation } from '@/stores/presentationStore'
import {
  simpleViewer,
  type PresentationConfig,
  type PresentationZone,
  type ResolvedSimpleViewer,
} from '@/lib/product/presentation'
import ViewerPlinth, { type PlinthSpec } from './ViewerPlinth'

// DRACO's path, the KTX2 transcoder's path and the one-instance-each rule all
// live in lib/three/gltfLoaders now. @see extendGltfLoader

/** Never let the control panel claim more than this much of the height, however
 *  tall it measures — past it the piece has no frame left to be judged in. */
const MAX_PANEL_COVERAGE = 0.5

/** The opening three-quarter view: slightly off-axis and slightly above, which
 *  is how furniture is photographed. Normalised on use. */
const OPENING_DIR = new THREE.Vector3(0.55, 0.3, 1)

/** The polar angle of that opening view — the elevation a `lockPolar` viewer is
 *  pinned to, so a drag turns the piece and never tips it. */
const OPENING_POLAR = Math.acos(OPENING_DIR.y / OPENING_DIR.length())

/**
 * The finished piece, centred on the origin.
 *
 * Every mesh becomes a `cover` paint target. On the full presentation page the
 * zone is implied by which layer GLB a mesh came from; here there is one file
 * and no ladder, so the whole piece takes the cover palette — the same call
 * CoverLayer already makes for this exact model.
 *
 * Deliberately **not** matted. `isMatte` exists on the full page because an HDR
 * reflecting into the upholstery shifted the colours away from the hex the
 * buyer picked in a room already lit by spots. Here the environment is the only
 * light there is, and showing what it does to the material is the point of the
 * page.
 */
function Piece({
  path,
  envIntensity,
  onRadius,
  sourceRef,
  plinth,
  zone,
  paintable = true,
}: {
  path: string
  envIntensity: number
  /** The piece's bounding-sphere radius, once measured — the camera frames on
   *  it and cannot solve anything before it arrives. */
  onRadius: (radius: number) => void
  /** Publishes the raw cached GLTF scene — not the painted clone below — for an
   *  host page to inspect outside the Canvas. */
  sourceRef?: React.MutableRefObject<THREE.Object3D | null>
  /** Stands the piece on a plinth. @see ViewerPlinth */
  plinth?: PlinthSpec
  /** Which palette this file wears. The frame is `wood`, a cover variant is
   *  `cover` — one file at a time, so one zone at a time. */
  zone: PresentationZone
  /** False leaves the GLB's own materials alone. @see Props.paintable */
  paintable?: boolean
}) {
  const gltf = useGLTF(path, false, true, extendGltfLoader)
  const { settings } = useQuality()
  const invalidate = useThree((s) => s.invalidate)
  // Read at clone time without making the clone depend on it. @see below.
  const anisotropyRef = useRef(settings.anisotropyLevel)
  anisotropyRef.current = settings.anisotropyLevel

  const { scene, targets, radius, bottom, footprint } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    preparePresentationObject(clone, {
      envMapIntensity: envIntensity,
      // Whatever the tier is on this render. The effect below keeps it current
      // without rebuilding the scene — @see the note under this memo.
      anisotropy: anisotropyRef.current,
      // No sun on this page, so no mesh takes part in a shadow pass and no
      // shadow map is ever allocated.
      shadows: false,
    })

    // An unpainted piece keeps every material the file shipped with — nothing
    // is cloned, so nothing is recoloured and nothing needs disposing.
    const collected = paintable ? collectZoneTargets(clone, { zone }) : []
    if (paintable) applyFirstCoat(collected, usePresentation.getState().paint)

    // Centred rather than seated: with the piece's own centre on the origin,
    // the orbit turns it in place and the camera's distance is simply its
    // position's length. Seating it on a floor there is no floor for would put
    // the pivot at its feet and swing it round the frame as you drag.
    const box = new THREE.Box3().setFromObject(clone)
    clone.position.sub(box.getCenter(new THREE.Vector3()))

    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const size = box.getSize(new THREE.Vector3())
    return {
      scene: clone,
      targets: collected,
      radius: sphere.radius,
      // Measured *after* the centring above, so both are in the space the
      // plinth is placed in: the underside, and half the footprint.
      bottom: -size.y / 2,
      footprint: Math.max(size.x, size.z) / 2,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, path, envIntensity, zone, paintable])

  /**
   * Anisotropy is applied to the existing clone, not baked into the memo above.
   *
   * It used to be a dependency, which meant a tap on the quality chips —
   * available on this page and only this page — re-cloned the entire scene
   * graph, re-cloned every material, disposed the old set and compiled a fresh
   * set of programs. To change a texture filter. FurnitureStack has excluded it
   * from its own deps deliberately for exactly this reason; this is the same
   * decision, made explicit rather than by omission.
   */
  useEffect(() => {
    scene.traverse((child) => {
      const material = (child as THREE.Mesh).material
      if (!material) return
      const list = Array.isArray(material) ? material : [material]
      list.forEach((entry) => applyAnisotropy(entry, settings.anisotropyLevel))
    })
    invalidate()
  }, [scene, settings.anisotropyLevel, invalidate])

  useZonePaint(targets)
  useEffect(() => () => disposeTargets(targets), [targets])

  useEffect(() => {
    if (!sourceRef) return
    sourceRef.current = gltf.scene
    return () => {
      sourceRef.current = null
    }
  }, [sourceRef, gltf.scene])
  // A plinth reaches past the piece on every side, so the fit has to be solved
  // against the pair or the stage clips out of frame at some angles.
  useEffect(() => onRadius(plinth ? radius * 1.2 : radius), [radius, plinth, onRadius])

  return (
    <>
      <primitive object={scene} />
      {plinth && <ViewerPlinth spec={plinth} bottom={bottom} radius={footprint} />}
    </>
  )
}

/**
 * Frames the piece from its measured size, the live canvas aspect, and how much
 * of the screen the control panel is standing on.
 *
 * A fixed distance frames a desktop window and a portrait phone completely
 * differently, because `fov` is vertical — so the fit solves for whichever of
 * the two half-angles is tighter. The panel then narrows the vertical one
 * further: the piece has to fit the band *above* it, not the whole canvas, or
 * it is framed perfectly into a strip of screen the viewer cannot see.
 *
 * `setViewOffset` does the lift rather than a moved camera or an offset model,
 * and that is the only version that survives an orbit: it shifts the frustum
 * window, so the piece still turns about its own centre and the controls still
 * aim at the origin. Moving either would put the pivot off the piece and turn
 * a rotation into an orbit around empty space.
 *
 * Re-run on a resize, an orientation change or a panel that grows, keeping the
 * viewer's own orbit and dolly (as a fraction of the previous fit) rather than
 * snapping back to the opening shot.
 */
function Frame({
  radius,
  coverage,
  view,
  controls,
}: {
  radius: number
  /** Fraction of the viewport height the control panel covers. */
  coverage: number
  view: ResolvedSimpleViewer
  controls: React.MutableRefObject<OrbitControlsImpl | null>
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const fitted = useRef(0)

  useEffect(() => {
    if (!radius || !Number.isFinite(radius)) return

    const hidden = Math.min(Math.max(coverage, 0), MAX_PANEL_COVERAGE)
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    // The usable half-angles: vertical shrunk by the band the panel leaves,
    // horizontal opened by the aspect.
    const vHalf = Math.atan(halfFov * (1 - hidden))
    const hHalf = Math.atan(halfFov * (size.width / size.height))
    const distance = (radius / Math.sin(Math.min(vHalf, hHalf))) * view.padding

    const previous = fitted.current
    fitted.current = distance

    // Tight around the piece, so depth precision is spent where the geometry
    // actually is.
    camera.near = Math.max(0.01, radius / 100)
    camera.far = distance * 6

    const direction = previous ? camera.position.clone().normalize() : OPENING_DIR.clone().normalize()
    const keep = previous ? camera.position.length() / previous : 1
    camera.position.copy(direction).multiplyScalar(distance * keep)
    camera.lookAt(0, 0, 0)

    // A positive offsetY walks the frustum window down the virtual image, which
    // is what carries the piece up the screen — half the panel's coverage puts
    // it in the middle of what is left. Also updates the projection matrix, so
    // it goes last.
    if (hidden > 0) camera.setViewOffset(size.width, size.height, 0, (size.height * hidden) / 2, size.width, size.height)
    else camera.clearViewOffset()

    const orbit = controls.current
    if (orbit) {
      orbit.target.set(0, 0, 0)
      orbit.minDistance = distance * view.minZoom
      orbit.maxDistance = distance * view.maxZoom
      orbit.update()
    }
    invalidate()
  }, [radius, coverage, view, size.width, size.height, camera, controls, invalidate])

  return null
}

/**
 * Hands the page back the one gesture it cannot do without.
 *
 * OrbitControls sets `touch-action: none` on the canvas when it connects, which
 * on a phone means a swipe up over the piece rotates it instead of scrolling
 * the page — the viewer becomes a hole the reader falls into. `pan-y` gives
 * vertical drags back to the browser and keeps everything else for the viewer:
 * a horizontal drag still turns the piece, and a two-finger pinch still dollies,
 * because the browser has no `pan-y` meaning for it.
 *
 * Mounted after OrbitControls so its effect runs last and wins.
 */
function EmbeddedGestures() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.domElement.style.touchAction = 'pan-y'
  }, [gl])
  return null
}

interface Props {
  config: PresentationConfig
  /** Fraction of the viewport height the control panel covers, measured by the
   *  page. The piece is framed into what it leaves. @see Frame */
  coverage: number
  /** Raised once the piece is measured — the page holds its splash until then. */
  onReady: () => void
  onError: (category: string, error: Error) => void
  /** Optional: receives the loaded GLB so the host page can export it for AR
   *  with the live colours applied. Left out, nothing is published. */
  sourceRef?: React.MutableRefObject<THREE.Object3D | null>
  /** Pins the camera's elevation so a drag only spins the piece. Off by
   *  default — /product/[id]/simple keeps its free orbit. */
  lockPolar?: boolean
  /** Stands the piece on a plinth instead of on nothing. @see ViewerPlinth */
  plinth?: PlinthSpec
  /** The palette the mounted file wears. Defaults to `cover`, which is the
   *  finished piece — pass `wood` when showing the bare frame. */
  zone?: PresentationZone
  /** The viewer sits inside a page that scrolls: gives vertical touch drags
   *  back to the document. Zoom is untouched. @see EmbeddedGestures */
  embedded?: boolean
  /**
   * Whether the swatch palette dresses what is mounted. On by default, which is
   * what every configurator surface wants.
   *
   * Off for a model nobody configured — an uploaded GLB is shown as its author
   * exported it, and painting it would repaint every mesh in the store's
   * current cover colour. @see /view/[id]
   */
  paintable?: boolean
  /** Names this renderer in the `?debug` readout — three routes mount this
   *  component and the overlay has to tell them apart. */
  label?: string
  /** The GPU dropped the buffer. The host decides what to show. */
  onContextLost?: () => void
}

/**
 * A plain product viewer: one GLB, one HDR, on a flat ground.
 *
 * The full presentation page is a room — a modelled booth, a window sun with a
 * PCSS shadow map, a post chain and a layer ladder. None of that is here, and
 * its absence is the feature: no shadow map, no composer and no second scene
 * render, so what the GPU spends goes entirely into the piece. Two consequences
 * worth naming:
 *
 *  - **Canvas MSAA, not SMAA.** With no composer to bypass it, `antialias` is
 *    live again — and on the tile-based GPU in every phone and every Apple
 *    machine, multisampling resolves inside tile memory, which is far cheaper
 *    than the two full-resolution targets an SMAA pass allocates. The page gets
 *    better edges for less than the heavy one pays.
 *  - **A demand loop that genuinely parks.** Nothing here animates on its own.
 *    OrbitControls invalidates while it is damping and stops when it settles,
 *    so a viewer who is not touching the screen costs zero frames.
 *
 * Everything it draws comes from the manifest's `simple` block, defaults filled
 * in. @see SimpleViewerMeta
 */
export default function SimpleViewer({
  config,
  coverage,
  onReady,
  onError,
  sourceRef,
  lockPolar,
  plinth,
  embedded,
  zone = 'cover',
  paintable = true,
  label = 'viewer',
  onContextLost,
}: Props) {
  const { settings } = useQuality()
  const [perfScale, setPerfScale] = useState(1)
  const [radius, setRadius] = useState(0)
  const controls = useRef<OrbitControlsImpl | null>(null)

  const view = useMemo(() => simpleViewer(config), [config])
  const envIntensity = view.envIntensity ?? settings.envIntensity

  const dpr = useMemo<[number, number]>(() => {
    const [min, max] = clampDprToBudget(settings.dpr)
    return [min, Math.max(min, +(max * perfScale).toFixed(2))]
  }, [settings.dpr, perfScale])

  const handleRadius = useCallback(
    (value: number) => {
      setRadius(value)
      if (value) onReady()
    },
    [onReady]
  )

  // Nothing here allocates enough to lose a context on its own — but this
  // viewer is also what /showroom and /view mount, and a page that cannot
  // report a loss leaves the viewer staring at a frozen frame.
  const handleCreated = useCanvasLifecycle({ label, onContextLost })

  return (
    <Canvas
      /* Explicitly off. No light on this page casts, so three never allocates a
         shadow map — which is the single largest buffer the heavy page holds. */
      shadows={false}
      frameloop="demand"
      dpr={dpr}
      style={{ touchAction: embedded ? 'pan-y' : 'none', background: view.background }}
      gl={{
        // Live, unlike every other scene in the app: those route their output
        // through an EffectComposer, which renders past the canvas's own
        // multisampled buffer and makes paying for it pure waste. @see the note
        // on the component.
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: NeutralToneMapping,
        toneMappingExposure: 1,
      }}
      camera={{ position: [0, 0, 4], fov: view.fov, near: 0.1, far: 100 }}
      onCreated={handleCreated}
    >
      <color attach="background" args={[view.background]} />

      {/* Sustained-FPS ladder only. AdaptiveDpr is deliberately left off: it
          drops resolution while the camera moves, and on a page whose whole
          purpose is judging a finish, a piece that goes soft the moment you
          turn it is the wrong trade. */}
      <PerfLadder onScale={setPerfScale} adaptive={false} />

      {/* The image-based light, and the reason the material reads as leather or
          velvet rather than as flat colour. Its own boundary: `useEnvironment`
          suspends while the HDR downloads, and without one that would unmount
          the piece until it lands. */}
      <Suspense fallback={null}>
        {view.hdr && (
          <Environment files={view.hdr} background={false} environmentIntensity={envIntensity} />
        )}
      </Suspense>

      {/* A studio fill over the top of the HDR, not a sun — no `castShadow`
          anywhere, so there is still no shadow pass. The key gives the piece
          its form where an interior HDR alone would leave it flat; the low
          ambient keeps the shaded side off pure black against the ground. */}
      <ambientLight intensity={view.lighting.ambient} />
      <directionalLight position={[4, 6, 5]} intensity={view.lighting.key} />
      <directionalLight position={[-5, 2, -3]} intensity={view.lighting.fill} />

      <Suspense fallback={null}>
        <PartErrorBoundary category="piece" onError={onError}>
          <Piece
            path={view.model}
            envIntensity={envIntensity}
            onRadius={handleRadius}
            sourceRef={sourceRef}
            plinth={plinth}
            zone={zone}
            paintable={paintable}
          />
        </PartErrorBoundary>
      </Suspense>

      <Frame radius={radius} coverage={coverage} view={view} controls={controls} />

      {/* Rotate and dolly, nothing else. Panning would slide the piece off the
          pivot the orbit turns about, which is the one thing this camera must
          not do. */}
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.85}
        zoomSpeed={0.8}
        // Locked, both limits on the opening elevation, when the host asked for
        // a turntable: the piece spins and never tips. Otherwise stop short of
        // the poles — at the exact top the azimuth is undefined and the piece
        // spins on the spot as you drag past it.
        minPolarAngle={lockPolar ? OPENING_POLAR : 0.15}
        maxPolarAngle={lockPolar ? OPENING_POLAR : Math.PI - 0.35}
      />

      {embedded && <EmbeddedGestures />}

      {isDebug() && <RendererStatsProbe label={label} />}
    </Canvas>
  )
}
