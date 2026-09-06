import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import * as THREE from 'three'

export interface FurnitureColor {
  name: string
  hex: string
}

export interface FurnitureItem {
  id: string
  name: string
  colors: FurnitureColor[]
  glbPath: string
  usdzPath: string
}

export interface FurnitureConfigState {
  selectedFurnitureId: string | null
  selectedObject: THREE.Object3D | null
  currentColor: string | null
  originalColor: string | null
  colorTransitioning: boolean
  colorInitialized: boolean

  selectFurniture: (furnitureId: string, object: THREE.Object3D | null, defaultColor?: string) => void
  setColor: (colorHex: string) => void
  setOriginalColor: (colorHex: string) => void
  initializeColor: () => void
  setColorTransitioning: (transitioning: boolean) => void
  resetConfig: () => void
}

export const useFurnitureConfig = create<FurnitureConfigState>()(
  devtools(
    (set) => ({
      selectedFurnitureId: null,
      selectedObject: null,
      currentColor: null,
      originalColor: null,
      colorTransitioning: false,
      colorInitialized: false,

      selectFurniture: (furnitureId, object, defaultColor) => {
        console.log('[FurnitureConfigStore] selectFurniture called:', {
          furnitureId,
          objectName: object?.name,
          defaultColor,
        })
        set({
          selectedFurnitureId: furnitureId,
          selectedObject: object,
          currentColor: defaultColor || null,
          originalColor: null, // Will be set by FurnitureColorApplier
          colorInitialized: false,
        })
      },

      setColor: (colorHex) => {
        console.log('[FurnitureConfigStore] setColor called:', colorHex)
        set({
          currentColor: colorHex,
          colorTransitioning: true,
        })
      },

      setOriginalColor: (colorHex) => {
        console.log('[FurnitureConfigStore] setOriginalColor called:', colorHex)
        set({ originalColor: colorHex })
      },

      initializeColor: () => {
        console.log('[FurnitureConfigStore] initializeColor called')
        set({ colorInitialized: true })
      },

      setColorTransitioning: (transitioning) =>
        set({ colorTransitioning: transitioning }),

      resetConfig: () =>
        set({
          selectedFurnitureId: null,
          selectedObject: null,
          currentColor: null,
          originalColor: null,
          colorTransitioning: false,
          colorInitialized: false,
        }),
    }),
    { name: 'FurnitureConfigStore' }
  )
)
