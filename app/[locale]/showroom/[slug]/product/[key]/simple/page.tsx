import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { resolveShowroomPresentation } from '@/lib/product/presentation'
import { fetchShowroomList, fetchPresentations } from '@/lib/api'
import SimpleViewerClient from './SimpleViewerClient'

export async function generateStaticParams() {
  const showrooms = await fetchShowroomList()
  const params = await Promise.all(
    showrooms.map(async ({ slug }) => {
      const presentations = await fetchPresentations(slug)
      return Object.keys(presentations).map((key) => ({ slug, key }))
    })
  )
  return routing.locales.flatMap((locale) => params.flat().map(({ slug, key }) => ({ locale, slug, key })))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale; slug: string; key: string }
}): Promise<Metadata> {
  const { locale, slug, key } = params
  const t = await getTranslations({ locale, namespace: 'product' })
  const presentation = await resolveShowroomPresentation(slug, key, locale)
  if (!presentation) return { title: t('metaNotFoundTitle') }

  const { product } = presentation
  const title = `${product.name} ${t('simpleMetaTitleSuffix')}`
  const description = t('simpleMetaDescription', { name: product.name })

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    alternates: {
      canonical:
        locale === 'fa' ? `/showroom/${slug}/product/${key}/simple` : `/en/showroom/${slug}/product/${key}/simple`,
      languages: {
        fa: `/showroom/${slug}/product/${key}/simple`,
        en: `/en/showroom/${slug}/product/${key}/simple`,
      },
    },
  }
}

export default async function SimpleProductPage({
  params,
}: {
  params: { locale: Locale; slug: string; key: string }
}) {
  setRequestLocale(params.locale)
  const presentation = await resolveShowroomPresentation(params.slug, params.key, params.locale)
  if (!presentation) notFound()
  return <SimpleViewerClient presentation={presentation} />
}
