'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Heart, SlidersHorizontal } from 'lucide-react'
import QualitySelector from '@/components/car/QualitySelector'
import { useShop } from '@/stores/storeShopStore'
import type { QualityPreset } from '@/lib/config/quality'

interface Props {
  productName: string
  /** Catalogue id — likes and the cart are keyed on those, not the scene key. */
  catalogId: string | null
}

const QUALITY_LABELS: Record<QualityPreset, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
  ultra: 'حداکثر',
}

export default function PresentationTopBar({ productName, catalogId }: Props) {
  const liked = useShop((s) => s.liked)
  const toggleLike = useShop((s) => s.toggleLike)
  const isLiked = !!catalogId && liked.includes(catalogId)

  const [qualityOpen, setQualityOpen] = useState(false)
  const qualityRef = useRef<HTMLDivElement>(null)

  // Same dismissal contract as the car bar's popover.
  useEffect(() => {
    if (!qualityOpen) return
    const onPointer = (e: PointerEvent) => {
      if (qualityRef.current && !qualityRef.current.contains(e.target as Node)) {
        setQualityOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQualityOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [qualityOpen])

  return (
    <div
      dir="rtl"
      className="font-persian pointer-events-none fixed inset-x-0 top-0 z-[100] flex items-center
                 justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <Link
        href="/store"
        aria-label="بازگشت به شوروم"
        className="glass pointer-events-auto flex h-10 items-center gap-1.5 rounded-full px-3
                   text-[13px] text-[var(--text-primary)] transition-colors
                   hover:text-[var(--gold-primary)]"
      >
        <ChevronRight className="h-4 w-4" />
        شوروم
      </Link>

      <span
        className="glass pointer-events-none max-w-[35%] truncate rounded-full px-4 py-2
                   text-[12px] text-[var(--text-secondary)]"
      >
        {productName}
      </span>

      <div className="flex items-center gap-2">
        {/* The tier is pinned from the manifest, so this is a runtime override:
            somewhere to turn the render down on a device that is struggling,
            without leaving the page. */}
        <div ref={qualityRef} className="relative">
          <button
            onClick={() => setQualityOpen((v) => !v)}
            aria-label="کیفیت گرافیک"
            aria-expanded={qualityOpen}
            className="glass pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full
                       text-[var(--text-secondary)] transition-colors hover:text-[var(--gold-primary)]"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {/* dir="ltr" so the tier grid reads cheapest-first inside an otherwise
              RTL bar, the way the store sidebar mounts it. */}
          {qualityOpen && (
            <div
              dir="ltr"
              className="pointer-events-auto absolute left-0 top-12 w-56 rounded-2xl border border-white/10
                         bg-black/75 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
            >
              <QualitySelector labels={QUALITY_LABELS} heading="کیفیت گرافیک" />
            </div>
          )}
        </div>

        {catalogId ? (
          <button
            onClick={() => toggleLike(catalogId)}
            aria-label={isLiked ? 'حذف از علاقه‌مندی' : 'افزودن به علاقه‌مندی'}
            aria-pressed={isLiked}
            className="glass pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full
                       text-[var(--text-secondary)] transition-colors hover:text-[var(--gold-primary)]"
          >
            <Heart className={`h-4 w-4 ${isLiked ? 'fill-[var(--gold-primary)] text-[var(--gold-primary)]' : ''}`} />
          </button>
        ) : (
          <span className="h-10 w-10" aria-hidden />
        )}
      </div>
    </div>
  )
}
