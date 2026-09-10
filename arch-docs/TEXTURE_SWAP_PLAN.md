# Real texture swapping for the colour switcher

## Context

Colour switching today is a tint. `hooks/useZonePaint.ts` damps `material.color`
toward a hex from `palettes` in `public/config/furniture-presentation.json`, over
cloned materials collected by `collectZoneTargets` in `lib/three/layerMaterials.ts`.
Multiplying a hex over one authored fabric map cannot make velvet read as linen —
the weave, the nap and the sheen all stay whatever the GLB shipped with, so every
"colour" is the same cloth in a different light. That is what reads as fake.

The change: a swatch swaps the material's **`map`** (and a per-family
**`normalMap`**) to a different pre-authored KTX2 texture, the way you would change
the map slot in the three.js editor — while keeping the mobile GPU-budget work
that `arch-docs/MOBILE_GPU_BUDGET.md` documents (1074 MB → 42 MB of texture VRAM)
completely intact.

Scope, as decided:

| Decision | Choice |
|---|---|
| Map slots | Basecolor per swatch + **one shared normal per fabric family** |
| UV transform | New texture **inherits the transform of the slot it replaces**, with a per-swatch `repeat`/`offset`/`rotation` override |
| Surfaces | Presentation trio first — `/product/[id]`, `/product/[id]/simple`, `/showroom`. `/store` unchanged |
| Transition | Preload, then instant swap. No cross-fade shader |
| AR | **In scope.** The chosen fabric travels to `/simple`'s AR by injecting the KTX2 into the served GLB — §12 |

> **One flag.** The original brief asked for the new texture at **UV 1×1**; the
> answer to the tiling question was **inherit the material's transform**. These
> disagree on `fabric_03` (scale 3×3) and `vray_rene_sofa_011` (normal scale 4×4).
> The plan resolves it by making that a config value, not a code decision:
> inherit is the default, and a swatch that sets `"repeat": [1, 1]` gets literal
> 1×1. Flip the default in one line if 1×1 turns out to be what the assets want.

## Baseline: what the sample asset actually is

`public/test-models/Furniture high Test2-optimized.glb` as of `6db00bc` on
`perf/mobile-gpu-budget` — 5.2 MB, the KTX2 build. (An older 13.6 MB WebP copy of
the same file exists in history; everything below is measured against the KTX2
one.)

- Requires `KHR_draco_mesh_compression`, `KHR_texture_basisu`, `KHR_texture_transform`.
- 12 images, all KTX2, 1024²-capped, 10–11 mip levels. Basecolours are ETC1S
  (110–215 KB); normals are UASTC+zstd (450 KB–1.24 MB).
- One sampler: `wrapS/wrapT = REPEAT`, `minFilter = LINEAR_MIPMAP_LINEAR`.
- Every primitive has **only `TEXCOORD_0`**.
- **Mesh and node names are meaningless** (`rene_sofa-004…014`, `Node_67…89`).
  **Material names carry the semantics** — targeting must key off material names:

| Material | Slots | `KHR_texture_transform` |
|---|---|---|
| `Fabric_1` | base, normal, metalRough(+AO), sheenColor | none |
| `fabric_03` | base, normal | `scale [3,3]` on both |
| `vray_rene_sofa_011` | base, normal | base none; normal `scale [4,4] offset [-0.5,-0.5]` |
| `vray_rene_sofa_012` | base, normal, metalRough | `rotation 90°` on all three |
| `vray_rene_sofa_013` | base only | none |
| `vray_rene_sofa_010` | **no textures** — `baseColorFactor` only | — |

Mesh 4 is instanced by two nodes. `Object3D.clone(true)` copies the *material
reference*, so `collectZoneTargets` visits two meshes and calls `mat.clone()`
twice — two independent clones, both of which need the swap. Dedupe by
`material.uuid` in the apply loop for idempotence, but it must **not** collapse
that pair. The hazard the instancing actually creates is the sibling: both clones
point at the **same `normalMap` Texture object, which belongs to drei's cached
GLTF** — so any code that retiles a sibling must `Texture.clone()` first (§3).


---

## Design

### 1. One door for standalone KTX2 — `lib/three/gltfLoaders.ts`

The `KTX2Loader` singleton already exists there and is already primed with a live
renderer by `primeGltfLoaders(gl)` from `hooks/useCanvasLifecycle.ts:57`. It is
module-private, and it should stay that way. Add one export rather than exposing
the instance, so the `whenLoadersReady()` gate cannot be forgotten at a call site:

```ts
/** Load a standalone .ktx2, behind the transcoder rather than racing it.
 *  @see preloadGltf for the same gate over GLBs. */
export async function loadKtx2(url: string): Promise<THREE.CompressedTexture> {
  await ready
  return ktx2Loader().loadAsync(url) as Promise<THREE.CompressedTexture>
}
```

This is the first standalone `.ktx2` path in the app — everything non-GLB goes
through drei `useTexture` today (uncompressed JPEG/PNG at 4 B/px), and there is no
`.ktx2` file in `public/` at all.

### 2. The swap module — `lib/three/swatchTextures.ts` (new)

