import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { fetchShowroom, fetchShowroomList } from '@/lib/api'
import StorePageClient from './StorePageClient'

export async function generateStaticParams() {
  const showrooms = await fetchShowroomList()
  return routing.locales.flatMap((locale) => showrooms.map(({ slug }) => ({ locale, slug })))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale; slug: string }
}): Promise<Metadata> {
  const { locale, slug } = params
  const t = await getTranslations({ locale, namespace: 'metadata' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: locale === 'fa' ? `/showroom/${slug}/store` : `/en/showroom/${slug}/store`,
      languages: { fa: `/showroom/${slug}/store`, en: `/en/showroom/${slug}/store` },
    },
  }
}

/**
 * Thin server shell: settles the locale and 404s an unknown showroom slug
 * before the heavy walkthrough scene mounts (Client Component, `ssr: false`).
 *
 * The scene itself (`Scene.tsx` and everything it loads — `ProductInteraction`,
 * `useStoreConfig`, the category bar) still reads the app's static demo JSON
 * rather than this showroom's real catalogue/room — threading `slug` through
 * the 3D pipeline's own data loaders is follow-up work, not done this round.
 * This shell only guarantees the *route* is correctly per-showroom (a real
 * slug renders, an unknown one 404s).
 */
export default async function StorePage({ params }: { params: { locale: Locale; slug: string } }) {
  setRequestLocale(params.locale)
  const showroom = await fetchShowroom(params.slug)
  if (!showroom) notFound()
  return <StorePageClient />
}
