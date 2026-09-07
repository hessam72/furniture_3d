import Link from 'next/link'
import type { ShowroomConfig } from '@/lib/showroom/config'
import Reveal from './Reveal'
import { ArrowIcon, SofaGhostIcon } from './icons'

/** The platform band: the brand hands the visitor over to the marketplace it
 *  lives in. Its mark is drawn (a conic ring) when no logo is supplied. */
export default function ShowroomClosing({ closing }: { closing: NonNullable<ShowroomConfig['closing']> }) {
  const platform = closing.platform

  return (
    <section className="sr-closing" id="about">
      <div className="sr-shell sr-closing-grid">
        {platform && (
          <Reveal className="sr-platform">
            {platform.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sr-brand-logo" src={platform.logo} alt={platform.name} />
            ) : (
              <span className="sr-platform-mark" aria-hidden="true" />
            )}
            <span className="sr-brand-lockup">
              <span className="sr-platform-name">{platform.name}</span>
              {platform.tagline && <span className="sr-platform-tag">{platform.tagline}</span>}
            </span>
          </Reveal>
        )}

        <Reveal className="sr-closing-copy" delay={80}>
          {closing.eyebrow && <p className="sr-section-eyebrow">{closing.eyebrow}</p>}
          <h2 className="sr-h2">{closing.title}</h2>
          {closing.description && <p className="sr-section-lead">{closing.description}</p>}

          {closing.cta && (
            <div className="sr-closing-actions">
              <Link className="sr-round-btn" href={closing.cta.href} aria-label={closing.cta.label}>
                <ArrowIcon size={20} />
              </Link>
              <span>{closing.cta.label}</span>
            </div>
          )}
        </Reveal>

        <Reveal className="sr-closing-media" delay={140}>
          {closing.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={closing.image} alt="" loading="lazy" />
          ) : (
            <SofaGhostIcon size={96} />
          )}
        </Reveal>
      </div>

      {closing.sideText && closing.sideText.length > 0 && (
        <p className="sr-closing-side sr-latin" aria-hidden="true">
          {closing.sideText.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
        </p>
      )}
    </section>
  )
}
