import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { presentationKeys, resolvePresentation } from '@/lib/product/presentation'
import ProductPageClient from './ProductPageClient'

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => presentationKeys().map((id) => ({ locale, id })))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale; id: string }
}): Promise<Metadata> {
  const { locale, id } = params
  const t = await getTranslations({ locale, namespace: 'product' })
  const presentation = resolvePresentation(id, locale)
  if (!presentation) return { title: t('metaNotFoundTitle') }

  const { product } = presentation
  const title = `${product.name} ${t('metaTitleSuffix')}`
  const description = product.detailedDescription ?? t('metaDescriptionFallback', { name: product.name })

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    alternates: {
      canonical: locale === 'fa' ? `/product/${id}` : `/en/product/${id}`,
      languages: { fa: `/product/${id}`, en: `/en/product/${id}` },
    },
  }
}

export default function ProductPage({ params }: { params: { locale: Locale; id: string } }) {
  setRequestLocale(params.locale)
  const presentation = resolvePresentation(params.id, params.locale)
  if (!presentation) notFound()
  return <ProductPageClient presentation={presentation} />
}