```ts
export type SwatchSlot = 'map' | 'normalMap' | 'roughnessMap'

export interface SwatchMaps {
  map?: string
  normalMap?: string
  roughnessMap?: string
}

/** What a material looked like before any swatch touched it. */
interface SlotBaseline {
  texture: THREE.Texture | null
  repeat: THREE.Vector2
  offset: THREE.Vector2
  rotation: number
  center: THREE.Vector2
}

export async function loadSwatchTexture(url: string, slot: SwatchSlot, anisotropy: number): Promise<THREE.Texture>
export function preloadSwatchTextures(urls: string[]): () => void
export function applySwatchMaps(targets: ZoneTarget[], spec: ResolvedSwatch, anisotropy: number): void
export function restoreBaseline(targets: ZoneTarget[]): void
export function releaseSwatchTextures(urls: string[]): void
export function swatchCacheStats(): { count: number; bytes: number }
```

**What three does not do for you on a standalone KTX2**, and this module must:

| Property | Value | Why |
|---|---|---|
| `colorSpace` | `SRGBColorSpace` for `map`, `NoColorSpace` for normal/roughness | `GLTFLoader` sets this per slot; a standalone load does not. Set it **before first upload**: three picks the sRGB *variant* of the transcoded compressed format from `colorSpace` at upload time, so getting it wrong ships a washed-out fabric that can only be fixed by re-uploading every mip. |
| `wrapS` / `wrapT` | `RepeatWrapping` | `CompressedTexture` defaults to `ClampToEdge`; the GLB's sampler says REPEAT. With an inherited 3×3 transform, clamp smears the edge row across the piece. |
| `repeat` / `offset` / `rotation` / `center` | copied from the baseline of the slot being replaced | The inherit rule (§3). |
| `anisotropy` | `settings.anisotropyLevel`, read at apply time | Set it **before first upload**: `applyAnisotropy` in `prepareCarMaterial.ts` sets `needsUpdate = true`, which re-uploads every mip of a compressed texture. Once a swapped texture is bound, `SimpleViewer.tsx:138-147`'s existing tier-change effect already traverses and re-applies for free — no separate cache walk is needed. |
| `flipY` | leave `false` | three **ignores** `flipY` on compressed textures. Orientation is baked at encode time — see §9. |

**Cache.** A module-level `Map<url, { promise, texture, refs, lastUsed }>`.
Deduped by URL, so the shared family normal is fetched and transcoded once for
every colour in the family. LRU cap (start at 8 entries); evict only entries with
`refs === 0`, calling `texture.dispose()`. Mirrors the
`collectZoneTargets` / `disposeTargets` pairing the codebase already enforces.

**Baseline capture.** `collectZoneTargets` already clones every material (mandatory
— drei caches the GLTF). Extend `ZoneTarget` there with the material name and a
lazily captured `Record<SwatchSlot, SlotBaseline>`. Baseline textures belong to
drei's GLB cache and are **never disposed** by this module.

### 3. UV transform — inherit, with an override

Rule: **each swapped slot inherits the transform of the texture it replaces.**
`fabric_03`'s new basecolour lands at 3×3 like the map it displaced; the shared
family normal dropped into `vray_rene_sofa_011` lands at 4×4 with the `-0.5`
offset, because that is what its `normalMap` carried. The colour pattern and the
relief therefore stay registered with each other, which is the failure mode a
strict 1×1-on-`map`-only would have introduced.

Two fallbacks, in order: a slot with no baseline texture inherits the material's
`map` transform; a material with no `map` either gets identity (1×1).

Per-swatch override in the manifest — `"repeat": [1,1]` (plus optional `offset`,
`rotation`) applies to every slot that swatch fills and is how literal 1×1 is
requested. A per-material override (`targets: [{ material, uv }]`) handles the odd
one out, e.g. keeping `vray_rene_sofa_012`'s 90° rotation.

**Per-material variants are free.** `Texture.clone()` copies the reference to
`.source`, and three keeps the GL handle on the *source* — so one decode can serve
several tilings for the cost of a JS object and zero VRAM. Cache the clones under
`` `${url}|${uvKey}` `` so one swatch at one tiling is one object forever.

Note for implementation: three 0.180 has **per-slot transform uniforms**
(`mapTransform`, `normalMapTransform`, …) and per-slot varyings, so the slots
genuinely can differ; this was not true before r152, where one shared
`uvTransform` was driven by `material.map`. Worth confirming once by eye rather
than taking on trust.

**The trap this cannot solve.** `Fabric_1` carries no `KHR_texture_transform` at
all. If its 3× tiling was baked into the *mesh UVs* instead, `repeat 1×1` still
tiles 3× and the feature looks broken for reasons nothing in the config can
express. Add a dev-only check — read each matched mesh's `uv` attribute bounding
box, `console.warn` when max > 1.001 with the mesh and material name — so that is
diagnosable in seconds instead of mysterious. Same shape as `describeSceneNames`
in `lib/store/sceneObject.ts`. A matching rule that hits nothing deserves the same
warning: `gltf-transform dedup` (step 6 of `optimize-glb.sh`) can merge materials
and collapse the names `materials[]` is written against.

### 4. Applying without a shader recompile

three keys the program cache on which map slots are *populated* (`!!material.map`,
`!!material.normalMap`, …) and on each texture's UV `channel`. It does **not** key
on the texture object itself. So:

- **texture → texture in the same slot, same channel: no recompile.** Assign and
  do *not* set `material.needsUpdate`. Every primitive here is `TEXCOORD_0`
  (channel 0), so channel always matches.
