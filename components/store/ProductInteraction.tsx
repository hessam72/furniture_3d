'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useLocale } from 'next-intl'
import { Raycaster, Vector2, Object3D, Vector3 } from 'three'
import type { Locale } from '@/i18n/routing'
import { localizeProduct } from '@/lib/i18n/localize'

export interface FurnitureColor {
  name: string
  hex: string
  /** English name override — falls back to `name` (fa) when absent. @see lib/i18n/localize */
  en?: { name: string }
}

export interface ProductData {
  id: string
  name: string
  category?: string
  type?: string
  dimensions?: string
  material?: string
  weight?: string
  seatingCapacity?: string
  shelves?: string
  /** Toman, unformatted — formatPrice() renders it per-locale. @see lib/store/catalog */
  price?: number
  colors?: FurnitureColor[]
  fabricType?: string
  detailedDescription?: string
  fabricMaterials?: string[]
  glbPath?: string
  usdzPath?: string
  billboardPosition: [number, number, number]
  /**
   * English overrides for the flat string fields above, plus a positional
   * mirror of `fabricMaterials`. Missing fields (including a missing `en`
   * entirely) fall back to the Persian value. @see lib/i18n/localize
   */
  en?: Partial<
    Pick<
      ProductData,
      | 'category'
      | 'type'
      | 'name'
      | 'dimensions'
      | 'material'
      | 'weight'
      | 'seatingCapacity'
      | 'shelves'
      | 'fabricType'
      | 'detailedDescription'
      | 'fabricMaterials'
    >
  >
}

/** How far behind the first solid hit a product's surface may be and still
 *  count as the thing tapped — covers the piece's own collision box. */
const OCCLUSION_TOLERANCE = 0.75

interface ProductInteractionProps {
  onProductClick: (
    product: ProductData | null,
    position?: [number, number, number],
    clickedObject?: Object3D,
    productKey?: string
  ) => void
}

export default function ProductInteraction({ onProductClick }: ProductInteractionProps) {
  const locale = useLocale() as Locale
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new Raycaster())
  const pointer = useRef(new Vector2())
  const [products, setProducts] = useState<Record<string, ProductData>>({})
  const { world, rapier } = useRapier()

  // Latest callback without re-attaching the canvas listeners on every
  // parent render (Scene passes an inline arrow)
  const onProductClickRef = useRef(onProductClick)
  onProductClickRef.current = onProductClick

  /** Scene objects named exactly as a product id — the tap's candidates.
   *  Walked per tap (names only, well under a millisecond) so a remounted
   *  room is never stale. */
  const productRoots = useCallback(() => {
    const ids = new Set(Object.values(products).map((p) => p.id.toLowerCase()))
    const roots: Object3D[] = []
    scene.traverse((o) => {
      if (o.name && ids.has(o.name.toLowerCase())) roots.push(o)
    })
    return roots
  }, [products, scene])

  // Load products config
  useEffect(() => {
    fetch('/config/products.json')
      .then(res => res.json())
      .then((data: Record<string, ProductData>) =>
        setProducts(Object.fromEntries(Object.entries(data).map(([key, p]) => [key, localizeProduct(p, locale)])))
      )
      .catch(err => console.error('Failed to load products:', err))
  }, [locale])

  useEffect(() => {
    const downPos: { x: number; y: number } | null = { x: 0, y: 0 }
    const CLICK_THRESHOLD = 10 // pixels - higher tolerance for distant products

    const handlePointerDown = (e: PointerEvent) => {
      downPos.x = e.clientX
      downPos.y = e.clientY
    }

    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault()

      // Check if it's a drag or a click
      if (downPos) {
        const dx = e.clientX - downPos.x
        const dy = e.clientY - downPos.y
        const dist = Math.hypot(dx, dy)

        if (dist > CLICK_THRESHOLD) {
          return // It's a drag, not a click
        }
      }

      // Get canvas rect for proper coordinate mapping
      const rect = gl.domElement.getBoundingClientRect()

      // Normalize pointer coordinates
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.current.setFromCamera(pointer.current, camera)

      // Only the pieces in products.json are candidates. This used to cast
      // against the entire room (and its collision proxy) on every tap — tens
      // of milliseconds on a phone — and the room's batched meshes no longer
      // keep a CPU copy to test against anyway. @see batchStaticMeshes
      const roots = productRoots()
      if (roots.length === 0) return
      const hit = raycaster.current.intersectObjects(roots, true)[0]
      if (!hit) return

      // Something solid in front of it? The room collider answers that
      // instantly (Rapier keeps its own BVH). The tolerance lets a piece's
      // own collision box — which the ray meets just before the mesh — pass.
      const { origin, direction } = raycaster.current.ray
      const wall = world.castRay(
        new rapier.Ray(origin, direction),
        hit.distance,
        true,
        rapier.QueryFilterFlags.EXCLUDE_DYNAMIC
      )
      if (wall && wall.timeOfImpact < hit.distance - OCCLUSION_TOLERANCE) return

      // Search up the hierarchy for a product name — exact ID match only
      let foundProduct: ProductData | null = null
      let matchedKey = ''
      for (let o: Object3D | null = hit.object; o && !foundProduct; o = o.parent) {
        const objectName = o.name.toLowerCase()
        for (const [productKey, productData] of Object.entries(products)) {
          if (objectName === productData.id.toLowerCase()) {
            foundProduct = productData
            matchedKey = productKey
            break
          }
        }
      }
      if (!foundProduct) return

      // Get world position of the clicked object
      const worldPosition = new Vector3()
      hit.object.getWorldPosition(worldPosition)
      const position: [number, number, number] = [worldPosition.x, worldPosition.y, worldPosition.z]

      // Find the root object of the furniture (top-level parent before scene)
      let rootObject = hit.object
      while (rootObject.parent && rootObject.parent.type !== 'Scene') {
        rootObject = rootObject.parent
      }

      // The products.json *key*, not the id. The camera flight resolves the
      // room object from this, and passing the id made a tap resolve a
      // different object than the same product picked from the menu —
      // different bounding box, different landing spot.
      onProductClickRef.current(foundProduct, position, rootObject, matchedKey)
    }

    const canvas = gl.domElement
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false })
    canvas.addEventListener('pointerup', handlePointerUp, { passive: false })

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
    }
  }, [camera, gl, products, world, rapier, productRoots])

  return null
}
