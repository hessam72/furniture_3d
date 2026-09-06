'use client'

import { useQuality } from '@/contexts/QualityContext'
import { QualityPreset } from '@/lib/config/quality'

const QUALITY_LABELS: Record<QualityPreset, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
}

interface Props {
  /** Override the tier names and heading. English by default, so /car and
   *  /store are unchanged; /product is a Persian page and passes its own. */
  labels?: Record<QualityPreset, string>
  heading?: string
}

/**
 * Graphics-quality picker. Pure popover content — positioning and the
 * open/close trigger live in TopBar.
 */
export default function QualitySelector({ labels = QUALITY_LABELS, heading = 'Graphics Quality' }: Props = {}) {
  const { preset, setPreset, settings, ssgiEnabled, setSsgiEnabled } = useQuality()

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] uppercase tracking-[0.3em] text-white/45">{heading}</span>

      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={heading}>
        {(Object.keys(QUALITY_LABELS) as QualityPreset[]).map((quality) => (
          <button
            key={quality}
            role="radio"
            aria-checked={preset === quality}
            onClick={() => setPreset(quality)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium tracking-wide transition-colors ${
              preset === quality
                ? 'border-[#d4af37]/60 bg-[#d4af37]/10 text-[#d4af37]'
                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white'
            }`}
          >
            {labels[quality]}
          </button>
        ))}
      </div>

      {settings.experimentalSSGI && (
        <button
          onClick={() => setSsgiEnabled(!ssgiEnabled)}
          aria-pressed={ssgiEnabled}
          title="Screen-space global illumination + temporal AA (experimental, heavy)"
          className={`rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition-colors ${
            ssgiEnabled
              ? 'border-[#d4af37]/60 bg-[#d4af37]/10 text-[#d4af37]'
              : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white'
          }`}
        >
          SSGI {ssgiEnabled ? 'On' : 'Off'} <span className="opacity-60">(experimental)</span>
        </button>
      )}
    </div>
  )
}
