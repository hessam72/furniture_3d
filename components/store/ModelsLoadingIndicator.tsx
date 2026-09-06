'use client'
import { useState, useEffect } from 'react'
import { useProgress } from '@react-three/drei'

interface ModelsLoadingIndicatorProps {
  fadeOut?: boolean
  loadedCount?: number
  totalCount?: number
}

/**
 * Gallery model-streaming indicator, in the same design language as the
 * /car loading overlay. Byte-level % comes from the drei loading manager
 * (raw useLoader reports through it); the model count is shown alongside.
 */
export function ModelsLoadingIndicator({
  fadeOut = false,
  loadedCount,
  totalCount
}: ModelsLoadingIndicatorProps) {
  const { progress } = useProgress()
  const [opacity, setOpacity] = useState(1)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (fadeOut) {
      const fadeStart = Date.now()
      const fadeDuration = 300

      const interval = setInterval(() => {
        const elapsed = Date.now() - fadeStart
        const newOpacity = Math.max(1 - elapsed / fadeDuration, 0)
        setOpacity(newOpacity)

        if (newOpacity <= 0) {
          clearInterval(interval)
          setVisible(false)
        }
      }, 16)

      return () => clearInterval(interval)
    }
  }, [fadeOut])

  if (!visible) return null

  const showCount = loadedCount !== undefined && totalCount !== undefined

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center transition-opacity duration-300"
      style={{ opacity }}
    >
      <div className="flex w-72 flex-col items-center gap-5 rounded-2xl border border-white/10 bg-black/60 px-8 py-7 backdrop-blur-xl">
        <span className="text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">Gallery</span>
        <p className="font-[family-name:var(--font-vazir)] text-sm text-white/80" dir="rtl">
          بارگذاری مدل‌های سه‌بعدی...
        </p>

        <div className="h-px w-full overflow-hidden bg-white/10">
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(to right, #b8860b, #d4af37, #f5e6b8)',
            }}
          />
        </div>

        <p className="text-[11px] tracking-[0.35em] text-white/40 tabular-nums">
          {Math.round(progress)}%{showCount ? ` · ${loadedCount}/${totalCount}` : ''}
        </p>
      </div>
    </div>
  )
}
