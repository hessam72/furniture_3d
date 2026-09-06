'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { applyMatte, collectZoneTargets, disposeTargets, preparePresentationObject } from '@/lib/three/layerMaterials'
import { applyFirstCoat, useZonePaint } from '@/hooks/useZonePaint'
import { usePresentation } from '@/stores/presentationStore'
import { useQuality } from '@/contexts/QualityContext'
import { PartErrorBoundary } from '@/components/car/PartErrorBoundary'
import {
  findCoverVariant,
  isMatte,
  sunEnabled,
  type LayerMeta,
  type PresentationConfig,
  type PresentationZone,
} from '@/lib/product/presentation'
import type { ExportSources } from '@/lib/three/exportConfigured'
import CoverLayer from './CoverLayer'
import PresentationStage from './PresentationStage'
import type { WipeDirection } from '@/hooks/useClipWipe'

/** Rotation/tilt targets live in refs, not the store — a 60Hz zustand write
 *  would re-render the whole bottom sheet every frame. */
export interface StackControls {
  yaw: number
  /** Vertical drag, in radians about the horizontal axis through the piece's
   *  own centre. Drag up tips it towards the viewer, down tips it away. */
  pitch: number
}

/** Measured bounds of the seated piece, published to the camera rig so it can
 *  frame by what is actually there rather than a hard-coded distance. */
export interface StackFraming {
  center: THREE.Vector3
  size: THREE.Vector3
  version: number
}

interface FurnitureStackProps {
  config: PresentationConfig
  controls: React.MutableRefObject<StackControls>
  framing: React.MutableRefObject<StackFraming | null>
  /** `?debug=1` — draws the piece's ground plane so it can be lined up against
   *  the floor in the backdrop photograph. */
  debug?: boolean
  /** Filled in with the raw cached GLTFs so the AR export can rebuild the piece
   *  from the sources rather than from this live, half-animated subtree. */
  sources?: React.MutableRefObject<ExportSources>
}

/** One GLB layer: cloned, prepared, its colourable subset tagged with a zone. */
function useLayer(path: string, zone: PresentationZone, matte: boolean, shadows: boolean, match?: string) {
  const gltf = useGLTF(path)
  const { settings } = useQuality()

  const { scene, targets } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    preparePresentationObject(clone, {
      envMapIntensity: matte ? 0 : settings.envIntensity,
      anisotropy: settings.anisotropyLevel,
      shadows,
    })
    const collected = collectZoneTargets(clone, { zone, match })
    applyFirstCoat(collected, usePresentation.getState().paint)
    if (matte) applyMatte(collected)
    return { scene: clone, targets: collected }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, path, matte, shadows])

  useZonePaint(targets)
  useEffect(() => () => disposeTargets(targets), [targets])

  return { scene, targets, source: gltf.scene }
}

/**
 * Registers the active cover's source scene without rendering it.
 *
 * The mounted CoverLayer only exists at the finished step, but two things need
 * the cover regardless: the AR export, which always ships the whole piece, and
 * the camera framing — with the soft layer gone the cover is what overhangs the
 * frame, so a camera framed to the frame alone crops the arms.
 *
 * It reads the same drei cache CoverLayer does, so this costs no extra fetch.
 */
function CoverSource({
  path,
  sources,
  onBounds,
}: {
  path: string
  sources?: React.MutableRefObject<ExportSources>
  onBounds: (box: THREE.Box3) => void
}) {
  const { scene } = useGLTF(path)
  useEffect(() => {
    if (sources) sources.current.cover = scene
    onBounds(new THREE.Box3().setFromObject(scene))
  }, [scene, sources, onBounds])
  return null
}

