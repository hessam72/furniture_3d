import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  /**
   * Runs on every page route, but never on `/api/**`, `/_next/**`, or any
   * request whose path contains a dot — which is every static asset this
   * app serves (`/models/*.glb`, `/config/*.json`, `/fonts/*.woff2`,
   * `/favicon.ico`, `/manifest.webmanifest`, …). Most of those asset roots
   * (`models`, `store-models`, `ktx-optimized`, …) are gitignored and only
   * exist at runtime, so matching by extension is the robust rule here —
   * enumerating asset directories would silently go stale the next time one
   * is added.
   */
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
