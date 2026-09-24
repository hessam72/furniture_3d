import { getLocale, getTranslations } from 'next-intl/server'

export default async function ProductLoading() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('product')])
  return (
    <div
      dir={locale === 'fa' ? 'rtl' : 'ltr'}
      className="font-persian flex h-screen w-screen items-center justify-center bg-[var(--surface-0)]"
    >
      <span className="text-[11px] tracking-[0.4em] text-[var(--gold-primary)]/60">
        {t('preparingView')}
      </span>
    </div>
  )
}
