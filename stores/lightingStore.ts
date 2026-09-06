import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface LightingPreset {
  id: string
  name: string
  hdri: string
  key: number
  fill: number
  rim: number
  envIntensity: number
  rotation: number
}

export interface LightingState {
  hdriPath: string
  keyIntensity: number
  fillIntensity: number
  rimIntensity: number
  envRotation: number
  envIntensity: number
  activePreset: string | null
  setHdri: (path: string) => void
  adjustLight: (key: 'keyIntensity' | 'fillIntensity' | 'rimIntensity' | 'envIntensity' | 'envRotation', value: number) => void
  applyPreset: (presetId: string) => void
  setEnvRotation: (degrees: number) => void
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: 'studio',
    name: 'Studio',
    hdri: '/hdr/main_hdr.exr',
    key: 70,
    fill: 40,
    rim: 80,
    envIntensity: 1.5,
    rotation: 0,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    hdri: '/hdr/sunset.exr',
    key: 50,
    fill: 60,
    rim: 30,
    envIntensity: 1.8,
    rotation: 90,
  },
  {
    id: 'showroom',
    name: 'Showroom',
    hdri: '/hdr/showroom.exr',
    key: 80,
    fill: 35,
    rim: 50,
    envIntensity: 1.2,
    rotation: 0,
  },
  {
    id: 'garage',
    name: 'Garage',
    hdri: '/hdr/garage.exr',
    key: 40,
    fill: 50,
    rim: 20,
    envIntensity: 1.0,
    rotation: 180,
  },
]

export const useLightingStore = create<LightingState>()(
  devtools(
    (set) => ({
      hdriPath: '/hdr/main_hdr.exr',
      keyIntensity: 70,
      fillIntensity: 40,
      rimIntensity: 80,
      envRotation: 0,
      envIntensity: 1.5,
      activePreset: 'studio',

      setHdri: (path) => set({ hdriPath: path, activePreset: null }),

      adjustLight: (key, value) =>
        set({ [key]: value, activePreset: null }),

      applyPreset: (presetId) => {
        const preset = LIGHTING_PRESETS.find((p) => p.id === presetId)
        if (!preset) return

        set({
          hdriPath: preset.hdri,
          keyIntensity: preset.key,
          fillIntensity: preset.fill,
          rimIntensity: preset.rim,
          envIntensity: preset.envIntensity,
          envRotation: preset.rotation,
          activePreset: presetId,
        })
      },

      setEnvRotation: (degrees) =>
        set({ envRotation: degrees, activePreset: null }),
    }),
    { name: 'LightingStore' }
  )
)
