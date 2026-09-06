'use client'

import { Check } from 'lucide-react'
import { faPrice } from '@/lib/store/catalog'
import type { CoverVariant } from '@/lib/product/presentation'

interface Props {
  variants: CoverVariant[]
  activeId: string | null
  disabled?: boolean
  /** Variant ids whose GLB failed to load, keyed to the reason. */
  errors?: Record<string, string>
  onSelect: (id: string) => void
}

export default function CoverVariantGrid({ variants, activeId, disabled, errors, onSelect }: Props) {
  return (
    <div className={`grid grid-cols-3 gap-2 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      {variants.map((variant) => {
        const active = variant.id === activeId
        const delta = variant.priceDelta ?? 0
        const failed = !!errors?.[variant.id]
        return (
          <button
            key={variant.id}
            onClick={() => !failed && onSelect(variant.id)}
            aria-pressed={active}
            aria-disabled={failed}
            className={`group relative overflow-hidden rounded-xl border text-right transition-colors ${
              failed
                ? 'cursor-not-allowed border-white/[0.06] bg-white/[0.01] opacity-45'
                : active
                  ? 'border-[var(--gold-primary)] bg-[var(--gold-primary)]/10'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
            }`}
          >
            <div className="aspect-square w-full overflow-hidden bg-[var(--surface-3)]">
              {variant.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={variant.thumbnail}
                  alt={variant.name}
                  loading="lazy"
                  /* Thumbnails are optional art; a missing one should read as
                     an empty tile, not a broken-image glyph. */
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="px-2 py-1.5">
              <p className="truncate text-[12px] text-[var(--text-primary)]">{variant.name}</p>
              <p className="persian-number truncate text-[10px] text-[var(--text-muted)]">
                {failed
                  ? 'در دسترس نیست'
                  : delta === 0
                    ? 'بدون تغییر قیمت'
                    : `${delta > 0 ? '+' : '−'} ${faPrice(Math.abs(delta))}`}
              </p>
            </div>

            {active && !failed && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--gold-primary)] p-1 text-black">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
