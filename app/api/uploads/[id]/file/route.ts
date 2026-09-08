import { createReadStream } from 'fs'
import { Readable } from 'stream'
import { NextResponse } from 'next/server'
import { assetPath, getAsset } from '@/lib/uploads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stream an uploaded model.
 *
 * Uploads cannot live under `public/`: Next indexes that directory once at
 * boot, so anything written later is a 404 until the process restarts. This
 * route reads `data/uploads` per request instead, which is also what lets a
 * delete take effect immediately.
 *
 * Streamed rather than buffered — a 100MB GLB read into memory to answer one
 * request is exactly the kind of spike this app has been trimming elsewhere.
 * The id is unique per upload and its bytes never change, so the response is
 * immutable for a year; deleting the model removes the URL, not its cache.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const asset = await getAsset(params.id)
  if (!asset) return NextResponse.json({ error: 'یافت نشد.' }, { status: 404 })

  const body = Readable.toWeb(createReadStream(assetPath(asset))) as ReadableStream

  return new Response(body, {
    headers: {
      'Content-Type': asset.file.endsWith('.gltf') ? 'model/gltf+json' : 'model/gltf-binary',
      'Content-Length': String(asset.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Named for the human downloading it, not for the id it is stored under.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    },
  })
}
