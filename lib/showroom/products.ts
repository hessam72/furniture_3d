import { fetchProduct, fetchProducts } from '@/lib/api'
import type { Locale } from '@/i18n/routing'
import { localizePresentationConfig, localizeProduct } from '@/lib/i18n/localize'
import { authoredPath, simpleViewer, type PresentationConfig } from '@/lib/product/presentation'
import { uploadViewerConfig } from '@/lib/uploads/viewer'
import type { ProductData } from '@/components/store/ProductInteraction'
import type { ShowroomConfig } from '@/lib/showroom/config'
import type { ProductCard } from '@/lib/showroom/productQuery'

/**
 * The data behind `/showroom/[slug]/products` and `/products/[key]`, read from
 * the backend's public API (`/products`, `/products/:key`) and shaped for the
 * two pages. Server-side only: it reaches `lib/product/presentation`, which
 * still bundles the static manifests.
 */

/**
 * Photos the brand page already shows, by product key.
 *
 * `ProductData` carries no photo yet, but a collection card on the homepage
 * does — and the backend seeds those from the product's own thumbnail. A card
 * is this product's when its href names it (legacy `/product/<key>` hrefs are
 * already re-pointed by `resolveShowroomConfig`). `null` is a card that
 * deliberately shows none; that is not a photo either.
 */
function collectionImages(config: ShowroomConfig): Map<string, string> {
  const own = new RegExp(`^/showroom/${config.slug}/products?/([^/?#]+)`)
  const images = new Map<string, string>()
  for (const item of config.collection.items) {
    const key = item.href && own.exec(item.href)?.[1]
    if (key && item.image && !images.has(key)) images.set(key, item.image)
  }
  return images
}

/** The product's own photo once the API sends one, else its homepage card's. */
function productImage(product: ProductData, key: string, images: Map<string, string>): string | null {
  return authoredPath(product.thumbnail) ?? images.get(key) ?? null
}

/** Every published product of the showroom, as cards, in the showroom's order. */
export async function loadProductCards(slug: string, locale: Locale, config: ShowroomConfig): Promise<ProductCard[]> {
  const products = await fetchProducts<ProductData>(slug)
  const images = collectionImages(config)

  return Object.entries(products).map(([key, raw], rank) => {
    const product = localizeProduct(raw, locale)
    return {
      key,
      name: product.name,
      category: product.category,
      type: product.type,
      material: product.material,
      fabricType: product.fabricType,
      price: product.price ?? undefined,
      image: productImage(product, key, images),
      colors: (product.colors ?? []).map(({ name, hex }) => ({ name, hex })),
      rank,
    }
  })
}

/** What the product page's turntable mounts. */
export interface ProductViewerSource {
  config: PresentationConfig
  /** The GLB — also what the page probes before mounting the canvas. */
  model: string
}

export interface ProductDetail {
  key: string
  product: ProductData
  image: string | null
  /** `null` → the product has no 3D file at all. */
  viewer: ProductViewerSource | null
  /** Has a frame layer, so `/showroom/<slug>/product/<key>` exists. */
  hasPresentation: boolean
}

/**
 * The piece to spin: the presentation's own `/simple` model and settings where
 * it has one — the file the showroom's inline viewer draws — else the finished
 * GLB the room places, on the house studio defaults.
 */
function viewerSource(product: ProductData, presentation: PresentationConfig | null): ProductViewerSource | null {
  if (presentation) {
    const model = authoredPath(simpleViewer(presentation).model)
    if (model) return { config: presentation, model }
  }
  const glb = authoredPath(product.glbPath)
  return glb ? { config: uploadViewerConfig(glb), model: glb } : null
}

/** One product, or `null` for an unknown/unpublished key. */
export async function loadProductDetail(
  slug: string,
  key: string,
  locale: Locale,
  config: ShowroomConfig
): Promise<ProductDetail | null> {
  const result = await fetchProduct<ProductData, PresentationConfig>(slug, key)
  if (!result) return null

  const product = localizeProduct(result.product, locale)
  const presentation = result.presentation ? localizePresentationConfig(result.presentation, locale) : null
  return {
    key,
    product,
    image: productImage(product, key, collectionImages(config)),
    viewer: viewerSource(product, presentation),
    hasPresentation: !!presentation,
  }
}

/** Every key a product page exists for in this showroom — the SSG param source. */
export async function productKeys(slug: string): Promise<string[]> {
  return Object.keys(await fetchProducts(slug))
}
