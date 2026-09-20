import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

/**
 * Site-wide 404 for anything under `[locale]/**` with no more specific
 * `not-found.tsx` of its own (`/product/[id]` has its own, more specific one).
 * There was no root `not-found.tsx` at all before this — a bad URL fell
 * through to Next's unstyled default.
 */
export default async function NotFound() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('common')])
  return (
    <div
      dir={locale === 'fa' ? 'rtl' : 'ltr'}
      className="font-persian ink-gradient flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 className="text-xl font-light text-white">{t('pageNotFoundTitle')}</h1>
      <p className="max-w-sm text-[13px] leading-7 text-white/55">{t('pageNotFoundBody')}</p>
      <Link
        href="/"
        className="mt-2 rounded-full border border-gold-line px-6 py-2.5 text-[13px] text-gold transition-colors hover:bg-gold/10"
      >
        {t('backHome')}
      </Link>
    </div>
  )
}
