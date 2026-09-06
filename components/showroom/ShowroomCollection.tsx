'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ShowroomConfig } from '@/lib/showroom/config'
import Reveal from './Reveal'
import { ArrowIcon, PlusIcon, SofaGhostIcon } from './icons'

/**
 * The model rail.
 *
 * A scroll container with snap points rather than a transformed track: the
 * native scroller keeps the drag, the wheel, the trackpad swipe and the
 * keyboard for free, and `scroll-behavior: smooth` gives the arrows the same
 * easing — so the only JS here is the paging step and whether an arrow has
 * anywhere left to go.
 */
export default function ShowroomCollection({
  collection,
}: {
  collection: ShowroomConfig['collection']
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  const syncEdges = useCallback(() => {
    const node = rail.current
    if (!node) return
    // `scrollLeft` runs negative in RTL on every engine that matters now, so
    // the distance travelled is its magnitude either way round.
    const travelled = Math.abs(node.scrollLeft)
    const max = node.scrollWidth - node.clientWidth
    setEdge({ start: travelled < 8, end: travelled >= max - 8 })
  }, [])

  useEffect(() => {
    syncEdges()
    const node = rail.current
    if (!node) return
    node.addEventListener('scroll', syncEdges, { passive: true })
    window.addEventListener('resize', syncEdges)
    return () => {
      node.removeEventListener('scroll', syncEdges)
      window.removeEventListener('resize', syncEdges)
    }
  }, [syncEdges])

  const page = useCallback((direction: 1 | -1) => {
    const node = rail.current
    if (!node) return
    const card = node.firstElementChild as HTMLElement | null
    const step = card ? card.offsetWidth + 20 : node.clientWidth * 0.8
    // Positive `left` is always "further along the reading direction" —
    // scrollBy is direction-aware, unlike scrollLeft.
    node.scrollBy({ left: step * direction, behavior: 'smooth' })
  }, [])

  return (
    <section className="sr-section" id="collection">
      <div className="sr-shell">
        <div className="sr-collection-head">
          <Reveal>
            {collection.eyebrow && <p className="sr-section-eyebrow">{collection.eyebrow}</p>}
            <h2 className="sr-h2">{collection.title}</h2>
            {collection.description && <p className="sr-section-lead">{collection.description}</p>}
          </Reveal>

          <div className="sr-slider-nav">
            <button
              type="button"
              className="sr-slider-btn"
              aria-label="قبلی"
              disabled={edge.start}
              onClick={() => page(-1)}
            >
              {/* The glyph points left; RTL reverses what "back" means. */}
              <ArrowIcon size={18} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button
              type="button"
              className="sr-slider-btn"
              aria-label="بعدی"
              disabled={edge.end}
              onClick={() => page(1)}
            >
              <ArrowIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="sr-shell">
        <div className="sr-rail" ref={rail}>
          {collection.items.map((item, index) => (
            <article
              className="sr-card"
              key={item.id}
              data-featured={!!item.badge}
              style={{ transitionDelay: `${index * 40}ms` }}
            >
              <div className="sr-card-media">
                {item.badge && <span className="sr-badge">{item.badge}</span>}
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt={item.name} loading="lazy" />
                ) : (
                  <SofaGhostIcon size={92} className="sr-card-ghost" />
                )}
                <span className="sr-podium" />
              </div>

              <div className="sr-card-foot">
                <span className="sr-card-dots">
                  {item.colors?.map((color) => (
                    <span className="sr-card-dot" key={color} style={{ background: color }} />
                  ))}
                </span>

                <span className="sr-card-title">
                  {item.category && <span className="sr-card-cat">{item.category}</span>}
                  <span className="sr-card-name">{item.name}</span>
                </span>

                <Link
                  className="sr-card-add"
                  href={item.href ?? '#'}
                  aria-label={`${collection.addLabel ?? 'مشاهده'} ${item.name}`}
                >
                  <PlusIcon size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
