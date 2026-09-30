/**
 * Every storefront route under one showroom, built in one place.
 *
 * Client-safe on purpose — no data imports — so a component can link without
 * pulling `lib/showroom/config` (and the static manifests behind it) into the
 * browser bundle.
 */

export const showroomPath = (slug: string) => `/showroom/${slug}`

/** The searchable product list. */
export const productsPath = (slug: string) => `${showroomPath(slug)}/products`

/** One product's page: photo, specs and the plain turntable — exists for every
 *  published product. */
export const productPath = (slug: string, key: string) => `${productsPath(slug)}/${key}`

/** The full layered 3D presentation — only for a product with a frame layer. */
export const presentationPath = (slug: string, key: string) => `${showroomPath(slug)}/product/${key}`

export const storePath = (slug: string) => `${showroomPath(slug)}/store`
