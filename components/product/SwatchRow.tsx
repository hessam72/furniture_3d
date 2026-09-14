'use client'

import { motion } from 'framer-motion'
import type { PresentationZone, ZoneSwatch } from '@/lib/product/presentation'

const SPRING = { type: 'spring' as const, damping: 34, stiffness: 320, mass: 0.8 }

interface Props {
  label: string
  zone: PresentationZone
  swatches: ZoneSwatch[]
  /**
   * Which swatch is showing, by id.
   *
   * Was the active hex, which cannot survive textures: a palette may offer a
   * velvet and a linen in the same colour, and a textured swatch's hex describes
   * its chip rather than the cloth on the piece. `activeHex` remains as the
   * fallback for a paint state seeded before ids existed.
   */
  activeId?: string
  activeHex: string
  /** Swatch ids whose textures are still being fetched. */
  pendingId?: string | null
  onPick: (swatch: ZoneSwatch) => void
}

export default function SwatchRow({ label, zone, swatches, activeId, activeHex, pendingId, onPick }: Props) {
  const isActive = (swatch: ZoneSwatch) =>
    activeId ? swatch.id === activeId : swatch.hex.toLowerCase() === activeHex.toLowerCase()
  const activeName = swatches.find(isActive)?.name

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
        {activeName && <span className="text-[12px] text-[var(--text-secondary)]">{activeName}</span>}
      </div>

      <div role="radiogroup" aria-label={label} className="scrollbar-hide flex items-center gap-3 overflow-x-auto py-1">
        {swatches.map((swatch) => {
          const active = isActive(swatch)
          const pending = pendingId === swatch.id
          return (
            <button
              key={swatch.id}
              role="radio"
              aria-checked={active}
              aria-busy={pending}
              aria-label={swatch.name}
              title={swatch.name}
              onClick={() => onPick(swatch)}
              className={`relative h-8 w-8 shrink-0 rounded-full bg-cover bg-center ring-1 ring-inset ring-white/20
                         transition-transform duration-300 ease-[var(--ease-cinematic)]
                         hover:scale-110 active:scale-95 ${pending ? 'animate-pulse' : ''}`}
              /* The hex stays underneath a thumbnail, so a chip that has not
                 loaded its image reads as the right colour rather than a hole. */
              style={{
                backgroundColor: swatch.hex,
                ...(swatch.thumbnail ? { backgroundImage: `url(${swatch.thumbnail})` } : {}),
              }}
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
