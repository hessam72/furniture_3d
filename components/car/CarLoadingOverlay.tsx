'use client'

import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

interface CarLoadingOverlayProps {
  carName: string
}

/**
 * Branded first-paint overlay for the configurator. Tracks the drei loading
 * manager (scene chunk, car GLB, part GLBs, studio EXR) via useProgress —
 * the viewport is never a bare black canvas while assets stream.
 *
 * Animated with plain CSS transitions: framer-motion would add ~60 kB to
 * the first-load JS of the page whose loading time this overlay exists
 * to soften.
 */
export default function CarLoadingOverlay({ carName }: CarLoadingOverlayProps) {
  const { progress, active } = useProgress()
  const [done, setDone] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (done) return
    if (!active && progress >= 100) {
      // Small grace period absorbs the first-frame shader compile
      const t = setTimeout(() => setDone(true), 400)
      return () => clearTimeout(t)
    }
    if (!active && progress === 0) {
      // Fully warm cache — nothing will ever hit the loading manager
      const t = setTimeout(() => setDone(true), 2500)
      return () => clearTimeout(t)
    }
  }, [active, progress, done])

  // Unmount after the fade-out transition completes
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setHidden(true), 850)
    return () => clearTimeout(t)
  }, [done])

  if (hidden) return null

  return (
    <div
      className={`fixed inset-0 z-[160] flex flex-col items-center justify-center gap-7 bg-[#060608] transition-opacity duration-700 ease-in-out ${
        done ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-label="Loading 3D configurator"
      aria-hidden={done}
    >
      <div className="flex flex-col items-center gap-2 px-6 text-center">
        <span className="text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">
          Configurator
        </span>
        <h2 className="text-2xl font-extralight uppercase tracking-[0.2em] text-white md:text-3xl">
          {carName}
        </h2>
      </div>

      <div className="h-px w-64 overflow-hidden bg-white/10">
        <div
          className="h-full transition-[width] duration-300 ease-out"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(to right, #b8860b, #d4af37, #f5e6b8)',
          }}
        />
      </div>

      <p className="text-[11px] tracking-[0.35em] text-white/40 tabular-nums">
        {Math.round(progress)}%
      </p>
    </div>
  )
}
