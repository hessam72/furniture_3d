'use client'

import { Check } from 'lucide-react'
import type { ZoneSwatch } from '@/lib/product/presentation'

/**
 * The hard finishes — the frame, the legs — as tiles rather than discs.
 *
 * A wood tone or a metal is not really a colour choice, it is a *material*, and
 * the thing that tells oak from walnut from black steel is the sheen across a
 * surface rather than the hue at a point. So each tile is a small lit face: a
 * diagonal sweep whose highlight is brighter and whose shade is darker the
 * glossier the finish is, derived from the swatch's own `roughness`. That number
 * is already in the manifest and already drives the render, so a tile cannot
 * disagree with the piece.
 */
export default function MaterialTiles({
  swatches,
  activeId,
  onPick,
  label,
}: {
  swatches: ZoneSwatch[]
  activeId?: string
  onPick: (swatch: ZoneSwatch) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-2">
      {swatches.map((swatch) => {
        const active = swatch.id === activeId
        // 0 = mirror, 1 = chalk. A rough finish gets a soft, narrow sweep; a
        // polished one a hard, wide specular.
        const gloss = 1 - Math.min(Math.max(swatch.roughness ?? 0.55, 0), 1)
        const sheen = 0.12 + gloss * 0.5
        const shade = 0.15 + gloss * 0.3

        return (
          <button
            key={swatch.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={swatch.name}
            onClick={() => onPick(swatch)}
            className="group flex flex-col items-center gap-1.5 focus-visible:outline-none"
          >
            <span
              aria-hidden
              className={`relative flex aspect-square w-full items-center justify-center
                          overflow-hidden rounded-[13px] transition-[transform,box-shadow]
                          duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
                          ${
                            active
                              ? 'shadow-[inset_0_0_0_2px_rgb(255_255_255/0.9),inset_0_0_0_4px_rgb(59_130_246/0.95),0_6px_18px_-8px_rgb(59_130_246/0.7)]'
                              : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] group-hover:scale-[1.04] group-hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.32)]'
                          }`}
              style={{
                backgroundColor: swatch.hex,
                backgroundImage:
                  `linear-gradient(145deg, rgb(255 255 255 / ${sheen}) 0%, ` +
                  `rgb(255 255 255 / ${sheen * 0.25}) 38%, ` +
                  `rgb(0 0 0 / ${shade * 0.4}) 62%, rgb(0 0 0 / ${shade}) 100%)`,
              }}
            >
              {active && (
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-500 text-white shadow">
                  <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                </span>
              )}
            </span>
            <span
              className={`w-full truncate text-center text-[10.5px] leading-none transition-colors ${
                active ? 'text-white' : 'text-white/45 group-hover:text-white/75'
              }`}
            >
              {swatch.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
