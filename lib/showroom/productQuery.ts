/**
 * The product list's search and sort — pure, client-safe, no data imports.
 *
 * Everything runs in the browser over the one `/products` payload the page
 * was rendered with: a showroom lists tens of pieces, not thousands, so a
 * server round trip per keystroke would only add latency.
 */

/** One card on `/showroom/[slug]/products`: what it shows and what it is
 *  searched by, nothing the 3D viewer needs. */
export interface ProductCard {
  /** `Product.slug` — the URL segment. */
  key: string
  name: string
  category?: string
  type?: string
  material?: string
  fabricType?: string
  /** Toman. Absent → "price on request", listed last by either price sort. */
  price?: number
  image: string | null
  colors: { name: string; hex: string }[]
  /** Position in the showroom's own order — the backend's `sortOrder`. */
  rank: number
}

export const SORT_KEYS = ['default', 'price-asc', 'price-desc', 'name'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export function parseSort(value: string | null | undefined): SortKey {
  return SORT_KEYS.find((key) => key === value) ?? 'default'
}

const ARABIC_TO_PERSIAN: Record<string, string> = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه' }

/**
 * Folds the ways one word gets typed into one spelling: Arabic ي/ك (the default
 * on many keyboards) to Persian ی/ک, Persian and Arabic digits to Latin, ZWNJ
 * and runs of space to a single space, Latin to lower case — so «كاناپه» finds
 * «کاناپه» and «مبل‌راحتی» finds «مبل راحتی».
 */
export function normalizeSearch(text: string): string {
  return text
    .replace(/[يىكةۀ]/g, (ch) => ARABIC_TO_PERSIAN[ch])
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[‌‍\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Every searchable field of a card, normalised once. */
export function searchIndex(card: ProductCard): string {
  return normalizeSearch(
    [card.name, card.category, card.type, card.material, card.fabricType, card.key].filter(Boolean).join(' ')
  )
}

/** Cards matching *every* word of `query`, in their incoming order. */
export function searchProducts(cards: ProductCard[], index: string[], query: string): ProductCard[] {
  const words = normalizeSearch(query).split(' ').filter(Boolean)
  if (!words.length) return cards
  return cards.filter((_, i) => words.every((word) => index[i].includes(word)))
}

export function sortProducts(cards: ProductCard[], sort: SortKey, locale: string): ProductCard[] {
  if (sort === 'default') return [...cards].sort((a, b) => a.rank - b.rank)
  if (sort === 'name') {
    const collator = new Intl.Collator(locale)
    return [...cards].sort((a, b) => collator.compare(a.name, b.name) || a.rank - b.rank)
  }

  const direction = sort === 'price-asc' ? 1 : -1
  return [...cards].sort((a, b) => {
    // Unpriced pieces trail either way round — "on request" is neither the
    // cheapest nor the dearest.
    if (a.price === undefined || b.price === undefined) {
      return (a.price === undefined ? 1 : 0) - (b.price === undefined ? 1 : 0) || a.rank - b.rank
    }
    return (a.price - b.price) * direction || a.rank - b.rank
  })
}
