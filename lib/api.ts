/**
 * The one place this app talks to `furniture_backend`'s public read API
 * (`/api/v1/public/showrooms/:slug/*`). Every function here returns `null` on
 * a 404 (unknown/unpublished showroom or product) so callers can `notFound()`,
 * and throws on anything else — a 500 or a network failure is not "this
 * showroom doesn't exist".
 *
 * Response shapes are byte-for-byte what this app's static JSON files used to
 * carry (`products.json`, `catalog.json`, `furniture-presentation.json`,
 * `showrooms-page.json`, `stores.json`) — the backend was built to match them,
 * so no adapter layer sits between a fetch here and the existing types in
 * `lib/showroom/config.ts` / `lib/product/presentation.ts` / `lib/store/catalog.ts`.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3010').replace(/\/$/, '')

/** The origin alone, for building asset URLs (`${apiOrigin}/uploads/...`). */
export const apiOrigin = API_BASE

/** Where `/uploads/*` is served. Defaults to the API's own origin; set
 *  `NEXT_PUBLIC_MEDIA_URL=''` when a reverse proxy serves `/uploads` on this
 *  site's origin, which also sidesteps the backend's single-origin CORS. */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_URL ?? API_BASE).replace(/\/$/, '')

/**
 * A payload's asset path, made loadable from this app. The backend sends media
 * relative (`/uploads/<storageKey>`); anything else — an absolute URL, or one
 * of this app's own `public/` paths — is returned untouched.
 */
export function mediaUrl(path: string): string {
  return path.startsWith('/uploads/') ? `${MEDIA_BASE}${path}` : path
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}/api/v1/public${path}`, {
    next: { revalidate: 60 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

export interface ShowroomListEntry {
  slug: string
  name: string
}

/** Every published slug — the `generateStaticParams` source for `/showroom/[slug]`. */
export function fetchShowroomList(): Promise<ShowroomListEntry[]> {
  return getJson<{ showrooms: ShowroomListEntry[] }>('/showrooms').then((v) => v?.showrooms ?? [])
}

/** The full `ShowroomConfig` for one slug, or `null` if unknown/unpublished. */
export function fetchShowroom<T = unknown>(slug: string): Promise<T | null> {
  return getJson<T>(`/showrooms/${encodeURIComponent(slug)}`)
}

/** `Record<Product.slug, ProductData>` — `products.json`'s shape. */
export function fetchProducts<T = unknown>(slug: string): Promise<Record<string, T>> {
  return getJson<Record<string, T>>(`/showrooms/${encodeURIComponent(slug)}/products`).then((v) => v ?? {})
}

/** `Record<Product.slug, PresentationConfig>` — bulk, for SSG. */
export function fetchPresentations<T = unknown>(slug: string): Promise<Record<string, T>> {
  return getJson<Record<string, T>>(`/showrooms/${encodeURIComponent(slug)}/presentations`).then((v) => v ?? {})
}

/** `{categories, items}` — `catalog.json`'s shape. */
export function fetchCatalog<T = unknown>(slug: string): Promise<T | null> {
  return getJson<T>(`/showrooms/${encodeURIComponent(slug)}/catalog`)
}

/** One product plus its presentation, or `null` if unknown/unpublished. `key` is `Product.slug`. */
export function fetchProduct<TProduct = unknown, TPresentation = unknown>(
  slug: string,
  key: string
): Promise<{ product: TProduct; presentation: TPresentation | null } | null> {
  return getJson(`/showrooms/${encodeURIComponent(slug)}/products/${encodeURIComponent(key)}`)
}

/** The walkable room — `stores.json`'s per-store shape, plus its numbered
 *  `slots` and the `placements` standing on them. Asset URLs are relative. */
export function fetchRoom<T = unknown>(slug: string): Promise<T | null> {
  return getJson<T>(`/showrooms/${encodeURIComponent(slug)}/room`)
}

/** The backend's own AR patch route for a configured piece — replaces this
 *  app's local `/api/ar/[key]/model.glb`. Query contract (`layer`, `zone`,
 *  `paint`) matches; the backend does not yet accept `tex` (chosen fabric),
 *  so a swatch pick does not travel to AR through this endpoint. */
export function arModelUrl(slug: string, key: string, query: URLSearchParams): string {
  return `${API_BASE}/api/v1/public/showrooms/${encodeURIComponent(slug)}/products/${encodeURIComponent(key)}/ar/model.glb?${query.toString()}`
}
