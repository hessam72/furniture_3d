import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { MultiZonePaintConfig } from './carConfigStore'
import { DEFAULT_PARTS, defaultPaintConfig, useCarConfig } from './carConfigStore'
import carsData from '@/public/config/cars.json'

export interface ConfigSnapshot {
  selectedParts: Record<string, string>
  paintConfig: MultiZonePaintConfig
  suspensionHeight: number
}

export interface ComparisonState {
  compareMode: boolean
  beforeSnapshot: ConfigSnapshot | null
  enableCompareMode: () => void
  disableCompareMode: () => void
  updateSnapshot: (snapshot: ConfigSnapshot) => void
}

export const useComparisonStore = create<ComparisonState>()(
  devtools(
    (set) => ({
      compareMode: false,
      beforeSnapshot: null,

      enableCompareMode: () => {
        // Get current car ID from carConfigStore
        const currentCarId = useCarConfig.getState().currentCarId

        // Find car configuration from cars.json
        const carConfig = carsData.find((car: any) => car.id === currentCarId)

        // Use car-specific defaults if found, otherwise fallback to hardcoded
        const factoryParts = carConfig?.defaultParts || DEFAULT_PARTS
        const factoryPaint = carConfig?.defaultPaint || defaultPaintConfig
        const factorySuspension = carConfig?.defaultSuspension ?? 0

        set({
          compareMode: true,
          beforeSnapshot: {
            selectedParts: { ...factoryParts },
            paintConfig: {
              body: { ...factoryPaint.body },
              trim: { ...factoryPaint.trim },
              interior: { ...factoryPaint.interior },
            },
            suspensionHeight: factorySuspension,
          },
        })
      },

      disableCompareMode: () =>
        set({
          compareMode: false,
          beforeSnapshot: null,
        }),

      updateSnapshot: (snapshot) =>
        set({
          beforeSnapshot: {
            selectedParts: { ...snapshot.selectedParts },
            paintConfig: {
              body: { ...snapshot.paintConfig.body },
              trim: { ...snapshot.paintConfig.trim },
              interior: { ...snapshot.paintConfig.interior },
            },
            suspensionHeight: snapshot.suspensionHeight,
          },
        }),
    }),
    { name: 'ComparisonStore' }
  )
)
