'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type RootState } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerfLadder } from '@/components/three/PerfLadder'
import { RendererStatsProbe } from '@/components/three/RendererStatsProbe'
import { isDebug } from '@/components/three/rendererStatsStore'
import { extendGltfLoader } from '@/lib/three/gltfLoaders'
import { useCanvasLifecycle } from '@/hooks/useCanvasLifecycle'
import { useVramWatchdog } from '@/hooks/useVramWatchdog'
import { PartErrorBoundary } from '@/components/three/PartErrorBoundary'
import { COMPOSER_PIXEL_WEIGHT, clampDprToBudget } from '@/lib/three/dprBudget'
import { useQuality } from '@/contexts/QualityContext'
import {
  collectZoneTargets,
  describeObjectTree,
  disposeTargets,
  preparePresentationObject,
} from '@/lib/three/layerMaterials'
import { applyAnisotropy } from '@/lib/three/prepareCarMaterial'
import { applyFirstCoat, useZonePaint } from '@/hooks/useZonePaint'
import { applyFirstSwatch, useSwatchTextures } from '@/hooks/useSwatchTextures'
import { usePresentation } from '@/stores/presentationStore'
import {
  simpleViewer,
  SHADOW_BUDGET,
  type DeviceClass,
  type PresentationConfig,
  type PresentationPart,
  type PresentationZone,
  type ResolvedSimpleViewer,
} from '@/lib/product/presentation'
import PresentationSun from '@/components/product/PresentationSun'
import ViewerPlinth, { type PlinthSpec } from './ViewerPlinth'
import ViewerBackdrop from './ViewerBackdrop'

// DRACO's path, the KTX2 transcoder's path and the one-instance-each rule all
// live in lib/three/gltfLoaders now. @see extendGltfLoader

/** Never let the control panel claim more than this much of the height, however
 *  tall it measures — past it the piece has no frame left to be judged in. */
const MAX_PANEL_COVERAGE = 0.5

/** The same ceiling for a side dock. A panel wider than this leaves the piece
 *  squeezed into a column, which is worse than a panel that overlaps it. */
const MAX_DOCK_COVERAGE = 0.45

/**
 * How far touch hardware may raise its DPR ask above the tier's own ratio.
 *
 * The tier's `dpr[1]` is tuned for the composer pages, where the ratio itself
 * has to stay conservative because there is no per-pixel budget downstream of
 * it. Here there is — `clampDprToBudget` holds the real ceiling in absolute
 * pixels — so the ratio can ask past the tier and let the budget be what
 * binds, exactly as `lib/three/dprBudget.ts` intends. 2.2 against a phone's
 * `PIXEL_BUDGET.normal.phone` (28MB, `weight` 1) works out to DPR ~3.2 on an
 * iPhone 15's panel, so this is the ask, not the grant.
 */
const VIEWER_TOUCH_DPR_MAX = 2.2

/** A stable identity for an unset callback prop, so a component that always
 *  mounts its watcher does not hand it a fresh closure every render. */
const NOOP = () => {}

/** `simple.toneMapping` is a string — @see SimpleViewerMeta for why — mapped
 *  to the real constant here, the one file in this pipeline that already
 *  imports `three`. */
const TONE_MAPPINGS: Record<ResolvedSimpleViewer['toneMapping'], THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  'aces-filmic': THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
}

/**
 * What `<ContactShadows>` actually costs: a blur ping-pong pair, RGBA8, at
 * `resolution` each. Measured to ~2.1MB at 512² against the drei source, and
 * `reserveBytes` wants the same unit `dprBudget` prices the drawing buffer
 * in, so the two compete for one honestly-accounted allowance rather than the
 * shadow eating room the budget does not know it gave up.
 */
function contactShadowBytes(resolution: number): number {
  return resolution * resolution * 4 * 2
}

/**
 * What the real sun's shadow map costs: a depth-only render target at
 * `resolution` each side, priced generously at 4 bytes/pixel since the exact
 * depth format is driver-chosen. Only relevant on tablet — desktop is exempt
 * from `reserveBytes` by `clampDprToBudget` itself, and the sun never mounts
 * on phone at all. @see SHADOW_BUDGET
 */
