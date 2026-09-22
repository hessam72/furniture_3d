import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { presentationKeys2, resolvePresentation2 } from '@/lib/product/presentation'
import SimpleViewerClient from '../simple/SimpleViewerClient'

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => presentationKeys2().map((id) => ({ locale, id })))
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale; id: string }
}): Promise<Metadata> {
  const { locale, id } = params
  const t = await getTranslations({ locale, namespace: 'product' })
  const presentation = resolvePresentation2(id, locale)
  if (!presentation) return { title: t('metaNotFoundTitle') }

  const { product } = presentation
  const title = `${product.name} ${t('simpleMetaTitleSuffix')}`
  const description = t('simpleMetaDescription', { name: product.name })

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    alternates: {
      canonical: locale === 'fa' ? `/product/${id}/simple-new` : `/en/product/${id}/simple-new`,
      languages: { fa: `/product/${id}/simple-new`, en: `/en/product/${id}/simple-new` },
    },
  }
}

export default function SimpleNewProductPage({ params }: { params: { locale: Locale; id: string } }) {
  setRequestLocale(params.locale)
  const presentation = resolvePresentation2(params.id, params.locale)
  if (!presentation) notFound()
  return <SimpleViewerClient presentation={presentation} />
}
