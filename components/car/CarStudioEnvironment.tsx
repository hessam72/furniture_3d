'use client'

import { Environment, Lightformer } from '@react-three/drei'
import { useQuality } from '@/contexts/QualityContext'
import { useLightingStore } from '@/stores/lightingStore'

/**
 * Automotive studio environment. The existing EXR renders as the virtual
 * scene's background (low-frequency base), and a Lightformer rig layers the
 * high-contrast strip/softbox highlights that make paint and clearcoat read.
 * frames={1}: captured once into a cubemap on mount — zero per-frame cost;
 * re-captured automatically if the rig (rotation) or resolution changes.
 */
export default function CarStudioEnvironment() {
  const { settings } = useQuality()

  // Get dynamic lighting environment values from store
  const hdriPath = useLightingStore((s) => s.hdriPath)
  const envRotation = useLightingStore((s) => s.envRotation)
  const envIntensity = useLightingStore((s) => s.envIntensity)

  // Convert degrees to radians for rotation
  const rotationRadians = (envRotation * Math.PI) / 180

  return (
    <Environment
      files={hdriPath}
      background={false}
      resolution={settings.envResolution}
      frames={1}
      environmentIntensity={envIntensity}
    >
      <group rotation={[0, rotationRadians, 0]}>
        {/* Overhead light-strip tunnel — the signature streaks along the body */}
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 5, -2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[9, 1, 1]}
        />
        <Lightformer
          form="rect"
          intensity={3.5}
          position={[0, 5, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[9, 1.2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 5, 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[9, 1, 1]}
        />

        {/* Side softboxes — broad fill so the flanks aren't dead */}
        <Lightformer
          form="rect"
          intensity={1}
          position={[-6, 2, 0]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[6, 3, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1}
          position={[6, 2, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[6, 3, 1]}
        />

        {/* Cool rim card behind, warm card in front */}
        <Lightformer
          form="rect"
          intensity={0.8}
          color="#a8c2ff"
          position={[0, 3, -7]}
          scale={[8, 3, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.6}
          color="#ffe8d0"
          position={[0, 1.5, 7]}
          rotation={[0, Math.PI, 0]}
          scale={[8, 2, 1]}
        />

        {/* Soft overhead ring for ambient wrap */}
        <Lightformer
          form="ring"
          intensity={0.5}
          position={[0, 8, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[12, 12, 1]}
        />
      </group>
    </Environment>
  )
}