function sunShadowBytes(resolution: number): number {
  return resolution * resolution * 4
}

/**
 * What the camera frames on: the piece's measured size.
 *
 * `radius` still sets the near/far planes and the zoom stops, where a
 * conservative bound is the right thing. The two extents are what the fit
 * actually solves against. @see Piece
 */
export interface Fit {
  radius: number
  horizontal: number
  vertical: number
  /** Y of the piece's underside, in the centred space the viewer draws in —
   *  where a ground belongs. @see ViewerBackdrop, ContactShadows */
  bottom: number
  /** Half the piece's footprint — what a ground shadow has to cover. */
  footprint: number
}

const EMPTY_FIT: Fit = { radius: 0, horizontal: 0, vertical: 0, bottom: 0, footprint: 0 }

/** The opening three-quarter view: slightly off-axis and slightly above, which
 *  is how furniture is photographed. Normalised on use. */
const OPENING_DIR = new THREE.Vector3(0.55, 0.3, 1)

/** The polar angle of that opening view — the elevation a `lockPolar` viewer is
 *  pinned to, so a drag turns the piece and never tips it. */
const OPENING_POLAR = Math.acos(OPENING_DIR.y / OPENING_DIR.length())

/**
 * How far a free drag may tip the camera.
 *
 * Polar angle runs 0 at directly overhead, π/2 level with the piece, π directly
 * underneath. The old lower stop of `Math.PI - 0.35` (≈160°) put the camera well
 * below the floor, so a drag down showed the underside of the couch — frame,
 * webbing, and whatever the model does not bother to author down there.
 *
 * So the floor is the horizon: at π/2 the eye is level with the piece and the
 * bottom is edge-on, never in view. The ceiling stops 60% of the way from the
 * horizon to overhead, which keeps a recognisable three-quarter view at the top
 * of the drag instead of the flat plan view a full tip gives.
 */
