import type { routing } from '@/i18n/routing'

/**
 * Types every next-intl API (`useLocale()`, `useTranslations()`'s messages,
 * `getLocale()`, …) against this app's actual locale union and message
 * shape, instead of the generic `string` next-intl falls back to without
 * this. This is what lets `useLocale()` be passed straight into a function
 * typed `(locale: Locale) => …` (e.g. `getHomeCopy`, `formatPrice`) with no
 * cast at the call site.
 * @see https://next-intl.dev/docs/workflows/typescript
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number]
    Messages: typeof import('@/messages/fa.json')
  }
}
