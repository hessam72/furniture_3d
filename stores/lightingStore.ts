/**
 * Zustand Store: Scene Lighting Configuration
 *
 * Purpose: Manages lighting presets and manual adjustments (HDRI, intensity, rotation)
 * Why Zustand: Lighting state shared between 3D scene and lighting controls UI
 * Pattern: Preset system + granular manual overrides
 * Used By: Car configurator lighting controls
 */
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

/**
 * Sunset, Showroom and Garage went with `LightingControls`, the panel that was
 * the only way to select them — and their three EXRs with them, 5.4MB of files
 * nothing could reach. Studio is the default and the only one left.
 */
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
