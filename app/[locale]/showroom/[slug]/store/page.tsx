import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { fetchRoom, fetchShowroom, fetchShowroomList } from '@/lib/api'
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
 * Thin server shell: settles the locale and 404s an unknown showroom slug —
 * or one with no room to walk — before the heavy walkthrough scene mounts
 * (Client Component, `ssr: false`). The scene's own data (room, catalogue,
 * products) is fetched client-side, scoped to this `slug`.
 * @see Scene.tsx, useStoreConfig, ProductInteraction
 */
export default async function StorePage({ params }: { params: { locale: Locale; slug: string } }) {
  setRequestLocale(params.locale)
  const [showroom, room] = await Promise.all([fetchShowroom(params.slug), fetchRoom(params.slug)])
  if (!showroom || !room) notFound()
  return <StorePageClient slug={params.slug} />
}
