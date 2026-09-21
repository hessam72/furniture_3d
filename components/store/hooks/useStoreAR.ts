'use client'

import { useCallback, useState } from 'react'
import { arModelUrl, arUsdzUrl, swatchIdsFromPaint } from '@/lib/ar/arSource'
import { AR_GLB_MAX_BYTES, AR_GLB_WARN_BYTES } from '@/lib/ar/budget'
import { authoredPath, hasPresentation } from '@/lib/product/presentation'
import type { ZonePaintConfig } from '@/stores/presentationStore'
import type { ProductData } from '../ProductInteraction'

/**
 * /store's own `openAR()` — the same URL-building, preflight and fallback
 * `SimpleViewerClient.openAR()` runs, reused rather than re-derived, just fed
 * a single `cover` zone instead of the full wood/cover/cushion/shawl set.
 *
 * `/store`'s "View in AR" used to hand `<ARProductViewer>` the product's
 * static `glbPath`/`usdzPath` straight from products.json — whatever the
 * shopper picked in the drawer never reached the room. This builds the same
 * `/api/ar/[key]/model.{glb,usdz}` URLs `/simple` does instead, so the
 * customer's colour travels; a product with no manifest entry (@see
 * hasPresentation) or any conversion failure falls back to exactly the old
 * static-file behaviour, never a black Quick Look screen.
 */
export function useStoreAR() {
  const [showAR, setShowAR] = useState(false)
  const [arBuilding, setArBuilding] = useState(false)
  const [arProduct, setArProduct] = useState<ProductData | null>(null)
  const [arGlbUrl, setArGlbUrl] = useState<string | null>(null)
  const [arUsdzSrc, setArUsdzSrc] = useState<string | null>(null)

  const openAR = useCallback(async (product: ProductData, key: string | null, paint: ZonePaintConfig) => {
    setArBuilding(true)
    setArProduct(product)

    // No manifest entry for this product at all → straight to the static
    // fallback, same as before this hook existed.
    if (!key || !hasPresentation(key)) {
      setArGlbUrl(null)
      setArUsdzSrc(null)
      setShowAR(!!product.glbPath)
      setArBuilding(false)
      return
    }

    // Whichever zone is wearing a real fabric (not just a tint) travels
    // alongside the paint, so the configured AR file carries the cloth the
    // shopper picked, not just its colour. @see swatchIdsFromPaint
    const swatches = swatchIdsFromPaint(paint)
    const url = arModelUrl(key, 'frame', 'cover', paint, swatches)
    const usdz = arUsdzUrl(key, 'frame', 'cover', paint, swatches)

    try {
      const head = await fetch(url, { method: 'HEAD' })
      const size = Number(head.headers.get('content-length') ?? 0)
      if (!head.ok) throw new Error(`configured model unavailable (${head.status})`)
      if (size > AR_GLB_MAX_BYTES) throw new Error(`configured model is ${size} bytes`)
      if (size > AR_GLB_WARN_BYTES) console.warn('[store-ar] configured GLB is large for a phone', size)

      setArGlbUrl(url)
      setArUsdzSrc(usdz)
      setShowAR(true)
    } catch (err) {
      // Published files stand in — same as every AR call site in the app.
      console.error('[store-ar] configured source unavailable, falling back to static files', err)
      setArGlbUrl(null)
      setArUsdzSrc(null)
      setShowAR(!!product.glbPath)
    } finally {
      setArBuilding(false)
    }
  }, [])

  const closeAR = useCallback(() => {
    setShowAR(false)
    setArProduct(null)
    setArGlbUrl(null)
    setArUsdzSrc(null)
  }, [])

  return {
    showAR,
    arBuilding,
    arProduct,
    /** Never omit `ios-src` — @see ARProductViewer's own note on why. */
    arGlbUrl: arGlbUrl ?? arProduct?.glbPath ?? '',
    arUsdzUrl: arUsdzSrc ?? authoredPath(arProduct?.usdzPath) ?? '',
    openAR,
    closeAR,
  }
}
