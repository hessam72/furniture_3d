'use client'

import { useTranslations } from 'next-intl'
import { useQuality } from '@/contexts/QualityContext'
import { type QualityPreset } from '@/lib/config/quality'
import { tiersUpTo } from '@/lib/config/deviceTier'

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
 * was capped somewhere the user could not see. It also used to write into a
 * key shared with every other surface, so a choice made here followed the
 * visitor to /store too — each surface now has its own storage key.
 * @see SURFACE_POLICY, TIER_STORAGE
 */
export default function QualityChips() {
  const t = useTranslations('quality')
  const { preset, setPreset, ceiling } = useQuality()
  const tiers = tiersUpTo(ceiling)

  return (
    <div
      role="radiogroup"
      aria-label={t('heading')}
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
          {t(tier)}
        </button>
      ))}
    </div>
  )
}
