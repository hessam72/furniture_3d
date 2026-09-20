import type { Metadata } from 'next'
import { listAssets } from '@/lib/uploads/store'
import ManageClient from './ManageClient'

// The library changes at runtime, so the first paint has to read it per request
// rather than serve a list baked at build time.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'مدیریت مدل‌های سه‌بعدی',
  // Uploads are unlisted links, not catalogue pages.
  robots: { index: false, follow: false },
}

export default async function ManagePage() {
  return <ManageClient initial={await listAssets()} />
}
