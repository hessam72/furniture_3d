import Link from 'next/link'
import SmoothLink from './SmoothLink'
import type { ShowroomConfig } from '@/lib/showroom/config'
import Reveal from './Reveal'
import { ArrowIcon, Icon, PlayIcon, VrIcon } from './icons'

/**
 * The brand's opening statement: copy on the reading side, the photograph on
 * the other.
 *
 * The photograph carries no frame, no plate and no ornament — it simply runs to
 * the edge and dissolves into the page where it meets the copy, so the two read
 * as one spread rather than as a picture beside a paragraph. The dissolve is a
 * mask on the image, not a white panel over it: the page's own ground shows
 * through, so it stays right whatever the section is standing on.
 */
export default function ShowroomHero({ config }: { config: ShowroomConfig }) {
  const { hero } = config

  return (
    <section className="sr-hero" id="hero">
      <div className="sr-shell sr-hero-grid">
        <Reveal className="sr-hero-copy">
          {hero.eyebrow && <p className="sr-eyebrow">{hero.eyebrow}</p>}
          <h1 className="sr-h1">{hero.title}</h1>
          {hero.subtitle && <p className="sr-h1-sub">{hero.subtitle}</p>}
          {hero.description && <p className="sr-lead">{hero.description}</p>}

          {hero.contact && hero.contact.length > 0 && (
            <ul className="sr-contact">
              {hero.contact.map((row) => (
                <li key={row.text} className="sr-contact-row">
                  <Icon name={row.icon} size={17} />
                  {row.text}
                </li>
              ))}
            </ul>
          )}

          {hero.ctas && hero.ctas.length > 0 && (
            <div className="sr-cta-row">
              {hero.ctas.map((cta) => (
                <SmoothLink
                  key={cta.label}
                  href={cta.href}
                  className={`sr-btn ${cta.variant === 'outline' ? 'sr-btn-outline' : 'sr-btn-solid'}`}
                >
                  {cta.icon === 'vr' && <VrIcon size={19} />}
                  {cta.label}
                  <ArrowIcon className="sr-arrow" size={17} />
                </SmoothLink>
              ))}
            </div>
          )}

          {hero.video && (
            <div className="sr-video-row">
              {hero.video.href ? (
                <Link className="sr-play" href={hero.video.href} aria-label={hero.video.label}>
                  <PlayIcon size={15} />
                </Link>
              ) : (
                <span className="sr-play" aria-hidden="true">
                  <PlayIcon size={15} />
                </span>
              )}
              <span className="sr-video-label">
                <strong>{hero.video.label}</strong>
                {hero.video.note && <span>{hero.video.note}</span>}
              </span>
            </div>
          )}
        </Reveal>

        <Reveal className="sr-hero-media" delay={120}>
          {hero.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero.image}
              alt={hero.imageAlt ?? config.brand.nameFa}
              loading="eager"
              style={hero.imageFocus ? { objectPosition: hero.imageFocus } : undefined}
            />
          )}
        </Reveal>
      </div>

      {hero.sideText && hero.sideText.length > 0 && (
        <p className="sr-side-text" aria-hidden="true">
          {hero.sideText.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
        </p>
      )}

      {hero.scrollLabel && (
        <div className="sr-scroll-cue" aria-hidden="true">
          <span>{hero.scrollLabel}</span>
        </div>
      )}
    </section>
  )
}
