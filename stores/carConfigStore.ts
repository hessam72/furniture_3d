import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export type PaintZone = 'body' | 'trim' | 'interior'

export interface PaintConfig {
  color: string
  metalness: number
  roughness: number
  clearcoat: number
}

export type MultiZonePaintConfig = Record<PaintZone, PaintConfig>

export interface PalettePreset {
  id: string
  name: string
  zones: MultiZonePaintConfig
}

export interface CarConfigState {
  currentCarId: string | null
  selectedParts: Record<string, string>
  paintConfig: MultiZonePaintConfig
  activeZone: PaintZone
  paintInitialized: boolean
  loadingParts: Record<string, boolean>
  partLoadErrors: Record<string, string>
  openParts: Record<string, boolean>
  suspensionHeight: number
  setCurrentCarId: (carId: string) => void
  selectPart: (category: string, partId: string) => void
  setPaintConfig: (config: Partial<PaintConfig>, zone?: PaintZone) => void
  setActiveZone: (zone: PaintZone) => void
  copyZoneToAll: (sourceZone: PaintZone) => void
  applyPalettePreset: (presetId: string) => void
  initializePaint: () => void
  setPartLoading: (category: string, isLoading: boolean) => void
  setPartError: (category: string, error: string | null) => void
  togglePart: (partName: string) => void
  openAllParts: () => void
  closeAllParts: () => void
  setSuspensionHeight: (height: number) => void
  getTotalPrice: () => number
  resetConfig: (defaultParts?: Record<string, string>) => void
}

/** Stock selection for every category — single source of truth for mount and reset */
export const DEFAULT_PARTS: Record<string, string> = {
  wheels: 'wheel-stock',
  spoilers: 'spoiler-stock',
  hoods: 'hood-stock',
  bumpers: 'bumper-front-stock',
  mirrors: 'mirror-stock',
  exhaust: 'exhaust-stock',
  'side-skirts': 'skirts-none',
  seats: 'seat-stock',
  'steering-wheels': 'steering-stock',
  'brake-calipers': 'caliper-stock',
  headlights: 'headlight-stock',
}

export const defaultPaintConfig: MultiZonePaintConfig = {
  body: {
    color: '#ff0000',
    metalness: 0.9,
    roughness: 0.3,
    clearcoat: 1.0,
  },
  trim: {
    color: '#000000',
    metalness: 0.5,
    roughness: 0.7,
    clearcoat: 0.3,
  },
  interior: {
    color: '#1a1a1a',
    metalness: 0.1,
    roughness: 0.9,
    clearcoat: 0.0,
  },
}

export const FACTORY_PALETTES: PalettePreset[] = [
  {
    id: 'racing-red',
    name: 'Racing Red',
    zones: {
      body: { color: '#ff0000', metalness: 0.9, roughness: 0.3, clearcoat: 1.0 },
      trim: { color: '#000000', metalness: 0.5, roughness: 0.7, clearcoat: 0.3 },
      interior: { color: '#1a1a1a', metalness: 0.1, roughness: 0.9, clearcoat: 0.0 },
    },
  },
  {
    id: 'midnight-black',
    name: 'Midnight Black',
    zones: {
      body: { color: '#0a0a0a', metalness: 0.95, roughness: 0.2, clearcoat: 1.0 },
      trim: { color: '#1a1a1a', metalness: 0.8, roughness: 0.4, clearcoat: 0.5 },
      interior: { color: '#2a2a2a', metalness: 0.2, roughness: 0.8, clearcoat: 0.0 },
    },
  },
  {
    id: 'pearl-white',
    name: 'Pearl White',
    zones: {
      body: { color: '#f8f8f8', metalness: 0.85, roughness: 0.25, clearcoat: 0.9 },
      trim: { color: '#cccccc', metalness: 0.6, roughness: 0.5, clearcoat: 0.4 },
      interior: { color: '#e0e0e0', metalness: 0.1, roughness: 0.85, clearcoat: 0.0 },
    },
  },
  {
    id: 'electric-blue',
    name: 'Electric Blue',
    zones: {
      body: { color: '#0066ff', metalness: 0.92, roughness: 0.28, clearcoat: 1.0 },
      trim: { color: '#001133', metalness: 0.7, roughness: 0.6, clearcoat: 0.35 },
      interior: { color: '#1a2a3a', metalness: 0.15, roughness: 0.88, clearcoat: 0.0 },
    },
  },
  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    zones: {
      body: { color: '#ff6600', metalness: 0.88, roughness: 0.32, clearcoat: 0.95 },
      trim: { color: '#331100', metalness: 0.5, roughness: 0.7, clearcoat: 0.3 },
      interior: { color: '#2a1a0a', metalness: 0.1, roughness: 0.9, clearcoat: 0.0 },
    },
  },
  {
    id: 'stealth-gray',
    name: 'Stealth Gray',
    zones: {
      body: { color: '#3a3a3a', metalness: 0.8, roughness: 0.4, clearcoat: 0.7 },
      trim: { color: '#1a1a1a', metalness: 0.6, roughness: 0.65, clearcoat: 0.4 },
      interior: { color: '#2a2a2a', metalness: 0.15, roughness: 0.85, clearcoat: 0.0 },
    },
  },
  {
    id: 'emerald-green',
    name: 'Emerald Green',
    zones: {
      body: { color: '#00aa44', metalness: 0.9, roughness: 0.3, clearcoat: 1.0 },
      trim: { color: '#003311', metalness: 0.55, roughness: 0.7, clearcoat: 0.35 },
      interior: { color: '#1a2a1a', metalness: 0.12, roughness: 0.9, clearcoat: 0.0 },
    },
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    zones: {
      body: { color: '#6600cc', metalness: 0.93, roughness: 0.27, clearcoat: 1.0 },
      trim: { color: '#220044', metalness: 0.65, roughness: 0.6, clearcoat: 0.4 },
      interior: { color: '#1a0a2a', metalness: 0.15, roughness: 0.88, clearcoat: 0.0 },
    },
  },
]

