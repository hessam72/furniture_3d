import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { presentationKeys, resolvePresentation } from '@/lib/product/presentation'
import SimpleViewerClient from './SimpleViewerClient'

export function generateStaticParams() {
  return presentationKeys().map((id) => ({ id }))
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const presentation = resolvePresentation(params.id)
  if (!presentation) return { title: 'محصول یافت نشد' }

  const { product } = presentation
  const title = `${product.name} — نمای ساده`
  const description = `${product.name} را روی پس‌زمینه سفید بچرخانید، نزدیک شوید و رنگ رویه را انتخاب کنید.`

  return { title, description, openGraph: { title, description, type: 'website' } }
}

export default function SimpleProductPage({ params }: { params: { id: string } }) {
  const presentation = resolvePresentation(params.id)
  if (!presentation) notFound()
  return <SimpleViewerClient presentation={presentation} />
}
