import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { resolveShowroom, showroomSlugs } from '@/lib/showroom/config'
import ShowroomPage from '@/components/showroom/ShowroomPage'

export async function generateStaticParams() {
  const slugs = await showroomSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const showroom = await resolveShowroom(params.slug)
  if (!showroom) return { title: 'شوروم یافت نشد' }

  const { brand, seo } = showroom.config
  const title = seo?.title ?? `${brand.nameFa} | شوروم مجازی`
  const description =
    seo?.description ??
    `${brand.nameFa} را سه‌بعدی ببینید، رنگ و رویه را تغییر دهید و پیش از خرید در خانه‌تان بچینید.`

  return { title, description, openGraph: { title, description, type: 'website' } }
}

export default async function Showroom({ params }: { params: { slug: string } }) {
  const showroom = await resolveShowroom(params.slug)
  if (!showroom) notFound()
  return <ShowroomPage showroom={showroom} />
}
