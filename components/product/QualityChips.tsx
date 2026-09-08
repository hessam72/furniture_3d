'use client'

import { useQuality } from '@/contexts/QualityContext'
import { QUALITY_PRESETS, type QualityPreset } from '@/lib/config/quality'

const LABELS: Record<QualityPreset, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
  ultra: 'حداکثر',
}

const TIERS = Object.keys(QUALITY_PRESETS) as QualityPreset[]

/**
 * The render tier, exposed as a control rather than pinned.
 *
 * Only safe to offer on the plain viewer and the pages built from it: nothing
 * there allocates a shadow map, a reflection target or a composer buffer, so
 * the tier only moves DPR and anisotropy and every rung is affordable. The
 * heavy presentation page pins its tier from the manifest for exactly that
 * reason. Must be mounted inside a `QualityProvider`.
 */
export default function QualityChips() {
  const { preset, setPreset } = useQuality()

  return (
    <div
      role="radiogroup"
      aria-label="کیفیت نمایش"
      className="pointer-events-auto flex gap-1 rounded-full border border-neutral-200 bg-white/85 p-1 backdrop-blur-sm"
    >
      {TIERS.map((tier) => (
        <button
          key={tier}
          role="radio"
          aria-checked={preset === tier}
          onClick={() => setPreset(tier)}
          className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
            preset === tier ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          {LABELS[tier]}
        </button>
      ))}
    </div>
  )
}
