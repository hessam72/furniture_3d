'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useGLTF, useEnvironment } from '@react-three/drei'
import CustomizationPanel from '@/components/car/CustomizationPanel'
import ComparisonSlider from '@/components/car/ComparisonSlider'
import PhotoModeUI from '@/components/car/PhotoModeUI'
import TopBar from '@/components/car/TopBar'
import ViewDock from '@/components/car/ViewDock'
import CarLoadingOverlay from '@/components/car/CarLoadingOverlay'
import partsConfig from '@/public/config/car-parts.json'
import { useCarConfig, DEFAULT_PARTS } from '@/stores/carConfigStore'
import { useComparisonStore } from '@/stores/comparisonStore'
import { isARCapable } from '@/lib/device-utils'
import { QualityProvider } from '@/contexts/QualityContext'

// Use the local DRACO decoder instead of drei's default CDN — this runs
// before any preload in this chunk (CustomizationPanel included)
useGLTF.setDecoderPath('/draco/')

const CarTuningScene = dynamic(() => import('@/components/car/CarTuningScene'), {
  ssr: false,
  loading: () => <div className="h-screen w-screen bg-[#060608]" />,
})

const ARCarViewer = dynamic(() => import('@/components/car/ARCarViewer'), {
  ssr: false,
})

export interface Car {
  id: string
  name: string
  model_path: string
  usdz_path: string
  specs: {
    engine: string
    horsepower: number
    torque: string
    top_speed: string
  }
}

const STUDIO_HDR = '/hdr/main_hdr.exr'

export default function CarPageClient({ car }: { car: Car }) {
  const [showAR, setShowAR] = useState(false)
  const [arSupported, setArSupported] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [sceneKey, setSceneKey] = useState(0)
  const [baseCarError, setBaseCarError] = useState<string | null>(null)
  const resetConfig = useCarConfig((s) => s.resetConfig)
  const setCurrentCarId = useCarConfig((s) => s.setCurrentCarId)
  const compareMode = useComparisonStore((s) => s.compareMode)

  useEffect(() => {
    setArSupported(isARCapable())
    // Desktop opens with the panel visible — customization is the product
    if (window.matchMedia('(min-width: 768px)').matches) setPanelOpen(true)
  }, [])

  useEffect(() => {
    setCurrentCarId(car.id)
    resetConfig(DEFAULT_PARTS)

    // Warm the drei cache: base car + the stock parts the scene renders first,
    // plus the studio EXR (the largest single asset)
    useGLTF.preload(car.model_path)
    Object.entries(DEFAULT_PARTS).forEach(([category, partId]) => {
      const parts: any[] = partsConfig[category as keyof typeof partsConfig] || []
      const part = parts.find((p) => p.id === partId)
      if (part?.model_path) useGLTF.preload(part.model_path)
    })
    useEnvironment.preload({ files: STUDIO_HDR })
  }, [car, resetConfig, setCurrentCarId])

  const handleBaseCarError = useCallback((_category: string, error: Error) => {
    setBaseCarError(error.message || 'Failed to load the 3D model')
  }, [])

  const retryScene = () => {
    // Purge the cached rejection, re-warm and remount the whole scene
    useGLTF.clear(car.model_path)
    useGLTF.preload(car.model_path)
    setBaseCarError(null)
    setSceneKey((k) => k + 1)
  }

  return (
    <QualityProvider>
      {/* dir=ltr: the configurator UI is English inside an RTL document —
          without this, flex order and text alignment mirror incorrectly */}
      <div className="car-page relative h-screen w-screen overflow-hidden bg-[#060608]" dir="ltr">
        <CarTuningScene key={sceneKey} modelPath={car.model_path} onBaseCarError={handleBaseCarError} />

        <TopBar
          carName={car.name}
          arSupported={arSupported}
          onOpenAR={() => setShowAR(true)}
          panelOpen={panelOpen}
        />

        <ViewDock panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} />

        {/* Photo-mode progress/save overlay (entry button lives in TopBar) */}
        <PhotoModeUI />

        <CustomizationPanel open={panelOpen} onOpenChange={setPanelOpen} />

        {/* Comparison Slider - Before/After view */}
        {compareMode && <ComparisonSlider />}

        {/* AR Viewer Modal */}
        {showAR && (
          <ARCarViewer
            glbPath={car.model_path}
            usdzPath={car.usdz_path}
            carName={car.name}
            onClose={() => setShowAR(false)}
          />
        )}

        {/* Base model failed to load — styled recovery instead of a dead black stage */}
        {baseCarError && (
          <div className="absolute inset-0 z-[150] flex flex-col items-center justify-center gap-4 bg-[#060608]/95 px-6 text-center">
            <p className="text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">Configurator</p>
            <h2 className="text-xl font-extralight uppercase tracking-[0.2em] text-white">
              Model could not be loaded
            </h2>
            <p className="max-w-sm text-sm text-white/40">{baseCarError}</p>
            <button
              onClick={retryScene}
              className="mt-2 rounded-full border border-white/15 px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-white/70 transition-colors hover:border-white/40 hover:text-white"
            >
              Try again
            </button>
          </div>
        )}

        <CarLoadingOverlay carName={car.name} />
      </div>
    </QualityProvider>
  )
}
