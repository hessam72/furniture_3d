'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { QualityProvider } from '@/contexts/QualityContext'
import {
  PHONE_QUERY,
  readDeviceClass,
  simpleViewer,
  simpleViewerQuality,
  TOUCH_QUERY,
  type DeviceClass,
} from '@/lib/product/presentation'
import { assetUrl, uploadViewerConfig } from '@/lib/uploads/viewer'
import type { UploadedAsset } from '@/lib/uploads/store'

const SimpleViewer = dynamic(() => import('@/components/product/SimpleViewer'), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
})

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
 */
export default function ViewerClient({ asset }: { asset: UploadedAsset }) {
  const [device, setDevice] = useState<DeviceClass>('desktop')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const queries = [window.matchMedia(PHONE_QUERY), window.matchMedia(TOUCH_QUERY)]
    const apply = () => setDevice(readDeviceClass())
    apply()
    queries.forEach((mq) => mq.addEventListener('change', apply))
    return () => queries.forEach((mq) => mq.removeEventListener('change', apply))
  }, [])

  // Same full-screen, non-scrolling shape as the simple page, so it needs the
  // same guard against an iOS swipe becoming a pull-to-refresh.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('viewport-locked')
    return () => root.classList.remove('viewport-locked')
  }, [])

  const config = useMemo(() => uploadViewerConfig(assetUrl(asset.id)), [asset.id])
  const view = useMemo(() => simpleViewer(config), [config])

  const handleReady = useCallback(() => setReady(true), [])
  const handleError = useCallback((_category: string, err: Error) => setError(err.message), [])

  return (
    <div
      dir="rtl"
      className="font-persian viewport-fill relative w-screen overflow-hidden"
      style={{ background: view.background }}
    >
      <QualityProvider preset={simpleViewerQuality(config, device)}>
        {!error && (
          <SimpleViewer
            config={config}
            coverage={0}
            paintable={false}
            onReady={handleReady}
            onError={handleError}
          />
        )}
      </QualityProvider>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="max-w-[70%] truncate text-[13px] text-neutral-600">{asset.name}</h1>
        <Link
          href="/manage"
          className="pointer-events-auto rounded-full border border-neutral-300 bg-white/85 px-3 py-1
                     text-[12px] text-neutral-700 backdrop-blur-sm transition-colors hover:border-neutral-400"
        >
          مدیریت فایل‌ها
        </Link>
      </header>

      {/* Held over the canvas rather than shown in its place: the canvas has to
          be mounted and rendering to load its own model at all. */}
      {!error && (
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
  )
}
