import { NextResponse } from 'next/server'
import { assetHdrPath, getAsset } from '@/lib/uploads/store'
import { contentTypeFor, fileResponse } from '@/lib/uploads/serve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stream a model's environment map.
 *
 * The filename is in the path, and that is not decoration: drei's `Environment`
 * picks its loader from the URL's extension — `.hdr` gets RGBELoader, `.exr`
 * gets EXRLoader — so a bare `/hdr` endpoint would load as neither. The segment
 * is matched against the index rather than trusted, so it can only ever name
 * the file this id already owns.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; file: string } }
) {
  const asset = await getAsset(params.id)
  const path = asset && assetHdrPath(asset)
  if (!asset?.hdr || !path || asset.hdr.file !== params.file) {
    return NextResponse.json({ error: 'یافت نشد.' }, { status: 404 })
  }

  return fileResponse(path, {
    type: contentTypeFor(asset.hdr.file),
    size: asset.hdr.size,
    filename: asset.hdr.name,
  })
}
