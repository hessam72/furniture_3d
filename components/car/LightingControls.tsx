'use client'

import { useLightingStore, LIGHTING_PRESETS } from '@/stores/lightingStore'

const MICRO_LABEL = 'block text-[10px] uppercase tracking-[0.3em] text-white/45'

export default function LightingControls() {
  const activePreset = useLightingStore((s) => s.activePreset)
  const keyIntensity = useLightingStore((s) => s.keyIntensity)
  const fillIntensity = useLightingStore((s) => s.fillIntensity)
  const rimIntensity = useLightingStore((s) => s.rimIntensity)
  const envRotation = useLightingStore((s) => s.envRotation)
  const envIntensity = useLightingStore((s) => s.envIntensity)
  const applyPreset = useLightingStore((s) => s.applyPreset)
  const adjustLight = useLightingStore((s) => s.adjustLight)

  return (
    <div className="space-y-6">
      {/* Lighting Presets */}
      <div>
        <span className={`${MICRO_LABEL} mb-3`}>Lighting Presets</span>
        <div className="grid grid-cols-2 gap-2.5">
          {LIGHTING_PRESETS.map((preset) => {
            const active = activePreset === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`rounded-lg border py-3 text-xs font-medium tracking-wide transition-all ${
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

      {/* Key Light Intensity */}
      <div>
        <label htmlFor="key-intensity" className="mb-3 flex items-baseline justify-between">
          <span className={MICRO_LABEL}>Key Light</span>
          <span className="font-mono text-xs tabular-nums text-white/60">{keyIntensity}</span>
        </label>
        <input
          id="key-intensity"
          type="range"
          min="0"
          max="100"
          step="1"
          value={keyIntensity}
          onChange={(e) => adjustLight('keyIntensity', parseFloat(e.target.value))}
          className="slider-thumb h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
        />
      </div>

      {/* Fill Light Intensity */}
      <div>
        <label htmlFor="fill-intensity" className="mb-3 flex items-baseline justify-between">
          <span className={MICRO_LABEL}>Fill Light</span>
          <span className="font-mono text-xs tabular-nums text-white/60">{fillIntensity}</span>
        </label>
        <input
          id="fill-intensity"
          type="range"
          min="0"
          max="100"
          step="1"
          value={fillIntensity}
          onChange={(e) => adjustLight('fillIntensity', parseFloat(e.target.value))}
          className="slider-thumb h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
        />
      </div>

      {/* Rim Light Intensity */}
      <div>
        <label htmlFor="rim-intensity" className="mb-3 flex items-baseline justify-between">
          <span className={MICRO_LABEL}>Rim Light</span>
          <span className="font-mono text-xs tabular-nums text-white/60">{rimIntensity}</span>
        </label>
        <input
          id="rim-intensity"
          type="range"
          min="0"
          max="100"
          step="1"
          value={rimIntensity}
          onChange={(e) => adjustLight('rimIntensity', parseFloat(e.target.value))}
          className="slider-thumb h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
        />
      </div>

      {/* Environment Section */}
      <div className="border-t border-white/10 pt-6">
        <span className={`${MICRO_LABEL} mb-4`}>Environment</span>

        {/* Environment Rotation */}
        <div className="mb-4">
          <label htmlFor="env-rotation" className="mb-3 flex items-baseline justify-between">
            <span className={MICRO_LABEL}>Rotation</span>
            <span className="font-mono text-xs tabular-nums text-white/60">{envRotation}°</span>
          </label>
          <input
            id="env-rotation"
            type="range"
            min="0"
            max="360"
            step="1"
            value={envRotation}
            onChange={(e) => adjustLight('envRotation', parseFloat(e.target.value))}
            className="slider-thumb h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
          />
        </div>

        {/* Environment Intensity */}
        <div>
          <label htmlFor="env-intensity" className="mb-3 flex items-baseline justify-between">
            <span className={MICRO_LABEL}>Intensity</span>
            <span className="font-mono text-xs tabular-nums text-white/60">
              {envIntensity.toFixed(2)}
            </span>
          </label>
          <input
            id="env-intensity"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={envIntensity}
            onChange={(e) => adjustLight('envIntensity', parseFloat(e.target.value))}
            className="slider-thumb h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
          />
        </div>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-white/5 bg-white/5 p-3">
        <p className="text-[11px] leading-relaxed text-white/50">
          Control the lighting environment with preset scenes or fine-tune individual light
          intensities, rotation, and HDRI brightness for the perfect shot.
        </p>
      </div>
    </div>
  )
}