/** The soft layer is optional — a product can ship as frame + cover alone. */
function SoftLayer({
  meta,
  matte,
  shadows,
  sources,
}: {
  meta: LayerMeta
  matte: boolean
  shadows: boolean
  sources?: React.MutableRefObject<ExportSources>
}) {
  const soft = useLayer(meta.path, 'cushion', matte, shadows, meta.zoneMatch)
  useEffect(() => {
    if (!sources) return
    sources.current.soft = soft.source
    // Cleared on unmount, or the AR export would keep shipping a layer the
    // page has stopped showing.
    return () => {
      sources.current.soft = null
    }
  }, [sources, soft.source])
  return <primitive object={soft.scene} />
}

export default function FurnitureStack({ config, controls, framing, sources, debug }: FurnitureStackProps) {
  const invalidate = useThree((s) => s.invalidate)

  const layerStep = usePresentation((s) => s.layerStep)
  const exploded = usePresentation((s) => s.exploded)
  const coverId = usePresentation((s) => s.coverId)
  const coverPhase = usePresentation((s) => s.coverPhase)
  const commitCover = usePresentation((s) => s.commitCover)
  const finishWipe = usePresentation((s) => s.finishWipe)
  const setLayerError = usePresentation((s) => s.setLayerError)

  const matte = isMatte(config)
  // The piece casts into the sun patch, and takes the window's shape across it,
  // only where a product configures a sun.
  const shadows = sunEnabled(config)
  const softMeta = config.layers.soft

  // The frame never changes path, so loading it here rather than in a child
  // makes its bounding box available in the same render — the centering offset
  // lands on the first committed frame, with no one-frame pop.
  const frame = useLayer(config.layers.frame.path, 'wood', matte, shadows)

  // Reported by CoverSource once the active variant is in cache.
  const [coverBox, setCoverBox] = useState<THREE.Box3 | null>(null)

  // Scenery under the piece. Measured by the stage itself so a re-exported
  // plinth of a different thickness needs no re-tuning here.
  const stageMeta = config.layers.stage
  const [stageHeight, setStageHeight] = useState(0)
  /**
   * The height the piece actually stands at — the room floor, plus the stage
   * when it is asked to carry the piece, plus whatever `room.pieceLift` adds.
   *
   * Everything that seats or measures the piece reads this instead of
   * `room.floorY`, framing included: a piece raised in the room has genuinely
   * moved, and a camera that did not follow would frame the empty space
   * underneath it. That is the opposite of `room.pieceOffsetY`, which is a
   * screen-space nudge the camera is deliberately blind to.
   */
  const deckY =
    (config.room.floorY ?? 0) +
    (stageMeta?.liftPiece ? stageHeight : 0) +
    (config.room.pieceLift ?? 0)

  const gap = config.explode?.gap ?? 0.45

  // Centred in X/Z but *seated* in Y: the piece stands on the room floor rather
  // than floating at the origin, and the frame alone defines the offset so the
  // three layers (authored at a shared world origin) never drift apart.
  const { centerOffset, baseSize } = useMemo(() => {
    // The frame alone is the structural datum for centering — it is the layer
    // that always exists and never changes. Framing, though, unions in the
    // cover: the upholstery overhangs the frame on every real piece, and a
    // camera framed to the frame alone crops the arms.
    const box = new THREE.Box3().setFromObject(frame.scene)
    const center = box.getCenter(new THREE.Vector3())
    const outer = coverBox ? box.clone().union(coverBox) : box.clone()
    const size = outer.getSize(new THREE.Vector3())
    if (process.env.NODE_ENV !== 'production' && (size.y > 3 || size.y < 0.2)) {
      console.warn(
        `[FurnitureStack] frame is ${size.y.toFixed(2)}m tall — check the Blender unit scale`,
        config.layers.frame.path
      )
    }
    return {
      centerOffset: [-center.x, deckY - box.min.y, -center.z] as [number, number, number],
      baseSize: size,
    }
  }, [frame.scene, coverBox, deckY, config.layers.frame.path])

  useEffect(() => {
    if (!sources) return
    sources.current.frame = frame.source
    sources.current.centerOffset = centerOffset
  }, [sources, frame.source, centerOffset])

  // Publish the bounds the camera should frame. Exploding raises the top layer
  // by two gaps, so the rig has to re-frame or the fanned stack runs off-screen.
  useEffect(() => {
    const extra = exploded ? gap * 2 : 0
    const size = new THREE.Vector3(baseSize.x, baseSize.y + extra, baseSize.z)
    framing.current = {
      center: new THREE.Vector3(0, deckY + size.y / 2, 0),
      size,
      version: (framing.current?.version ?? 0) + 1,
    }
    invalidate()
  }, [baseSize, exploded, gap, deckY, framing, invalidate])

  // The piece's centre — the same height the camera frames on, and the axis
  // the tilt turns about.
  const pivotY = deckY + baseSize.y / 2
  // Kept out of `framing` on purpose: the camera must not follow this, or the
  // piece would never move on screen. See the note on room.pieceOffsetY.
  //
  // Y only, and deliberately so — a horizontal offset here breaks the spin.
  // Both rotations still turn about the piece's own axes, but the camera aims
  // at the piece's *measured* centre, which the framing puts at the origin. Move
  // the piece off that point and it sits off the optical axis, where perspective
  // swings its near and far ends across the frame as it turns: rotation in place
  // reads as an orbit. Push the piece back into a room by moving the *room*
  // forward instead — `room.offset` — and the piece stays on axis.
  const pieceOffsetY = config.room.pieceOffsetY ?? 0

  const pitchRef = useRef<THREE.Group>(null)
  const yawRef = useRef<THREE.Group>(null)
  const stageYawRef = useRef<THREE.Group>(null)
  const frameSlot = useRef<THREE.Group>(null)
  const softSlot = useRef<THREE.Group>(null)
  const coverSlot = useRef<THREE.Group>(null)

  const variant = findCoverVariant(config, coverId)

  // Box3 has no value equality, so compare before setting or the framing memo
  // re-runs on every cover mount and the camera re-frames for nothing.
  const handleCoverBounds = useCallback((box: THREE.Box3) => {
    setCoverBox((previous) => (previous && previous.equals(box) ? previous : box))
  }, [])

  // The cover stays mounted through a wipe-out so it animates away rather than
  // popping when you step back off it.
  const coverMounted = !!variant && (layerStep === 1 || coverPhase === 'wipeOut')
  const coverDirection: WipeDirection =
    coverPhase === 'wipeIn' ? 'in' : coverPhase === 'wipeOut' ? 'out' : null

  // Layers are exclusive now: choosing a material hides the skeleton. Exploded
  // is the exception — fanning two layers apart is pointless with one hidden.
  const frameVisible = exploded || layerStep === 0
  const softVisible = exploded || layerStep === 0

  useFrame((_, delta) => {
    const pitch = pitchRef.current
    const yaw = yawRef.current
    if (!pitch || !yaw) return

    const target = controls.current
    const nextYaw = THREE.MathUtils.damp(yaw.rotation.y, target.yaw, 12, delta)
    const nextPitch = THREE.MathUtils.damp(pitch.rotation.x, target.pitch, 12, delta)

    let moving = Math.abs(nextYaw - target.yaw) > 1e-4 || Math.abs(nextPitch - target.pitch) > 1e-4
    yaw.rotation.y = nextYaw
    pitch.rotation.x = nextPitch
    // The stage turns with the piece and takes the same damping, so the two
    // never shear apart mid-spin. Yaw only, and outside the pitch pivot: a
    // plinth that tipped with the drag would lift off the floor on one edge,
    // and a turntable does not tilt.
    if (stageYawRef.current) stageYawRef.current.rotation.y = nextYaw

    // Explode fans the layers apart along Y; the clip plane follows via each
    // layer's world matrix, so no special-casing is needed there. The soft slot
    // drops out of the ladder entirely when the product has no soft layer, so
    // the cover does not fan to a gap that nothing occupies.
    const slots = softMeta
      ? [frameSlot.current, softSlot.current, coverSlot.current]
      : [frameSlot.current, coverSlot.current]
    slots.forEach((slot, index) => {
      if (!slot) return
      const goal = exploded ? index * gap : 0
      slot.position.y = THREE.MathUtils.damp(slot.position.y, goal, 8, delta)
      if (Math.abs(slot.position.y - goal) > 1e-4) moving = true
      else slot.position.y = goal
    })

    if (moving) invalidate()
  })

  return (
    <>
      {/* Sibling of the stack, not a child: it shares the spin but must stay
          clear of the tilt pivot above. Both turn about the same vertical axis
          through the origin, which is where the framing puts the piece. */}
      {stageMeta && (
        <group ref={stageYawRef} name="presentation-stage-yaw">
          {/* No Suspense of its own, unlike the soft and cover layers. Theirs
              exist so a late layer cannot hide the rest of the piece; the stage
              is under the piece from the first frame or it pops in behind the
              splash lifting. Letting it suspend the shared boundary is what
              makes SceneReady wait for it. */}
          <PartErrorBoundary category="stage">
            <PresentationStage
              meta={stageMeta}
              floorY={config.room.floorY ?? 0}
              shadows={shadows}
              onHeight={setStageHeight}
            />
          </PartErrorBoundary>
        </group>
      )}

      {/* The tilt pivot is raised to the piece's centre and undone immediately
          below it. Rotating about the world origin instead would swing the
          piece through an arc — invisible at the old 16°, but it throws it
          off-screen at 60°, because the piece sits a metre or so above that
          origin. */}
      <group ref={pitchRef} name="furniture-stack" position={[0, pivotY + pieceOffsetY, 0]}>
      <group position={[0, -pivotY, 0]}>
        <group ref={yawRef}>
          <group position={centerOffset}>
            <group ref={frameSlot} visible={frameVisible}>
              <primitive object={frame.scene} />
              {exploded && <LayerLabel text={config.layers.frame.label} />}
            </group>

            {softMeta && (
              <group ref={softSlot} visible={softVisible}>
                <Suspense fallback={null}>
                  <PartErrorBoundary category="soft">
                    <SoftLayer meta={softMeta} matte={matte} shadows={shadows} sources={sources} />
                  </PartErrorBoundary>
                </Suspense>
                {exploded && <LayerLabel text={softMeta.label} />}
              </group>
            )}

            <group ref={coverSlot}>
              {/* Its own Suspense: a child that suspends hides the *nearest*
                  boundary's whole subtree, so without this a cover swap would
                  blank the frame and cushions too. */}
              <Suspense fallback={null}>
                {/* A single corrupt variant degrades to "unavailable" in the
                    grid; the frame and cushions keep rendering. */}
                <PartErrorBoundary
                  category="cover"
                  onError={(_category, error) => variant && setLayerError(variant.id, error.message)}
                >
                  {coverMounted && variant && (
                    <CoverLayer
                      key={variant.id}
                      variant={variant}
                      direction={coverDirection}
                      matte={matte}
                      shadows={shadows}
                      durationMs={(config.wipe?.durationMs ?? 900) / 2}
                      onWipeComplete={coverPhase === 'wipeOut' ? commitCover : finishWipe}
                    />
                  )}
                </PartErrorBoundary>
              </Suspense>
              {exploded && <LayerLabel text={config.layers.cover.label} />}
            </group>

            {variant && (
              <Suspense fallback={null}>
                <PartErrorBoundary category="cover-source">
                  <CoverSource path={variant.path} sources={sources} onBounds={handleCoverBounds} />
                </PartErrorBoundary>
              </Suspense>
            )}

          </group>
        </group>
      </group>
      </group>
    </>
  )
}

function LayerLabel({ text }: { text: string }) {
  return (
    <Html center distanceFactor={6} position={[0.9, 0.25, 0]} zIndexRange={[20, 0]}>
      <span
        dir="rtl"
        className="font-persian whitespace-nowrap rounded-full border border-[var(--gold-primary)]/30
                   bg-black/70 px-3 py-1 text-[11px] text-[var(--text-primary)] backdrop-blur-sm"
      >
        {text}
      </span>
    </Html>
  )
}
