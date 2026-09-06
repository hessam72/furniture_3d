import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { presentationKeys, resolvePresentation } from '@/lib/product/presentation'
import ProductPageClient from './ProductPageClient'

export function generateStaticParams() {
  return presentationKeys().map((id) => ({ id }))
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const presentation = resolvePresentation(params.id)
  if (!presentation) return { title: 'محصول یافت نشد' }

  const { product } = presentation
  const title = `${product.name} — نمای ویژه محصول`
  const description =
    product.detailedDescription ??
    `${product.name} را لایه به لایه ببینید، رنگ چوب، رویه و کوسن را جداگانه انتخاب کنید و در واقعیت افزوده در خانه بچینید.`

  return { title, description, openGraph: { title, description, type: 'website' } }
}

export default function ProductPage({ params }: { params: { id: string } }) {
  const presentation = resolvePresentation(params.id)
  if (!presentation) notFound()
  return <ProductPageClient presentation={presentation} />
}
