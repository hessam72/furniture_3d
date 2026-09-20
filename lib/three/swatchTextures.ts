'use client'

/**
 * Swapping the *texture* a swatch shows, rather than tinting the one it has.
 *
 * `material.color` multiplied over one authored fabric map cannot make velvet
 * read as linen: the weave, the nap and the sheen stay whatever the GLB shipped
 * with, so every "colour" is the same cloth in a different light. This module
 * puts a different image in the `map` slot instead — the thing you would do by
 * hand in the three.js editor — and keeps the mobile texture budget intact
 * while doing it.
 *
 * Three things make that affordable:
 *
 *  - **KTX2, through the loader the GLBs already share.** A 1024² PNG is 5.6MB
 *    resident; the same image as KTX2 stays block-compressed in GPU memory and
 *    is 0.7-1.3MB depending on what the driver transcodes to. @see loadKtx2
 *  - **One decode per URL.** The `normalMap` shared by every colour in a fabric
 *    family is fetched, transcoded and uploaded once, however many swatches name
 *    it, because the cache keys on the URL.
 *  - **Free per-material tiling.** `Texture.clone()` copies the reference to
 *    `.source`, and three keeps the GL handle on the source — so one decode can
 *    serve a 3×3 tiling on one material and 1×1 on another for the cost of a JS
 *    object and no VRAM at all.
 *
 * The pairing to hold in mind is `collectZoneTargets` / `disposeTargets` in
 * ./layerMaterials: that one clones and frees *materials*, this one loads and
 * frees *textures*. Neither ever touches what drei's GLTF cache owns.
 */

import * as THREE from 'three'
import { loadKtx2 } from './gltfLoaders'
import { SWATCH_CACHE_BUDGET_BYTES, textureResidentBytes } from './textureBudget'
import type { ZoneTarget } from './layerMaterials'

/**
 * The map slots a swatch may replace.
 *
 * Deliberately short. Every slot listed here is one a swatch has to ship an
 * image for, and every image is download, transcode and resident bytes on a
 * phone — so this is the set that changes what a fabric *is*, not every slot a
 * `MeshPhysicalMaterial` can carry.
 */
export type SwatchSlot = 'map' | 'normalMap' | 'roughnessMap'

export const SWATCH_SLOTS: readonly SwatchSlot[] = ['map', 'normalMap', 'roughnessMap']

/** URLs of the `.ktx2` files a swatch dresses its materials with. */
export type SwatchMaps = Partial<Record<SwatchSlot, string>>

/** A UV transform, as the manifest writes it. Omitted fields keep their default. */
export interface SwatchUv {
  repeat?: [number, number]
  offset?: [number, number]
  rotation?: number
}

/** What `applySwatchTextures` needs to dress a target set. */
export interface SwatchSpec {
  /** Identity, for the request token in the hook and for cache bookkeeping. */
  id: string
  maps: SwatchMaps
  /**
   * Material-name substrings, case-insensitive. A target whose material matches
   * none of them is restored to its authored maps rather than left half-dressed.
   * Omitted → every target in the zone that has a base map.
   */
  materials?: string[] | null
  /** Omitted → each slot inherits the transform of the texture it replaces. */
  uv?: SwatchUv | null
  /** Normal-map intensity. Omitted → the target's own authored scale —
   *  @see ZoneTarget.baseNormalScale — which is what lets several swatches
   *  share one normal map and still read at different depths. */
  normalScale?: number
}

/** One slot of a material as the GLB authored it. @see captureBaseline */
export interface SlotBaseline {
  texture: THREE.Texture | null
  repeat: THREE.Vector2
  offset: THREE.Vector2
  rotation: number
  center: THREE.Vector2
}

export type MaterialBaseline = Record<SwatchSlot, SlotBaseline>

const IDENTITY: SlotBaseline = {
  texture: null,
  repeat: new THREE.Vector2(1, 1),
  offset: new THREE.Vector2(0, 0),
  rotation: 0,
  center: new THREE.Vector2(0, 0),
}

/**
 * What each swatch slot held before any swatch touched it.
 *
 * Called from `collectZoneTargets` at clone time, which is the only moment the
 * authored state is guaranteed to still be there. Two things depend on it:
 * restoring when a plain colour swatch is picked after a texture one, and the
 * inherit rule — a swapped map lands on the transform of the map it displaced,
 * so the colour pattern stays registered with the relief.
 *
 * The textures recorded here belong to drei's GLTF cache. They are read, put
 * back, and **never disposed** by this module.
 */
