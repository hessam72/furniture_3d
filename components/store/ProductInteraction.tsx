'use client'

import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Raycaster, Vector2, Object3D, Vector3 } from 'three'

interface FurnitureColor {
  name: string
  hex: string
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
  /** Toman, unformatted — the drawer renders it with Intl 'fa-IR' */
  price?: number
  colors?: FurnitureColor[]
  fabricType?: string
  detailedDescription?: string
  fabricMaterials?: string[]
  glbPath?: string
  usdzPath?: string
  billboardPosition: [number, number, number]
}

interface ProductInteractionProps {
  onProductClick: (
    product: ProductData | null,
    position?: [number, number, number],
    clickedObject?: Object3D,
    productKey?: string
  ) => void
}

export default function ProductInteraction({ onProductClick }: ProductInteractionProps) {
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new Raycaster())
  const pointer = useRef(new Vector2())
  const [products, setProducts] = useState<Record<string, ProductData>>({})

  // Load products config
  useEffect(() => {
    fetch('/config/products.json')
      .then(res => res.json())
      .then(data => setProducts(data))
      .catch(err => console.error('Failed to load products:', err))
  }, [])

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

      // Configure raycaster for better hit detection at distance
      raycaster.current.params.Mesh = { threshold: 0.1 }
      raycaster.current.params.Line = { threshold: 0.1 }
      raycaster.current.params.Points = { threshold: 0.1 }

      // Update raycaster
      raycaster.current.setFromCamera(pointer.current, camera)

      // Find intersections
      const intersects = raycaster.current.intersectObjects(scene.children, true)

      if (intersects.length > 0) {
        // Get clicked object
        let targetObject: Object3D | null = intersects[0].object

        // Search up the hierarchy for a product name
        let foundProduct: ProductData | null = null
        let matchedKey = ''
        while (targetObject && !foundProduct) {
          const objectName = targetObject.name.toLowerCase()
          console.log('[ProductInteraction] Checking object:', objectName)

          // Check if this object matches any product - exact ID match only
          for (const [productKey, productData] of Object.entries(products)) {
            if (objectName === productData.id.toLowerCase()) {
              foundProduct = productData
              matchedKey = productKey
              console.log('[ProductInteraction] Matched product key:', productKey, 'Product ID:', productData.id)
              break
            }
          }

          targetObject = targetObject.parent
        }

        if (foundProduct) {
          // Get world position of the clicked object
          const worldPosition = new Vector3()
          intersects[0].object.getWorldPosition(worldPosition)
          const position: [number, number, number] = [
            worldPosition.x,
            worldPosition.y,
            worldPosition.z
          ]

          // Find the root object of the furniture (top-level parent before scene)
          let rootObject = intersects[0].object
          while (rootObject.parent && rootObject.parent.type !== 'Scene') {
            rootObject = rootObject.parent
          }

          // The products.json *key*, not the id. The camera flight resolves the
          // room object from this, and passing the id made a tap resolve a
          // different object than the same product picked from the menu —
          // different bounding box, different landing spot.
          console.log('[ProductInteraction] Calling onProductClick with key:', matchedKey)
          onProductClick(foundProduct, position, rootObject, matchedKey)
        }
      }
    }

    const canvas = gl.domElement
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false })
    canvas.addEventListener('pointerup', handlePointerUp, { passive: false })

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
    }
  }, [camera, scene, gl, products, onProductClick])

  return null
}
