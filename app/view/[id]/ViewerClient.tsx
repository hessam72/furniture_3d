'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { QualityProvider } from '@/contexts/QualityContext'
import {
  simpleViewer,
  simpleViewerQuality,
  type DeviceClass,
} from '@/lib/product/presentation'
import { isARCapable } from '@/lib/device-utils'
import { assetHdrUrl, assetUrl, uploadViewerConfig } from '@/lib/uploads/viewer'
import type { UploadedAsset } from '@/lib/uploads/store'
import QualityChips from '@/components/product/QualityChips'
import { useDeviceClass } from '@/hooks/useDeviceClass'

const SimpleViewer = dynamic(() => import('@/components/product/SimpleViewer'), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
})

const ARProductViewer = dynamic(() => import('@/components/store/ARProductViewer'), { ssr: false })

/**
 * The plain viewer, pointed at an uploaded file.
 *
 * Deliberately the same component /product/[id]/simple draws with — one GLB,
 * one HDR, free orbit, no room and no post — so an upload is judged under
 * exactly the lighting a catalogue piece is. What it drops is everything that
 * needs a catalogue entry: no bottom sheet, no swatches, no layer ladder, no
 * AR. There is nothing to configure on a file somebody just dropped in.
 *
 * `paintable={false}` is the one behavioural difference and it matters: the
 * viewer would otherwise repaint every mesh in the presentation store's cover
 * colour, and an uploaded model must look like the file its author exported.
 *
 * The two controls it does carry are the ones that cost nothing to offer: AR,
 * which is handed the same uploaded file the canvas is drawing, and the render
 * tier, which on this viewer only moves DPR and anisotropy. @see QualityChips
 */
export default function ViewerClient({ asset }: { asset: UploadedAsset }) {
  const device = useDeviceClass()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAR, setShowAR] = useState(false)
  const [arCapable, setArCapable] = useState(false)
  /** Remounts the canvas after AR: it is unmounted to give the overlay the GPU,
   *  and a Canvas whose context went with it has to be rebuilt. */
  const [canvasKey, setCanvasKey] = useState(0)

  // Same full-screen, non-scrolling shape as the simple page, so it needs the
  // same guard against an iOS swipe becoming a pull-to-refresh.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('viewport-locked')
    return () => root.classList.remove('viewport-locked')
  }, [])

  useEffect(() => setArCapable(isARCapable()), [])

  /** The uploaded environment, when one came with the model; otherwise the
   *  house HDR. @see uploadViewerConfig */
  const config = useMemo(
    () =>
      uploadViewerConfig(
        assetUrl(asset.id),
        asset.hdr ? assetHdrUrl(asset.id, asset.hdr.file) : null
      ),
    [asset.id, asset.hdr]
  )
  const view = useMemo(() => simpleViewer(config), [config])

  const handleReady = useCallback(() => setReady(true), [])
  const handleError = useCallback((_category: string, err: Error) => setError(err.message), [])

  return (
    // The provider wraps the whole page, not just the canvas: the tier picker
    // is chrome over it and reads the same context.
    <QualityProvider surface="viewer" preset={simpleViewerQuality(config, device)}>
    <div
      dir="rtl"
      className="font-persian viewport-fill relative w-screen overflow-hidden"
      style={{ background: view.background }}
    >
      {!error && !showAR && (
        <SimpleViewer
          label="upload"
          key={canvasKey}
          config={config}
          coverage={0}
          paintable={false}
          onReady={handleReady}
          onError={handleError}
        />
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h1 className="max-w-full truncate text-[13px] text-neutral-600">{asset.name}</h1>
          {/* Same picker the simple page carries, on the same terms: nothing
              here allocates a shadow map or a composer buffer, so every rung is
              safe to offer. */}
          {!error && !showAR && <QualityChips />}
        </div>
        <Link
          href="/manage"
          className="pointer-events-auto shrink-0 rounded-full border border-neutral-300 bg-white/85 px-3 py-1
                     text-[12px] text-neutral-700 backdrop-blur-sm transition-colors hover:border-neutral-400"
        >
          مدیریت فایل‌ها
        </Link>
      </header>

      {/* The uploaded file itself goes to AR — nothing is built, so the button
          opens straight into the overlay. */}
      {!error && !showAR && (
        <button
          type="button"
          onClick={() => setShowAR(true)}
          className="pointer-events-auto absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))]
                     z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-neutral-300
                     bg-white/90 px-5 py-2.5 text-[13px] text-neutral-800 backdrop-blur-sm
                     transition-colors hover:border-neutral-500"
        >
          {arCapable ? 'نمایش در فضای واقعی (AR)' : 'پیش‌نمایش سه‌بعدی'}
        </button>
      )}

      {showAR && (
        <ARProductViewer
          glbPath={assetUrl(asset.id)}
          productName={asset.name}
          arScale="fixed"
          onClose={() => {
            setShowAR(false)
            setCanvasKey((n) => n + 1)
          }}
        />
      )}

      {/* Held over the canvas rather than shown in its place: the canvas has to
          be mounted and rendering to load its own model at all. */}
      {!error && !showAR && (
        <div
          aria-hidden={ready}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-500"
          style={{
            background: view.background,
            opacity: ready ? 0 : 1,
            visibility: ready ? 'hidden' : 'visible',
          }}
        >
          <span className="text-[11px] tracking-[0.4em] text-neutral-400">در حال بارگذاری</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6 text-center">
          <div className="space-y-2">
            <p className="text-[14px] text-neutral-800">این فایل قابل نمایش نیست.</p>
            <p className="break-all text-[11px] text-neutral-500">{error}</p>
          </div>
        </div>
      )}
    </div>
    </QualityProvider>
  )
}
