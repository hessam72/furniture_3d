'use client'

import type { ZoneSwatch } from '@/lib/product/presentation'

/**
 * The plain colours in a palette, as discs.
 *
 * Split from `SwatchGrid` on purpose rather than shown in the same wall: a
 * textured swatch and a tinted one are different *kinds* of choice — one changes
 * the cloth, the other changes its colour — and a grid that mixes them asks the
 * customer to work out which is which from the picture. A disc says "colour"
 * without a caption, which is exactly what it is.
 *
 * @see swatchPaint — a textured swatch drives `material.color` to white, so
 * these two rows genuinely cannot both be active on one zone.
 */
export default function ColorDots({
  swatches,
  activeId,
  onPick,
  label,
  images = true,
}: {
  swatches: ZoneSwatch[]
  activeId?: string
  onPick: (swatch: ZoneSwatch) => void
  label: string
  /** False → the dot is its `hex` alone and fetches nothing, which is all a
   *  tint swatch ever needed. @see SwatchGrid's `images` */
  images?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2.5">
      {swatches.map((swatch) => {
        const active = swatch.id === activeId
        return (
          <button
            key={swatch.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={swatch.name}
            title={swatch.name}
            onClick={() => onPick(swatch)}
            className="group relative flex h-8 w-8 items-center justify-center rounded-full
                       transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
                       hover:scale-110 active:scale-95 focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)]"
              style={{
                backgroundColor: swatch.hex,
                ...(images && swatch.thumbnail
                  ? { backgroundImage: `url(${swatch.thumbnail})`, backgroundSize: 'cover' }
                  : {}),
              }}
            />
            {/* A ring sitting *outside* the disc, so selecting one never changes
                the colour area being judged. */}
            <span
              aria-hidden
              className={`absolute -inset-[3px] rounded-full transition-opacity duration-300 ${
                active ? 'opacity-100' : 'opacity-0'
              } shadow-[0_0_0_2px_rgb(59_130_246)]`}
            />
          </button>
        )
      })}
    </div>
  )
}
