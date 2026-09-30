import '../showroom.css'
import './products.css'
import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import type { ShowroomConfig } from '@/lib/showroom/config'
import ShowroomHeader from '../ShowroomHeader'
import ShowroomFooter from '../ShowroomFooter'

/**
 * The brand page's frame — its header and footer, its light theme — around a
 * page under it. `config` should come through `withHomeAnchors`, so the
 * header's `#collection`-style links lead back to the homepage's sections.
 */
export default function ShowroomSubpage({
  config,
  locale,
  crumbs,
  children,
}: {
  config: ShowroomConfig
  locale: Locale
  crumbs: { label: string; items: { name: string; href?: string }[] }
  children: ReactNode
}) {
  return (
    <div className="sr-root" dir={locale === 'fa' ? 'rtl' : 'ltr'} lang={locale}>
      <ShowroomHeader config={config} />

      <main>
        <nav className="sr-shell sr-crumbs" aria-label={crumbs.label}>
          <ol>
            {crumbs.items.map((item) => (
              <li key={item.name}>
                {item.href ? (
                  <Link href={item.href}>{item.name}</Link>
                ) : (
                  <span aria-current="page" dir="auto">
                    {item.name}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {children}
      </main>

      <ShowroomFooter config={config} />
    </div>
  )
}
