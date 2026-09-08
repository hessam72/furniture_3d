import { NextResponse } from 'next/server'
import { removeAsset } from '@/lib/uploads/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const removed = await removeAsset(params.id)
  if (!removed) return NextResponse.json({ error: 'یافت نشد.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