export function captureBaseline(material: THREE.Material): MaterialBaseline {
  const slots = material as unknown as Record<string, THREE.Texture | null | undefined>
  const baseline = {} as MaterialBaseline
  SWATCH_SLOTS.forEach((slot) => {
    const texture = slots[slot] ?? null
    baseline[slot] = texture
      ? {
          texture,
          repeat: texture.repeat.clone(),
          offset: texture.offset.clone(),
          rotation: texture.rotation,
          center: texture.center.clone(),
        }
      : { ...IDENTITY, repeat: IDENTITY.repeat.clone(), offset: IDENTITY.offset.clone(), center: IDENTITY.center.clone() }
  })
  return baseline
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface MasterEntry {
  promise: Promise<THREE.Texture | null>
  texture: THREE.Texture | null
  bytes: number
  /** How many live target sets currently show this URL. Only 0 is evictable. */
  refs: number
  lastUsed: number
  /** A URL that failed once is not retried on every swatch tap. */
  failed: boolean
}

/** One decode per URL. The family normal is shared by every colour that names it. */
const masters = new Map<string, MasterEntry>()

/** `${url}|${uvKey}` → a clone sharing the master's `.source`. Zero extra VRAM. */
const clones = new Map<string, THREE.Texture>()

let inflight = 0

/** `map` carries colour and must decode through sRGB; the rest are data. */
function colorSpaceFor(slot: SwatchSlot): string {
  return slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
}

/**
 * Everything `GLTFLoader` would have done to this texture, and a standalone load
 * does not.
 *
 * All of it has to happen before the texture is first uploaded:
 *
 *  - **`colorSpace`** picks the sRGB *variant* of the transcoded compressed
 *    format at upload time. Set it late and the fabric ships visibly pale, with
 *    a full re-upload of every mip as the only cure.
 *  - **`wrapS`/`wrapT`** default to `ClampToEdge` on a `CompressedTexture`; the
 *    glTF sampler these files were authored against says REPEAT, and a clamped
 *    texture under an inherited 3×3 transform smears its border row across the
 *    whole piece.
 * `anisotropy` is deliberately *not* set here. The master is never bound to a
 * material, and whoever warms the cache first may not know the render tier —
 * the bottom sheet prefetches on tap and has no Canvas above it. It is set on
 * the clone instead, where the caller does know. @see cloneAt
 *
 * `flipY` is left alone on purpose: three cannot flip block-compressed data at
 * upload, so orientation is an encode-time decision. @see scripts/optimize-texture.sh
 */
function configureMaster(texture: THREE.Texture, slot: SwatchSlot) {
  texture.colorSpace = colorSpaceFor(slot)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
}

function master(url: string, slot: SwatchSlot): MasterEntry {
  const existing = masters.get(url)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing
  }

  inflight += 1
  const entry: MasterEntry = {
    texture: null,
    bytes: 0,
    refs: 0,
    lastUsed: Date.now(),
    failed: false,
    promise: loadKtx2(url)
      .then((texture) => {
        configureMaster(texture, slot)
        texture.name = url.split('/').pop() ?? url
        entry.texture = texture
        entry.bytes = textureResidentBytes(texture)
        return texture as THREE.Texture
      })
      .catch((error) => {
        // A fabric that will not load is not a page that should go blank: the
        // caller leaves the authored maps in place and the piece shows the
        // cloth it was exported with. @see useSwatchTextures
        console.warn('[swatchTextures] failed to load', url, error)
        entry.failed = true
        return null
      })
      .finally(() => {
        inflight -= 1
      }),
  }
  masters.set(url, entry)
  return entry
}

function uvKey(uv: SlotBaseline): string {
  return `${uv.repeat.x},${uv.repeat.y},${uv.offset.x},${uv.offset.y},${uv.rotation},${uv.center.x},${uv.center.y}`
}

/**
 * A view of one master at one tiling.
 *
 * The master itself is never bound to a material — only clones are — so it stays
 * at its authored state and every tiling is an independent `Texture` over the
 * same `.source`. three refcounts sources, so disposing one clone cannot pull
 * the image out from under another.
 */
function cloneAt(url: string, texture: THREE.Texture, uv: SlotBaseline, anisotropy: number): THREE.Texture {
  const key = `${url}|${uvKey(uv)}`
  const cached = clones.get(key)
  if (cached) return cached

  const clone = texture.clone()
  clone.repeat.copy(uv.repeat)
  clone.offset.copy(uv.offset)
  clone.center.copy(uv.center)
  clone.rotation = uv.rotation
  // Set before the clone is ever bound, so the level costs nothing. Changing it
  // later goes through `applyAnisotropy`, which sets `needsUpdate` and therefore
  // re-uploads all eleven mip levels of a compressed texture — that is the
  // tier-change path, and it is already handled by the traverse in SimpleViewer.
  clone.anisotropy = Math.max(1, anisotropy)
  clone.needsUpdate = true
  clones.set(key, clone)
  return clone
}

