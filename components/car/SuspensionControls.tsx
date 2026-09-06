'use client'

import { useCarConfig } from '@/stores/carConfigStore'

const PRESETS: { id: 'stock' | 'lowered' | 'raised'; name: string; height: number }[] = [
  { id: 'stock', name: 'Stock', height: 0 },
  { id: 'lowered', name: 'Lowered', height: -3 },
  { id: 'raised', name: 'Raised', height: 5 },
]

const MICRO_LABEL = 'block text-[10px] uppercase tracking-[0.3em] text-white/45'

export default function SuspensionControls() {
  const suspensionHeight = useCarConfig((s) => s.suspensionHeight)
  const setSuspensionHeight = useCarConfig((s) => s.setSuspensionHeight)

  return (
    <div className="space-y-6">
      {/* Preset Buttons */}
      <div>
        <span className={`${MICRO_LABEL} mb-3`}>Presets</span>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => {
            const active = suspensionHeight === preset.height
            return (
              <button
                key={preset.id}
                onClick={() => setSuspensionHeight(preset.height)}
                className={`rounded-lg border py-2.5 text-xs font-medium tracking-wide transition-all ${
                  active
                    ? 'border-[#d4af37]/60 bg-[#d4af37]/15 text-[#d4af37]'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                }`}
              >
                {preset.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Height Slider */}
      <div>
        <label htmlFor="suspension-height" className="mb-3 flex items-baseline justify-between">
          <span className={MICRO_LABEL}>Height Adjustment</span>
          <span className="font-mono text-xs tabular-nums text-white/60">
            {suspensionHeight > 0 ? '+' : ''}
            {suspensionHeight} cm
          </span>
        </label>
        <input
          id="suspension-height"
          type="range"
          min="-5"
          max="10"
          step="0.5"
          value={suspensionHeight}
          onChange={(e) => setSuspensionHeight(parseFloat(e.target.value))}
          className="slider-thumb h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
        />
        <div className="mt-2 flex justify-between text-[10px] text-white/35">
          <span>-5 cm</span>
          <span>0 cm</span>
          <span>+10 cm</span>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-white/5 bg-white/5 p-3">
        <p className="text-[11px] leading-relaxed text-white/50">
          Adjust suspension height for different styles. Lowered for aggressive stance, raised for
          off-road clearance.
        </p>
      </div>
    </div>
  )
}
