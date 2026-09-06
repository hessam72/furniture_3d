'use client'

import { memo, useMemo } from 'react'
import * as THREE from 'three'
import {
  galleryLighting,
  lightingMode,
  STORE_RENDER,
  type PresentationConfig,
} from '@/lib/product/presentation'

const DEFAULTS = { key: 120, fill: 70, rim: 60, bounce: 6, ambient: 1.1, hemi: 0.8 }

type Vec = [number, number, number]

/**
 * A spot that aims where it is told.
 *
 * three's SpotLight points at its `target` Object3D, and that target's world
 * matrix is only updated while it is in the scene graph — the studio rig gets
 * away with leaving it out because an un-parented target sits at the origin,
 * which is exactly where the piece is. A gallery fixture has to aim somewhere
 * else, so its target is mounted as a real (empty) node.
 */
function Spot({
  from,
  at,
  intensity,
  angle,
  penumbra = 0.65,
  color,
}: {
  from: Vec
  at: Vec
  intensity: number
  angle: number
  penumbra?: number
  color: string
}) {
  const node = useMemo(() => new THREE.Object3D(), [])
  return (
    <>
      <primitive object={node} position={at} />
      <spotLight
        position={from}
        target={node}
        intensity={intensity}
        angle={angle}
        penumbra={penumbra}
        color={color}
      />
    </>
  )
}

interface Fixture {
  from: Vec
  at: Vec
  intensity: number
  angle: number
  penumbra: number
}

/**
 * Ceiling track + back-wall wash, solved from the room's own bounds.
 *
 * The whole point is that nothing here is a hand-picked distance. Every fixture
 * is placed as a fraction of the measured room and its intensity is scaled by
 * the square of its throw, because `decay: 2` means illuminance falls as 1/d² —
 * the single reason the studio numbers leave a room black. A fixture 3m up needs
 * nine times the intensity of the same fixture 1m up to land the same light.
 */
function GalleryRig({
  box,
  floorY,
  view,
  spots,
  track,
  wash,
  angle,
  color,
  trace,
}: {
  box: THREE.Box3
  floorY: number
  view: THREE.Vector3
  spots: number
  track: number
  wash: number
  angle: number
  color: string
  trace: boolean
}) {
  const fixtures = useMemo<Fixture[]>(() => {
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    // Hang just under the ceiling, the way a track actually mounts.
    const ceiling = box.max.y - Math.min(0.25, size.y * 0.08)
    const throwDist = Math.max(ceiling - floorY, 0.5)
    // decay 2: illuminance = intensity / d². Solving for a target irradiance
    // keeps the rig identical in look whatever the room measures.
    const unit = throwDist * throwDist

    // The camera never orbits, so "toward the viewer" is a fixed direction and
    // the track can be laid across it — which is where a real one goes, so the
    // fixtures rake the front of the piece instead of crowning it flat.
    const forward = new THREE.Vector3(view.x, 0, view.z).normalize()
    const right = new THREE.Vector3(forward.z, 0, -forward.x)
    const extent = (d: THREE.Vector3) => Math.abs(d.x) * size.x + Math.abs(d.z) * size.z
    const width = extent(right)
    const depth = extent(forward)

    const list: Fixture[] = []

    for (let i = 0; i < spots && track > 0; i++) {
      // −0.5…0.5 across 55% of the room's width, so the end fixtures stay well
      // inside the walls rather than clipping into them.
      const t = spots === 1 ? 0 : i / (spots - 1) - 0.5
      const offset = t * width * 0.55
      const from = centre
        .clone()
        .addScaledVector(right, offset)
        .addScaledVector(forward, depth * 0.18)
      from.y = ceiling
      // Toe the pools in towards the piece — parallel beams read as a grid,
      // converging ones read as a display.
      const at = centre.clone().addScaledVector(right, offset * 0.3)
      at.y = floorY
      list.push({
        from: from.toArray() as Vec,
        at: at.toArray() as Vec,
        intensity: unit * 3 * track,
        angle,
        penumbra: 0.7,
      })
    }

    if (wash > 0 && depth > 0.5) {
      // One wide fixture grazing the back wall. Without it the piece is lit and
      // the room behind it stays a dark void, which is the tell that a scene is
      // an object on a backdrop rather than an object in a space.
      const from = centre.clone().addScaledVector(forward, depth * 0.3)
      from.y = ceiling
      const at = centre.clone().addScaledVector(forward, -depth * 0.5)
      at.y = floorY + size.y * 0.45
      const reach = from.distanceTo(at)
      list.push({
        from: from.toArray() as Vec,
        at: at.toArray() as Vec,
        intensity: reach * reach * 1.1 * wash,
        // Deliberately much wider than a track fixture: this is a wash, and a
        // hard-edged pool on a back wall looks like a mistake.
        angle: Math.min(angle * 2, 1.2),
        penumbra: 0.9,
      })
    }

    if (trace) {
      const f = (n: number) => n.toFixed(2)
      console.log(
        `[gallery] room ${size.toArray().map(f).join(' x ')}m` +
          ` ceiling ${f(box.max.y)} floorY ${f(floorY)} throw ${f(throwDist)}` +
          ` → ${list.length} fixtures @ ${list.map((x) => f(x.intensity)).join(', ')}`
      )
    }
    if (process.env.NODE_ENV !== 'production' && (size.y > 20 || size.y < 1)) {
      console.warn(
        `[gallery] the room GLB measures ${size.toArray().map((n) => n.toFixed(1)).join(' x ')}m.` +
          ' A room that is not roughly room-sized is usually a unit mismatch (centimetres' +
          ' exported as metres, or the reverse) — the piece, the camera clamp and this rig all' +
          ' assume metres, and none of them will look right until the GLB is rescaled.'
      )
    }

    return list
  }, [box, floorY, view, spots, track, wash, angle, trace])

  return (
    <>
      {fixtures.map((f, i) => (
        <Spot key={i} {...f} color={color} />
      ))}
    </>
  )
}

