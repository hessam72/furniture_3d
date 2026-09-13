'use client'

import { Check, Loader2 } from 'lucide-react'
import type { ZoneSwatch } from '@/lib/product/presentation'

/**
 * Cloth, chosen by looking at it.
 *
 * The chip is a photograph of the fabric rather than a disc of its average
 * colour, because that is the question a customer is actually asking: two greys
 * can be a flat linen and a chunky bouclé, and a circle of #b4b0a8 cannot tell
 * them apart. The images come out of the shipped `.ktx2` itself — @see
 * scripts/ktx2-thumb.mjs — so a chip can never show a weave the piece is not
 * wearing. The hex stays underneath as the background, so a chip whose image has
 * not landed reads as the right colour rather than as a hole.
 *
 * Two layouts, one component, because the alternative is two components with the
 * same selection rules drifting apart:
 *
 *  - `grid` is the dock's own, and the shape a fabric book has: a wall of cloth
 *    you scan rather than scroll. Its column count follows the palette rather
 *    than being fixed at three: four fabrics in three columns leave one orphan
 *    on a row of its own, which reads as a mistake, and two columns of four are
 *    bigger chips as well as a square block. @see `columns`
 *  - `row` is for a strip that has to sit inside something else.
 */
export default function SwatchGrid({
  swatches,
  activeId,
  pendingId,
  onPick,
  label,
  layout = 'grid',
}: {
  swatches: ZoneSwatch[]
  activeId?: string
  /** Swatch whose `.ktx2` is still in flight. */
  pendingId?: string | null
  onPick: (swatch: ZoneSwatch) => void
  label: string
  layout?: 'grid' | 'row'
}) {
  const grid = layout === 'grid'
  /* Three columns unless the palette divides better by two — a short palette in
     two columns is both tidier and easier to judge, since the chips are wider. */
  const columns = swatches.length <= 4 && swatches.length !== 3 ? 2 : 3

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={
        grid
          ? `grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`
          : /* `-mx-1 px-1` so a selected chip's ring is not clipped by the
               scroller; `overscroll-x-contain` keeps a flick at the end of the
               row from becoming an iOS back-navigation. The mask fades both ends
               instead of cutting a chip in half — a half-faded swatch reads as
               "there is more this way", which is the only scroll affordance a
               touch row gets. */
            'scrollbar-hide -mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 py-1 ' +
            '[mask-image:linear-gradient(to_left,transparent_0,#000_18px,#000_calc(100%-18px),transparent_100%)]'
      }
    >
      {swatches.map((swatch) => {
        const active = swatch.id === activeId
        const pending = pendingId === swatch.id
        return (
          <button
            key={swatch.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-busy={pending}
            aria-label={swatch.name}
            title={swatch.name}
            onClick={() => onPick(swatch)}
            className={`group relative overflow-hidden rounded-[13px] bg-cover bg-center
                        transition-[transform,box-shadow,filter] duration-300
                        ease-[cubic-bezier(0.22,1,0.36,1)]
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                        focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                        ${grid ? 'aspect-[5/4] w-full' : 'h-[56px] w-[44px] shrink-0'}
                        ${
                          active
                            ? 'shadow-[0_6px_20px_-6px_rgb(59_130_246/0.55)]'
                            : 'shadow-[0_2px_8px_-3px_rgb(0_0_0/0.6)] hover:scale-[1.03] hover:brightness-110'
                        }`}
            style={{
              backgroundColor: swatch.hex,
              ...(swatch.thumbnail ? { backgroundImage: `url(${swatch.thumbnail})` } : {}),
            }}
          >
            {/* The ring is an inset shadow rather than a border, so it cannot
                shift the image inside it by a pixel when it appears. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 rounded-[13px] transition-shadow duration-300 ${
                active
                  ? 'shadow-[inset_0_0_0_2px_rgb(255_255_255/0.92),inset_0_0_0_4px_rgb(59_130_246/0.95)]'
                  : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)] group-hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35)]'
              }`}
            />

            {active && !pending && (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1.5 left-1.5 flex h-[18px] w-[18px]
                           items-center justify-center rounded-full bg-blue-500 text-white
                           shadow-[0_2px_6px_rgb(0_0_0/0.45)]"
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </span>
            )}

            {pending && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center
                           bg-slate-950/50 backdrop-blur-[1px]"
              >
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
