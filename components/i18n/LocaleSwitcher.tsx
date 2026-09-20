'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'

/**
 * Two-segment فا|EN pill, in the same visual language as
 * `components/about/AboutLangToggle.tsx` — labels stay in their own script
 * so a reader of either language recognises the option they want.
 *
 * Swaps locale in place: `usePathname()`/`useRouter()` from `i18n/navigation`
 * already resolve to the current route with its params filled in (no
 * `pathnames` map is configured, so there is nothing per-locale to remap),
 * so the visitor lands back on the exact page — including a `/product/[id]`
 * — they were just on, just under the other locale's prefix. `next-intl`
 * also sets its own locale cookie on the way, so the choice persists.
 */
export default function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale
  const t = useTranslations('common')
  const pathname = usePathname()
  const router = useRouter()

  const switchTo = (next: Locale) => {
    if (next === locale) return
    router.replace(pathname, { locale: next })
  }

  return (
    <div className={`locale-switcher ${className ?? ''}`} role="group" aria-label={t('language')}>
      <button
        type="button"
        lang="fa"
        aria-pressed={locale === 'fa'}
        onClick={() => switchTo('fa')}
      >
        فا
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={locale === 'en'}
        onClick={() => switchTo('en')}
      >
        EN
      </button>
    </div>
  )
}
