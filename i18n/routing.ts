import { defineRouting } from 'next-intl/routing'

/**
 * fa is the unprefixed default — every existing `/store`, `/product/[id]`
 * link, QR code and AR share URL keeps resolving exactly as before. English
 * is the only locale that gets a URL prefix (`/en/...`).
 * @see middleware.ts
 */
export const routing = defineRouting({
  locales: ['fa', 'en'],
  defaultLocale: 'fa',
  localePrefix: 'as-needed',
})

export type Locale = (typeof routing.locales)[number]
