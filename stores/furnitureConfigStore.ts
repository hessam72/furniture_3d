/**
 * Zustand Store: Store Furniture Selection
 *
 * Purpose: Tracks which furniture is selected in the 3D walkable store —
 * shared between the raycaster (click handler) and the UI panel.
 *
 * Colour/fabric paint state used to live here too (a flat hex). It now lives
 * in `usePresentation` (stores/presentationStore.ts) instead — the same
 * store /simple and /product use — because the real zone-paint and
 * swatch-texture engine (`useZonePaint`, `useSwatchTextures`) reads that
 * store directly and isn't written to take an injected source.
 * @see components/store/FurnitureColorApplier.tsx
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import * as THREE from 'three'

export interface FurnitureConfigState {
  selectedFurnitureId: string | null
  selectedObject: THREE.Object3D | null

  selectFurniture: (furnitureId: string, object: THREE.Object3D | null) => void
  resetConfig: () => void
}

export const useFurnitureConfig = create<FurnitureConfigState>()(
  devtools(
    (set) => ({
      selectedFurnitureId: null,
      selectedObject: null,

      selectFurniture: (furnitureId, object) => {
        set({ selectedFurnitureId: furnitureId, selectedObject: object })
      },

      resetConfig: () => set({ selectedFurnitureId: null, selectedObject: null }),
    }),
    { name: 'FurnitureConfigStore' }
  )
)
