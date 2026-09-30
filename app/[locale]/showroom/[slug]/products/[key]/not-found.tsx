'use client'

import '@/components/showroom/showroom.css'
import '@/components/showroom/products/products.css'
import { useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { productsPath } from '@/lib/showroom/paths'
import { SofaGhostIcon } from '@/components/showroom/icons'

/** An unknown or unpublished product — back to its showroom's list. A client
 *  component only because `not-found` receives no params. */
export default function ProductNotFound() {
  const t = useTranslations('showroomProduct')
  const locale = useLocale()
  const { slug } = useParams<{ slug: string }>()

  return (
    <div className="sr-root" dir={locale === 'fa' ? 'rtl' : 'ltr'} lang={locale}>
      <main className="sr-section">
        <div className="sr-shell">
          <div className="sr-pl-empty">
            <SofaGhostIcon size={72} />
            <h1 className="sr-h2">{t('notFoundTitle')}</h1>
            <p>{t('notFoundBody')}</p>
            <Link href={productsPath(slug)} className="sr-btn sr-btn-solid">
              {t('backToProducts')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
