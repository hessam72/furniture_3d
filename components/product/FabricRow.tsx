'use client'

import { Check, Loader2 } from 'lucide-react'
import type { ZoneSwatch } from '@/lib/product/presentation'

/**
 * A row of cloth, chosen by looking at it.
 *
 * The chip is a photograph of the fabric rather than a disc of its average
 * colour, because that is the question a customer is actually asking: two greys
 * can be a flat linen and a chunky bouclé, and a circle of #b4b0a8 cannot tell
 * them apart. The images come out of the shipped `.ktx2` itself — @see
 * scripts/ktx2-thumb.mjs — so a chip can never show a weave the piece is not
 * wearing.
 *
 * Wide and short rather than round: a rectangle shows the weave running in a
 * direction, which is most of what distinguishes one fabric from another at
 * thumbnail size.
 */
export default function FabricRow({
  swatches,
  activeId,
  pendingId,
  onPick,
  label,
}: {
  swatches: ZoneSwatch[]
  activeId?: string
  pendingId?: string | null
  onPick: (swatch: ZoneSwatch) => void
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      /* `-mx-1 px-1` so a selected chip's ring is not clipped by the scroller.
         `overscroll-x-contain` keeps a flick at the end of the row from turning
         into a back-navigation gesture on iOS.

         The mask softens both ends instead of cutting a chip in half at the
         edge: a half-faded swatch reads as "there is more this way", which is
         the only scroll affordance a touch row gets. */
      className="scrollbar-hide -mx-1 flex gap-2.5 overflow-x-auto overscroll-x-contain px-1 py-1
                 [mask-image:linear-gradient(to_left,transparent_0,#000_18px,#000_calc(100%-18px),transparent_100%)]"
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
            className={`group relative h-[58px] w-[46px] shrink-0 overflow-hidden rounded-xl
                        bg-cover bg-center transition-[transform,box-shadow] duration-300
                        ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04]
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300
                        ${active ? 'scale-[1.04] shadow-lg shadow-black/25' : 'shadow-sm shadow-black/10'}`}
            style={{
              backgroundColor: swatch.hex,
              ...(swatch.thumbnail ? { backgroundImage: `url(${swatch.thumbnail})` } : {}),
            }}
          >
            {/* The ring is an inset shadow rather than a border so it cannot
                shift the image inside by a pixel when it appears. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 rounded-xl transition-shadow duration-300 ${
                active
                  ? 'shadow-[inset_0_0_0_2.5px_rgb(255_255_255/0.95),inset_0_0_0_4px_rgb(56_130_246/0.9)]'
                  : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.28)]'
              }`}
            />
            {active && !pending && (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1 left-1/2 flex h-4 w-4 -translate-x-1/2
                           items-center justify-center rounded-full bg-white text-slate-900 shadow"
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </span>
            )}
            {pending && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center
                           bg-slate-900/45 backdrop-blur-[1px]"
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
