'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { preparePresentationObject } from '@/lib/three/layerMaterials'
import { useQuality } from '@/contexts/QualityContext'

/**
 * The plinth the piece stands on inside the plain viewer.
 *
 * Real geometry rather than a CSS ellipse behind the canvas: a drawn ellipse
 * cannot go *behind* the piece as it turns, cannot catch the environment, and
 * slides out of register the moment the camera moves. This is three meshes and
 * costs nothing next to the piece itself.
 *
 * Sizes are ratios of the piece's own measured radius, never metres, because a
 * GLB may be authored in any unit — the same numbers frame a 2.4-unit sofa and
 * a 240-unit one.
 */
export interface PlinthSpec {
  /** A modelled stage of your own. Seated and scaled to the piece; the
   *  procedural plinth below is skipped entirely. */
  path?: string | null
  /** Top surface colour of the procedural plinth. */
  color?: string
  /** The LED halo around its edge. `null` turns the ring off. */
  glow?: string | null
  /** Plinth radius as a multiple of the piece's footprint radius. */
  radiusScale?: number
  /** Plinth height as a fraction of the piece's radius. */
  height?: number
  /** GLB stage only: extra uniform scale after it is fitted. */
  scale?: number
  /** GLB stage only: nudge after it is centred and seated. */
  offset?: [number, number, number]
}

function GlbStage({
  spec,
  bottom,
  radius,
}: {
  spec: PlinthSpec
  bottom: number
  radius: number
}) {
  const gltf = useGLTF(spec.path as string)
  const { settings } = useQuality()

  const object = useMemo(() => {
    const clone = gltf.scene.clone(true)
    preparePresentationObject(clone, {
      envMapIntensity: settings.envIntensity,
      anisotropy: settings.anisotropyLevel,
      shadows: false,
    })

    // Fit the stage to the piece rather than trusting its authored unit, then
    // seat its top face exactly on the piece's underside.
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const footprint = Math.max(size.x, size.z) / 2 || 1
    const fit = ((radius * (spec.radiusScale ?? 1.25)) / footprint) * (spec.scale ?? 1)
    clone.scale.setScalar(fit)

    const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(fit)
    clone.position.set(-centre.x, bottom - box.max.y * fit, -centre.z)
    if (spec.offset) clone.position.add(new THREE.Vector3().fromArray(spec.offset))

    return clone
  }, [gltf.scene, spec, bottom, radius, settings.envIntensity, settings.anisotropyLevel])

  return <primitive object={object} />
}

export default function ViewerPlinth({
  spec,
  /** Y of the piece's underside, in the centred space the viewer draws in. */
  bottom,
  /** Half the piece's footprint — what the plinth has to cover. */
  radius,
}: {
  spec: PlinthSpec
  bottom: number
  radius: number
}) {
  if (spec.path) return <GlbStage spec={spec} bottom={bottom} radius={radius} />

  const r = radius * (spec.radiusScale ?? 1.2)
  const h = radius * (spec.height ?? 0.1)
  const color = spec.color ?? '#f7f8fa'
  const glow = spec.glow === null ? null : spec.glow ?? '#5b8def'

  return (
    <group position={[0, bottom, 0]}>
      {/* The body, and the inset top the design's plinth reads as a second
          plate. Both are lit by the same HDR the piece is. */}
      <mesh position={[0, -h / 2, 0]}>
        <cylinderGeometry args={[r, r * 0.99, h, 64]} />
        {/* envMapIntensity above 1: the plinth is meant to read as a lit white
            plate, and under the studio fill alone a white standard material
            settles to mid-grey. */}
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.04} envMapIntensity={1.4} />
      </mesh>
      <mesh position={[0, -h * 0.12, 0]}>
        <cylinderGeometry args={[r * 0.94, r * 0.94, h * 0.24, 64]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.02} envMapIntensity={1.6} />
      </mesh>

      {/* The cold strip around the rim. Unlit on purpose — it is a light
          source in the fiction, so shading it would read as a painted band. */}
      {glow && (
        <mesh position={[0, -h * 0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 1.005, r * 1.16, 64]} />
          <meshBasicMaterial
            color={glow}
            transparent
            opacity={0.22}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
