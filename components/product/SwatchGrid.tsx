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
 * Three layouts, one component, because the alternative is three components
 * with the same selection rules drifting apart:
 *
 *  - `stack` is the dock's own, and what a fabric sample book actually looks
 *    like: full-width folded bands laid one on the next, the whole thing bound
 *    in a dark frame. @see FabricBand for why the folds are drawn rather than
 *    photographed.
 *  - `grid` is a wall of cloth you scan rather than scroll. Its column count
 *    follows the palette rather than being fixed at three: four fabrics in three
 *    columns leave one orphan on a row of its own, which reads as a mistake.
 *  - `row` is for a strip that has to sit inside something else.
 */
export default function SwatchGrid({
  swatches,
  activeId,
  pendingId,
  onPick,
  label,
  layout = 'stack',
}: {
  swatches: ZoneSwatch[]
  activeId?: string
  /** Swatch whose `.ktx2` is still in flight. */
  pendingId?: string | null
  onPick: (swatch: ZoneSwatch) => void
  label: string
  layout?: 'stack' | 'grid' | 'row'
}) {
  if (layout === 'stack') {
    return (
      <div
        role="radiogroup"
        aria-label={label}
        /* The binding of the book. A single frame around the whole stack is what
           makes the bands read as one folded pile rather than as a list of
           rectangles — the same reason a real sample book is bound at one edge.

           Deliberately **not** `overflow-hidden`: the selected bolt lifts past
           the binding, which is the whole gesture, and clipping it squared off
           the book's own top and bottom corners whenever the first or last
           fabric was the chosen one. Each band carries its own end radius
           instead, so the stack still reads as bound and the lift still reads
           as a bolt pulled out of it. */
        className="rounded-[14px] bg-[#0a0e15]
                   shadow-[0_10px_30px_-12px_rgb(0_0_0/0.85),inset_0_0_0_1px_rgb(255_255_255/0.09)]"
      >
        {swatches.map((swatch) => (
          <FabricBand
            key={swatch.id}
            swatch={swatch}
            active={swatch.id === activeId}
            pending={pendingId === swatch.id}
            onPick={onPick}
          />
        ))}
      </div>
    )
  }

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

/**
 * One bolt of cloth in the stack.
 *
 * The fold is **drawn, not photographed**, and that is the whole trick. The
 * thumbnails are flat crops of a weave — they have to be, since they are cut
 * from the `.ktx2` the piece actually renders with — so the three-dimensionality
 * has to come from light laid over the top:
 *
 *  - a highlight along the top edge, where the crest of the fold catches the
 *    room, falling off fast because a fold's radius is small;
 *  - a deepening shadow along the bottom, where the cloth turns under and the
 *    band below is tucked beneath it;
 *  - a hairline of near-black at the very bottom — the crease itself, and the
 *    single detail that stops the stack reading as stripes;
 *  - a soft vignette at both ends, so the band reads as cloth bowing away from
 *    the light rather than as a flat rectangle.
 *
 * Selecting pulls the bolt out of the book: it lifts on the cross axis, its
 * shadow deepens and lengthens, and the crease under it opens. That is the
 * gesture the object itself would make, and it survives on a fabric of any
 * colour — a coloured ring does not, which is why the grid's blue rim is not
 * reused here.
 */
function FabricBand({
  swatch,
  active,
  pending,
  onPick,
}: {
  swatch: ZoneSwatch
  active: boolean
  pending: boolean
  onPick: (swatch: ZoneSwatch) => void
}) {
  const fold =
    // Crest, then the turn under. The stops are uneven on purpose: cloth does
    // not fall off linearly, and evenly spaced stops read as a gradient rather
    // than as a form.
    'linear-gradient(to bottom,' +
    'rgb(255 255 255 / 0.20) 0%,' +
    'rgb(255 255 255 / 0.07) 5%,' +
    'rgb(255 255 255 / 0.01) 13%,' +
    'rgb(0 0 0 / 0) 45%,' +
    'rgb(0 0 0 / 0.07) 68%,' +
    'rgb(0 0 0 / 0.28) 90%,' +
    'rgb(0 0 0 / 0.50) 100%)'

  // The ends, bowing away from the light.
  const vignette =
    'linear-gradient(to right,' +
    'rgb(0 0 0 / 0.30) 0%, rgb(0 0 0 / 0) 14%,' +
    'rgb(0 0 0 / 0) 86%, rgb(0 0 0 / 0.30) 100%)'

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-busy={pending}
      aria-label={swatch.name}
      title={swatch.name}
      onClick={() => onPick(swatch)}
      className={`group relative block h-[46px] w-full first:rounded-t-[14px] last:rounded-b-[14px]
                  md:h-[52px] transition-[transform,filter,box-shadow] duration-300
                  ease-[cubic-bezier(0.22,1,0.36,1)]
                  focus-visible:z-20 focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400
                  ${
                    active
                      ? /* Lifted clear of the pile, and casting onto it. */
                        'z-10 scale-[1.035] brightness-[1.06] ' +
                        'shadow-[0_10px_22px_-8px_rgb(0_0_0/0.9),0_-6px_16px_-10px_rgb(0_0_0/0.7)]'
                      : 'hover:z-10 hover:scale-[1.015] hover:brightness-[1.05]'
                  }`}
      style={{
        backgroundColor: swatch.hex,
        backgroundImage: swatch.thumbnail
          ? `${fold}, ${vignette}, url(${swatch.thumbnail})`
          : `${fold}, ${vignette}`,
        /**
         * Tiled at a fixed size, not `cover`.
         *
         * `cover` on a band this wide magnifies a 256px thumbnail until the
         * thread reads as rope and a bouclé reads as marble — the band shows one
         * blurred crop of the weave rather than the weave. These thumbnails are
         * mip levels of the tiling texture the piece actually renders with, so
         * they tile seamlessly (checked: opposite edges match more closely than
         * two interior lines of the same image do), and 64px puts several
         * repeats across the band at roughly the scale real cloth would be.
         */
        backgroundSize: 'auto, auto, 64px',
        backgroundRepeat: 'no-repeat, no-repeat, repeat',
        backgroundPosition: 'center, center, center',
      }}
    >
      {/* The crease between this bolt and the next. An inset shadow rather than
          a border: a border would add a pixel to the band's height and the whole
          stack would grow by the number of fabrics in it. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-[inherit] transition-shadow duration-300 ${
          active
            ? 'shadow-[inset_0_1px_0_rgb(255_255_255/0.34),inset_0_-1px_0_rgb(0_0_0/0.75)]'
            : 'shadow-[inset_0_1px_0_rgb(255_255_255/0.10),inset_0_-1px_0_rgb(0_0_0/0.55)]'
        }`}
      />

      {/* Names, because a stack of cloth is beautiful and unshoppable without
          them. A translucent slab rather than bare text: the palette runs from
          white linen to near-black, and nothing else is legible on both. */}
      <span
        className={`pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2.5
                    text-[11.5px] leading-none tracking-tight transition-colors duration-300
                    ${active ? 'text-white' : 'text-white/80 group-hover:text-white'}`}
      >
        <span
          className={`rounded-full px-2 py-1 backdrop-blur-[2px] transition-colors duration-300 ${
            active ? 'bg-black/55' : 'bg-black/40'
          }`}
        >
          {swatch.name}
        </span>
      </span>

      {active && !pending && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5"
        >
          <span
            className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-white
                       text-slate-900 shadow-[0_2px_6px_rgb(0_0_0/0.5)]"
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
          </span>
        </span>
      )}

      {pending && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center
                     bg-slate-950/45 backdrop-blur-[1px]"
        >
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        </span>
      )}
    </button>
  )
}
