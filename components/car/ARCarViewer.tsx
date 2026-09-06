'use client'

import { useEffect, useRef, useState } from 'react'
// Registers the <model-viewer> custom element. Without this side-effect
// import the tag renders as an inert unknown element and AR never works.
// The dist bundle ships its own three copy — the package peers three@^0.183
// while this project pins 0.170, so the ESM build must not be used. This
// file is only ever loaded via next/dynamic, so the library stays in the
// on-demand AR chunk, not the base /car bundle.
import '@google/model-viewer/dist/model-viewer.min.js'
import { isARCapable, getARModeName } from '@/lib/device-utils'

interface ARCarViewerProps {
  glbPath: string
  usdzPath: string
  carName: string
  onClose: () => void
}

export default function ARCarViewer({
  glbPath,
  usdzPath,
  carName,
  onClose
}: ARCarViewerProps) {
  const modelViewerRef = useRef<HTMLElement & ModelViewerElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [arSupported, setArSupported] = useState(false)

  useEffect(() => {
    setArSupported(isARCapable())

    const mv = modelViewerRef.current
    if (!mv) return

    const handleLoadEvent = () => {
      setIsLoading(false)
      console.log('✅ AR Car loaded:', carName)
    }

    const handleErrorEvent = () => {
      setIsLoading(false)
      setError('Failed to load 3D model')
      console.error('❌ AR Car error')
    }

    mv.addEventListener('load', handleLoadEvent)
    mv.addEventListener('error', handleErrorEvent)

    return () => {
      mv.removeEventListener('load', handleLoadEvent)
      mv.removeEventListener('error', handleErrorEvent)
    }
  }, [carName])

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-black to-slate-900">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-30 px-4 py-2 bg-white/90 hover:bg-white text-black font-semibold rounded-lg shadow-lg transition-all"
      >
        ✕
      </button>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Loading {carName}...</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white p-4 rounded-lg z-20">
          Failed to load 3D model
        </div>
      )}

      {/* AR not supported message */}
      {!arSupported && !isLoading && (
        <div className="absolute bottom-20 left-4 right-4 bg-yellow-500/90 text-black p-4 rounded-lg z-20 text-center">
          <p className="font-semibold mb-1">AR Not Available on This Device</p>
          <p className="text-sm">You can still view and rotate the 3D model</p>
        </div>
      )}

      {/* Model Viewer */}
      <model-viewer
        ref={modelViewerRef}
        src={glbPath}
        ios-src={usdzPath}
        alt={carName}
        seamless-poster
        loading="eager"
        reveal="auto"

        // AR Configuration
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="auto"
        ar-placement="floor"
        // scale="0.5"
        xr-environment

        // Visual enhancements
        camera-controls
        auto-rotate
        auto-rotate-delay={1000}
        rotation-per-second="15deg"
        shadow-intensity={1}
        shadow-softness={0.5}
        exposure={1}

        // Camera settings - adjusted for car size
        camera-orbit="45deg 75deg 3m"
        min-camera-orbit="auto auto 1m"
        max-camera-orbit="auto auto 30m"
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
            className="absolute top-6 left-6 px-6 py-3 bg-white hover:bg-gray-100 active:bg-gray-200 text-black font-semibold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 z-30"
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
            View in AR
          </button>
        )}

        {/* Info panel */}
        <div
          className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-lg"
          slot="poster"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-2">{carName}</h2>
          <div className="text-sm text-gray-600 space-y-1">
            {arSupported && (
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                AR Available ({getARModeName()})
              </p>
            )}
            <p>• Rotate: Drag with one finger</p>
            <p>• Zoom: Pinch with two fingers</p>
            {arSupported && <p>• Tap the AR button to place in your space</p>}
          </div>
        </div>
      </model-viewer>
    </div>
  )
}
