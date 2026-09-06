'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePresentation } from '@/stores/presentationStore'
import type { PresentationConfig } from '@/lib/product/presentation'
import type { StackControls, StackFraming } from './FurnitureStack'
import type { RoomBounds } from './PresentationRoom'

const SPIN_SENSITIVITY = 0.0075
const TILT_SENSITIVITY = 0.005
/** A tenth of a full turn each way. Still reads clearly as movement — the old
 *  16° did not — without the wide swing of the 60° it replaces. Override per
 *  product with `camera.tiltLimitDeg`. */
const TILT_LIMIT_DEG = 36

interface Props {
  config: PresentationConfig
  controls: React.MutableRefObject<StackControls>
  framing: React.MutableRefObject<StackFraming | null>
  /** The walls, when the backdrop is a modelled room. */
  roomBounds?: React.MutableRefObject<RoomBounds | null>
}

/** Clearance kept between the camera and the wall behind it, in metres.
 *  Override per product with `camera.wallMargin`. */
const WALL_MARGIN = 0.35

/** Widest the rig will open the lens to fit a piece it cannot back away from.
 *  Override per product with `camera.maxFov`; set it to `fov` to refuse. */
const MAX_FOV = 75

/**
 * How far the camera can travel back along `dir` from `origin` before it leaves
 * the box.
 *
 * The rig sizes its distance from the piece alone and knows nothing about the
 * room. That held while the piece was measured once, in a single render — but
 * the cover's bounds now arrive after load, so the framing changes and the
 * camera reverses. Through the back wall, the screen is solid black.
 *
 * The origin is clamped into the box first: the look-at target is aimed *below*
 * the piece to clear the bottom sheet, and with the sheet open it can dip under
 * the floor. Bailing out there would switch the clamp off exactly when the
 * camera is furthest back.
 */
const clampedOrigin = new THREE.Vector3()

function distanceToWall(origin: THREE.Vector3, dir: THREE.Vector3, box: THREE.Box3): number {
  box.clampPoint(origin, clampedOrigin)
  let limit = Infinity
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = dir[axis]
    if (Math.abs(d) < 1e-6) continue
    const t = ((d > 0 ? box.max[axis] : box.min[axis]) - clampedOrigin[axis]) / d
    if (t > 0) limit = Math.min(limit, t)
  }
  return limit
}

/**
 * The whole interaction model for this page.
 *
 * The camera never rotates and never orbits — it sits on a view ray derived
 * once from the piece's measured bounds and only slides along it. One finger
 * spins the *model*; two fingers (or the wheel) dolly within a hard clamp.
 *
 * Listeners attach to `gl.domElement`, not `document`. RotatableCar uses
 * document, which means a pointerdown anywhere — including on the bottom
 * sheet — starts a model spin. Canvas-scoping removes that conflict
 * structurally instead of heuristically.
 */
