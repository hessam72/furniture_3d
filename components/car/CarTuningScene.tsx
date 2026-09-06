'use client'

import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { NeutralToneMapping } from 'three'
import { PerfLadder } from '@/components/three/PerfLadder'
import { clampDprToBudget } from '@/lib/three/dprBudget'

// Color-accurate paint rendering: Khronos PBR Neutral keeps brand colors
// on-hue (ACESFilmic pushed pure red toward orange). Swap here for look-dev
// (AgXToneMapping = filmic alternative, also hue-stable).
const TONE_MAPPING = NeutralToneMapping
const TONE_MAPPING_EXPOSURE = 1.0
import { ReflectiveFloor } from '@/components/store/ReflectiveFloor'
import { PostProcessing } from '@/components/store/PostProcessing'
import CarGroundShadows from './CarGroundShadows'
import CarLighting from './CarLighting'
import CarStudioEnvironment from './CarStudioEnvironment'
import ConfigurableCar from './ConfigurableCar'
import CameraControls from './CameraControls'
import InteriorLookControls from './InteriorLookControls'
import PartClickDetector from './PartClickDetector'
import { PartErrorBoundary } from './PartErrorBoundary'
import PhotoMode from './PhotoMode'
import ShadowFreeze from './ShadowFreeze'
import { useCameraStore } from '@/stores/cameraStore'
import { useQuality } from '@/contexts/QualityContext'
import { CarReflectiveFloor } from '../store/CarReflectiveFloor'

interface CarTuningSceneProps {
  modelPath: string
  /** Base-car GLB failed to load/parse — lets the page show a styled recovery overlay */
  onBaseCarError?: (category: string, error: Error) => void
}

export default function CarTuningScene({ modelPath, onBaseCarError }: CarTuningSceneProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialPosition: [number, number, number] = isMobile ? [8, 3.2, 8] : [5, 2, 5]
  const { activePreset } = useCameraStore()
  const { settings } = useQuality()

  // Sustained-FPS ladder: DreiPerformanceMonitor steps the max DPR down
  // (1 → 0.85 → 0.7) when frame rate can't hold, and back up when it can.
  // Quality yields only under real load and recovers automatically.
  const [perfScale, setPerfScale] = useState(1)
  const dpr = useMemo<[number, number]>(() => {
    const [min, max] = clampDprToBudget(settings.dpr)
    return [min, Math.max(min, +(max * perfScale).toFixed(2))]
  }, [settings.dpr, perfScale])

  return (
    <div className="w-full h-screen" style={{ cursor: 'auto' }}>
      <Canvas
        shadows
        frameloop="demand"
        dpr={dpr}
        gl={{
          // The EffectComposer renders offscreen, so canvas MSAA never applies —
          // AA lives in the composer (multisampling/SMAA per quality tier)
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: TONE_MAPPING,
          toneMappingExposure: TONE_MAPPING_EXPOSURE,
        }}
        camera={{
          position: initialPosition,
          fov: 50,
          near: 0.1,
          far: 1000,
        }}
      >
        {/* Sustained-FPS ladder + adaptive DPR during camera interaction
            (shared with the /store scene) */}
        <PerfLadder onScale={setPerfScale} adaptive={settings.adaptiveDpr} />

        {/* Shadow maps re-render only when shadow content can change */}
        <ShadowFreeze />

        {/* Studio environment: EXR base + Lightformer highlight rig */}
        <CarStudioEnvironment />

        {/* Studio Lighting */}
        <CarLighting />

        {/* Reflective Floor — the reflection pass re-renders the scene every
            drawn frame, so the low tier swaps to a plain matte floor */}
        <CarReflectiveFloor
          resolution={settings.floorReflectionResolution}
          enabled={settings.floorReflectionsEnabled}
        />

        {/* Ground contact shadows (contact or accumulative per quality tier) */}
        <CarGroundShadows />

        {/* Configurable Car with Part Swapping. A 404ing/corrupt base GLB is
            caught here instead of white-screening the whole page. */}
        <PartErrorBoundary category="base-car" onError={onBaseCarError}>
          <ConfigurableCar modelPath={modelPath} />
        </PartErrorBoundary>

        {/* Post Processing */}
        <PostProcessing />

        {/* Camera Controls */}
        <CameraControls />

        {/* Interior Look Controls */}
        {activePreset === 'interior' && <InteriorLookControls />}

        {/* Part Click Detection */}
        <PartClickDetector />

        {/* Path-traced photo mode (entry button in TopBar, overlay in PhotoModeUI) */}
        <PhotoMode />
      </Canvas>
    </div>
  )
}
