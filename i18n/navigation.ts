import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

/**
 * Locale-aware wrappers around next/navigation + next/link. Always import
 * these instead of the plain Next.js ones inside `app/[locale]/**` — they
 * keep the current locale prefix (or lack of one, for `fa`) when building
 * hrefs, so the language switcher and every internal `<Link>` stay correct
 * without manual prefixing.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