export default function PresentationGestures({ config, controls, framing, roomBounds }: Props) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const regress = useThree((s) => s.performance.regress)

  const sheetCoverage = usePresentation((s) => s.sheetCoverage)

  const target = useRef(new THREE.Vector3())
  const desiredTarget = useRef(new THREE.Vector3())
  const viewDir = useRef(new THREE.Vector3(0, 0, 1))
  const framedDistance = useRef(0)
  const distance = useRef(0)
  const targetDistance = useRef(0)
  /** Zoom survives a re-frame (rotation, resize) as a ratio, not an absolute. */
  const zoom = useRef(1)
  const appliedVersion = useRef(-1)
  const settled = useRef(false)
  /** Viewport fraction the piece's centre must sit above screen centre. */
  const bandCentre = useRef(0)
  /** How far the aim point sits above the piece's centre, in metres. */
  const aimOffset = useRef(0)
  const lensDistance = useRef(-1)
  /** Half-height the piece must cover at unit distance, padding folded in — the
   *  numerator of the fit, so distance and lens can be re-solved against it. */
  const need = useRef(0)
  const baseHalf = useRef(0)
  const capHalf = useRef(0)
  const targetHalf = useRef(0)
  /** Furthest the camera may travel: what a landscape window would need. */
  const distanceCeiling = useRef(Infinity)
  /** How much of the just-fits framing the *vertical* constraint accounts for:
   *  1 in landscape, below it in portrait where the width binds instead. */
  const verticalShare = useRef(1)
  const warnedTight = useRef(false)

  const minZoom = config.camera.minZoom ?? 0.6
  const maxZoom = config.camera.maxZoom ?? 1.8
  const tiltLimit = THREE.MathUtils.degToRad(config.camera.tiltLimitDeg ?? TILT_LIMIT_DEG)
  const wallMargin = config.camera.wallMargin ?? WALL_MARGIN
  const aimHeight = THREE.MathUtils.clamp(config.camera.aimHeight ?? 0.5, 0, 1)
  const maxDistance = config.camera.maxDistance ?? Infinity
  const baseFov = config.camera.fov
  const maxFov = Math.max(baseFov, config.camera.maxFov ?? MAX_FOV)

  /** How far back the wall lets the camera go. Infinity only when there is no
   *  room to be stopped by.
   *
   *  A room too tight to hold even the margin used to return Infinity — which
   *  read as "unclamped" and let the camera fly out through the wall in exactly
   *  the case that needed the clamp most. It now returns the smallest usable
   *  distance instead: the view is useless either way, but it is useless from
   *  inside the room, and the dev warning below says why. */
  const wallLimit = () => {
    const box = roomBounds?.current?.box
    if (!box) return Infinity
    return Math.max(0.05, distanceToWall(desiredTarget.current, viewDir.current, box) - wallMargin)
  }

  /**
   * How far back the camera may go: the room's bounds, the landscape ceiling,
   * and whatever `camera.maxDistance` says on top.
   *
   * The room's bounds alone were not enough, and this is why: the clamp
   * measures against the GLB's *bounding box*, and PresentationRoom's booth is
   * authored front-facing only — no geometry behind the static camera, which is
   * where its download saving comes from. The box therefore reaches past the
   * built walls and over the ceiling, and a camera inside the box but outside
   * the room looks exactly like one that flew out through the back of it. A
   * phone reached that dead air and a desktop never did, because a portrait
   * canvas asks for roughly twice the metres for the same shot.
   */
  const pullBackLimit = () => Math.min(wallLimit(), maxDistance, distanceCeiling.current)

  /**
   * The shot for a given zoom — distance **and** lens, solved together.
   *
   * `zoom` means one thing only: the fraction of the framed band the piece
   * covers. That is already device-independent, and it is the *metres* that are
   * not — `fov` is vertical, so a portrait canvas needs roughly twice the
   * pull-back for the same apparent size, and a booth modelled around the piece
   * does not have twice the depth. Spending the difference on distance is what
   * walked the camera out of the room on a phone, and capping the distance
   * alone is what made the dolly stop responding there.
   *
   * So the residual is spent on the lens instead. Once the room runs out of
   * metres the camera stops moving and the fov opens toward `camera.maxFov`,
   * which shrinks the piece by exactly as much as the metres would have. The
   * same `maxZoom` then means the same thing on a phone and a desktop, without
   * a per-device override — and on a desktop, which never reaches the limit,
   * nothing changes at all.
   */
  const solveShot = (zoomFactor: number) => {
    const limit = pullBackLimit()
    const wanted = (need.current / baseHalf.current) * zoomFactor
    if (!(wanted > limit)) return { distance: wanted, half: baseHalf.current }
    // Widen only as far as the cap allows; past that the room has nothing left
    // to give and zoom-out simply stops, at the wall rather than through it.
    const half = Math.min(capHalf.current, (need.current * zoomFactor) / limit)
    return { distance: Math.min((need.current / half) * zoomFactor, limit), half }
  }

  const solveDistance = (zoomFactor: number) => solveShot(zoomFactor).distance
  const fovFor = (half: number) => 2 * THREE.MathUtils.radToDeg(Math.atan(half))

  // Framing is the fiddliest thing on this page — `?debug=1` prints the solve.
  const trace =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')

  /**
   * Put the piece's centre in the middle of the band the sheet leaves — as a
   * lens shift, not by aiming the camera below it.
   *
   * Aiming low is what put the camera under the floor on a phone: the lift
   * scales with the framed distance and with how much of the screen the sheet
   * takes, and a phone maximises both — a ~2m dive on a sofa whose centre is
   * 0.4m up, which the elevation angle could not climb back out of. Every metre
   * of it also came off the pull-back the room could afford, since the wall
   * limit was measured from that sunken point.
   *
   * `setViewOffset` renders a window offset within a virtual frame of the same
   * size, which skews the frustum down in world space and moves the image up on
   * screen — the identical result, from a camera that stays on the piece's own
   * level and inside the room.
   *
   * Re-solved per distance rather than fixed, because the camera is aimed above
   * the piece's centre by `aimOffset` metres and a *metre* covers a larger
   * share of the screen the closer you get. Holding the shift constant would
   * let the piece slide down the frame as the dolly came in — the framing has
   * to compensate for exactly as much as the perspective changes.
   */
  const applyLens = (d: number) => {
    if (!size.height || d <= 0) return
    const viewHeight = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const shift = bandCentre.current + (viewHeight > 0 ? aimOffset.current / viewHeight : 0)
    // Clamped: a frustum skewed most of its own height off-axis is degenerate,
    // and at a hard zoom-in the correction term alone would ask for that.
    camera.setViewOffset(
      size.width,
      size.height,
      0,
      THREE.MathUtils.clamp(shift, -0.45, 0.45) * size.height,
      size.width,
      size.height
    )
    camera.updateProjectionMatrix()
    lensDistance.current = d
  }

  /**
   * Distance at which the piece just fits, then padded.
   *
   * `fov` is vertical, so on a portrait canvas the horizontal field is far
   * narrower than it looks — a distance tuned on desktop puts the camera
   * inside the sofa on a phone. Both axes are solved and the larger wins.
   *
   * Which is where a booth runs out of room. The pull-back a phone needs is
   * roughly twice a desktop window's, and a room modelled around the piece
   * does not have it, so the rig used to take the crop. It now opens the lens
   * instead, up to `camera.maxFov`: the piece is framed from a distance the
   * room actually affords rather than from one it does not. Desktop is
   * untouched — it never reaches the limit, so the lens never widens — which
   * is the half that lowering `maxZoom` for the phone could not preserve.
   */
  const reframe = () => {
    const frame = framing.current
    if (!frame || !size.height) return

    // Solved first: `wallLimit` measures along this ray, and the lens widening
    // below depends on the answer.
    const azimuth = THREE.MathUtils.degToRad(config.camera.azimuthDeg ?? 0)
    const elevation = THREE.MathUtils.degToRad(config.camera.elevationDeg ?? 10)
    viewDir.current
      .set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
      .normalize()

    const aspect = size.width / size.height

    // Worst-case silhouette: the piece can be spun to any yaw.
    const radius = Math.hypot(frame.size.x, frame.size.z) / 2
    // The piece has to fit the band the sheet leaves visible, not the whole
    // viewport. Capped so an over-tall sheet cannot push the camera to infinity
    // — the sheet's own max height is kept below this so the two agree.
    const coverage = Math.min(sheetCoverage, 0.62)
    const padding = config.camera.padding ?? 1.15

    // The two fit constraints, reduced to the one number `solveShot` needs.
    const needV = frame.size.y / (1 - coverage) / 2
    need.current = Math.max(needV, radius / aspect) * padding
    baseHalf.current = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2)
    capHalf.current = Math.tan(THREE.MathUtils.degToRad(maxFov) / 2)
    framedDistance.current = need.current / baseHalf.current

    /**
     * The same solve at a landscape aspect, and the furthest the camera may
     * ever travel.
     *
     * `fov` is vertical, so the whole of the extra pull-back a portrait canvas
     * asks for comes from `radius / aspect` — the horizontal fit — blowing up
     * below 1:1. That extra is what walked the camera out of a booth that a
     * desktop window never left, and it is why a per-device `maxZoom` seemed
     * like the answer: it is the metres that differ, not the shot.
     *
     * So the metres are capped at the landscape figure and the difference is
     * spent on the lens instead (see `solveShot`). A phone is then never
     * further from the piece than a desktop would be, at any zoom, with no
     * per-device override and no change to the desktop at all — its aspect is
     * already ≥ 1, so this ceiling is exactly the distance it was using.
     */
    distanceCeiling.current =
      ((Math.max(needV, radius / Math.max(aspect, 1)) * padding) / baseHalf.current) * maxZoom

    // 1 wherever the piece's height is what sets the framing, below it once the
    // width takes over — which is what portrait does. @see the opening zoom
    verticalShare.current = need.current > 0 ? (needV * padding) / need.current : 1

    // The aim point rides up the piece by `camera.aimHeight`, so a close dolly
    // does not sink to the piece's own centre height. Still on the piece, so
    // the pull-back limit is measured from inside the room whatever the sheet
    // is doing.
    aimOffset.current = (aimHeight - 0.5) * frame.size.y
    desiredTarget.current.copy(frame.center).setY(frame.center.y + aimOffset.current)

    bandCentre.current = coverage / 2 + (config.camera.screenLift ?? 0.02)

    const limit = pullBackLimit()
    const shot = solveShot(zoom.current)
    targetHalf.current = shot.half
    camera.fov = fovFor(shot.half)
    applyLens(shot.distance)

    if (trace) {
      console.log(
        `[reframe] coverage ${coverage.toFixed(3)} aspect ${aspect.toFixed(3)}` +
          ` size ${frame.size.toArray().map((n) => +n.toFixed(2)).join('/')}` +
          ` fov ${camera.fov.toFixed(1)} framed ${framedDistance.current.toFixed(2)}` +
          ` vShare ${verticalShare.current.toFixed(2)} zoom ${zoom.current.toFixed(2)}` +
          ` wall ${roomBounds?.current?.box ? wallLimit().toFixed(2) : 'none'}` +
          ` → dist ${solveDistance(zoom.current).toFixed(2)}`
      )
    }
    if (process.env.NODE_ENV !== 'production' && !warnedTight.current && camera.fov > baseFov + 0.5) {
      warnedTight.current = true
      console.warn(
        `[PresentationGestures] the camera may back off only ${limit.toFixed(2)}m` +
          `${maxDistance < wallLimit() ? ' (camera.maxDistance)' : ' (the room bounds)'}, so the` +
          ` lens opened from ${baseFov}° to ${camera.fov.toFixed(1)}° to keep the piece framed` +
          `${camera.fov >= maxFov - 0.5 ? ' — and hit camera.maxFov, so the view is still cropped' : ''}.` +
          ' Scale the room GLB up, or lower camera.padding, to shoot it at the intended focal length.'
      )
    }

    /**
     * Opening zoom, on the first solve only — a fraction of `maxZoom`, scaled
     * by how much of the framing the piece's *height* accounts for.
     *
     * The bare fraction opens a phone much further out than it looks, and this
     * is why: `zoom` is a share of the framed band, so the same number gives the
     * same share on any screen — but in portrait the framing is set by the
     * piece's *width*, and a shot that just fits a sofa across a narrow canvas
     * leaves it small down the middle with the band half empty above and below.
     * Identical by the numbers, much further away to look at.
     *
     * Scaling by the vertical share cancels exactly the part of the pull-back
     * the width imposed, so the piece opens at the same on-screen height it
     * does on a desktop, where the share is 1 and nothing changes.
     *
     * Floored at the just-fits shot so this can only ever bring the opening
     * closer, never crop the piece — unless the configured value asked to open
     * inside the framing in the first place, which stays honoured.
     */
    if (!settled.current && config.camera.startZoom !== undefined) {
      const configured = maxZoom * config.camera.startZoom
      zoom.current = THREE.MathUtils.clamp(
        Math.max(configured * verticalShare.current, Math.min(1, configured)),
        minZoom,
        maxZoom
      )
    }

    targetDistance.current = solveDistance(zoom.current)
    // First frame snaps; a later re-frame (explode, resize) eases via useFrame
    // so the pull-back reads as part of the explode animation.
    if (!settled.current) {
      distance.current = targetDistance.current
      target.current.copy(desiredTarget.current)
      settled.current = true
      camera.position.copy(target.current).addScaledVector(viewDir.current, distance.current)
      camera.lookAt(target.current)
    }
    invalidate()
  }

  // Re-frame on mount, on a resize/orientation change, and when the stack
  // reports new bounds (a different product, or a layer that loaded late).
  useFrame(() => {
    const version = framing.current?.version ?? -1
    if (version >= 0 && version !== appliedVersion.current) {
      appliedVersion.current = version
      reframe()
    }
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reframe, [size.width, size.height, config.camera, sheetCoverage])

  // The shift and any widening live on the camera object, which outlives this
  // component — hand it back as it was found.
  useEffect(
    () => () => {
      camera.clearViewOffset()
      camera.fov = baseFov
      camera.updateProjectionMatrix()
    },
    [camera, baseFov]
  )

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let mode: 'idle' | 'rotate' | 'pinch' = 'idle'
    let pinchStart = 0

    const pinchDistance = () => {
      const [a, b] = Array.from(pointers.values())
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const applyZoom = (factor: number) => {
      zoom.current = THREE.MathUtils.clamp(zoom.current * factor, minZoom, maxZoom)
      const shot = solveShot(zoom.current)
      targetDistance.current = shot.distance
      targetHalf.current = shot.half
    }

    const onPointerDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      // A second finger landing must not feed its first delta into the spin.
      mode = pointers.size >= 2 ? 'pinch' : 'rotate'
      if (mode === 'pinch') pinchStart = pinchDistance()
      regress()
      invalidate()
    }

    const onPointerMove = (e: PointerEvent) => {
      const previous = pointers.get(e.pointerId)
      if (!previous) return
      const dx = e.clientX - previous.x
      const dy = e.clientY - previous.y
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (mode === 'pinch' && pointers.size >= 2) {
        const current = pinchDistance()
        if (current > 0 && pinchStart > 0) applyZoom(pinchStart / current)
        pinchStart = current
      } else if (mode === 'rotate') {
        controls.current.yaw += dx * SPIN_SENSITIVITY
        // Drag up tips the piece towards you, down tips it away. The rotation
        // happens about the piece's own centre — see FurnitureStack — so it
        // turns in place rather than swinging through an arc.
        controls.current.pitch = THREE.MathUtils.clamp(
          controls.current.pitch - dy * TILT_SENSITIVITY,
          -tiltLimit,
          tiltLimit
        )
      }

      regress()
      invalidate()
    }

    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
      // Dropping from two fingers to one must re-anchor, or the remaining
      // pointer's stale delta snaps the model round.
      if (pointers.size >= 2) {
        mode = 'pinch'
        pinchStart = pinchDistance()
      } else if (pointers.size === 1) {
        mode = 'rotate'
      } else {
        mode = 'idle'
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      applyZoom(1 + delta * 0.0012)
      regress()
      invalidate()
    }

    // iOS Safari treats a two-finger pinch as page zoom unless this is killed.
    const onGesture = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)
    el.addEventListener('lostpointercapture', endPointer)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGesture)
    el.addEventListener('gesturechange', onGesture)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPointer)
      el.removeEventListener('pointercancel', endPointer)
      el.removeEventListener('lostpointercapture', endPointer)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGesture)
      el.removeEventListener('gesturechange', onGesture)
    }
  }, [gl, minZoom, maxZoom, tiltLimit, controls, invalidate, regress])

  useFrame((_, delta) => {
    // Re-solved every frame, not just on reframe: the room GLB usually resolves
    // after the camera has already settled, and the walls have to pull it back
    // in — and re-spend the difference on the lens — when they arrive.
    const legal = solveShot(zoom.current)
    if (legal.distance !== targetDistance.current) targetDistance.current = legal.distance
    targetHalf.current = legal.half

    const wantFov = fovFor(targetHalf.current)
    const distanceSettled = distance.current === targetDistance.current
    const targetSettled = target.current.distanceToSquared(desiredTarget.current) < 1e-8
    const fovSettled = Math.abs(camera.fov - wantFov) < 1e-3
    if (distanceSettled && targetSettled && fovSettled) return

    if (!fovSettled) {
      // Damped on the same clock as the dolly, so a zoom-out that runs out of
      // metres and continues on the lens reads as one continuous movement
      // rather than a hand-off between two.
      const next = THREE.MathUtils.damp(camera.fov, wantFov, 12, delta)
      camera.fov = Math.abs(next - wantFov) < 1e-3 ? wantFov : next
      camera.updateProjectionMatrix()
      lensDistance.current = -1
    }

    if (!distanceSettled) {
      const next = THREE.MathUtils.damp(distance.current, targetDistance.current, 12, delta)
      distance.current = Math.abs(next - targetDistance.current) < 1e-4 ? targetDistance.current : next
    }
    if (targetSettled) target.current.copy(desiredTarget.current)
    else target.current.lerp(desiredTarget.current, 1 - Math.exp(-10 * delta))

    // The shift depends on how far away we are — see applyLens. Only on a real
    // change, so a settled camera is not re-projecting every frame.
    if (Math.abs(distance.current - lensDistance.current) > 1e-4) applyLens(distance.current)

    camera.position.copy(target.current).addScaledVector(viewDir.current, distance.current)
    camera.lookAt(target.current)
    invalidate()
  })

  return null
}