- **null → texture is a recompile**, and so is texture → null on restore. Same
  hazard class the codebase already names for `clippingPlanes`
  (`hooks/useClipWipe.ts` parks the plane rather than detaching it, "detaching
  flips the shader variant and forces a program recompile on every cover swap").

Therefore: **a material with no baseline `map` is not a texture-swatch target** —
it stays on the colour path. In the sample asset that is exactly
`vray_rene_sofa_010`, the near-black base, which is not upholstery anyway. And
restore never nulls a slot; it puts the baseline texture back.

Dedupe the apply by `material.uuid` (mesh 4 is double-instanced).

### 5. Colour and texture together

A swatch that carries `maps.map` **must drive `material.color` to `#ffffff`** —
`map` is multiplied by `color`, so leaving the old hex in place double-darkens the
new texture. The swap sets the map and the colour in the same frame, which leaves
`useZonePaint`'s ~400 ms damp already at its target so it settles immediately and
stops calling `invalidate()`. No change to the demand-loop contract.

`hex` stays in the config for texture swatches: it is the UI chip colour, the
`SwatchRow` fallback, and the only thing that can travel to AR (§12).

Going the other way — a hex-only swatch picked *after* a texture swatch —
`restoreBaseline` puts the GLB's own maps and transforms back and the colour damp
resumes as it does today. That is why the baseline is captured rather than
overwritten, and it is what lets a palette mix tinted and textured swatches in the
same row.

### 6. Config schema — backwards compatible

`ZoneSwatch` in `lib/product/presentation.ts:14-20` gains optional fields. A swatch
with no `maps` is exactly today's colour swatch, unchanged:

```jsonc
"palettes": {
  "cover": [
    {
      "id": "velvet-charcoal",
      "name": "مخمل ذغالی",
      "hex": "#36454f",                    // chip colour, fallback, AR
      "roughness": 0.95,
      "maps": {
        "map":       "/textures/covers/velvet-charcoal-1024-v1.ktx2",
        "normalMap": "/textures/covers/velvet-weave-1024-v1.ktx2"   // shared by the family
      },
      "materials": ["Fabric_1", "fabric_03", "vray_rene_sofa_011"], // optional
      "thumbnail": "/images/covers/velvet-charcoal.webp"            // optional
      // "repeat": [1, 1]                  // optional — literal 1×1 instead of inherit
    }
  ]
}
```

`materials` is a list of **material-name** substrings, because mesh names in these
assets carry nothing. Omitted → every target in the zone that has a baseline `map`.
Implement it as a filter at apply time, not at collect time, so one
`collectZoneTargets` pass still serves every swatch. `CollectOptions` in
`layerMaterials.ts` keeps `zone` and `match`; `ZoneTarget` gains `materialName`.
The `userData.zone` / `paintZone` override in `zoneOverride()` keeps working
untouched.

There is no "family" concept in the schema and there does not need to be: the
shared normal is simply the same URL on every swatch that uses it, and the cache
keys on URL, so it is fetched and transcoded once.

`lib/showroom/config.ts:258` merges `palettes` per zone by wholesale replacement,
so it carries the new fields with no change.

**One addition that the texture path makes necessary.** `palettes.cover` is a flat
list today, shown regardless of which cover variant is mounted — fine when a
swatch is a tint, wrong when it is a cloth: a velvet basecolour dropped onto the
leather GLB is not a leather colourway. Give `CoverVariant`
(`presentation.ts:22-31`) an optional `palette?: ZoneSwatch[]` that replaces
`palettes.cover` while that variant is selected, resolved in `ProductSheet`
alongside the existing `findCoverVariant(config, coverId)` call it already makes.
Omitted → today's shared list, so nothing existing changes.

### 7. State and UI

`ZonePaint` (`stores/presentationStore.ts:14-19`) gains three optional fields:

```ts
export interface ZonePaint {
  color: string
  metalness: number
  roughness: number
  clearcoat: number
  /** Swatch identity. Active state was keyed on hex, which breaks the moment
   *  two swatches share one or a texture swatch has no meaningful colour. */
  swatchId?: string | null
  /** Absent → the colour-only path, exactly as before. */
  maps?: SwatchMaps | null
  materials?: string[] | null
}
```

All three **must be optional** and must stay out of `encodePaint`/`decodePaint` —
see §12. `decodePaint` builds its result with `satisfies ZonePaint`, so optional is
also what keeps it compiling.

`setPaint` merges, so switching from a texture swatch back to a hex swatch has to
pass `maps: null` explicitly or the old fabric sticks. One helper beside
`coverSurface()` in `presentation.ts` stops every call site getting that wrong:
`swatchPaint(swatch, roughnessFallback?) → Partial<ZonePaint>`, which also
resolves colour (`#ffffff` for a texture swatch, `swatch.hex` otherwise). Note
`ProductSheet.tsx:152` leaves `roughness` alone when a swatch has none while
`ShowroomFeatured.tsx:103,203` forces `0.6` — pass `swatchPaint(swatch, 0.6)` from
the showroom to preserve its look exactly.

`applyFirstCoat` and `useZonePaint` (`hooks/useZonePaint.ts`) keep damping colour /
metalness / roughness / clearcoat as they do now. The texture side is not damped —
it is applied once, in an effect keyed on `paint[zone].swatchId`, after the load
resolves.

The UI changes are mechanical and all of them are one substitution: **identity
moves from hex to id.** It has to — three velvets in three colours can share a
hex with three linens, and today `swatches.find(s => s.hex === activeHex)` would
light the wrong chip.

- `components/product/SwatchRow.tsx:16,28` — `activeHex` → `activeId`, compare
  `swatch.id === activeId`. Add a pending state while a texture loads, and render
  `swatch.thumbnail` when present instead of a flat hex chip. Thumbnails must be
  small WebP: `arch-docs/mobile-3d-op-roadmap.md:106` already flags
  `public/images/covers/leather.png` as "a 1.37 MB PNG rendered as a ~40 px
  swatch chip", and a palette of these would multiply that.
- `components/product/ProductSheet.tsx:150-155,267` — `pick()` passes the whole
  swatch through `setPaint`; `activeHex={paint[zone].color}` → `activeId={paint[zone].swatchId}`.
- `components/showroom/ShowroomFeatured.tsx:73,103,203` — same substitution
  (`activeColor` → `activeSwatchId`).

### 8. Loading policy — preload the default, warm the rest off-phone

Mirrors what `ProductPageClient.tsx:155-175` already does for cover GLBs, comment
and all ("Not on a phone… every warmed variant is a second full GLB parsed and held
in drei's cache, on a device already at its ceiling with the one it is showing"):

1. **Preload with the page's other assets**: the default swatch's `map` plus the
   family `normalMap`, via `preloadSwatchTextures` gated on `whenLoadersReady()`,
   alongside the existing `preloadGltf` call.
2. **On tap**: load, show the swatch's pending state, then apply. ~200 KB at
   1024² ETC1S, immutable-cached, so a second tap is instant.
3. **Desktop only**, in `requestIdleCallback`: warm the remaining swatches of the
   active family. Same idle-callback shape as the cover warm, same phone bail-out.

### 9. Authoring pipeline — `scripts/optimize-texture.sh` (new)

A sibling to `scripts/optimize-glb.sh`, same doctrine: run offline, never in
`next build`. Requires KTX-Software (`ktx`) plus ImageMagick for the resize —
`ktx create` does not resize.

```bash
# basecolour — sRGB, ETC1S, ~200KB at 1024²
magick in.png -resize 1024x1024! -strip out.png
ktx create --format R8G8B8_SRGB --encode basis-lz --qlevel 200 \
           --assign-oetf srgb --generate-mipmap out.png name-1024-v1.ktx2

# family normal — linear, UASTC (ETC1S quantises to a shared palette, which is
# visibly wrong for a vector packed into RGB — the same reason optimize-glb.sh
# gives normals their own pass)
ktx create --format R8G8B8_UNORM --encode uastc --uastc-quality 2 --zstd 18 \
           --assign-oetf linear --generate-mipmap normal.png weave-1024-v1.ktx2
```

Rules that must hold:
- **No vertical flip.** `ktx create`'s default top-left origin matches glTF, and
  three ignores `flipY` on compressed textures, so a flipped encode cannot be
  corrected at runtime.
- **PNG or JPEG in.** The `ktx` encoder refuses WebP outright and hands back a
  file that looks like it worked — already learned in `optimize-glb.sh` step 2.
- **1024 cap**, matching `MAX_EDGE` / `TEXTURE_MAX_EDGE_PHONE`.
- Output to `public/textures/covers/`. That path is served
  `max-age=31536000, immutable` by `next.config.mjs`, so **a replaced texture needs
  a filename bump** — hence the `-v1` suffix in the names above. The script should
  refuse to overwrite an existing output and say so.
- **`public/textures` is *not* gitignored** (unlike `public/models` and
  `public/ktx-optimized`, which are). A small palette is fine to commit; past a few
  megabytes, add `public/textures/covers` to `.gitignore` and ship it out of band
  the way models already travel. Decide this before the first commit, not after.

Validate the encoder output against a known-good file rather than the flag
spellings, which moved between KTX-Software 4.1 and 4.3: extract a `.ktx2` from an
already-optimised GLB (those came from this same `ktx` binary via
`gltf-transform`), run `ktx info` on both, and match the DFD.

### 10. Budget accounting

Per the codebase's own formula (`lib/three/textureBudget.ts`, mirrored in
`scripts/glb-budget.mjs`): `width × height × bytesPerPixel × 4/3`, with ETC1S at
0.5 B/px and UASTC at 1 B/px.

| 1024² asset | desktop / Android (DXT1, ETC2-RGB) | **iOS (ASTC 4×4)** |
|---|---|---|
| ETC1S basecolour, per swatch | 0.5 B/px → 0.67 MB | 1 B/px → **1.33 MB** |
| UASTC family normal, once per family | 1.33 MB | **1.33 MB** |

**Budget against the iOS column** — that is the platform that runs out, and it is
the one place the repo's own tooling currently under-reports: `glb-budget.mjs:111`
prices ETC1S at 0.5 B/px, which is the desktop figure. ETC1S transcodes to ASTC on
an iPhone at 1 B/px. Report both there, or take the max.

So: **≈1.33 MB per swatch, plus 1.33 MB once for the family normal.** An 8-entry
LRU is ≈ 12 MB on iOS. Against a `/product` scene at ~42 MB and a 96 MB warn line,
comfortable — and it is *why* the shared-normal choice matters: a full PBR set per
swatch would have been ~4 MB each and ~32 MB for the same eight.

Add the ceiling as a constant beside the existing ones in `textureBudget.ts`, so
they are read together:

```ts
/** How much of the 96MB warn budget the swatch cache may hold resident.
 *  A quarter of TEXTURE_VRAM_WARN_BYTES — a full cover palette with room left. */
export const SWATCH_CACHE_BUDGET_BYTES = 24 * 1048576
```

(While in that file: `TEXTURE_MAX_EDGE_PHONE` at line 157 is exported and used
nowhere. `optimize-texture.sh`'s `MAX_EDGE` is its natural consumer — wire it or
delete it, but stop leaving it.)

Two additions to the measurement, so this stays honest:
- `components/three/RendererStatsProbe.tsx` prices anything bound into the scene
  automatically (it dedupes by `Texture.uuid` across 23 slots), but a cached-yet-
  unbound LRU entry is invisible to it. The probe already imports three, so it is
  the right side of the split to call `swatchCacheStats()` on its existing 2000 ms
  tick and put the numbers on `RendererSample`; `rendererStatsStore.ts` keeps
  importing nothing, for the bundle reason its header gives. One new line:
  `swatch 4 sets · 11MB/24MB · 1 in flight`, amber past the budget.
- `scripts/glb-budget.mjs` already parses KTX2 headers (offset 44, scheme 1 =
  ETC1S). Teach it to sniff the `0xAB 'KTX 20'` magic in its per-file loop and
  price a bare `.ktx2` directly, so `npm run glb:budget
  public/textures/covers/*.ktx2 --strict` gates these the way it gates models.
  Warn on a missing mip chain (`levels < log2(maxEdge)+1`) while there — a swatch
  encoded without `--generate-mipmap` aliases badly and costs *less* VRAM, so
  nothing else would catch it.

### 11. Eviction

`hooks/useGltfCacheEviction.ts` releases GLBs at **page** unmount, not canvas
unmount, because a canvas is torn down constantly here (AR round trip,
context-loss retry, StrictMode). Swatch textures follow the same rule: a
`useSwatchTextureEviction(urls)` hook alongside it in the three page clients, and
the LRU inside the module for churn within a single visit.

### 12. AR — the texture travels too

`/product/[id]/simple` already sends the configuration to AR: `arModelUrl(key,
layer, zone, paint)` (`SimpleViewerClient.tsx:243`) hits
`app/api/ar/[key]/model.glb`, which reads the manifest's file off disk and runs
`patchGlbMaterials` over it. Colours arrive in the customer's room today. The
fabric must too, so the route learns one more thing.

(`/product/[id]` and `/showroom` hand model-viewer a static `arModelPath` with no
query at all, so they are unaffected either way. This section is `/simple` only.)

**Why this is affordable, and why the earlier caution was wrong.**
`SimpleViewerClient.tsx:411` passes `usdzPath={undefined}` whenever `arUrl` is
set, so `ios-src` is unset and **model-viewer builds the USDZ itself** from the
GLB, capped by `ar-usdz-max-texture-size="1024"`. It loads that GLB through its
own three-based loader, which transcodes KTX2 before writing the USDZ — so an
injected KTX2 survives Quick Look. On Android, Scene Viewer fetches the GLB
directly, and these assets are *already* `KHR_texture_basisu`-required today; one
more Basis texture is not a new risk.

#### 12a. `patchGlbMaterials` gains an optional injection

The function already re-serialises the whole container with correct chunk lengths
and 4-byte padding, and copies everything after the JSON chunk through untouched.
Appending is an extension of that loop, not a rewrite:

```ts
export interface TextureInjection {
  /** Material indices to repoint. Resolved from the swatch's `materials[]`
   *  names against `json.materials[].name` — it must agree with the page's
   *  `materialMatch` or AR dresses different parts than the screen did. */
  materials: Set<number>
  /** slot → the KTX2 bytes. `baseColorTexture` and `normalTexture` only. */
  maps: Partial<Record<'baseColorTexture' | 'normalTexture', Uint8Array>>
}

export function patchGlbMaterials(
  bytes: ArrayBuffer,
  edits: Map<number, MaterialEdit>,
  injection?: TextureInjection
): ArrayBuffer
```

Per injected map, in one pass over the parsed JSON:

1. Append the bytes to the **BIN** chunk (`type === 0x004E4942` — not merely
   "chunk 1"; `readChunks` already tolerates extra trailing chunks and so must
   this), 4-byte aligned, and add `bufferViews[n] = { buffer: 0, byteOffset,
   byteLength }`. Bump `buffers[0].byteLength` to match.
2. `images[n] = { mimeType: 'image/ktx2', bufferView: n }`;
   `textures[n] = { sampler: <the replaced texture's sampler>, extensions: {
   KHR_texture_basisu: { source: n } } }`.
3. Repoint `material.pbrMetallicRoughness.baseColorTexture.index` (or
   `material.normalTexture.index`) to `n` — **and leave that reference's
   `extensions` object alone.** `KHR_texture_transform` lives on the *reference*,
   not the texture, so repointing `index` and nothing else implements §3's
   inherit rule on the AR side for free: `vray_rene_sofa_012` keeps its 90°
   rotation, `fabric_03` its 3×3. A swatch that overrides `repeat` writes
   `KHR_texture_transform.scale` here instead.
4. Ensure `KHR_texture_basisu` is in `extensionsUsed`, and in `extensionsRequired`
   — the injected texture carries no uncompressed fallback `source`, so the spec
   requires it. Guard both with an `includes` check, the same shape the existing
   `clearcoatAdded` block uses.

**Materials with no `baseColorTexture` are skipped**, exactly as on the page (§4):
there is no sampler to inherit and no reference to repoint.

Nothing else changes. Draco stays Draco, every existing texture stays where it
was, and `zoneEditsFromJson` still writes the four factors — including
`baseColorFactor`, which for a texture swatch is already `hexToLinearRgb('#ffffff')`
= `[1,1,1]` because §5 put white in `ZonePaint.color`. The tint multiply lands
correctly with no special case.

#### 12b. The route

`app/api/ar/[key]/model.glb/route.ts` gains one query parameter and one file read.

```
GET /api/ar/<key>/model.glb?layer=<id>&zone=<zone>&paint=<b64url>&tex=<swatchId>
```

- **`tex` is a swatch id, never a URL.** Resolve it against
  `presentation.config.palettes[zone]` and read `maps.map` / `maps.normalMap`
  from the manifest entry. This is the same lock the route already puts on
  `layer` — *"`layer` selects a file, it does not name one, so no query can reach
  a path the manifest has not published"* — and the `path.resolve` +
  `startsWith(PUBLIC_DIR + path.sep)` containment check is reused verbatim as the
  second lock.
- **An unknown `tex` is a 400**, matching how `decodePaint` refuses rather than
  guesses. Absent `tex` → today's behaviour exactly.
- **A missing texture file degrades, it does not fail.** The route already has
  this posture for an unparseable GLB ("serve it as authored rather than failing:
  the piece appears in its own colours, which beats no AR at all"). A `.ktx2` that
  will not read falls through to the colour-only patch.
- **The cache key needs nothing.** It is
  `` `${key}?${url.searchParams.toString()}` ``, so `tex` extends it for free —
  browser cache, the route's 6-entry LRU and the immutable header all keep working.
- **`encodePaint` / `decodePaint` are still untouched.** `tex` is its own
  parameter precisely so the paint tuple stays a 4-tuple: `decodePaint` rejects
  `entry.length !== 4` with a 400, and an old URL must keep decoding against a new
  build.

`arModelUrl` (`lib/ar/arSource.ts:90`) gains an optional 5th argument and omits
the parameter when it is absent, so URLs for colour-only swatches are byte-identical
to today's and stay warm in every cache.

#### 12c. Size

Injecting `map` + `normalMap` at 1024² adds ~0.2 MB + ~1.2 MB *on disk* (the
encoded KTX2, not the resident figure) to a ~5 MB response. Against
`lib/ar/budget.ts`'s `AR_GLB_WARN_BYTES` 15 MB and `AR_GLB_MAX_BYTES` 30 MB that is
comfortable, and the page's existing HEAD-before-open check already measures the
real response — so an oversized combination degrades honestly instead of failing
in front of the customer.

The route's design claim softens from "the response is the input's size" to "the
response is the input plus the fabric the customer chose", which is still the
point: nothing is decompressed, nothing is re-encoded, and the 8× `GLTFExporter`
blow-up this route exists to prevent stays prevented.

### 13. Doc to update

`arch-docs/FURNITURE_SETUP_GUIDE.md:256-258` currently states the opposite rule:

> **No baked colour textures on colourable surfaces** — the page drives `color`
> directly. Normal, roughness and AO maps are fine and encouraged.

That becomes conditional: a colourable surface either takes the colour path (no
basecolour map) or the swatch path (a basecolour map that swatches replace). Both
are supported; what is not supported is a material with no `map` receiving a
texture swatch (§4).

Two new export rules belong beside it, because both are things only the artist can
fix:

- **A colourable island must be unwrapped 0..1** — no tiling baked into the UVs.
  Tiling belongs in `KHR_texture_transform`, where the config can read and override
  it; baked into the UVs it is invisible to the runtime and `repeat 1×1` silently
  does not mean 1×1 (§3).
- **Material names are an API now.** `materials[]` matching is written against
  them, and `gltf-transform dedup` can merge and rename. Name the upholstery
  material something stable and deliberate.

Also update `arch-docs/MULTI_ZONE_PAINT_SYSTEM.md` (document `useSwatchTextures`
beside `useZonePaint`), `arch-docs/MOBILE_GPU_BUDGET.md` (the per-swatch cost table
and the cache budget) and `arch-docs/AR_PIPELINE.md` — which needs a real edit,
not a footnote: its central claim is *"the output is the input's size"*, and the
`tex` parameter, the BIN append and the new `?layer&zone&paint&tex` contract all
belong in it (§12).

---

## Implementation order

0. Confirm `public/test-models/Furniture high Test2-optimized.glb` is the 5.2 MB
   KTX2 build this plan is measured against, not the 13.6 MB WebP one.
1. `loadKtx2` in `gltfLoaders.ts` + `lib/three/swatchTextures.ts` (load, cache,
   apply, restore). Provable on its own with one hand-encoded `.ktx2`.
2. `scripts/optimize-texture.sh`, and encode one real fabric family (one shared
   normal + two or three basecolours) into `public/textures/covers/`.
3. `ZoneTarget.materialName` + baseline capture in `layerMaterials.ts`.
4. Config types + `furniture-presentation.json` entries for that one family.
5. `presentationStore` / `useZonePaint` / `useSwatchTextures`, wired into
   `SimpleViewer` first — one file, one zone, the smallest surface to prove on.
6. UI: identity by id across `SwatchRow`, `ProductSheet`, `ShowroomFeatured`.
7. **AR (§12)** — right after `/simple` works on screen, while the material
   targeting is fresh: `patchGlbMaterials`'s injection, then the `tex` param in
   the route and `arModelUrl`. Doing it here rather than last is what stops
   `zoneEditsFromJson`'s material selection and the page's `materials[]` matching
   from quietly diverging, which is the one way AR can show a fabric the screen
   never did.
8. `FurnitureStack` + `CoverLayer` (the layered `/product` path), then preload,
   eviction and the `?debug` line.
9. `glb-budget.mjs` `.ktx2` mode and the doc updates.

## Files

**New**
- `lib/three/swatchTextures.ts` — load / cache / apply / restore / evict
- `hooks/useSwatchTextures.ts` — the R3F-side effect that applies on `swatchId` change and re-applies anisotropy on a tier change
- `scripts/optimize-texture.sh` — PNG/JPEG → 1024² KTX2

**Changed**
- `lib/three/gltfLoaders.ts` — add `loadKtx2(url)`
- `lib/three/layerMaterials.ts` — `ZoneTarget` gains `materialName` + baseline capture
- `lib/product/presentation.ts` — `ZoneSwatch.maps` / `.materials` / `.repeat` / `.thumbnail`, `CoverVariant.palette`, `swatchPaint()`
- `stores/presentationStore.ts` — `ZonePaint.swatchId` / `.maps` / `.materials`
- `hooks/useZonePaint.ts` — `applyFirstCoat` sets colour to white when a swatch carries `maps.map`
- `components/product/{SwatchRow,ProductSheet}.tsx`, `components/showroom/ShowroomFeatured.tsx` — identity by id, thumbnails, pending state
- `components/product/{FurnitureStack,CoverLayer,SimpleViewer}.tsx` — mount the swatch hook next to `useZonePaint`
- `app/product/[id]/ProductPageClient.tsx`, `app/product/[id]/simple/SimpleViewerClient.tsx`, `components/showroom/ShowroomFeatured.tsx` — preload + eviction
- `lib/ar/glbPatch.ts` — `TextureInjection`, an optional 3rd argument to `patchGlbMaterials`, BIN append + `bufferViews`/`images`/`textures` entries + index repoint (§12a)
- `app/api/ar/[key]/model.glb/route.ts` — the `tex` param, manifest resolution, the reused containment check (§12b)
- `lib/ar/arSource.ts` — `arModelUrl` gains an optional `swatchId`. **`encodePaint`/`decodePaint` untouched**
- `components/three/{rendererStatsStore.ts,RendererStatsProbe.tsx}` — swatch cache line
- `scripts/glb-budget.mjs` — accept bare `.ktx2`
- `public/config/furniture-presentation.json` — the new swatch entries
- `arch-docs/FURNITURE_SETUP_GUIDE.md` — rule 5

**Untouched:** `/store` (`stores/furnitureConfigStore.ts`, `components/store/FurnitureColorApplier.tsx`, `public/config/products.json`), and `/product/[id]` + `/showroom`'s AR, which hand model-viewer a static `arModelPath` with no query and are unaffected either way.

---

## Risks

| Risk | Mitigation |
|---|---|
| Shader recompile stutter on swap | Never null a slot; skip materials with no baseline `map`; match `colorSpace` and `channel` to the baseline; do not set `material.needsUpdate` |
| ClampToEdge seams | Set `RepeatWrapping` before the texture's first upload |
| sRGB double-gamma (washed or dark fabric) | Encode basecolour with `--assign-oetf srgb`, set `SRGBColorSpace` on load; normals linear on both sides |
| Texture upside-down | Encode with default top-left origin — `flipY` cannot fix a compressed texture at runtime |
| Weave and relief disagree | The inherit rule (§3); only the explicit `repeat` override can break it, deliberately |
| KTX2 parsed before `detectSupport` | Every load goes through `loadKtx2`, which awaits the same `ready` promise `preloadGltf` uses |
| Leak on rapid swatch tapping | Two causes, two fixes: a load resolving after the user moved on → a monotonic request token + mount guard; clones accumulating → key them `` `${url}\|${uvKey}` `` and ref-count instead of disposing eagerly |
| Extra VRAM tipping a phone into context loss | ~12 MB LRU ceiling (iOS figures) against a 96 MB warn line; `useContextRecovery` already drops a tier rung and retries |
| **Textures surviving a lost context** | Every `CompressedTexture` from a dead context points at nothing. Clear the cache from the same path `useContextRecovery` uses to drop a tier, *before* the new Canvas mounts |
| `?debug` `tex` rising legitimately | Per-UV clones are separate `Texture` objects sharing one `Source`; three may count them per object. Establish the baseline empirically before running the ten-swap test, and treat `prog` and the VRAM figure as the real signals |
| UV tiling baked into the mesh, not the transform | Dev-only UV bounding-box warning (§3), plus the new setup-guide rule |
| `gltf-transform dedup` collapsing material names | Dev-only warning when a `materials[]` rule matches nothing, printing the names actually present |
| A failed texture fetch taking the page down | `useSwatchTextures` catches and leaves the baseline maps in place — a missing fabric shows the authored one, never a Suspense boundary that never resolves |
| **AR dressing different parts than the screen** | `zoneEditsFromJson` selects by mesh→primitive→material *index*; the page selects by material *name*. Two rules over one asset is exactly how they diverge. Resolve the swatch's `materials[]` against `json.materials[].name` in the route and build both from the same list; the visual check in step 7 below is the guard |
| **AR response outgrowing its budget** | +~1.4 MB on ~5 MB, against `AR_GLB_WARN_BYTES` 15 MB / `AR_GLB_MAX_BYTES` 30 MB. The page's existing HEAD-before-open already measures the real response and degrades honestly |
| **A malformed BIN append producing a file no viewer will load** | The append must find the BIN chunk by `type === 0x004E4942`, not by position (`readChunks` tolerates trailing chunks), keep 4-byte alignment, and bump `buffers[0].byteLength`. Validate with `readGlbJson` on the output plus a load in model-viewer *before* trusting a phone |
| **`extensionsRequired` locking out a viewer** | The injected texture has no uncompressed fallback `source`, so `KHR_texture_basisu` genuinely must be required. These assets already require it today, so this adds nothing new — but guard the push with an `includes` check or it accumulates on every request |

---

## Verification

```bash
ktx info public/textures/covers/*_basecolor.v1.ktx2   # DFD transfer sRGB, 1024², 11 levels
ktx info public/textures/covers/*_normal.v1.ktx2      # DFD transfer linear, UASTC
node scripts/glb-budget.mjs public/textures/covers/*.ktx2 --strict
node scripts/glb-budget.mjs public/test-models/*.glb --strict   # must still exit 0
npx tsc --noEmit && npm run lint && npm run build
```

Plus a one-off read-only check so the `materials[]` strings are written against
reality rather than guessed — reuse `readGlb` from `scripts/glb-budget.mjs` to
print `json.materials.map(m => m.name)` for the cover GLB that actually ships.

Then, on `/product/test?debug`, `/product/test/simple?debug` and `/showroom/…?debug`:

1. **It looks like a different cloth.** Switch swatches — the weave/nap changes,
   not just the tint. Side-by-side against the current build is the check.
2. **`fps` reads 0 at idle** after the swap settles. Non-zero means a `useFrame`
   lost its settle check.
3. **`prog` does not climb** across ten swatch switches. A rising program count is
   a recompile per swap — §4 failed.
4. **`tex` and `geo` return to baseline** after ten switches and after leaving and
   re-entering the page. A rising count is a missing dispose.
5. **`VRAM` stays under 96 MB** (green in the overlay), with the swatch line
   accounting for the delta.
6. **One renderer, one canvas** — red in the overlay if not.
7. **Orientation and brightness.** Put a standalone-loaded map and the GLB's own
   map on screen together — they must agree. This one check catches both the
   ClampToEdge and the sRGB failure at once, and both are subtle enough to ship.
   Then confirm the fabric fills the island exactly once: no tiling, no mirrored
   grain, no smeared border.
8. **Grazing angle.** Tilt to near-horizontal — the far end of the seat must not go
   to mush. That is `configureTexture` having read the tier's `anisotropyLevel`.
9. **AR round trip** five times from `/product/test/simple`: opens, returns, the
   piece is still there, no downgrade rung burned.

### AR specifically (§12)

Verify the served bytes before ever picking up a phone — the route is a pure
function of its query, so most of this is a `curl`:

```bash
curl -s 'http://localhost:3000/api/ar/test/model.glb?layer=leather&zone=cover&paint=<b64>&tex=velvet-charcoal' -o /tmp/ar.glb
node scripts/glb-budget.mjs /tmp/ar.glb        # parses the container: a bad append fails here
node -e "const j=require('./scripts/...').readGlbJson(...); ..."   # images[n].mimeType, textures[n].KHR_texture_basisu, the repointed index
```

10. **The file still parses.** `glb-budget.mjs` walks the container, so a
    misaligned append or a stale `buffers[0].byteLength` shows up as a parse
    error rather than as a blank sofa on someone's floor.
11. **Only the intended materials moved.** Diff the patched JSON against the
    source: the repointed `baseColorTexture.index` values must be exactly the
    materials the page's `materials[]` matched — this is the divergence risk in
    the table above, and it is cheap to check here and expensive to notice later.
12. **The transform survived.** `vray_rene_sofa_012`'s `baseColorTexture.extensions
    .KHR_texture_transform.rotation` must still read `1.5707963` in the patched
    file — that is §12a step 3 working.
13. **No `tex` → byte-identical to today.** Same URL, same response as the current
    build, so nothing already cached goes stale.
14. **Bad input refuses.** An unknown `tex` → 400. A manifest entry whose `.ktx2`
    is missing from disk → the colour-only patch, 200, not a 500.
15. **On a real device, both platforms.** Android/Scene Viewer consumes the GLB
    directly; iOS/Quick Look goes through model-viewer's own USDZ build
    (`ios-src` is unset on this page) capped at 1024. The fabric in the room must
    be the fabric on the screen, and `AR_GLB_WARN_BYTES` must not have fired.
16. **On a real iPhone**, not a throttled desktop — the whole budget exists because
    iOS caps canvas-backed memory at 256 MB. Swap the palette twice, background and
    foreground the tab; a context loss on return must recover with the swatch cache
    cleared, not with black fabric.
