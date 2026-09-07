import Link from 'next/link'
import type { ShowroomConfig } from '@/lib/showroom/config'
import Reveal from './Reveal'
import { ArrowIcon, CubeIcon, PlayIcon, VrIcon } from './icons'

/**
 * The walkable-showroom pitch: a still of the room on one side, the invitation
 * and a plan of the space on the other. The CTA is the only door to /store on
 * the page that is not in the header, so it stays a full-width pill.
 *
 * The plan is drawn in CSS when no image is supplied — a brand that has a real
 * isometric render drops it into `virtual.map.image` and the placeholder steps
 * aside.
 */
export default function ShowroomVirtual({ virtual }: { virtual: ShowroomConfig['virtual'] }) {
  return (
    <section className="sr-section" id="virtual">
      <div className="sr-shell sr-virtual-grid">
        <Reveal className="sr-virtual-media">
          {virtual.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={virtual.image} alt={virtual.imageAlt ?? virtual.title} loading="lazy" />
          )}

          {virtual.imageCaption && (
            <div className="sr-virtual-caption">
              <span className="sr-play">
                <PlayIcon size={15} />
              </span>
              <span className="sr-video-label">
                <strong>{virtual.imageCaption}</strong>
                {virtual.imageNote && <span>{virtual.imageNote}</span>}
              </span>
            </div>
          )}

          {virtual.imageBadge && virtual.imageBadge.length > 0 && (
            <div className="sr-virtual-badge" aria-hidden="true">
              <CubeIcon size={22} />
              {virtual.imageBadge.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          )}
        </Reveal>

        <Reveal className="sr-virtual-copy" delay={100}>
          {virtual.eyebrow && <p className="sr-section-eyebrow">{virtual.eyebrow}</p>}
          <h2 className="sr-h2">{virtual.title}</h2>
          {virtual.description && <p className="sr-section-lead">{virtual.description}</p>}

          {virtual.cta && (
            <Link className="sr-btn sr-btn-solid" href={virtual.cta.href}>
              {virtual.cta.icon === 'vr' && <VrIcon size={19} />}
              {virtual.cta.label}
              <ArrowIcon className="sr-arrow" size={17} />
            </Link>
          )}

          <div className="sr-map">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img style={{background:'#fbfcfc'}} src="/images/right.png" alt="" loading="lazy" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
