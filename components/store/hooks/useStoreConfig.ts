'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export type ModelFile = {
  priority: number
  quality: 'low' | 'high'
  url: string
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/** Orthographic shadow-camera frustum for the window sun (world units) */
export type SunShadowConfig = {
  left: number
  right: number
  top: number
  bottom: number
  near: number
  far: number
  bias: number
  normalBias: number
}

/** drei SoftShadows (PCSS) parameters */
export type SoftShadowConfig = {
  /** Light-source size — larger = softer penumbra */
  size: number
  /** PCF samples — quality vs cost */
  samples: number
  /** Depth focus of the softening */
  focus: number
}

/** Per-store "sun through a window" directional light + PCSS soft shadows */
export type SunConfig = {
  /** Master on/off for the whole sun + shadow feature (per store) */
  enabled: boolean
  position: [number, number, number]
  target: [number, number, number]
  intensity: number
  color: string
  soft: SoftShadowConfig
  shadow: SunShadowConfig
}

/** A manifest's `sun` block: any subset of SunConfig, merged over DEFAULT_SUN.
 *  Exported because /product's presentation page reads the identical block, so a
 *  `?sundebug=1` printout pastes into either manifest unchanged. */
export type PartialSun = DeepPartial<SunConfig>

/** Per-store lamps: meshes named *lamp* become real point lights + emissive glow */
export type LampConfig = {
  /** Master on/off for the whole lamp feature (per store) */
  enabled: boolean
  color: string
  /** Point-light intensity (candela — physical units at exposure 0.3) */
  intensity: number
  /** Falloff range in world units (0 = infinite) */
  distance: number
  /** Physical inverse-square falloff = 2 */
  decay: number
  /** Vertical offset of the light from the mesh origin (drop to the bulb, below the shade) */
  offsetY: number
  /** Emissive glow strength on the shade material (feeds Bloom) */
  emissiveIntensity: number
  /** Cube shadow-map size per face for the capped shadow-casting lamps */
  shadowMapSize: number
  bias: number
  normalBias: number
}

/** Camera positioning and transition config */
export type CameraConfig = {
  playerStart: [number, number, number]
  cameraHeight?: number
  transitionTarget: [number, number, number]
  transitionStart: [number, number, number]
  lookAtStart: [number, number, number]
  lookAtEnd: [number, number, number]
}

export type StoreConfig = {
  id: string
  files: ModelFile[]
  /** Optional window-sunlight config; missing → feature off. Merged over DEFAULT_SUN. */
  sun?: DeepPartial<SunConfig>
  /** Optional lamp config; missing → feature off. Merged over DEFAULT_LAMP. */
  lamps?: DeepPartial<LampConfig>
  /** Optional camera config; missing → defaults. */
  camera?: CameraConfig
}

export type StoresData = {
  stores: StoreConfig[]
}

export function useStoreConfig() {
  const searchParams = useSearchParams()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const storeId = searchParams.get('id') || 'mall'

    fetch('/config/stores.json')
      .then((res) => res.json())
      .then((data: StoresData) => {
        const store = data.stores.find((s) => s.id === storeId)
        if (!store) {
          throw new Error(`Store "${storeId}" not found`)
        }
        setConfig(store)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [searchParams])

  return { config, loading, error }
}
