'use client'
import { useEffect, useState } from 'react'
import { fetchRoom } from '@/lib/api'

export type ModelFile = {
  priority: number
  quality: 'low' | 'high'
  url: string
  /** The invisible collision mesh. Flagged, not implied by priority 0: a room
   *  file's priority is only its load order. */
  isCollider: boolean
}

/** A numbered place in the room, empty or not. Its position is never in the
 *  payload — `anchor` names a node in the room GLB, read when the room loads. */
export type RoomSlot = {
  number: number
  anchor: string
  label?: string
}

/** A product standing on a slot. `product` is the products payload's key
 *  (slug); `glbPath` is its finished piece, inlined so it loads with the room. */
export type RoomPlacement = {
  slot: number
  anchor: string
  product: string
  glbPath: string
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
  /** Every slot the room defines, empty or not — the label overlay's source. */
  slots: RoomSlot[]
  /** What this showroom stood on them — only loadable pieces, in slot order. */
  placements: RoomPlacement[]
}

export type StoresData = {
  stores: StoreConfig[]
}

type RoomPayload = Omit<StoreConfig, 'files' | 'slots' | 'placements'> & {
  files: (Omit<ModelFile, 'isCollider'> & { isCollider?: boolean })[]
  slots?: RoomSlot[]
  placements?: RoomPlacement[]
}

/**
 * The files to mount: the collider plus one rung of the LOD ladder.
 *
 * `low` and `high` are the same room at two costs, not two parts of it
 * (the backend's `RoomFileQuality`). Mounting both drew every surface twice,
 * coplanar — double the download, draw calls and VRAM for one visible room.
 * The preferred rung falls back to the other when the room has no file on it.
 */
export function roomFilesFor(files: ModelFile[], preferLow: boolean): ModelFile[] {
  const want = preferLow ? 'low' : 'high'
  const rung = files.some((f) => !f.isCollider && f.quality === want) ? want : preferLow ? 'high' : 'low'
  return files.filter((f) => f.isCollider || f.quality === rung)
}

/** The payload with its optional parts defaulted. A file without the collider
 *  flag (a pre-flag payload) falls back to the old priority-0 rule. Asset URLs
 *  are already loadable from here — `lib/api` resolves them on arrival. */
function normalizeRoom(room: RoomPayload): StoreConfig {
  return {
    ...room,
    files: room.files.map((file) => ({
      ...file,
      isCollider: file.isCollider ?? file.priority === 0,
    })),
    slots: room.slots ?? [],
    placements: room.placements ?? [],
  }
}

/**
 * The walkable room, from the backend's `/showrooms/:slug/room` — one room
 * per showroom, already scoped server-side, so there is no `id` to pick
 * between any more (the old static `stores.json` held every store's config
 * in one file, selected by a `?id=` query param defaulting to `'mall'`).
 */
export function useStoreConfig(slug: string) {
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchRoom<RoomPayload>(slug)
      .then((store) => {
        if (!store) throw new Error(`No room configured for showroom "${slug}"`)
        setConfig(normalizeRoom(store))
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [slug])

  return { config, loading, error }
}
