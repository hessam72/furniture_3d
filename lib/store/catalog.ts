import type { ProductData } from '@/components/store/ProductInteraction'

/**
 * The merchandising tree, loaded from /config/catalog.json.
 *
 * It sits *beside* products.json rather than inside it: products.json is keyed
 * by scene-object name and drives the raycast match and the paint targets, so
 * its shape is load-bearing. A catalog item points back into it via
 * `sceneObject`, which lets several catalogue entries share one physical mesh
 * in the room.
 */

export interface SubCategory {
  id: string
  label: string
}

export interface MainCategory {
  id: string
  label: string
  subCategories: SubCategory[]
}

/** Optional per-item override of the automatic bounds-derived camera pose */
export interface FocusOverride {
  /** Stand-off distance from the mesh centre, world units */
  distance?: number
  /** Camera height above the mesh centre, world units */
  height?: number
  /** Approach bearing in degrees; omitted = approach from the player's side */
  azimuthDeg?: number
}

export interface CatalogItem {
  id: string
  name: string
  price: number
  mainCategory: string
  subCategory: string
  /** products.json key — resolves both the base product and the mesh to fly to */
  sceneObject: string
  focus?: FocusOverride
}

export interface Catalog {
  categories: MainCategory[]
  items: CatalogItem[]
}

/**
 * Merges a catalogue entry onto its base product. The catalogue owns the
 * commercial facts (name, price); the room owns the physical ones (colors,
 * fabric, dimensions, GLB paths).
 */
export function resolveCatalogItem(
  item: CatalogItem,
  products: Record<string, ProductData>
): ProductData | null {
  const base = products[item.sceneObject]
  if (!base) return null

  return {
    ...base,
    id: base.id,
    name: item.name,
    price: item.price,
    category: item.mainCategory,
    type: item.subCategory
  }
}

/** Items belonging to one subcategory, in authoring order */
export function itemsInSubCategory(catalog: Catalog, mainId: string, subId: string) {
  return catalog.items.filter((i) => i.mainCategory === mainId && i.subCategory === subId)
}

/**
 * Reverse lookup: find catalog item by sceneObject key.
 * Used when user clicks 3D object to get matching catalog metadata.
 */
export function findCatalogItemBySceneObject(
  catalog: Catalog,
  sceneObjectKey: string
): CatalogItem | null {
  return catalog.items.find(i => i.sceneObject === sceneObjectKey) ?? null
}

/** Persian price, shared with the product drawer */
export const faPrice = (n: number) => `${new Intl.NumberFormat('fa-IR').format(n)} تومان`
