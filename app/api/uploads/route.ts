import { NextResponse } from 'next/server'
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_HDR_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  addAsset,
  extensionOf,
  hdrExtensionOf,
  listAssets,
} from '@/lib/uploads/store'

// Writes to the filesystem, so it cannot be prerendered or run on the edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ assets: await listAssets() })
}

/**
 * Accept one model, optionally with the environment map it should be lit by,
 * and return the viewer link for it.
 *
 * Unauthenticated by request. What keeps that from being a file-write hole is
 * that nothing the client sends reaches the filesystem: each part must carry a
 * known extension, both are capped, and the stored names are built from a UUID
 * this server generates. @see addAsset
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const hdrFile = form?.get('hdr')

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

  // Optional, and empty is the same as absent: browsers submit a File of size 0
  // for an untouched file input inside a form.
  let hdr: { name: string; ext: string; data: Buffer } | undefined
  if (hdrFile instanceof File && hdrFile.size > 0) {
    const hdrExt = hdrExtensionOf(hdrFile.name)
    if (!hdrExt) {
      return NextResponse.json(
        { error: `فایل HDR باید ${ALLOWED_HDR_EXTENSIONS.join(' یا ')} باشد.` },
        { status: 415 }
      )
    }
    if (hdrFile.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `حجم فایل HDR باید کمتر از ${Math.round(MAX_UPLOAD_BYTES / 1048576)} مگابایت باشد.` },
        { status: 413 }
      )
    }
    hdr = { name: hdrFile.name, ext: hdrExt, data: Buffer.from(await hdrFile.arrayBuffer()) }
  }

  const asset = await addAsset(file.name, ext, Buffer.from(await file.arrayBuffer()), hdr)
  return NextResponse.json({ asset }, { status: 201 })
}
