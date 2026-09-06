'use client'

import { memo, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { preparePresentationObject } from '@/lib/three/layerMaterials'
import { useQuality } from '@/contexts/QualityContext'
import { sunEnabled, type PresentationConfig } from '@/lib/product/presentation'

/**
 * The trimmed presentation booth.
 *
 * Authored front-facing only — there is no geometry behind the static camera,
 * which is where the real saving lives (download, parse and VRAM, none of which
 * frustum culling helps with). Never a paint target, and a shadow caster only
 * where the product configures a sun — trimming the room is what made dropping
 * the shadow pass worth it, so it is paid for deliberately or not at all.
 */
/** Published so the camera rig can keep itself inside the walls. */
export interface RoomBounds {
  box: THREE.Box3
}

/** Headroom over the room's own reach before the far plane clips it. */
const FAR_MARGIN = 5

function PresentationRoom({
  config,
  bounds,
  onBounds,
}: {
  config: PresentationConfig & { room: { path: string } }
  bounds?: React.MutableRefObject<RoomBounds | null>
  /** The same box as `bounds`, but as a render-triggering callback — the
   *  gallery rig is JSX and cannot read a ref that mutates silently. */
  onBounds?: (box: THREE.Box3 | null) => void
}) {
  const gltf = useGLTF(config.room.path)
  const invalidate = useThree((s) => s.invalidate)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const { settings } = useQuality()

  const { room } = config
  const floorY = room.floorY ?? 0
  const alignFloor = room.alignFloor !== false
  const scaleFactor = room.scale ?? 1
  const doubleSide = room.doubleSide === true
  const offset = room.offset
  const shadows = sunEnabled(config)

  // Never matte. The matte flag exists to stop the *furniture* picking up
  // environment reflections, and it does that per-material. A room GLB is
  // authored to be lit by the environment, so zeroing its envMapIntensity
  // renders it black — which is exactly what it did.
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    preparePresentationObject(clone, {
      envMapIntensity: room.envIntensity ?? 1,
      anisotropy: settings.anisotropyLevel,
      // Casts the window frame's pattern onto the floor and receives the patch.
      // The *glass* / *lamp* name rules that make that read correctly live in
      // preparePresentationObject, shared with the furniture.
      shadows,
    })

    // Lifted from /store's ModelLoader, which forces DoubleSide on any mesh
    // named *ceiling*. A ceiling is modelled to be seen from below and often
    // exported with its normals pointing up, so from inside the room it is
    // culled and the room reads as open to a black sky. `room.doubleSide`
    // widens the same treatment to every mesh, for a model authored to be
    // viewed from outside.
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return
      const name = child.name.toLowerCase()
      const materials = Array.isArray(child.material) ? child.material : [child.material]

      if (doubleSide || name.includes('ceiling') || child.position.y > 3) {
        materials.forEach((mat: THREE.Material) => {
          mat.side = THREE.DoubleSide
          mat.needsUpdate = true
        })
      }

      // Also from ModelLoader: a mesh named *light* is a fixture, and the GLB
      // ships it unlit — the store makes it glow rather than lighting it. A
      // room whose only illumination is its own fixtures is otherwise a set of
      // black rectangles where the lamps should be.
      if (name.includes('light')) {
        materials.forEach((mat: THREE.Material) => {
          const std = mat as THREE.MeshStandardMaterial
          if (!std.emissive) return
          std.emissive = new THREE.Color('#f6ffc4')
          std.emissiveIntensity = 2
          std.needsUpdate = true
        })
      }
    })

    // Placement. This page used to render the room at whatever origin it was
    // exported with, while both /store and the furniture on this page seat the
    // model on the floor first — so a room whose origin is not at its floor was
    // the one asset in the scene standing somewhere else entirely.
    clone.scale.setScalar(scaleFactor)
    const authored = new THREE.Box3().setFromObject(clone)
    const lift = alignFloor ? floorY - authored.min.y : 0
    clone.position.set(offset?.[0] ?? 0, lift + (offset?.[1] ?? 0), offset?.[2] ?? 0)

    if (process.env.NODE_ENV !== 'production') {
      const size = authored.getSize(new THREE.Vector3())
      const f = (n: number) => n.toFixed(2)
      console.log(
        `[PresentationRoom] ${room.path}` +
          ` · authored ${authored.min.toArray().map(f).join('/')} → ${authored.max.toArray().map(f).join('/')}` +
          ` (${size.toArray().map(f).join(' x ')}m)` +
          ` · scale ${scaleFactor} · lift ${f(lift)}${alignFloor ? '' : ' (alignFloor off)'}`
      )
      if (alignFloor && Math.abs(lift) > 0.5) {
        console.warn(
          `[PresentationRoom] the room GLB's origin is ${f(-lift)}m from its floor, so it was` +
            ' authored to sit somewhere other than on the ground. It has been seated on' +
            ' room.floorY the way /store seats every model. Set room.alignFloor false to' +
            ' render it at its authored origin instead.'
        )
      }
    }

    return clone
  }, [
    gltf.scene,
    room.envIntensity,
    room.path,
    settings.anisotropyLevel,
    alignFloor,
    scaleFactor,
    doubleSide,
    offset,
    floorY,
    shadows,
  ])

  // Publish the walls. The camera rig derives its distance purely from the
  // piece and has never known the room exists — which was fine while the piece
  // was measured once, but the framing can now change after load, and a camera
  // that reverses through the back wall renders solid black.
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    if (bounds) bounds.current = { box }
    onBounds?.(box)

    // /store runs its camera at far 200; this page runs 40, chosen to keep depth
    // precision tight for N8AO. That is the right default for a booth and wrong
    // for a real room — anything past it is clipped away, and a room clipped
    // away around a piece framed inside it leaves an empty screen. Raise it only
    // as far as this room actually needs, and never lower it.
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const needed = sphere.center.length() + sphere.radius + FAR_MARGIN
    if (needed > camera.far) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[PresentationRoom] the room reaches ${needed.toFixed(1)}m but camera.far is` +
            ` ${camera.far} — raising it so the room is not clipped away. Set camera.far in` +
            ' the manifest to make this deliberate, or scale the room GLB down if it is' +
            ' larger than the space it is meant to be.'
        )
      }
      camera.far = needed
      camera.updateProjectionMatrix()
    }

    // Demand loop: without a frame the rig never reads the new bounds.
    invalidate()
    if (process.env.NODE_ENV !== 'production') {
      const size = box.getSize(new THREE.Vector3())
      console.log(
        `[PresentationRoom] bounds ${box.min.toArray().map((n) => n.toFixed(1)).join('/')}` +
          ` → ${box.max.toArray().map((n) => n.toFixed(1)).join('/')}` +
          ` (${size.toArray().map((n) => n.toFixed(1)).join(' x ')}m)`
      )
    }
    return () => {
      if (bounds) bounds.current = null
      onBounds?.(null)
    }
  }, [scene, bounds, onBounds, invalidate, camera])

  return <primitive object={scene} name="presentation-room" />
}

/** @see the note on the memo in PresentationScene. */
export default memo(PresentationRoom)