const FREE_POLAR_MAX = Math.PI / 2
const FREE_POLAR_MIN = FREE_POLAR_MAX * (1 - 0.6)

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
  onFit,
  sourceRef,
  plinth,
  zone,
  parts,
  paintable = true,
  sunOn = false,
}: {
  path: string
  envIntensity: number
  /** The piece's measured size, once it exists — the camera frames on it and
   *  cannot solve anything before it arrives. @see Fit */
  onFit: (fit: Fit) => void
  /** Publishes the raw cached GLTF scene — not the painted clone below — for an
   *  host page to inspect outside the Canvas. */
  sourceRef?: React.MutableRefObject<THREE.Object3D | null>
  /** Stands the piece on a plinth. @see ViewerPlinth */
  plinth?: PlinthSpec
  /** The zone for anything no part rule claims. The frame is `wood`, a cover
   *  variant is `cover` — one file at a time. */
  zone: PresentationZone
  /** The named groups inside this file — couch, cushions, shawl — so each can be
   *  dressed on its own. Omitted → the whole file wears `zone`. */
  parts?: PresentationPart[]
  /** False leaves the GLB's own materials alone. @see Props.paintable */
  paintable?: boolean
  /** The real sun is live and lighting the piece — cast and receive its
   *  shadow. @see the effect below, and PresentationSun for the light itself */
  sunOn?: boolean
}) {
  const gltf = useGLTF(path, false, true, extendGltfLoader)
  const { settings, preset } = useQuality()
  const invalidate = useThree((s) => s.invalidate)
  // Read at clone time without making the clone depend on it. @see below.
  const anisotropyRef = useRef(settings.anisotropyLevel)
  anisotropyRef.current = settings.anisotropyLevel

  const { scene, targets, radius, extent, bottom, footprint } = useMemo(() => {
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
    // `physical` wants a genuine MeshPhysicalMaterial for sheen, which is a
    // different, heavier compiled shader than a plain clone's — held back at
    // `low`, the rung a crashed device lands on, so that path never picks up
    // a shader variant it did not have before this existed. @see the
    // `low`-is-untouched invariant, arch-docs/plans/plan-for-increase-quality-of-simple-page.md
    const collected = paintable ? collectZoneTargets(clone, { zone, parts, physical: preset !== 'low' }) : []
    if (paintable) {
      const { paint } = usePresentation.getState()
      applyFirstCoat(collected, paint)
      // Same reason as the coat above, one layer further in: if a fabric is
      // already chosen, this file must not render a frame in the cloth it was
      // exported with. Cache-only, so a cold swatch lands on the next effect.
      applyFirstSwatch(collected, paint, anisotropyRef.current)
    }

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
      /**
       * How far the piece reaches across, and how far up.
       *
       * Two numbers rather than one sphere, because a sofa is not spherical and
       * the difference is most of the screen. A 2.4m-wide, 0.8m-tall sectional
       * has a bounding sphere about 1.3m across; fit *that* into the frame and
       * the piece uses a third of the height available to it, floating in
       * whitespace. The box is what a photographer would frame on.
       *
       * `hypot` rather than the larger of the two: yaw is the one rotation this
       * viewer always allows, and the widest silhouette a spin can produce is
       * the diagonal of the footprint. So this is still a bound that holds at
       * every angle, just a much tighter one than the sphere.
       */
      extent: { horizontal: Math.hypot(size.x, size.z) / 2, vertical: size.y / 2 },
      // Measured *after* the centring above, so both are in the space the
      // plinth is placed in: the underside, and half the footprint.
      bottom: -size.y / 2,
      footprint: Math.max(size.x, size.z) / 2,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, path, envIntensity, zone, parts, paintable, preset])

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

  /**
   * Cast/receive, applied to the existing clone rather than baked into the
   * memo above — the same reasoning as anisotropy just above: `sunOn` can
   * flip on a tier change or a resize that crosses a device-class boundary,
   * and re-cloning the whole scene graph for a boolean mesh flag would be the
   * same wasted work that comment already explains. Mirrors
   * `preparePresentationObject`'s own glass/lamp rule so a mesh casts
   * identically whichever path set the flag.
   */
  useEffect(() => {
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const name = mesh.name.toLowerCase()
      mesh.castShadow = sunOn && !name.includes('glass') && !name.includes('lamp')
      mesh.receiveShadow = sunOn
    })
    invalidate()
  }, [scene, sunOn, invalidate])

  /**
   * The file's own names, for whoever has to write the `parts` block.
   *
   * Those names live in the exporter's head and nowhere else, and a rule that
   * matches nothing fails by dressing nothing — no error, no warning, just a
   * swatch that does not work. Printing the tree turns that from a guess into a
   * lookup. Also flags rules that hit nothing, which is the other half of the
   * same problem: `gltf-transform dedup` can rename a material out from under a
   * config that used to be right.
   */
  useEffect(() => {
    if (!isDebug()) return
    console.groupCollapsed(`[parts] ${path}`)
    console.log(describeObjectTree(scene, parts))
    const claimed = new Set(targets.map((target) => target.zone))
    parts?.forEach((part) => {
      if (!claimed.has(part.zone)) {
        console.warn(`[parts] "${part.id}" matched nothing — check its objects/materials against the tree above`)
      }
    })
    console.groupEnd()
  }, [scene, parts, targets, path])

  // Before useZonePaint, so on the mount pass the map is in place before the
  // first damp frame reads the material.
  useSwatchTextures(targets)
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
  useEffect(
    () =>
      onFit(
        plinth
          ? {
              radius: radius * 1.2,
              // The plinth reaches past the piece on every side, so the fit is
              // solved against the pair or the stage clips out of frame.
              horizontal: extent.horizontal * 1.2,
              vertical: extent.vertical * 1.2,
              // Coordinates, not extents — a plinth does not move where the
              // piece's own underside is, and ViewerPlinth already renders
              // from these two unscaled. @see the primitive below.
              bottom,
              footprint,
            }
          : { radius, ...extent, bottom, footprint }
      ),
    [radius, extent, plinth, onFit, bottom, footprint]
  )

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
  fit,
  coverage,
  dock,
  view,
  controls,
}: {
  fit: Fit
  /** Fraction of the viewport height the control panel covers. */
  coverage: number
  /** Fraction of the viewport width a side dock covers. */
  dock: number
  view: ResolvedSimpleViewer
  controls: React.MutableRefObject<OrbitControlsImpl | null>
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const fitted = useRef(0)

  const { radius } = fit

  useEffect(() => {
    if (!radius || !Number.isFinite(radius)) return

    const hidden = Math.min(Math.max(coverage, 0), MAX_PANEL_COVERAGE)
    const docked = Math.min(Math.max(dock, 0), MAX_DOCK_COVERAGE)
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    // The usable half-angles: each shrunk by the band its panel leaves — the
    // sheet takes height, the dock takes width — and horizontal opened by the
    // aspect.
    const vHalf = Math.atan(halfFov * (1 - hidden))
    const hHalf = Math.atan(halfFov * (size.width / size.height) * (1 - docked))
    // Each extent against its own half-angle, and the binding one wins. A sofa
    // is wide and low, so on a landscape screen that is usually the height —
    // and solving it this way is what fills the frame instead of fitting a
    // sphere that is mostly air.
    const distance =
      Math.max(fit.horizontal / Math.tan(hHalf), fit.vertical / Math.tan(vHalf)) * view.padding

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

    /**
     * A positive offsetY walks the frustum window down the virtual image, which
     * is what carries the piece up the screen — half the panel's coverage puts
     * it in the middle of what is left. offsetX is the same trick sideways:
     * walking the window right carries the piece left, out from under a dock on
     * the right edge.
     *
     * Note this *moves* the piece rather than scaling it. Shrinking the canvas
     * to the free space would have been the easy version and is the wrong one:
     * it costs a resize of every buffer on every open, and the customer loses
     * sofa the moment they ask to see the fabric.
     *
     * Also updates the projection matrix, so it goes last.
     */
    if (hidden > 0 || docked > 0) {
      camera.setViewOffset(
        size.width,
        size.height,
        (size.width * docked) / 2,
        (size.height * hidden) / 2,
        size.width,
        size.height
      )
    } else {
      camera.clearViewOffset()
    }

    const orbit = controls.current
    if (orbit) {
      orbit.target.set(0, 0, 0)
      orbit.minDistance = distance * view.minZoom
      orbit.maxDistance = distance * view.maxZoom
      orbit.update()
    }
    invalidate()
  }, [fit, radius, coverage, dock, view, size.width, size.height, camera, controls, invalidate])

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

/** `useVramWatchdog` needs `useThree`/`useFrame`, which only work inside the
 *  Canvas — this is the mount point for it. @see the hook for what it does. */
function VramWatchdog({
  modelPath,
  device,
  demote,
}: {
  modelPath: string
  device: DeviceClass
  demote: () => void
}) {
  useVramWatchdog({ modelPath, device, demote })
  return null
}

interface Props {
  config: PresentationConfig
  /** Fraction of the viewport height the control panel covers, measured by the
   *  page. The piece is framed into what it leaves. @see Frame */
  coverage: number
  /** Fraction of the viewport *width* a side dock covers, measured the same way.
   *  A prop rather than a store read so the showroom, which has no dock, cannot
   *  inherit one from a `/simple` visit earlier in the session. */
  dockCoverage?: number
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
  /** The VRAM watchdog wants a rung dropped, live — no context lost, no
   *  remount. Omitted → the watchdog still measures (under `?debug` it still
   *  logs) but has nothing to call. @see hooks/useVramWatchdog */
  onDemote?: () => void
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
 *  - **Canvas MSAA on a desktop, and nowhere else.** With no composer to bypass
 *    it, `antialias` is live again, and on a tile-based GPU the resolve itself
 *    is genuinely cheap — cheaper than the two full-resolution targets an SMAA
 *    pass allocates. That was the whole argument for switching it on, and it is
 *    an argument about *bandwidth*. The cost that kills a tab is the *resident*
 *    multisample store, which it never priced: a 4x buffer is colour and depth
 *    at 4x plus the resolve, ~36 bytes a pixel against 8. At the `high` tier's
 *    DPR on an iPad that is ~86MB of the ~256MB iOS lets a tab hold in canvases,
 *    on the one page that has nothing else to spend it on — and it is why this
 *    page lost its context where the far heavier /product did not.
 *
 *    So MSAA is a desktop setting now. Nothing replaces it on touch: an SMAA
 *    pass needs a composer and two full-resolution targets, which is more than
 *    it saves, and at DPR 1.5 and up the edges hold without either.
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
  dockCoverage = 0,
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
  onDemote,
}: Props) {
  const { settings, device, gpu, preset } = useQuality()
  const [perfScale, setPerfScale] = useState(1)
  const [fit, setFit] = useState<Fit>(EMPTY_FIT)
  const controls = useRef<OrbitControlsImpl | null>(null)

  const view = useMemo(() => simpleViewer(config), [config])
  const envIntensity = view.envIntensity ?? settings.envIntensity

  /** MSAA is desktop-only below, and a multisampled buffer costs ~4.5x the
   *  bytes per pixel — so the budget is told which of the two this is. */
  const antialias = device === 'desktop'

  /** `simple.sun` overrides the shared `config.sun` — so tuning it for this
   *  page's piece-centred framing never disturbs /product's room-tuned sun.
   *  @see SimpleViewerMeta.sun */
  const sun = config.simple?.sun ?? config.sun

  /**
   * The real sun — gated on **tier, not device**. A phone that has earned
   * `high` or `ultra` (the on-screen picker, tapped deliberately — the tier
   * never defaults there on a phone, @see SURFACE_POLICY.viewer.fallback)
   * gets the identical rig a desktop does: same light, same PCSS shadow, same
   * `SHADOW_BUDGET`-scaled map size a strong tablet already gets. `medium`
   * and below keep the cheaper contact shadow — @see groundShadowOn — and
   * `low` keeps neither, on any device: that rung is where a crashed device
   * lands and must render with nothing new at all.
   */
  const sunOn = !!sun?.enabled && gpu !== 'weak' && (preset === 'high' || preset === 'ultra')

  /**
   * The contact shadow's own gate — off at the `low` rung, which is where a
   * crashed device lands and must render with no floor plane at all, on
   * every device including desktop. (`gpu !== 'weak'` is redundant with
   * `preset !== 'low'` here — `resolveTier` already caps a weak GPU to `low`
   * — kept only for readability.) `resolution` is clamped separately on
   * touch, so the render-target cost below and the mounted `<ContactShadows>`
   * (further down) never disagree. Off whenever the real sun is live: the
   * two are never both worth paying for at once.
   */
  const groundShadowOn = !sunOn && gpu !== 'weak' && preset !== 'low'
  const groundShadowResolution =
    device === 'desktop' ? settings.groundShadowResolution : Math.min(settings.groundShadowResolution, 512)

  const dpr = useMemo<[number, number]>(() => {
    // Weight 1 with MSAA off: this page holds a plain canvas and nothing else —
    // no composer, no shadow map, no second scene render — which is exactly why
    // it can afford the sharpest picture in the app.
    //
    // The tier's ratio is raised on touch before the budget clamps it, so the
    // budget — not the tier — is what binds. @see VIEWER_TOUCH_DPR_MAX. Left
    // alone at `low`: that rung is where a crashed device lands, and it must
    // stay exactly what it was.
    const [tierMin, tierMax] = settings.dpr
    const askMax = device !== 'desktop' && preset !== 'low' ? Math.max(tierMax, VIEWER_TOUCH_DPR_MAX) : tierMax
    // Whichever ground treatment is live spends its own render target here —
    // never both, since the two are mutually exclusive above — so this is
    // the one place that prices every byte this canvas spends, not just the
    // drawing buffer. Ignored on desktop by clampDprToBudget itself.
    // @see contactShadowBytes, sunShadowBytes
    const reserveBytes = sunOn
      ? sunShadowBytes(Math.min(settings.shadowResolution, SHADOW_BUDGET[device].resolution))
      : groundShadowOn
        ? contactShadowBytes(groundShadowResolution)
        : 0
    const [min, max] = clampDprToBudget(
      [tierMin, askMax],
      device,
      antialias ? COMPOSER_PIXEL_WEIGHT : 1,
      gpu,
      reserveBytes
    )
    return [min, Math.max(min, +(max * perfScale).toFixed(2))]
  }, [
    settings.dpr,
    settings.shadowResolution,
    device,
    gpu,
    antialias,
    perfScale,
    preset,
    sunOn,
    groundShadowOn,
    groundShadowResolution,
  ])

  const handleFit = useCallback(
    (next: Fit) => {
      setFit(next)
      if (next.radius) onReady()
    },
    [onReady]
  )

  /**
   * A stand-in for the room box `PresentationSun` normally fits its shadow
   * frustum against. There is no room here, so the piece's own measured
   * extent — already computed for the camera rig — plays that role: centred
   * on the origin the same way, horizontal used symmetrically for both X and
   * Z since it is already the diagonal-safe bound a yaw spin needs.
   */
  const pieceBox = useMemo(
    () =>
      fit.footprint > 0
        ? new THREE.Box3(
            new THREE.Vector3(-fit.horizontal, fit.bottom, -fit.horizontal),
            new THREE.Vector3(fit.horizontal, fit.vertical, fit.horizontal)
          )
        : null,
    [fit]
  )

  // Nothing here allocates enough to lose a context on its own — but this
  // viewer is also what /showroom and /view mount, and a page that cannot
  // report a loss leaves the viewer staring at a frozen frame.
  const handleCreated = useCanvasLifecycle({ label, onContextLost })

  return (
    <Canvas
      /* Off unless the real sun is live (@see sunOn) — the single largest
         buffer the heavy page holds, so this stays a deliberate opt-in. */
      shadows={sunOn}
      frameloop="demand"
      dpr={dpr}
      style={{ touchAction: embedded ? 'pan-y' : 'none', background: view.background }}
      gl={{
        // Live on a desktop, unlike every other scene in the app: those route
        // their output through an EffectComposer, which renders past the
        // canvas's own multisampled buffer and makes paying for it pure waste.
        // Off on touch, where the resident multisample store is what takes the
        // context out. @see the note on the component.
        //
        // Read once, at context creation — so this has to be right on the FIRST
        // render, not corrected by an effect. It is: QualityProvider resolves
        // `device` in a useState initialiser over useDeviceClass's
        // useSyncExternalStore, and this component is `dynamic(ssr: false)`.
        // Same reasoning as PresentationPostProcessing's `device` prop.
        antialias,
        // Deliberate: R3F merges `alpha: true` under whatever you pass, and the
        // page paints an opaque clear colour and sits on an opaque plate. The
        // channel composites nothing and the blend path is pure cost.
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: TONE_MAPPINGS[view.toneMapping],
        toneMappingExposure: view.exposure,
      }}
      camera={{ position: [0, 0, 4], fov: view.fov, near: 0.1, far: 100 }}
      onCreated={handleCreated}
    >
      <color attach="background" args={[view.background]} />

      {/* Cyclorama sweep instead of a flat void. Unauthored, this renders the
          same flat colour as the line above — @see simpleViewer's backdrop
          default — so it costs one draw call and changes nothing until a
          product actually authors it. */}
      <ViewerBackdrop top={view.backdrop.top} bottom={view.backdrop.bottom} vignette={view.backdrop.vignette} />

      {/* Sustained-FPS ladder only. AdaptiveDpr is deliberately left off: it
          drops resolution while the camera moves, and on a page whose whole
          purpose is judging a finish, a piece that goes soft the moment you
          turn it is the wrong trade. */}
      <PerfLadder onScale={setPerfScale} adaptive={false} />

      {/* Catches the allocation PerfLadder can't: a cover swap to a variant
          nobody has measured yet, checked before the frame it would cost is
          asked to draw. @see hooks/useVramWatchdog */}
      <VramWatchdog modelPath={view.model} device={device} demote={onDemote ?? NOOP} />

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

      {/* Rim — behind and above, opposite the key, cool: edge separation from
          the backdrop instead of the silhouette dissolving into it. Zero by
          default (@see simpleViewer), so an unauthored product is unchanged —
          same for the two lights below. */}
      <directionalLight position={[0, 5, -6]} intensity={view.lighting.rim} color="#88aaff" />

      {/* Floor bounce — low and slightly forward, warm: throws light back up
          into the underside now that the piece has a ground to bounce off. */}
      <pointLight position={[0, -0.3, 1.2]} intensity={view.lighting.bounce} distance={4} decay={2} color="#ffeedd" />

      {/* Diffuse-only fill, coloured from the backdrop itself — sky from its
          top stop, ground from its bottom — so the ambient light and the wall
          behind the piece read as the same room. */}
      <hemisphereLight args={[view.backdrop.top, view.backdrop.bottom, view.lighting.hemi]} />

      {/* The real sun — /store's own SunLight/ShadowSystem/SunDebug, imported
          via /product's PresentationSun rather than forked, so ?sundebug=1
          works identically here. Its shadow frustum fits the piece's own
          measured box in place of a room's, since there is no room. Desktop
          and a capable tablet only — @see sunOn. */}
      {sunOn && sun && pieceBox && <PresentationSun sun={sun} roomBox={pieceBox} device={device} />}

      <Suspense fallback={null}>
        <PartErrorBoundary category="piece" onError={onError}>
          <Piece
            path={view.model}
            envIntensity={envIntensity}
            onFit={handleFit}
            sourceRef={sourceRef}
            plinth={plinth}
            zone={zone}
            parts={config.parts}
            paintable={paintable}
            sunOn={sunOn}
          />
        </PartErrorBoundary>
      </Suspense>

      <Frame fit={fit} coverage={coverage} dock={dockCoverage} view={view} controls={controls} />

      {/* A frozen contact shadow so the piece sits on something instead of
          floating. `frames={1}`: the piece never moves, only the camera
          orbits, so one bake is the whole shadow for the mount's lifetime.
          Keyed on the model so a cover swap — a different footprint, a
          different height — re-bakes it rather than stretching the old one. */}
      {groundShadowOn && fit.footprint > 0 && (
        <ContactShadows
          key={view.model}
          frames={1}
          position={[0, fit.bottom, 0]}
          scale={Math.max(fit.footprint * 2.4, 0.1)}
          resolution={groundShadowResolution}
          blur={view.ground.blur}
          opacity={view.ground.opacity}
          far={view.ground.far}
        />
      )}

      {/* The real shadow's receiver — invisible everywhere but where the sun
          is blocked, via a bare ShadowMaterial, so there is no visible plane
          to keep registered with the backdrop. Sized generously past the
          footprint: the sun can fall at an angle, and a clipped shadow reads
          as a bug. Shares `view.ground.opacity` with the contact shadow it
          replaces, so the two never look like a different feature. */}
      {sunOn && fit.footprint > 0 && (
        <mesh receiveShadow position={[0, fit.bottom, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Math.max(fit.footprint * 8, 4), Math.max(fit.footprint * 8, 4)]} />
          <shadowMaterial transparent opacity={view.ground.opacity} />
        </mesh>
      )}

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
        // a turntable: the piece spins and never tips. Otherwise the tip is
        // bounded to the range above the horizon. @see FREE_POLAR_MIN
        minPolarAngle={lockPolar ? OPENING_POLAR : FREE_POLAR_MIN}
        maxPolarAngle={lockPolar ? OPENING_POLAR : FREE_POLAR_MAX}
      />

      {embedded && <EmbeddedGestures />}

      {isDebug() && <RendererStatsProbe label={label} />}
    </Canvas>
  )
}
