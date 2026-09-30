import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { fetchShowroomList } from '@/lib/api'
import { brandName, resolveShowroomConfig, withHomeAnchors } from '@/lib/showroom/config'
import { productsPath, showroomPath } from '@/lib/showroom/paths'
import { loadProductCards } from '@/lib/showroom/products'
import ShowroomSubpage from '@/components/showroom/products/ShowroomSubpage'
import ProductBrowser from '@/components/showroom/products/ProductBrowser'

type Params = { locale: Locale; slug: string }

export async function generateStaticParams() {
  const showrooms = await fetchShowroomList()
  return routing.locales.flatMap((locale) => showrooms.map(({ slug }) => ({ locale, slug })))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = params
  const [config, t] = await Promise.all([
    resolveShowroomConfig(slug),
    getTranslations({ locale, namespace: 'showroomProducts' }),
  ])
  if (!config) return {}

  const brand = brandName(config.brand, locale)
  const title = t('metaTitle', { brand })
  const description = t('metaDescription', { brand })
  const path = productsPath(slug)
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    alternates: {
      canonical: locale === 'fa' ? path : `/en${path}`,
      languages: { fa: path, en: `/en${path}` },
    },
  }
}

/**
 * Every published product of one showroom, searchable and sortable.
 *
 * Server-rendered from `/products` (ISR, 60s — `lib/api`), so the full list is
 * in the HTML; search and sort run in the browser. @see ProductBrowser
 */
export default async function ProductsPage({ params }: { params: Params }) {
  const { locale, slug } = params
  setRequestLocale(locale)

  const config = await resolveShowroomConfig(slug)
  if (!config) notFound()

  const [cards, t] = await Promise.all([
    loadProductCards(slug, locale, config),
    getTranslations({ locale, namespace: 'showroomProducts' }),
  ])

  return (
    <ShowroomSubpage
      config={withHomeAnchors(config)}
      locale={locale}
      crumbs={{
        label: t('breadcrumbAria'),
        items: [{ name: brandName(config.brand, locale), href: showroomPath(slug) }, { name: t('title') }],
      }}
    >
      <ProductBrowser slug={slug} cards={cards} />
    </ShowroomSubpage>
  )
}
