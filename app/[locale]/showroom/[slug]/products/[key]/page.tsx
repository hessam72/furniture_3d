import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { fetchShowroomList } from '@/lib/api'
import { brandName, resolveShowroomConfig, withHomeAnchors } from '@/lib/showroom/config'
import { productPath, productsPath, showroomPath } from '@/lib/showroom/paths'
import { loadProductDetail, productKeys } from '@/lib/showroom/products'
import ShowroomSubpage from '@/components/showroom/products/ShowroomSubpage'
import ProductDetailView from '@/components/showroom/products/ProductDetailView'

type Params = { locale: Locale; slug: string; key: string }

export async function generateStaticParams() {
  const showrooms = await fetchShowroomList()
  const params = await Promise.all(
    showrooms.map(async ({ slug }) => (await productKeys(slug)).map((key) => ({ slug, key })))
  )
  return routing.locales.flatMap((locale) => params.flat().map((param) => ({ locale, ...param })))
}

/** A description cut to a search snippet's length, on a word boundary. */
function excerpt(text: string | undefined, max = 160): string | undefined {
  if (!text || text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)}…`
}

/** Page and metadata read the same two payloads; `fetch` dedupes them. */
async function load({ locale, slug, key }: Params) {
  const config = await resolveShowroomConfig(slug)
  if (!config) return null
  const detail = await loadProductDetail(slug, key, locale, config)
  return detail && { config, detail }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug, key } = params
  const [data, t] = await Promise.all([load(params), getTranslations({ locale, namespace: 'showroomProduct' })])
  if (!data) return { title: t('notFoundTitle') }

  const { product, image } = data.detail
  const brand = brandName(data.config.brand, locale)
  const title = `${product.name} | ${brand}`
  const description =
    product.shortDescription ??
    excerpt(product.detailedDescription) ??
    t('metaDescriptionFallback', { name: product.name, brand })
  const path = productPath(slug, key)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      // Only an absolute URL: this app sets no `metadataBase` yet. @see app/[locale]/layout.tsx
      ...(image && /^https?:\/\//.test(image) ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    alternates: {
      canonical: locale === 'fa' ? path : `/en${path}`,
      languages: { fa: path, en: `/en${path}` },
    },
  }
}

/**
 * One product of one showroom: photo, specs and a plain 3D turntable.
 *
 * Exists for every published product — unlike `/product/[key]`, the layered
 * presentation, which needs a frame layer. Links to it when there is one.
 */
export default async function ProductPage({ params }: { params: Params }) {
  const { locale, slug } = params
  setRequestLocale(locale)

  const [data, t, tl] = await Promise.all([
    load(params),
    getTranslations({ locale, namespace: 'showroomProduct' }),
    getTranslations({ locale, namespace: 'showroomProducts' }),
  ])
  if (!data) notFound()
  const { config, detail } = data

  return (
    <ShowroomSubpage
      config={withHomeAnchors(config)}
      locale={locale}
      crumbs={{
        label: tl('breadcrumbAria'),
        items: [
          { name: brandName(config.brand, locale), href: showroomPath(slug) },
          { name: t('allProducts'), href: productsPath(slug) },
          { name: detail.product.name },
        ],
      }}
    >
      <ProductDetailView slug={slug} locale={locale} detail={detail} featured={config.featured} />
    </ShowroomSubpage>
  )
}
