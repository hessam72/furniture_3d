import type { Locale } from '@/i18n/routing'
import type { ProductData } from '@/components/store/ProductInteraction'
import type { Catalog } from '@/lib/store/catalog'
import type { PresentationConfig } from '@/lib/product/presentation'

/**
 * The shape every translatable JSON/config node follows: the object itself
 * holds the Persian (default) copy, and an optional sibling `en` holds only
 * the fields that differ in English. A key missing from `en` falls back to
 * the Persian value automatically — so catalogue content can be translated
 * incrementally without ever rendering empty.
 */
export type Localized<T> = T & { en?: Partial<T> }

/**
 * Shallow-merges `node.en` onto `node` for a non-`fa` locale. `fa` is a
 * no-op. `T`'s `en` is intentionally left unconstrained here (rather than
 * pinned to `Partial<T>` via `Localized<T>`) — several `en` fields are a
 * `Partial<Pick<T, …>>` of just the translatable subset, which does not
 * unify with `Partial<T>` when TypeScript infers `T` from an intersection
 * type at the call site. Every real `en` field is still an optional partial
 * of its own node, which is all the runtime merge below relies on.
 */
export function localize<T extends { en?: object }>(node: T, locale: Locale): T {
  if (locale === 'fa' || !node.en) return node
  return { ...node, ...node.en }
}

/** Maps `localize` over every element of an array of translatable nodes. */
export function localizeAll<T extends { en?: object }>(nodes: T[] | undefined, locale: Locale): T[] {
  if (!nodes) return []
  return nodes.map((node) => localize(node, locale))
}

/**
 * A product's flat fields (`en` sibling, shallow-merged) plus its `colors`
 * array, each localized independently since every color carries its own
 * `en.name`. @see components/store/ProductInteraction.ts#ProductData
 */
export function localizeProduct(product: ProductData, locale: Locale): ProductData {
  const base = localize(product, locale)
  if (!product.colors) return base
  return { ...base, colors: localizeAll(product.colors, locale) }
}

/** The merchandising tree: category/sub-category labels and item names. */
export function localizeCatalog(catalog: Catalog, locale: Locale): Catalog {
  return {
    categories: catalog.categories.map((category) => ({
      ...localize(category, locale),
      subCategories: localizeAll(category.subCategories, locale),
    })),
    items: localizeAll(catalog.items, locale),
  }
}

/**
 * Every translatable surface of a product's 3D presentation manifest: the
 * frame/cover layer copy, the cover variants (and their own palettes, where a
 * variant brings one), and every wood/cover/cushion/shawl swatch name, plus
 * part row labels.
 */
export function localizePresentationConfig(config: PresentationConfig, locale: Locale): PresentationConfig {
  return {
    ...config,
    layers: {
      ...config.layers,
      frame: localize(config.layers.frame, locale),
      cover: {
        ...localize(config.layers.cover, locale),
        variants: config.layers.cover.variants.map((variant) => ({
          ...localize(variant, locale),
          palette: variant.palette ? localizeAll(variant.palette, locale) : variant.palette,
        })),
      },
    },
    palettes: Object.fromEntries(
      Object.entries(config.palettes).map(([zone, swatches]) => [zone, localizeAll(swatches, locale)])
    ) as PresentationConfig['palettes'],
    parts: config.parts ? localizeAll(config.parts, locale) : config.parts,
  }
}
