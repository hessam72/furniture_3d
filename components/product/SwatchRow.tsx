'use client'

import { motion } from 'framer-motion'
import type { PresentationZone, ZoneSwatch } from '@/lib/product/presentation'

const SPRING = { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 }

interface Props {
  label: string
  zone: PresentationZone
  swatches: ZoneSwatch[]
  activeHex: string
  onPick: (swatch: ZoneSwatch) => void
}

export default function SwatchRow({ label, zone, swatches, activeHex, onPick }: Props) {
  const activeName = swatches.find((s) => s.hex.toLowerCase() === activeHex.toLowerCase())?.name

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
        {activeName && <span className="text-[12px] text-[var(--text-secondary)]">{activeName}</span>}
      </div>

      <div role="radiogroup" aria-label={label} className="scrollbar-hide flex items-center gap-3 overflow-x-auto py-1">
        {swatches.map((swatch) => {
          const active = swatch.hex.toLowerCase() === activeHex.toLowerCase()
          return (
            <button
              key={swatch.id}
              role="radio"
              aria-checked={active}
              aria-label={swatch.name}
              title={swatch.name}
              onClick={() => onPick(swatch)}
              className="relative h-8 w-8 shrink-0 rounded-full ring-1 ring-inset ring-white/20
                         transition-transform duration-300 ease-[var(--ease-cinematic)]
                         hover:scale-110 active:scale-95"
              style={{ backgroundColor: swatch.hex }}
            >
              {active && (
                <motion.span
                  aria-hidden
                  /* Each row needs its own layoutId — one shared id would make
                     the single gold ring fly between rows. */
                  layoutId={`swatch-ring-${zone}`}
                  transition={SPRING}
                  className="absolute -inset-[3px] rounded-full ring-[1.5px] ring-[var(--gold-primary)]"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
