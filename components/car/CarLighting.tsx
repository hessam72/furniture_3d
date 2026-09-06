'use client'

import { useQuality } from '@/contexts/QualityContext'
import { useLightingStore } from '@/stores/lightingStore'

interface LightFlickerData {
  intensities: {
    key: number
    fill: number
    rim: number
    bounce: number
    ambient: number
  }
  isComplete: boolean
}

interface CarLightingProps {
  flickerData?: LightFlickerData
}

export default function CarLighting({ flickerData }: CarLightingProps) {
  // Use provided flicker data or default to full brightness
  const data = flickerData ?? { intensities: { key: 1, fill: 1, rim: 1, bounce: 1, ambient: 0.3 }, isComplete: true }
  const flickerMultipliers = data.intensities
  const { settings } = useQuality()

  // Get lighting intensities from store
  const keyIntensity = useLightingStore((s) => s.keyIntensity)
  const fillIntensity = useLightingStore((s) => s.fillIntensity)
  const rimIntensity = useLightingStore((s) => s.rimIntensity)

  // Bounce light is not user-controllable
  const BOUNCE_INTENSITY = 40

  return (
    <>
      {/* Key Light - Main illumination from front-right */}
      <spotLight
        position={[5, 8, 5]}
        intensity={keyIntensity * flickerMultipliers.key}
        angle={0.5}
        penumbra={0.5}
        castShadow
        shadow-mapSize-width={settings.shadowResolution}
        shadow-mapSize-height={settings.shadowResolution}
        shadow-camera-near={5}
        shadow-camera-far={18}
        shadow-bias={-0.0001}
        shadow-normalBias={0.03}
      />

      {/* Fill Light - Soften shadows from left */}
      <spotLight
        position={[-5, 5, 3]}
        intensity={fillIntensity * flickerMultipliers.fill}
        angle={0.6}
        penumbra={0.7}
      />

      {/* Rim Light - Edge highlight from back */}
      <spotLight
        position={[0, 4, -6]}
        intensity={rimIntensity * flickerMultipliers.rim}
        angle={0.4}
        penumbra={0.6}
        color="#88aaff"
      />

      {/* Ground bounce light - realistic reflected light from floor */}
      <pointLight
        position={[0, 0.5, 0]}
        intensity={BOUNCE_INTENSITY * flickerMultipliers.bounce}
        distance={6}
        decay={2}
        color="#ffeedd"
      />

      {/* Ambient fill - smooth fade, no flicker */}
      <ambientLight intensity={flickerMultipliers.ambient} />

      {/* PERMANENT REFLECTION LIGHTS - Always on, not affected by flicker */}

 
    </>
  )
}
