'use client'

import { useState, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useComparisonStore } from '@/stores/comparisonStore'
import { useCarConfig } from '@/stores/carConfigStore'
import ConfigurableCar from './ConfigurableCar'
import CarStudioEnvironment from './CarStudioEnvironment'
import CarLighting from './CarLighting'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { IoClose } from 'react-icons/io5'
import carsData from '@/public/config/cars.json'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export default function ComparisonSlider() {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftControls, setLeftControls] = useState<OrbitControlsImpl | null>(null)
  const [rightControls, setRightControls] = useState<OrbitControlsImpl | null>(null)
  const isSyncing = useRef(false)

  const compareMode = useComparisonStore((s) => s.compareMode)
  const beforeSnapshot = useComparisonStore((s) => s.beforeSnapshot)
  const disableCompareMode = useComparisonStore((s) => s.disableCompareMode)

  const currentPaintConfig = useCarConfig((s) => s.paintConfig)
  const currentSelectedParts = useCarConfig((s) => s.selectedParts)
  const currentSuspensionHeight = useCarConfig((s) => s.suspensionHeight)
  const currentCarId = useCarConfig((s) => s.currentCarId)

  if (!compareMode || !beforeSnapshot) return null

  // Get current car model path from cars.json
  const currentCar = carsData.find((car: any) => car.id === currentCarId)
  const modelPath = currentCar?.model_path || ''

  // Synchronize camera rotation between both canvases
  useEffect(() => {
    if (!leftControls || !rightControls) {
      console.log('[ComparisonSlider] Controls not ready yet', { leftControls: !!leftControls, rightControls: !!rightControls })
      return
    }

    console.log('[ComparisonSlider] Setting up camera sync')

    const syncLeftToRight = () => {
      if (isSyncing.current) return
      isSyncing.current = true

      console.log('[ComparisonSlider] Syncing left → right')
      const leftCamera = leftControls.object
      rightControls.object.position.copy(leftCamera.position)
      rightControls.target.copy(leftControls.target)
      rightControls.update()

      isSyncing.current = false
    }

    const syncRightToLeft = () => {
      if (isSyncing.current) return
      isSyncing.current = true

      console.log('[ComparisonSlider] Syncing right → left')
      const rightCamera = rightControls.object
      leftControls.object.position.copy(rightCamera.position)
      leftControls.target.copy(rightControls.target)
      leftControls.update()

      isSyncing.current = false
    }

    leftControls.addEventListener('change', syncLeftToRight)
    rightControls.addEventListener('change', syncRightToLeft)

    return () => {
      console.log('[ComparisonSlider] Cleaning up camera sync')
      leftControls.removeEventListener('change', syncLeftToRight)
      rightControls.removeEventListener('change', syncRightToLeft)
    }
  }, [leftControls, rightControls])

  const handleMouseDown = () => setIsDragging(true)

  const handleMouseMove = (e: MouseEvent | React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const newPos = ((e.clientX - rect.left) / rect.width) * 100
    setSliderPosition(Math.max(0, Math.min(100, newPos)))
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleTouchMove = (e: TouchEvent) => {
    if (!containerRef.current) return
    const touch = e.touches[0]
    const rect = containerRef.current.getBoundingClientRect()
    const newPos = ((touch.clientX - rect.left) / rect.width) * 100
    setSliderPosition(Math.max(0, Math.min(100, newPos)))
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex bg-black"
      onMouseMove={handleMouseMove as any}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Before Canvas - Left Side */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
        }}
      >
        <Canvas
          shadows
          frameloop="demand"
          dpr={[1, 2]}
          gl={{
            antialias: false,
            powerPreference: 'high-performance',
            alpha: false,
          }}
        >
          <PerspectiveCamera makeDefault position={[5, 2, 5]} fov={50} />
          <OrbitControls
            ref={setLeftControls}
            enablePan={false}
            enableZoom={true}
            minDistance={3}
            maxDistance={15}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2}
            target={[0, 0.5, 0]}
          />

          <ConfigurableCar
            modelPath={modelPath}
            overrideSelectedParts={beforeSnapshot.selectedParts}
            overridePaintConfig={beforeSnapshot.paintConfig}
            overrideSuspensionHeight={beforeSnapshot.suspensionHeight}
          />

          <CarLighting />
          <CarStudioEnvironment />
        </Canvas>

        {/* Before Label */}
        <div className="pointer-events-none absolute left-6 top-6 rounded-lg bg-black/60 px-4 py-2 backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">Before</p>
          <p className="text-sm font-medium text-white">Factory Default</p>
        </div>
      </div>

      {/* After Canvas - Right Side */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 0 0 ${sliderPosition}%)`,
        }}
      >
        <Canvas
          shadows
          frameloop="demand"
          dpr={[1, 2]}
          gl={{
            antialias: false,
            powerPreference: 'high-performance',
            alpha: false,
          }}
        >
          <PerspectiveCamera makeDefault position={[5, 2, 5]} fov={50} />
          <OrbitControls
            ref={setRightControls}
            enablePan={false}
            enableZoom={true}
            minDistance={3}
            maxDistance={15}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2}
            target={[0, 0.5, 0]}
          />

          <ConfigurableCar
            modelPath={modelPath}
            overrideSelectedParts={currentSelectedParts}
            overridePaintConfig={currentPaintConfig}
            overrideSuspensionHeight={currentSuspensionHeight}
          />

          <CarLighting />
          <CarStudioEnvironment />
        </Canvas>

        {/* After Label */}
        <div className="pointer-events-none absolute right-6 top-6 rounded-lg bg-black/60 px-4 py-2 backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">After</p>
          <p className="text-sm font-medium text-white">Current Config</p>
        </div>
      </div>

      {/* Draggable Divider */}
      <div
        className="absolute inset-y-0 z-10 flex w-1 cursor-ew-resize items-center justify-center bg-white/80"
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={() => {
          document.addEventListener('touchmove', handleTouchMove)
          document.addEventListener('touchend', () => {
            document.removeEventListener('touchmove', handleTouchMove)
          })
        }}
      >
        {/* Divider Handle */}
        <div className="absolute flex h-16 w-8 items-center justify-center rounded-full bg-white shadow-lg">
          <div className="flex gap-0.5">
            <div className="h-6 w-0.5 rounded-full bg-gray-400" />
            <div className="h-6 w-0.5 rounded-full bg-gray-400" />
          </div>
        </div>
      </div>

      {/* Exit Button */}
      <button
        onClick={disableCompareMode}
        className="pointer-events-auto absolute left-1/2 top-6 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/70 px-5 py-2.5 text-sm font-medium tracking-wide text-white backdrop-blur-md transition-all hover:border-white/40 hover:bg-black/80"
      >
        <IoClose className="text-lg" />
        Exit Comparison
      </button>
    </div>
  )
}
