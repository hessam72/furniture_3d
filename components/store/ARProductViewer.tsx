'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { getARModeName, isIOS } from '@/lib/device-utils'
import { AR_USDZ_MAX_TEXTURE_SIZE } from '@/lib/ar/budget'
import "@google/model-viewer/dist/model-viewer.min.js"

interface ARProductViewerProps {
  glbPath: string
  /**
   * The USDZ Quick Look opens. **Required for AR on iOS** — this is not the
   * optional convenience the comment here used to call it.
   *
   * The old note said that without `ios-src` model-viewer builds the USDZ from
   * the loaded model, so Quick Look would show the live configuration. It does
   * try, and on these models it cannot: every GLB the pages hand it now carries
   * `KHR_texture_basisu`, and the USDZ exporter has to decompress each texture
   * through a throwaway `WebGLRenderer` before it can write a PNG into the zip.
   *
   * When that fails there is nowhere for the failure to go.
   * `openIOSARQuickLook` in model-viewer 4.x is:
   *
   *     const generate = !this.iosSrc
   *     this[arButtonContainer].classList.remove('enabled')
   *     const src = generate ? await this.prepareUSDZ() : this.iosSrc
   *     const url = new URL(src, self.location.toString())
   *     …
   *     anchor.setAttribute('href', url.toString()); anchor.click()
   *
   * — no try/catch, and `prepareUSDZ()` returns `''` when it has no model to
   * write. `new URL('', location)` **is the current page**, so the anchor is
   * clicked with `rel="ar"` pointing at the HTML document and Safari opens
   * Quick Look on it: a black screen, no camera, no error. That is the bug this
   * prop's absence was causing on both product routes.
   */
  usdzPath?: string
  productName: string
  poster?: string
  /** 'fixed' pins the model to its authored real-world size — right for
   *  furniture. Defaults to 'auto' so existing callers are unchanged. */
  arScale?: 'auto' | 'fixed'
  arModes?: string
  /**
   * The cap on textures baked into the USDZ model-viewer generates for Quick
   * Look. @see AR_USDZ_MAX_TEXTURE_SIZE — the default is the fix for the iOS
   * crash, not a tuning knob, so raise it only with a device to test on.
   */
  arUsdzMaxTextureSize?: number
  onClose?: () => void
}

export default function ARProductViewer({
  glbPath,
  usdzPath,
  productName,
  poster,
  arScale = 'auto',
  arModes = 'webxr scene-viewer quick-look',
  arUsdzMaxTextureSize = AR_USDZ_MAX_TEXTURE_SIZE,
  onClose
}: ARProductViewerProps) {
  const locale = useLocale()
  const dir = locale === 'fa' ? 'rtl' : 'ltr'
  const t = useTranslations('ar')
  const modelViewerRef = useRef<HTMLElement & ModelViewerElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [arSupported, setArSupported] = useState(false)

  /**
   * iOS with no USDZ cannot reach AR, and must not be offered a button.
   *
   * `canActivateAR` is true here regardless — model-viewer resolves `quick-look`
   * from the platform, before it knows whether it will be able to build the
   * file. Trusting it hands the customer a button that blanks the page. @see
   * the note on `usdzPath`.
   *
   * Read in an effect, not during render: this component is `ssr: false`, but
   * the UA is not available on the server and a value that differed between the
   * two would be a hydration mismatch if that ever changed.
   */
  const [quickLookBlocked, setQuickLookBlocked] = useState(false)
  useEffect(() => setQuickLookBlocked(isIOS() && !usdzPath), [usdzPath])

  useEffect(() => {
    const mv = modelViewerRef.current
    if (!mv) return

    // model-viewer resolves real AR support (WebXR / Scene Viewer / Quick Look)
    // once the model is loaded. That is the honest signal — a UA sniff calls
    // every desktop incapable and, worse, reads iPadOS 13+ as a Mac.
    const syncARSupport = () => setArSupported(mv.canActivateAR && !quickLookBlocked)

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
  }, [productName, quickLookBlocked])

  return (
    // Above the presentation page's top bar (z-100) and bottom sheet (z-99):
    // a full-screen AR overlay must not have page chrome floating over it.
    <div className="fixed inset-0 z-[200] w-full h-full min-h-screen bg-gradient-to-br from-slate-900 via-black to-slate-900">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="fixed top-18 end-6 z-[999999999] px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-[family-name:var(--font-vazir)] transition-colors"
          dir={dir}
        >
          {t('close')}
        </button>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
          <div className="text-white text-center font-[family-name:var(--font-vazir)]" dir={dir}>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>{t('loadingModel', { name: productName })}</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white p-4 rounded-lg z-20 font-[family-name:var(--font-vazir)]" dir={dir}>
          {t('loadError')}
        </div>
      )}

      {/* AR not supported message */}
      {!arSupported && !isLoading && (
        <div className="absolute bottom-20 left-4 right-4 bg-yellow-500/90 text-black p-4 rounded-lg z-20 text-center font-[family-name:var(--font-vazir)]" dir={dir}>
          <p className="font-semibold mb-1">
            {quickLookBlocked ? t('notAvailableCombo') : t('notAvailableDevice')}
          </p>
          <p className="text-sm">{t('canStillView')}</p>
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
        // Without this model-viewer passes `Infinity` to three's USDZ exporter
        // and re-encodes every texture at full size as PNG into an uncompressed
        // zip — which is what crashes Quick Look. @see AR_USDZ_MAX_TEXTURE_SIZE
        ar-usdz-max-texture-size={arUsdzMaxTextureSize}
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
            className="absolute top-18 start-6 px-6 py-3 bg-white hover:bg-gray-100 active:bg-gray-200 text-black font-semibold rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 z-30 font-[family-name:var(--font-vazir)]"
            dir={dir}
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
            {t('viewInAR')}
          </button>
        )}

        {/* Info panel */}
        <div
          className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-lg font-[family-name:var(--font-vazir)]"
          slot="poster"
          dir={dir}
        >
          <h2 className="text-xl font-bold text-gray-900 mb-2">{productName}</h2>
          <div className="text-sm text-gray-600 space-y-1">
            {arSupported && (
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                {t('active', { mode: getARModeName() })}
              </p>
            )}
            <p>{t('gestureRotate')}</p>
            <p>{t('gesturePinch')}</p>
            {arSupported && <p>{t('gesturePlace')}</p>}
          </div>
        </div>
      </model-viewer>
    </div>
  )
}
