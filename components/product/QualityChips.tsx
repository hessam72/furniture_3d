'use client'

import { useQuality } from '@/contexts/QualityContext'
import { type QualityPreset } from '@/lib/config/quality'
import { tiersUpTo } from '@/lib/config/deviceTier'

const LABELS: Record<QualityPreset, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
  ultra: 'حداکثر',
}

/**
 * The render tier, exposed as a control rather than pinned.
 *
 * Only safe to offer on the plain viewer and the pages built from it: nothing
 * there allocates a shadow map, a reflection target or a composer buffer, so
 * the tier only moves DPR and anisotropy. The heavy presentation page takes its
 * tier from the manifest for exactly that reason.
 *
 * **It offers only the rungs this device can hold.** A phone showing three
 * chips instead of four is the budget, not a bug: the control used to offer
 * `ultra`, store `ultra`, and then display `medium`, because the tier it wrote
 * was capped somewhere the user could not see. Worse, the key is shared, so the
 * choice followed them to /store — a page that reads it, and used to skip its
 * own phone downgrade whenever it found one. @see SURFACE_POLICY
 */
export default function QualityChips() {
  const { preset, setPreset, ceiling } = useQuality()
  const tiers = tiersUpTo(ceiling)

  return (
    <div
      role="radiogroup"
      aria-label="کیفیت نمایش"
      className="pointer-events-auto flex gap-1 rounded-full border border-neutral-200 bg-white/85 p-1 backdrop-blur-sm"
    >
      {tiers.map((tier) => (
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
