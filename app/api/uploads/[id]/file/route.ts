import { NextResponse } from 'next/server'
import { assetPath, getAsset } from '@/lib/uploads/store'
import { contentTypeFor, fileResponse } from '@/lib/uploads/serve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Stream an uploaded model. @see fileResponse for why this is a route at all. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const asset = await getAsset(params.id)
  if (!asset) return NextResponse.json({ error: 'یافت نشد.' }, { status: 404 })

  return fileResponse(assetPath(asset), {
    type: contentTypeFor(asset.file),
    size: asset.size,
    filename: asset.name,
  })
}