export const useCarConfig = create<CarConfigState>()(
  devtools(
    (set, get) => ({
      currentCarId: null,
      selectedParts: {},
      paintConfig: defaultPaintConfig,
      activeZone: 'body',
      paintInitialized: false,
      loadingParts: {},
      partLoadErrors: {},
      openParts: {
        car_door_left: false,
        car_door_right: false,
        car_door_back_left: false,
        car_door_back_right: false,
        car_caput: false,
        car_trunk: false,
      },
      suspensionHeight: 0,

      setCurrentCarId: (carId) => set({ currentCarId: carId }),

      selectPart: (category, partId) =>
        set((state) => ({
          selectedParts: { ...state.selectedParts, [category]: partId },
        })),

      setPartLoading: (category, isLoading) =>
        set((state) => ({
          loadingParts: { ...state.loadingParts, [category]: isLoading },
        })),

      setPartError: (category, error) =>
        set((state) => ({
          partLoadErrors: error
            ? { ...state.partLoadErrors, [category]: error }
            : Object.fromEntries(
                Object.entries(state.partLoadErrors).filter(([k]) => k !== category)
              ),
        })),

      setPaintConfig: (config, zone) =>
        set((state) => {
          const targetZone = zone || state.activeZone
          return {
            paintConfig: {
              ...state.paintConfig,
              [targetZone]: { ...state.paintConfig[targetZone], ...config },
            },
          }
        }),

      setActiveZone: (zone) =>
        set({ activeZone: zone }),

      copyZoneToAll: (sourceZone) =>
        set((state) => {
          const sourceConfig = state.paintConfig[sourceZone]
          return {
            paintConfig: {
              body: { ...sourceConfig },
              trim: { ...sourceConfig },
              interior: { ...sourceConfig },
            },
          }
        }),

      applyPalettePreset: (presetId) =>
        set(() => {
          const preset = FACTORY_PALETTES.find((p) => p.id === presetId)
          if (!preset) return {}
          return {
            paintConfig: {
              body: { ...preset.zones.body },
              trim: { ...preset.zones.trim },
              interior: { ...preset.zones.interior },
            },
          }
        }),

      initializePaint: () =>
        set({ paintInitialized: true }),

      togglePart: (partName) =>
        set((state) => ({
          openParts: {
            ...state.openParts,
            [partName]: !state.openParts[partName],
          },
        })),

      openAllParts: () =>
        set((state) => ({
          openParts: Object.fromEntries(
            Object.keys(state.openParts).map((key) => [key, true])
          ),
        })),

      closeAllParts: () =>
        set((state) => ({
          openParts: Object.fromEntries(
            Object.keys(state.openParts).map((key) => [key, false])
          ),
        })),

      setSuspensionHeight: (height) =>
        set({ suspensionHeight: height }),

      getTotalPrice: () => {
        // Will be implemented with part price lookup from car-parts.json
        const { selectedParts } = get()
        // TODO: Load car-parts.json and calculate total
        return 0
      },

      // Defaulting to the stock parts (not {}) keeps the car complete when
      // the panel's Reset action calls this with no arguments
      resetConfig: (defaultParts = DEFAULT_PARTS) =>
        set({
          selectedParts: defaultParts,
          paintConfig: defaultPaintConfig,
          activeZone: 'body',
          paintInitialized: false,
          loadingParts: {},
          partLoadErrors: {},
          openParts: {
            car_door_left: false,
            car_door_right: false,
            car_door_back_left: false,
            car_door_back_right: false,
            car_caput: false,
            car_trunk: false,
          },
          suspensionHeight: 0,
        }),
    }),
    { name: 'CarConfigStore' }
  )
)
