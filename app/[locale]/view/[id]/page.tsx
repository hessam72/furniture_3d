import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAsset } from '@/lib/uploads/store'
import ViewerClient from './ViewerClient'

// The library is a file on disk that the manager rewrites at runtime, so this
// route is resolved per request rather than baked at build time.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const asset = await getAsset(params.id)
  return { title: asset ? `${asset.name} — نمای سه‌بعدی` : 'مدل یافت نشد' }
}

export default async function UploadViewerPage({ params }: { params: { id: string } }) {
  const asset = await getAsset(params.id)
  if (!asset) notFound()
  return <ViewerClient asset={asset} />
}
