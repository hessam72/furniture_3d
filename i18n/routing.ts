import { defineRouting } from 'next-intl/routing'

/**
 * fa is the unprefixed default — every existing `/store`, `/product/[id]`
 * link, QR code and AR share URL keeps resolving exactly as before. English
 * is the only locale that gets a URL prefix (`/en/...`).
 * @see middleware.ts
 *
 * `localeDetection: false` is what makes that hold. next-intl's default
 * (`true`) picks the locale for an *unprefixed* path from, in order, the
 * `NEXT_LOCALE` cookie, then the browser's `Accept-Language` header, and
 * only falls back to `defaultLocale` once neither says anything — so a
 * visitor whose browser (or a prior visit, via the cookie) prefers English
 * got silently redirected from `/store` to `/en/store` on a link that was
 * never prefixed. The URL has to be the single source of truth for which
 * locale is shown: an unprefixed path is `fa`, full stop, matching every
 * shared `/product/[id]` link and QR code out there, which cannot be
 * expected to carry a locale, and would otherwise resolve differently for
 * different visitors depending on browser settings they never chose for
 * this purpose. `/en/...` is still reached the moment someone asks for it —
 * this only turns off guessing for everyone who has not.
 */
export const routing = defineRouting({
  locales: ['fa', 'en'],
  defaultLocale: 'fa',
  localePrefix: 'as-needed',
  localeDetection: false,
})

export type Locale = (typeof routing.locales)[number]
