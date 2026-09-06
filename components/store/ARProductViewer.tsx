'use client'

import { useEffect, useRef, useState } from 'react'
import { getARModeName } from '@/lib/device-utils'
import "@google/model-viewer/dist/model-viewer.min.js"

interface ARProductViewerProps {
  glbPath: string
  /** Omit for a runtime-generated GLB: with no `ios-src`, model-viewer builds
   *  the USDZ from the loaded model, so Quick Look shows the live config. An
   *  empty string would defeat that, so the attribute is dropped entirely. */
  usdzPath?: string
  productName: string
  poster?: string
  /** 'fixed' pins the model to its authored real-world size — right for
   *  furniture. Defaults to 'auto' so existing callers are unchanged. */
  arScale?: 'auto' | 'fixed'
  arModes?: string
  onClose?: () => void
}

export default function ARProductViewer({
  glbPath,
  usdzPath,
  productName,
  poster,
  arScale = 'auto',
  arModes = 'webxr scene-viewer quick-look',
  onClose
}: ARProductViewerProps) {
  const modelViewerRef = useRef<HTMLElement & ModelViewerElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [arSupported, setArSupported] = useState(false)

  useEffect(() => {
    const mv = modelViewerRef.current
    if (!mv) return

    // model-viewer resolves real AR support (WebXR / Scene Viewer / Quick Look)
    // once the model is loaded. That is the honest signal — a UA sniff calls
    // every desktop incapable and, worse, reads iPadOS 13+ as a Mac.
    const syncARSupport = () => setArSupported(mv.canActivateAR)

    const handleLoadEvent = () => {
      setIsLoading(false)
      syncARSupport()
    }

    const handleErrorEvent = () => {
      setIsLoading(false)
      setError('Failed to load 3D model')
      console.error('❌ AR Model error')
    }

    mv.addEventListener('load', handleLoadEvent)
    mv.addEventListener('error', handleErrorEvent)
    mv.addEventListener('ar-status', syncARSupport)

    return () => {
      mv.removeEventListener('load', handleLoadEvent)
      mv.removeEventListener('error', handleErrorEvent)
      mv.removeEventListener('ar-status', syncARSupport)
    }
  }, [productName])

  return (
    // Above the presentation page's top bar (z-100) and bottom sheet (z-99):
    // a full-screen AR overlay must not have page chrome floating over it.
    <div className="fixed inset-0 z-[200] w-full h-full min-h-screen bg-gradient-to-br from-slate-900 via-black to-slate-900">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="fixed top-18 right-6 z-[999999999] px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-[family-name:var(--font-vazir)] transition-colors"
          dir="rtl"
        >
          بستن
        </button>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
          <div className="text-white text-center font-[family-name:var(--font-vazir)]" dir="rtl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>در حال بارگذاری {productName}...</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white p-4 rounded-lg z-20 font-[family-name:var(--font-vazir)]" dir="rtl">
          خطا در بارگذاری مدل سه‌بعدی
        </div>
      )}

      {/* AR not supported message */}
      {!arSupported && !isLoading && (
        <div className="absolute bottom-20 left-4 right-4 bg-yellow-500/90 text-black p-4 rounded-lg z-20 text-center font-[family-name:var(--font-vazir)]" dir="rtl">
          <p className="font-semibold mb-1">واقعیت افزوده در این دستگاه فعال نیست</p>
          <p className="text-sm">شما می‌توانید مدل سه‌بعدی را مشاهده و چرخش دهید</p>
        </div>
      )}

      {/* Model Viewer */}
      <model-viewer
        ref={modelViewerRef}
        src={glbPath}
        {...(usdzPath ? { 'ios-src': usdzPath } : {})}
        alt={productName}
        poster={poster}
        seamless-poster
        loading="eager"
        reveal="auto"

        // AR Configuration
        ar
        ar-modes={arModes}
        ar-scale={arScale}
        ar-placement="floor"
        xr-environment

        // Visual enhancements
        camera-controls
        auto-rotate
        auto-rotate-delay={1000}
        rotation-per-second="30deg"
        shadow-intensity={1}
        shadow-softness={0.5}
        exposure={1}

        // Camera settings
        camera-orbit="0deg 75deg 3m"
        min-camera-orbit="auto auto 0.1m"
        max-camera-orbit="auto auto 10m"
        field-of-view="40deg"

        // Interaction
        interaction-prompt="auto"
        interaction-prompt-threshold={500}

        style={{
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      >
        {/* Custom AR Button */}
        {arSupported && (
          <button
            slot="ar-button"
            className="absolute top-18 left-6 px-6 py-3 bg-white hover:bg-gray-100 active:bg-gray-200 text-black font-semibold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 z-30 font-[family-name:var(--font-vazir)]"
            dir="rtl"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
            مشاهده در واقعیت افزوده
          </button>
        )}

        {/* Info panel */}
        <div
          className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-lg font-[family-name:var(--font-vazir)]"
          slot="poster"
          dir="rtl"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-2">{productName}</h2>
          <div className="text-sm text-gray-600 space-y-1">
            {arSupported && (
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                واقعیت افزوده فعال است ({getARModeName()})
              </p>
            )}
            <p>• چرخش: یک انگشت را بکشید</p>
            <p>• بزرگنمایی: با دو انگشت پینچ کنید</p>
            {arSupported && <p>• برای قرار دادن در فضای خود، روی دکمه واقعیت افزوده بزنید</p>}
          </div>
        </div>
      </model-viewer>
    </div>
  )
}