/**
 * Three-point studio rig, forked from CarLighting, plus an optional gallery rig
 * for a modelled room.
 *
 * Every `castShadow` and `shadow-*` prop is deliberately absent: this page
 * renders with no shadow maps at all. A shadow pass re-renders the scene from
 * the *light's* frustum, which ignores camera culling — dropping it is the
 * single biggest saving from the trimmed, front-facing-only room.
 *
 * `ambient` and `fill` are lifted, and a hemisphere added, to replace the fill
 * light the HDR environment used to contribute — that was removed to stop it
 * reflecting into the upholstery. A hemisphere is the right stand-in: it is
 * purely diffuse, so it lights without putting a highlight back on the fabric.
 */
function PresentationLighting({
  config,
  roomBox,
}: {
  config: PresentationConfig
  /** The measured room, once it has loaded. The gallery rig needs real bounds;
   *  until they arrive only the studio rig runs. */
  roomBox?: THREE.Box3 | null
}) {
  const l = { ...DEFAULTS, ...config.lighting }
  const gallery = galleryLighting(config)
  const mode = lightingMode(config)
  const trace =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')

  // Same view ray the camera rig derives — see PresentationGestures.reframe.
  const view = useMemo(() => {
    const azimuth = THREE.MathUtils.degToRad(config.camera.azimuthDeg ?? 0)
    const elevation = THREE.MathUtils.degToRad(config.camera.elevationDeg ?? 10)
    return new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation)
    ).normalize()
  }, [config.camera.azimuthDeg, config.camera.elevationDeg])

  // /store's whole rig, verbatim: a plain HDR environment (mounted separately)
  // plus one overhead point light. Nothing else — no studio spots, no gallery
  // track, no ambient. A room GLB authored against that scene is lit entirely
  // by the environment, and adding the booth rig on top only washes it out.
  if (mode === 'store') {
    const p = STORE_RENDER.point
    return (
      <pointLight
        position={p.position}
        intensity={p.intensity}
        distance={p.distance}
        decay={p.decay}
        color="#ffffff"
      />
    )
  }

  return (
    <>
      {/* Key — main illumination, front-right */}
      <spotLight position={[5, 8, 5]} intensity={l.key} angle={0.5} penumbra={0.5} />

      {/* Fill — opens the shaded side */}
      <spotLight position={[-5, 5, 3]} intensity={l.fill} angle={0.6} penumbra={0.7} />

      {/* Rim — cool edge separation from the backdrop */}
      <spotLight position={[0, 4, -6]} intensity={l.rim} angle={0.4} penumbra={0.6} color="#88aaff" />

      {/* Floor bounce — sits low and in front so it throws warm light back up
          into the underside, which is what keeps the piece grounded now that
          contact shadows are gone. Not inside the piece: at furniture scale a
          lamp at seat height blows the surrounding floor out to white. */}
      <pointLight position={[0, -0.25, 1.1]} intensity={l.bounce} distance={4} decay={2} color="#ffeedd" />

      {/* Diffuse-only fill, standing in for the IBL this page no longer has. */}
      <hemisphereLight args={['#fdf6ec', '#3a3128', l.hemi]} />

      <ambientLight intensity={l.ambient} />

      {gallery.enabled && roomBox && (
        <GalleryRig
          box={roomBox}
          floorY={config.room.floorY ?? 0}
          view={view}
          spots={gallery.spots}
          track={gallery.track}
          wash={gallery.wash}
          angle={gallery.angle}
          color={gallery.color}
          trace={trace}
        />
      )}
    </>
  )
}

/** @see the note on the memo in PresentationScene. */
export default memo(PresentationLighting)
