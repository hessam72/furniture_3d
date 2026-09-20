import Link from 'next/link'

export default function ShowroomNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-persian text-2xl font-bold">این شوروم پیدا نشد</h1>
      <p className="font-persian text-sm text-white/60">
        نشانی را بررسی کنید یا از فهرست شوروم‌ها یکی را انتخاب کنید.
      </p>
      <Link href="/" className="font-persian rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink-950">
        بازگشت به صفحه اصلی
      </Link>
    </div>
  )
}
