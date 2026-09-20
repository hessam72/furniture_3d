import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import StorePageClient from './StorePageClient'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale }
}): Promise<Metadata> {
  const { locale } = params
  const t = await getTranslations({ locale, namespace: 'metadata' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: locale === 'fa' ? '/store' : '/en/store',
      languages: { fa: '/store', en: '/en/store' },
    },
  }
}

/**
 * Thin server shell so the locale can be settled (and static rendering kept)
 * before the heavy walkthrough scene mounts — the scene itself has to stay
 * a Client Component (`useContextRecovery`, the `ssr: false` dynamic import),
 * which cannot call `setRequestLocale` on its own. @see StorePageClient
 */
export default function StorePage({ params }: { params: { locale: Locale } }) {
  setRequestLocale(params.locale)
  return <StorePageClient />
}
