'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import type { UploadedAsset } from '@/lib/uploads/store'

const MB = 1048576

/**
 * The upload manager: pick a GLB, get a link.
 *
 * Deliberately plain — one input, one list, no auth and no framework beyond
 * `fetch`. The server owns every decision that matters (accepted extensions,
 * size cap, the stored filename), so this component only has to report what it
 * is told and keep the list in step.
 */
export default function ManageClient({ initial }: { initial: UploadedAsset[] }) {
  const [assets, setAssets] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/uploads', { method: 'POST', body })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'بارگذاری ناموفق بود.')
      setAssets((current) => [payload.asset as UploadedAsset, ...current])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بارگذاری ناموفق بود.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    // Optimistic: the row is the only thing that can be wrong, and a failed
    // delete restores it.
    const previous = assets
    setAssets((current) => current.filter((asset) => asset.id !== id))
    const response = await fetch(`/api/uploads/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      setAssets(previous)
      setError('حذف ناموفق بود.')
    }
  }, [assets])

  const copy = useCallback(async (id: string) => {
    const link = `${window.location.origin}/view/${id}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(id)
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500)
    } catch {
      // clipboard is blocked outside a secure context — the link is on screen
      // as an anchor either way.
      setError('کپی نشد؛ لینک را از روی صفحه بردارید.')
    }
  }, [])

  return (
    <main dir="rtl" className="font-persian mx-auto min-h-screen max-w-2xl px-5 py-10 text-neutral-900">
      <h1 className="text-[17px] font-semibold">مدیریت مدل‌های سه‌بعدی</h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        فایل GLB را بارگذاری کنید تا لینک نمایش آن ساخته شود.
      </p>

      <label
        className={`mt-6 flex cursor-pointer items-center justify-center rounded-xl border border-dashed
                    border-neutral-300 px-4 py-8 text-[13px] transition-colors
                    ${busy ? 'text-neutral-400' : 'text-neutral-600 hover:border-neutral-500'}`}
      >
        <input
          ref={input}
          type="file"
          accept=".glb,.gltf,model/gltf-binary"
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) upload(file)
          }}
        />
        {busy ? 'در حال بارگذاری…' : 'انتخاب فایل GLB'}
      </label>

      {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

      <ul className="mt-8 space-y-2">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{asset.name}</p>
              <p className="text-[11px] text-neutral-500">
                {(asset.size / MB).toFixed(1)} MB · {new Date(asset.uploadedAt).toLocaleDateString('fa-IR')}
              </p>
            </div>

            <Link
              href={`/view/${asset.id}`}
              target="_blank"
              className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] transition-colors hover:border-neutral-500"
            >
              نمایش
            </Link>
            <button
              type="button"
              onClick={() => copy(asset.id)}
              className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] transition-colors hover:border-neutral-500"
            >
              {copied === asset.id ? 'کپی شد' : 'کپی لینک'}
            </button>
            <button
              type="button"
              onClick={() => remove(asset.id)}
              className="rounded-md px-2 py-1 text-[12px] text-red-600 transition-colors hover:bg-red-50"
            >
              حذف
            </button>
          </li>
        ))}
        {assets.length === 0 && (
          <li className="py-6 text-center text-[12px] text-neutral-400">هنوز فایلی بارگذاری نشده است.</li>
        )}
      </ul>
    </main>
  )
}