/**
 * Which transform a swapped slot lands on.
 *
 * Inherit by default — `fabric_03`'s new basecolour takes the 3×3 of the map it
 * displaced, so the pattern and the normal it sits under stay in register. An
 * explicit `uv` on the swatch overrides that and is how literal 1×1 is asked
 * for. A slot with no authored texture falls back to the material's `map`, then
 * to identity.
 */
function resolveUv(baseline: MaterialBaseline, slot: SwatchSlot, override?: SwatchUv | null): SlotBaseline {
  if (override) {
    return {
      texture: null,
      repeat: new THREE.Vector2(...(override.repeat ?? [1, 1])),
      offset: new THREE.Vector2(...(override.offset ?? [0, 0])),
      rotation: override.rotation ?? 0,
      center: new THREE.Vector2(0, 0),
    }
  }
  const own = baseline[slot]
  if (own.texture) return own
  if (baseline.map.texture) return baseline.map
  return IDENTITY
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

function matchesMaterials(materialName: string, names?: string[] | null): boolean {
  if (!names?.length) return true
  const haystack = materialName.toLowerCase()
  return names.some((name) => haystack.includes(name.toLowerCase()))
}

/**
 * Put a texture in a slot without flipping the shader variant.
 *
 * three keys its program cache on which slots are *populated* and on each
 * texture's UV channel, not on the texture object — so texture → texture in the
 * same slot needs no `needsUpdate` and compiles nothing. null ↔ texture does
 * change the key, which is the same hazard `useClipWipe` names when it parks the
 * clipping plane rather than detaching it. Hence the guard: a slot the GLB left
 * empty is never filled, and restore puts the authored texture back rather than
 * nulling.
 */
function assignSlot(material: THREE.Material, slot: SwatchSlot, next: THREE.Texture | null): void {
  const slots = material as unknown as Record<string, THREE.Texture | null>
  const current = slots[slot] ?? null
  if (current === next || !current || !next) return
  slots[slot] = next
}

function restore(target: ZoneTarget): void {
  SWATCH_SLOTS.forEach((slot) => assignSlot(target.material, slot, target.baseMaps[slot].texture))
}

/**
 * Dress every target this swatch claims, and put the rest back as authored.
 *
 * Deduped by `material.uuid` for idempotence — but note it does **not** collapse
 * the doubly-instanced mesh in these assets: `Object3D.clone(true)` copies the
 * material *reference*, so `collectZoneTargets` produced two independent clones
 * from it and both genuinely need dressing.
 *
 * Cold URLs are skipped rather than awaited. The caller either warmed the cache
 * first (`ensureSwatchMaps`) or is the synchronous first coat, where a slot that
 * is not ready yet simply stays authored until the effect runs.
 */
export function applySwatchTextures(
  targets: ZoneTarget[],
  spec: SwatchSpec | null,
  anisotropy: number
): void {
  const seen = new Set<string>()

  targets.forEach((target) => {
    if (seen.has(target.material.uuid)) return
    seen.add(target.material.uuid)

    const baseline = target.baseMaps
    const dressed = !!spec && matchesMaterials(target.materialName, spec.materials)

    // Independent of the slot loop below, and applied whichever branch this
    // target takes: a swatch that names no normalScale of its own restores
    // the authored one, the same as an unmatched or absent spec does.
    const scale = dressed ? spec!.normalScale : undefined
    target.material.normalScale.set(
      scale ?? target.baseNormalScale.x,
      scale ?? target.baseNormalScale.y
    )

    if (!dressed) {
      restore(target)
      return
    }

    SWATCH_SLOTS.forEach((slot) => {
      const url = spec.maps[slot]
      if (!url) {
        // A slot this swatch does not dress goes back to the cloth's own.
        assignSlot(target.material, slot, baseline[slot].texture)
        return
      }
      // The recompile guard: a slot the GLB left empty has no sampler, no
      // transform to inherit, and no way to be filled without changing the
      // program cache key. It stays empty.
      if (!baseline[slot].texture) return

      const entry = masters.get(url)
      if (!entry?.texture) return
      entry.lastUsed = Date.now()
      const uv = resolveUv(baseline, slot, spec.uv)
      assignSlot(target.material, slot, cloneAt(url, entry.texture, uv, anisotropy))
    })
  })
}

/** Restore every target to the maps its GLB shipped with. */
export function restoreSwatchTextures(targets: ZoneTarget[]): void {
  applySwatchTextures(targets, null, 1)
}

// ---------------------------------------------------------------------------
// Loading, retaining, evicting
// ---------------------------------------------------------------------------

/** True when every map this swatch names is already decoded and uploadable. */
export function peekSwatchMaps(maps: SwatchMaps): boolean {
  return SWATCH_SLOTS.every((slot) => {
    const url = maps[slot]
    if (!url) return true
    const entry = masters.get(url)
    return !!entry && (!!entry.texture || entry.failed)
  })
}

/**
 * Warm every map a swatch names.
 *
 * Resolves even when a file 404s — a missing fabric degrades to the authored one
 * rather than rejecting into a Suspense boundary, where it would read as a piece
 * that never arrives.
 */
export async function ensureSwatchMaps(maps: SwatchMaps): Promise<void> {
  await Promise.all(
    SWATCH_SLOTS.map((slot) => {
      const url = maps[slot]
      return url ? master(url, slot).promise : null
    })
  )
}

/**
 * Warm a set of swatches off the critical path.
 *
 * Returns a cancel function, because a page that unmounts mid-warm should stop
 * pulling files nobody will look at — the same contract `preloadGltf` has, and
 * the same reason.
 */
export function preloadSwatchMaps(sets: SwatchMaps[]): () => void {
  let cancelled = false
  // One at a time rather than all at once: these share the transcoder's worker
  // pool with whatever GLB the page is still parsing, and a warm is a courtesy.
  void sets.reduce<Promise<unknown>>(
    (chain, maps) => chain.then(() => (cancelled ? undefined : ensureSwatchMaps(maps))),
    Promise.resolve()
  )
  return () => {
    cancelled = true
  }
}

/** URLs currently shown by a live target set are pinned against eviction. */
export function retainSwatchMaps(maps: SwatchMaps): void {
  SWATCH_SLOTS.forEach((slot) => {
    const entry = maps[slot] && masters.get(maps[slot]!)
    if (entry) {
      entry.refs += 1
      entry.lastUsed = Date.now()
    }
  })
}

export function releaseSwatchMaps(maps: SwatchMaps): void {
  SWATCH_SLOTS.forEach((slot) => {
    const entry = maps[slot] && masters.get(maps[slot]!)
    if (entry) entry.refs = Math.max(0, entry.refs - 1)
  })
}

function disposeMaster(url: string, entry: MasterEntry): void {
  // Clones first: each holds a reference to the master's `.source`, and three
  // frees the GL texture when the last of them lets go.
  clones.forEach((clone, key) => {
    if (key.startsWith(`${url}|`)) {
      clone.dispose()
      clones.delete(key)
    }
  })
  entry.texture?.dispose()
  masters.delete(url)
}

/**
 * Drop what is not on screen until the cache is back inside its budget.
 *
 * Unreferenced entries only, oldest first. A swatch evicted this way costs a
 * re-transcode the next time it is picked, never a download — `/textures` is
 * served immutable for a year. @see next.config.mjs
 */
export function evictSwatchTextures(budget = SWATCH_CACHE_BUDGET_BYTES): void {
  let total = 0
  masters.forEach((entry) => {
    total += entry.bytes
  })
  if (total <= budget) return

  const evictable = [...masters.entries()]
    .filter(([, entry]) => entry.refs === 0 && !!entry.texture)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)

  for (const [url, entry] of evictable) {
    if (total <= budget) break
    total -= entry.bytes
    disposeMaster(url, entry)
  }
}

/**
 * Let go of everything, references included.
 *
 * For the one case eviction must not be polite about: a lost WebGL context
 * leaves every `CompressedTexture` pointing at a GL object that no longer
 * exists, and binding one draws black or throws. Call it before the replacement
 * Canvas mounts. @see hooks/useContextRecovery
 */
export function clearSwatchTextures(): void {
  ;[...masters.entries()].forEach(([url, entry]) => disposeMaster(url, entry))
  masters.clear()
  clones.clear()
}

/** For the `?debug` overlay: what the cache is holding that a scene walk cannot
 *  see, because an evictable texture is bound to no material. */
export function swatchCacheStats(): { sets: number; bytes: number; inflight: number } {
  let bytes = 0
  masters.forEach((entry) => {
    bytes += entry.bytes
  })
  return { sets: masters.size, bytes, inflight }
}
