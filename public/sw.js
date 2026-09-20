/**
 * Asset cache for the 3D routes.
 *
 * `next.config.mjs` already serves every one of these roots as
 * `public, max-age=31536000, immutable`, and on a desktop that is the end of
 * the story. On iOS it is not: WebKit's network cache caps the size of a single
 * entry, so the one file that actually costs something — a multi-megabyte GLB —
 * is the one file Safari declines to keep. The header is obeyed and the asset
 * is re-downloaded on every visit anyway, which is exactly the symptom this
 * exists to remove. Cache Storage has no such per-entry cap.
 *
 * Deliberately narrow:
 *
 *  - **Only the immutable asset roots below.** HTML, RSC payloads, `/api/*` and
 *    anything else fall through untouched — `respondWith` is never called for
 *    them — so a deploy is picked up the moment it lands and nothing here can
 *    serve a stale page. The roots are the same list `IMMUTABLE_ASSET_PATHS`
 *    names; a file in them is replaced by *bumping its filename*, never by
 *    editing it in place, which is what makes cache-first safe here.
 *  - **Only same-origin GET.** A cross-origin response is opaque and
 *    `cache.put` rejects on it.
 *  - **Never a `Range` request.** A 206 is a partial body; storing one and
 *    serving it back as if it were whole is a corrupt file.
 *
 * Failure is always survivable: a cache miss, a quota error and a rejected
 * `put` all end up at the network, which is what the page did before this file
 * existed. To turn it off for a visitor, load any page with `?sw=off` — @see
 * components/layout/AssetCache.tsx, which unregisters and empties the store.
 */

/** Bump to invalidate everything this has stored. Only needed if a root is
 *  reorganised or a file is ever replaced in place, which it should not be. */
const VERSION = 'v1'
const CACHE = `furniture-assets-${VERSION}`

/** The immutable roots, mirroring `IMMUTABLE_ASSET_PATHS` in next.config.mjs.
 *  Keep the two in step: a root cached here but mutable there would pin a stale
 *  file for a year on every device that visited once. */
const ROOTS = [
  '/ktx-optimized/',
  '/models/',
  '/store-models/',
  '/home_models/',
  '/hdr/',
  '/textures/',
  '/basis/',
  '/draco/',
  '/fonts/',
  '/audio/',
  '/images/',
]

self.addEventListener('install', () => {
  // Nothing is precached: what a visitor needs depends entirely on which page
  // they opened, and guessing wrong costs them the bandwidth this is meant to
  // save. Take over immediately rather than waiting for every tab to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('furniture-assets-') && name !== CACHE)
          .map((name) => caches.delete(name))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (request.headers.has('range')) return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return
  if (!ROOTS.some((root) => url.pathname.startsWith(root))) return

  event.respondWith(cacheFirst(request))
})

/**
 * Serve from the store, else fetch and keep it.
 *
 * `ignoreSearch` is off: `/api/ar/...` is not in scope here, but a texture
 * carrying a cache-busting query is a different file and must be treated as
 * one. `ignoreVary` is on because these are static bytes — a `Vary` the origin
 * happened to emit (`Accept-Encoding` through the Apache proxy, most likely)
 * would otherwise miss on every request and quietly make this a no-op.
 */
async function cacheFirst(request) {
  let cache = null
  try {
    cache = await caches.open(CACHE)
    const hit = await cache.match(request, { ignoreVary: true })
    if (hit) return hit
  } catch {
    // Storage unavailable — private browsing, a full disk, a locked-down
    // profile. Fall through to the network.
  }

  const response = await fetch(request)

  // 200 only. A 206 cannot be reassembled, a 30x should be followed live, and
  // an opaque (`type !== 'basic'`) response is one `put` rejects on anyway.
  if (cache && response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone()
    // Not awaited: the page should not wait on the disk to get its bytes. A
    // quota error here means the next visit re-downloads, which is the status
    // quo, not a regression.
    void cache.put(request, copy).catch(() => {})
  }

  return response
}
