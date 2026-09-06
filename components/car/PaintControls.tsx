'use client'

import { useCarConfig, type PaintZone, type PaintConfig, FACTORY_PALETTES } from '@/stores/carConfigStore'

const ZONES: { id: PaintZone; name: string }[] = [
  { id: 'body', name: 'Body' },
  { id: 'trim', name: 'Trim' },
  { id: 'interior', name: 'Interior' },
]

const PRESETS = [
  { id: 'gloss-red', name: 'Gloss Red', color: '#ff0000', metalness: 0.9, roughness: 0.3, clearcoat: 1.0 },
  { id: 'satin-black', name: 'Satin Black', color: '#1a1a1a', metalness: 0.7, roughness: 0.5, clearcoat: 0.5 },
  { id: 'matte-gray', name: 'Matte Gray', color: '#666666', metalness: 0.3, roughness: 0.9, clearcoat: 0.0 },
  { id: 'chrome', name: 'Chrome', color: '#d4d4d4', metalness: 1.0, roughness: 0.1, clearcoat: 1.0 },
  { id: 'gloss-blue', name: 'Gloss Blue', color: '#0066ff', metalness: 0.9, roughness: 0.3, clearcoat: 1.0 },
  { id: 'pearl-white', name: 'Pearl White', color: '#f5f5f5', metalness: 0.8, roughness: 0.2, clearcoat: 0.9 },
]

const SLIDERS: { key: keyof Pick<PaintConfig, 'metalness' | 'roughness' | 'clearcoat'>; label: string }[] = [
  { key: 'metalness', label: 'Metalness' },
  { key: 'roughness', label: 'Roughness' },
  { key: 'clearcoat', label: 'Clearcoat' },
]

const MICRO_LABEL = 'block text-[10px] uppercase tracking-[0.3em] text-white/45'

export default function PaintControls() {
  const paintConfig = useCarConfig((s) => s.paintConfig)
  const activeZone = useCarConfig((s) => s.activeZone)
  const setActiveZone = useCarConfig((s) => s.setActiveZone)
  const setPaintConfig = useCarConfig((s) => s.setPaintConfig)
  const copyZoneToAll = useCarConfig((s) => s.copyZoneToAll)
  const applyPalettePreset = useCarConfig((s) => s.applyPalettePreset)
  const initializePaint = useCarConfig((s) => s.initializePaint)

  // Get active zone config
  const activeConfig = paintConfig[activeZone]

  // Wrapper to initialize paint on first user interaction
  const handlePaintChange = (config: Parameters<typeof setPaintConfig>[0], zone?: PaintZone) => {
    initializePaint()
    setPaintConfig(config, zone)
  }

  const handleCopyZone = (zone: PaintZone) => {
    initializePaint()
    copyZoneToAll(zone)
  }

  const handleApplyPalette = (paletteId: string) => {
    initializePaint()
    applyPalettePreset(paletteId)
  }

  return (
    <div className="space-y-6">
      {/* Factory Palettes */}
      <div>
        <span className={`${MICRO_LABEL} mb-3`}>Factory Palettes</span>
        <div className="grid grid-cols-2 gap-2.5">
          {FACTORY_PALETTES.map((palette) => (
            <button
              key={palette.id}
              onClick={() => handleApplyPalette(palette.id)}
              className="group flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-all hover:border-[#d4af37]/50 hover:bg-white/10"
              aria-label={`Apply ${palette.name} palette`}
            >
              <div className="flex shrink-0 gap-1">
                <span
                  className="h-7 w-2.5 rounded-sm border border-white/10"
                  style={{ backgroundColor: palette.zones.body.color }}
                  title="Body"
                />
                <span
                  className="h-7 w-2.5 rounded-sm border border-white/10"
                  style={{ backgroundColor: palette.zones.trim.color }}
                  title="Trim"
                />
                <span
                  className="h-7 w-2.5 rounded-sm border border-white/10"
                  style={{ backgroundColor: palette.zones.interior.color }}
                  title="Interior"
                />
              </div>
              <span className="text-[11px] font-medium leading-tight text-white/70 transition-colors group-hover:text-white">
                {palette.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Zone Selector */}
      <div>
        <span id="paint-zone-label" className={`${MICRO_LABEL} mb-3`}>Paint Zone</span>
        <div
          role="radiogroup"
          aria-labelledby="paint-zone-label"
          className="flex rounded-full border border-white/10 bg-white/5 p-1"
        >
          {ZONES.map((zone) => {
            const active = activeZone === zone.id
            return (
              <button
                key={zone.id}
                role="radio"
                aria-checked={active}
                onClick={() => setActiveZone(zone.id)}
                className={`flex-1 rounded-full py-2 text-xs font-medium tracking-wide transition-colors ${
                  active ? 'bg-[#d4af37]/15 text-[#d4af37]' : 'text-white/55 hover:text-white'
                }`}
              >
                {zone.name}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => handleCopyZone(activeZone)}
          className="mt-2.5 text-[11px] tracking-wide text-white/45 transition-colors hover:text-white"
        >
          Copy {ZONES.find((z) => z.id === activeZone)?.name} to all zones
        </button>
      </div>

      {/* Color Picker */}
      <div>
        <label htmlFor="paint-color" className={`${MICRO_LABEL} mb-3`}>Color</label>
        <div className="flex items-center gap-3">
          <input
            id="paint-color"
            type="color"
            value={activeConfig.color}
            onChange={(e) => handlePaintChange({ color: e.target.value })}
            className="h-12 w-12 shrink-0 cursor-pointer rounded-full border border-white/15 bg-transparent p-1"
            aria-label="Paint color"
          />
          <input
            id="paint-color-hex"
            type="text"
            value={activeConfig.color}
            onChange={(e) => handlePaintChange({ color: e.target.value })}
            className="w-full min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-sm uppercase text-white/80 transition-colors focus:border-[#d4af37]/60 focus:bg-white/10 focus:outline-none"
            placeholder="#ff0000"
            aria-label="Paint color hex value"
          />
        </div>
      </div>

      {/* Material Sliders */}
      {SLIDERS.map(({ key, label }) => (
        <div key={key}>
          <label htmlFor={`paint-${key}`} className="mb-3 flex items-baseline justify-between">
            <span className={MICRO_LABEL}>{label}</span>
            <span className="font-mono text-xs tabular-nums text-white/60">
              {activeConfig[key].toFixed(2)}
            </span>
          </label>
          <input
            id={`paint-${key}`}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={activeConfig[key]}
            onChange={(e) => handlePaintChange({ [key]: parseFloat(e.target.value) })}
            className="slider-thumb h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
          />
        </div>
      ))}

      {/* Presets */}
      <div>
        <span className={`${MICRO_LABEL} mb-3`}>Presets</span>
        <div className="grid grid-cols-3 gap-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePaintChange(preset)}
              className="group flex flex-col items-center gap-2"
              aria-label={`Apply ${preset.name} preset`}
            >
              <span
                className="h-10 w-10 rounded-full border border-white/15 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)] transition-all group-hover:border-[#d4af37]/70 group-hover:shadow-[0_0_0_2px_rgba(212,175,55,0.25)]"
                style={{ backgroundColor: preset.color }}
              />
              <span className="text-[10px] leading-tight text-white/50 transition-colors group-hover:text-white/80">
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
