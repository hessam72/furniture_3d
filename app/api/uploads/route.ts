import { NextResponse } from 'next/server'
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  addAsset,
  extensionOf,
  listAssets,
} from '@/lib/uploads/store'

// Writes to the filesystem, so it cannot be prerendered or run on the edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ assets: await listAssets() })
}

/**
 * Accept one model file and return the viewer link for it.
 *
 * Unauthenticated by request. What keeps that from being a file-write hole is
 * that nothing the client sends reaches the filesystem: the extension must be
 * one of two known 3D formats, the body is capped, and the stored name is a
 * UUID this server generates. @see addAsset
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'فایلی ارسال نشد.' }, { status: 400 })
  }

  const ext = extensionOf(file.name)
  if (!ext) {
    return NextResponse.json(
      { error: `فقط ${ALLOWED_EXTENSIONS.join(' یا ')} پذیرفته می‌شود.` },
      { status: 415 }
    )
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `حجم فایل باید کمتر از ${Math.round(MAX_UPLOAD_BYTES / 1048576)} مگابایت باشد.` },
      { status: 413 }
    )
  }

  const asset = await addAsset(file.name, ext, Buffer.from(await file.arrayBuffer()))
  return NextResponse.json({ asset }, { status: 201 })
}
