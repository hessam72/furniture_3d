'use client'

import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { usePresentation } from '@/stores/presentationStore'
import * as THREE from 'three'
import type { PresentationConfig } from '@/lib/product/presentation'
import type { StackFraming } from './FurnitureStack'

interface Props {
  config: PresentationConfig
  framing: React.MutableRefObject<StackFraming | null>
}

/**
 * A photograph standing behind the piece, as real geometry.
 *
 * Not a CSS layer behind a transparent canvas: a DOM image sits outside the
 * composer, so it would stay sharp and ungraded while the piece picks up
 * vignette, bloom and AO — that mismatch is exactly what makes a backdrop read
 * as pasted on. It also could only fake the dolly with a hand-tuned transform.
 *
 * The plane is sized **once, for the zoomed-out extreme**, then left fixed in
 * world space. That is the whole trick. A plane re-fitted to the frustum every
 * frame is pinned to the screen and looks like a sticker; a fixed one grows and
 * shrinks under the pinch the way a real wall does.
 */
function PresentationBackdrop({ config, framing }: Props) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  // Same input the camera rig frames from, so the two cannot disagree and
  // leave an uncovered strip when the sheet opens.
  const sheetCoverage = usePresentation((s) => s.sheetCoverage)
  const invalidate = useThree((s) => s.invalidate)
  const meshRef = useRef<THREE.Mesh>(null)

  const texture = useTexture(config.room.image!)

  const distance = config.room.imageDistance ?? 6
  const offsetY = config.room.imageOffsetY ?? 0

  // Perpendicular to the same view ray the camera rides. The camera never
  // orbits — only dollies along it — so one fixed orientation stays correct,
  // and living outside `furniture-stack` keeps the piece's yaw off it.
  const viewDir = useMemo(() => {
    const azimuth = THREE.MathUtils.degToRad(config.camera.azimuthDeg ?? 0)
    const elevation = THREE.MathUtils.degToRad(config.camera.elevationDeg ?? 10)
    return new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation)
    ).normalize()
  }, [config.camera.azimuthDeg, config.camera.elevationDeg])

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    // The plane is cropped to the photo, never the other way round.
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
  }, [texture])

  const appliedVersion = useRef(-1)
  const appliedFov = useRef(-1)

  const fit = useCallback(() => {
    const mesh = meshRef.current
    const frame = framing.current
    if (!mesh || !frame || !size.height) return

    const aspect = size.width / size.height
    // The live lens, not the manifest's: the rig opens the fov up when the room
    // is too shallow to frame the piece from, and a plane sized for the narrower
    // one leaves bare canvas down the sides.
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)

    // The rig's own framing solve, reproduced exactly — including the live
    // sheet coverage. Sizing against the *cap* (0.62) instead of the current
    // value inflated the plane by up to 2.6x, which is why the photo opened
    // cropped into its middle third instead of fitting the screen.
    const coverage = Math.min(sheetCoverage, 0.62)
    const radius = Math.hypot(frame.size.x, frame.size.z) / 2
    const framed =
      Math.max(frame.size.y / (1 - coverage) / 2 / halfFov, radius / (halfFov * aspect)) *
      (config.camera.padding ?? 1.15)

    // Solved at the zoom-out extreme and then left fixed in world space, so the
    // pinch moves it by real perspective rather than re-pinning it to the
    // screen. The residual over-size at the opening zoom is the ratio between
    // the two ends of the dolly — `camera.maxZoom` is the dial for it, and the
    // further back `imageDistance` puts the plane the smaller that ratio gets.
    const far = framed * (config.camera.maxZoom ?? 1.8) + distance

    // 2% of slack so rounding never shows a sliver of empty frame at the edge.
    const height = 2 * far * halfFov * 1.02
    const width = height * aspect
    mesh.scale.set(width, height, 1)

    // Cover-fit, computed against the *plane*, not the viewport: crop the photo
    // on its long axis rather than stretching it at any window shape.
    const image = texture.image as { width?: number; height?: number } | undefined
    if (image?.width && image?.height) {
      const imageAspect = image.width / image.height
      const planeAspect = width / height
      if (imageAspect > planeAspect) {
        texture.repeat.set(planeAspect / imageAspect, 1)
        texture.offset.set((1 - texture.repeat.x) / 2, 0)
      } else {
        texture.repeat.set(1, imageAspect / planeAspect)
        texture.offset.set(0, (1 - texture.repeat.y) / 2)
      }
    }

    mesh.position.copy(frame.center).addScaledVector(viewDir, -distance)
    mesh.position.y += offsetY
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), viewDir)

    // `far` already is the camera-to-plane distance at full zoom-out.
    const camFar = config.camera.far ?? 40
    if (process.env.NODE_ENV !== 'production' && far > camFar) {
      console.warn(
        `[PresentationBackdrop] backdrop sits ~${far.toFixed(1)}m from the camera but camera.far is ${camFar} — raise camera.far or lower room.imageDistance`
      )
    }

    invalidate()
  }, [size, sheetCoverage, config.camera, camera, distance, offsetY, texture, viewDir, framing, invalidate])

  // The stack publishes its bounds through a ref, so there is nothing to
  // subscribe to — poll the version the way PresentationGestures does, and
  // re-fit when it changes (first measure, a different product, explode).
  useFrame(() => {
    const version = framing.current?.version ?? -1
    // The rig can widen the lens after this has already fitted once — it solves
    // in the same frame, off the same version — so the fov is polled too.
    if (version >= 0 && (version !== appliedVersion.current || camera.fov !== appliedFov.current)) {
      appliedVersion.current = version
      appliedFov.current = camera.fov
      fit()
    }
  })

  useEffect(fit, [fit])

  return (
    <mesh ref={meshRef} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      {/* Unlit: the studio rig lights the piece, never the photograph. */}
      <meshBasicMaterial map={texture} />
    </mesh>
  )
}

/** @see the note on the memo in PresentationScene. */
export default memo(PresentationBackdrop)
