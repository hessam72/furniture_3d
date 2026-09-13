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
      /* Dark glass like the rest of the page chrome: `simple.background` is a
         manifest value and may be white for the next product, and a dark pill is
         the one treatment that reads on both grounds. */
      className="pointer-events-auto flex gap-1 rounded-full border border-white/10 bg-[#0a0e15]/70 p-1 backdrop-blur-xl"
    >
      {tiers.map((tier) => (
        <button
          key={tier}
          role="radio"
          aria-checked={preset === tier}
          onClick={() => setPreset(tier)}
          className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
            preset === tier ? 'bg-white/[0.14] text-white' : 'text-white/45 hover:text-white/80'
          }`}
        >
          {LABELS[tier]}
        </button>
      ))}
    </div>
  )
}
