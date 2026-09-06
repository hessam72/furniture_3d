'use client'

import Link from 'next/link'

/**
 * `public/models` and `public/store-models` are gitignored, so a fresh clone or
 * a mistyped manifest path is a normal failure here — it must read as a calm
 * "not on this server yet", never an infinite spinner or a dead black stage.
 */
export default function MissingAssetsNotice({
  productName,
  missing,
  kind = 'missing',
  onRetry,
}: {
  productName: string
  missing: string[]
  /** 'missing' = the files are not on the server; 'error' = one is there but
   *  would not parse. Different problem, different thing to tell the reader. */
  kind?: 'missing' | 'error'
  onRetry?: () => void
}) {
  const broken = kind === 'error'
  return (
    <div
      dir="rtl"
      className="font-persian absolute inset-0 z-[150] flex flex-col items-center justify-center
                 gap-4 bg-[var(--surface-0)]/95 px-6 text-center"
    >
      <p className="text-[10px] tracking-[0.45em] text-[var(--gold-primary)]/70">نمای ویژه محصول</p>
      <h2 className="text-xl font-light text-[var(--text-primary)]">
        {broken
          ? `مدل سه‌بعدی ${productName} باز نشد`
          : `فایل‌های سه‌بعدی ${productName} روی سرور موجود نیست`}
      </h2>
      <p className="max-w-sm text-[13px] leading-7 text-[var(--text-muted)]">
        {broken
          ? 'فایل روی سرور هست اما خوانده نشد. احتمالاً هنگام خروجی گرفتن یا آپلود آسیب دیده است.'
          : `${missing.length} فایل پیدا نشد. پس از بارگذاری مدل‌ها این صفحه بدون تغییر کد کار خواهد کرد.`}
      </p>

      <ul dir="ltr" className="max-w-sm space-y-1 text-[11px] text-[var(--text-muted)]/70">
        {missing.slice(0, 5).map((path) => (
          <li key={path} className="truncate">
            {path}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-full border border-white/15 px-6 py-2.5 text-[13px]
                       text-[var(--text-secondary)] transition-colors hover:border-white/40
                       hover:text-[var(--text-primary)]"
          >
            تلاش دوباره
          </button>
        )}
        <Link
          href="/store"
          className="rounded-full border border-[var(--gold-primary)]/40 px-6 py-2.5 text-[13px]
                     text-[var(--gold-primary)] transition-colors hover:bg-[var(--gold-primary)]/10"
        >
          بازگشت به شوروم
        </Link>
      </div>
    </div>
  )
}
