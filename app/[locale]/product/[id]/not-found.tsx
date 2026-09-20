import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

export default async function ProductNotFound() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('product')])
  return (
    <div
      dir={locale === 'fa' ? 'rtl' : 'ltr'}
      className="font-persian flex h-screen w-screen flex-col items-center justify-center gap-4
                 bg-[var(--surface-0)] px-6 text-center"
    >
      <p className="text-[10px] tracking-[0.45em] text-[var(--gold-primary)]/70">{t('notFoundEyebrow')}</p>
      <h1 className="text-xl font-light text-[var(--text-primary)]">{t('notFoundTitle')}</h1>
      <p className="max-w-sm text-[13px] leading-7 text-[var(--text-muted)]">{t('notFoundBody')}</p>
      <Link
        href="/store"
        className="mt-2 rounded-full border border-[var(--gold-primary)]/40 px-6 py-2.5 text-[13px]
                   text-[var(--gold-primary)] transition-colors hover:bg-[var(--gold-primary)]/10"
      >
        {t('backToShowroomAria')}
      </Link>
    </div>
  )
}
