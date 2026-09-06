'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ShowroomConfig } from '@/lib/showroom/config'
import { ArrowIcon, CloseIcon, MenuIcon, SearchIcon } from './icons'

/** Brand lockup: the supplied logo when there is one, else the monogram +
 *  wordmark the JSON always carries. */
export function BrandMark({ brand }: { brand: ShowroomConfig['brand'] }) {
  if (brand.logo) {
    return (
      <span className="sr-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sr-brand-logo" src={brand.logo} alt={brand.nameFa} />
      </span>
    )
  }

  return (
    <span className="sr-brand">
      <span className="sr-mono">{brand.monogram}</span>
      <span className="sr-brand-lockup">
        <span className="sr-brand-name">{brand.name}</span>
        {brand.latinTagline && <span className="sr-brand-tag">{brand.latinTagline}</span>}
      </span>
    </span>
  )
}

export default function ShowroomHeader({ config }: { config: ShowroomConfig }) {
  const [open, setOpen] = useState(false)
  const { brand, nav } = config

  return (
    <header className="sr-header">
      <div className="sr-shell sr-header-inner">
        <Link href={`/showroom/${config.slug}`} aria-label={brand.nameFa}>
          <BrandMark brand={brand} />
        </Link>

        <nav className="sr-nav" aria-label={brand.nameFa}>
          {nav.links.map((link) => (
            <Link key={link.label} className="sr-nav-link" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="sr-header-actions">
          {nav.search !== false && (
            <button type="button" className="sr-icon-btn" aria-label="جستجو">
              <SearchIcon />
            </button>
          )}

          {nav.cta && (
            <Link className="sr-pill" href={nav.cta.href}>
              {nav.cta.label}
              <span className="sr-pill-dot">
                <ArrowIcon size={15} />
              </span>
            </Link>
          )}

          <button
            type="button"
            className="sr-burger"
            aria-expanded={open}
            aria-controls="sr-mobile-menu"
            aria-label={open ? 'بستن منو' : 'باز کردن منو'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <div className="sr-shell">
        <div className="sr-mobile" id="sr-mobile-menu" data-open={open}>
          {nav.links.map((link) => (
            <Link key={link.label} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
          {nav.cta && (
            <Link href={nav.cta.href} onClick={() => setOpen(false)}>
              {nav.cta.label}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
