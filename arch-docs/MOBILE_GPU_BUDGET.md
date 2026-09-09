# Mobile GPU Budget

Why iPhones were reloading the tab on every 3D page, and how the budget is held now.

---

## Overview

**Pages:** `/product/[id]` · `/product/[id]/simple` · `/store` · `/showroom/[slug]` · `/view/[id]`

| concern | module |
|---|---|
| Texture cost, at runtime | `lib/three/textureBudget.ts` |
| Texture cost, before it ships | `scripts/glb-budget.mjs` |
| The asset pipeline | `scripts/optimize-glb.sh` |
| Loader configuration (DRACO + KTX2) | `lib/three/gltfLoaders.ts` |
| Tier ceilings, per surface | `lib/config/deviceTier.ts` |
| Device class | `hooks/useDeviceClass.ts` |
| Context teardown | `lib/three/releaseRenderer.ts` · `hooks/useCanvasLifecycle.ts` |
| Crash recovery | `hooks/useContextRecovery.ts` |
| Cache eviction | `hooks/useGltfCacheEviction.ts` |
| On-device readout | `components/three/RendererStats*` |
| Environment conversion | `scripts/exr-to-hdr.mjs` |

Stack: three 0.180 · @react-three/fiber 8.17 · drei 9.122 · Next 14.2 · React 18.

---

## What was wrong

Four things, in descending order of how much they mattered. Only the first was
big enough to kill a tab on its own; the other three are what made the failure
unrecoverable once it happened.

### 1. Textures, by roughly a factor of twenty-five

Measured on `public/test-models`, the models `/product/test` actually loads:

```
final-scene.glb   20.5MB on disk  →  740MB texture VRAM   3× 4096², 1× 4000², 12× 2000²
Test2 (leather)   13.0MB          →  284MB                3× 4000²
Test3 (velvet)    13.1MB          →   50MB                695,572 triangles
                                    ────────
mounted together                      1074MB
```

iOS gives a Safari tab roughly 1.5 GB in total and, on several versions, caps
canvas-backed memory at 256 MB with `Total canvas memory use exceeds the maximum
limit`. The room alone is over that before a pixel is drawn.

**Why it was invisible.** Every texture is `EXT_texture_webp`, and WebP is very
good: a 4000×4000 map compresses to 850 KB. The GPU still holds
`4000 × 4000 × 4` bytes, plus a third again for the mip chain — 81 MB. Nothing
in the download, the parse, the network tab or the console reports that number,
and the file size actively misleads about it.

For scale: everything the quality-tier system argues over — DPR, MSAA, shadow
resolution — is worth 5–25 MB of framebuffer on a phone. The textures were worth
a thousand.

### 2. The tier ceiling was reachable three ways round

`DEVICE_TIER_CEILING` existed and was correct. Only `/product` consulted it.

- **The picker escaped.** `QualityChips` is mounted on `/product/[id]/simple` — a
  page with no shadow map, no composer and no second scene render, where every
  rung genuinely is affordable. It wrote the chosen tier into `localStorage` under
  `car-quality-preset`. `/store` read that key, took the stored branch, and
  **skipped its phone downgrade entirely**. A customer who tapped «حداکثر» on the
  cheap page silently put the walkable scene on DPR 2, 4× MSAA over an RGBA16F
  chain, N8AO, a 2048² shadow map and 24 point lights — on a handset.
- **Landscape read as a tablet.** `QualityContext` tested `window.innerWidth < 768`.
  Everything else in the codebase uses `PHONE_QUERY`, which tests the **short**
  side, precisely because an iPhone in landscape is ~852 across and ~390 tall.
- **`simpleViewerQuality` capped nothing**, deliberately, on the argument that the
  page is cheap. The page is cheap. `ultra` on a phone is not.

Plus three guards that existed and were never passed on `/store`:
`PostProcessing` had no touch check (`/product`'s equivalent has had one since it
worked out that a 4×-multisampled RGBA16F buffer is 32 bytes a pixel);
`SunLight` was mounted with no `maxResolution` and `samples: 16` straight from
JSON; and `high.lampMaxLights` was `80` — more real point lights than `ultra`'s 24.

### 3. WebGL contexts were never actually released

R3F does part of the teardown. In `unmountComponentAtNode` (fiber 8.17,
`events-*.esm.js`) it sets `internal.active = false`, then 500 ms later disposes
the render lists and calls `forceContextLoss()` inside a swallowing `try/catch`.

What it never calls is **`gl.dispose()`** — which is what frees the program cache
(every compiled shader), the material and texture property maps, the binding
states, the render states and the shadow-map targets, and removes three's own
context listener. Its `dispose(state)` helper iterates the state object's *string
keys* and disposes nothing at all. Nothing shrinks the canvas backing store.

On desktop that is untidy. On iOS Safari it is the bug: a WebGL2 backing store
released only by garbage collection is reclaimed when the collector feels
pressure, which on a page that is still drawing is later than the OS's patience.
Contexts accumulated on every `canvasKey` bump, every AR round trip and every
client-side route change.

Two pages also kept a canvas **live underneath** `model-viewer`, which takes a
context of its own: `/store` (plus a rapier world and the room GLB) and
`/showroom`. `/product` and `/simple` had gated theirs long before.

### 4. Nothing was released, ever

- Nothing called `useGLTF.clear` outside a retry button. drei's cache is keyed on
  URL and lives for the tab, so `/showroom → /product/test → /simple` held every
  parsed GLB from all three. `/showroom` re-probes and re-parses per layer toggle
  and released nothing, so three covers meant three resident.
- `FurnitureColorApplier` cloned a material set on every furniture selection and
  dropped the previous one. A material holds a compiled program and a slot in the
  renderer's property maps until `dispose()` is called.
- `SimpleViewer` had `settings.anisotropyLevel` in the deps of the memo that
  clones the scene — so a tap on the quality chips re-cloned the entire scene
  graph, re-cloned every material and compiled fresh programs, to change a
  texture filter.
- A lost context on `/simple`, `/showroom`, `/view` or `/store` produced a frozen
  frame with no notice, no retry and no change of tier. Only `/product` had a
  ladder, and its rung counter died with the tab — which on iOS is exactly when
  it was needed, since the OS reloads the tab.

---

## The fix

### Measure first: `lib/three/textureBudget.ts` + `scripts/glb-budget.mjs`

Both compute the same figure by the same formula, one from a loaded scene and one
from a `.glb` on disk:

```
width × height × bytesPerPixel × 4/3        (the mip chain converges on 4/3)
```

`bytesPerPixel` is 4 for anything uncompressed, and for KTX2 comes from the block
format: 1 byte for ASTC 4×4 / BC7 / DXT5 / ETC2-RGBA, half that for DXT1 / ETC2-RGB.
The runtime walk dedupes on `Texture.uuid` — the driver uploads one image once,
however many materials share it, and counting per-material would overstate the
room several times over and make the readout useless for deciding what to resize.

The CLI reads the GLB container and the image headers itself, with no dependency
on the build, on TypeScript or on `three` — `public/models` is gitignored and
copied to the server out of band, so it has to run from a shell against files the
project cannot see. WebP needs real care there: the dimensions live in a
different place in each of VP8X, VP8 and VP8L, and getting the bit-packing wrong
reports every texture as 0×0, which reads as "nothing to fix here".

```
$ npm run glb:budget public/test-models/final-scene.glb

final-scene.glb — 20MB on disk
  triangles    373,391   ⚠ over 150,000 for AR
  TEXTURE VRAM 740MB   ✖ over budget
     4096×4096  webp   1.33MB file →    85MB VRAM ⚠  vray_02___Defaultmetallicroughness
  ⚠ 28 map(s) exceed 1024px — run scripts/optimize-glb.sh
```

### The pipeline: `scripts/optimize-glb.sh`

```
resize  --width 1024 --height 1024        cap the resolution
png     --formats "*"                     WebP out, PNG in
uastc   --slots "normalTexture" --level 2 normals
etc1s   --quality 200                     everything else
prune → dedup → draco                     in that order
```

Two steps do the work. `resize` because a 4000×4000 texture on a 390 pt screen is
detail the panel cannot resolve, paid for in full. Then **KTX2/Basis**, which is
the part that cannot be done any other way: PNG, JPEG and WebP must all be fully
decompressed into GPU memory, while a KTX2 texture stays in a block format the
GPU samples directly, transcoded at load time to whatever this device wants.

Four details that are load-bearing and were each found the hard way:

- **`png --formats "*"`.** The default only re-encodes textures that were already
  PNG, which on these models is none of them. The `ktx` encoder refuses WebP
  outright — it skips those textures with a warning and hands back a file that
  looks like it worked.
- **UASTC for normals only.** ETC1S quantises to a shared palette: fine for
  colour, visibly wrong for a vector packed into RGB. Normals come back blotchy
  and the lighting swims.
- **No `--rdo`/`--zstd`.** They buy a smaller *download* for a large amount of
  encoder time — 9 minutes against 7 seconds on the room — and change the
  resident size not at all.
- **Draco last.** `prune` and `dedup` rewrite the document, which decodes Draco
  and does not put it back. With draco before them the room came out *larger*
  than it went in.

Measured, on the three real models:

```
                  on disk            texture VRAM
final-scene       20.5MB → 11MB      740MB → 24MB
Test2 (leather)   13.0MB → 5.0MB     284MB →  9.2MB
Test3 (velvet)    13.1MB → 7.5MB      50MB →  9.1MB
                 ────────────────    ──────────────
                  45.6MB → 23.5MB    1074MB → 42MB
```

About 20 seconds per model. Offline, never a `next build` step — the build has
nothing to operate on.

### Loading it: `lib/three/gltfLoaders.ts`

One place a `GLTFLoader` is taught to read our files. There were three: two
module-scope `useGLTF.setDecoderPath('/draco/')` calls and `ModelLoader`'s own
DRACO singleton. Survivable while DRACO was the only thing to configure; KTX2 is
the second, and it needs a step the others do not.

**The step.** `KTX2Loader` cannot parse anything until `detectSupport()` has been
handed a live renderer — it has to know whether this GPU wants ASTC, BC7 or ETC2
before it can transcode. So the loader exists from module load but is inert until
a Canvas primes it (`primeGltfLoaders`, called from `useCanvasLifecycle`), and
anything that loads early waits (`whenLoadersReady` / `preloadGltf`). A KTX2
texture parsed too early throws — into a Suspense boundary, where it reads as a
model that simply never arrives.

Two consequences worth knowing about:

- **`useGLTF(path, false, true, extendGltfLoader)`** — `useDraco: false`, on
  purpose. drei applies `extendLoader` *first* and then overwrites
  `setDRACOLoader` with its own singleton, so ours only survives with drei's
  branch switched off. That is also what finally collapses the app to one decoder
  worker pool instead of three.
- **`ModelLoader` and `Scene` moved to three-stdlib's `GLTFLoader`.** R3F keys its
  loader cache on the class, so `three/examples/jsm`'s copy and three-stdlib's
  were two separate caches over the same files — and the store's meshopt path had
  no decoder at all.

The transcoder ships at `/basis/`, which joins `/textures/` and `/store-models/`
in `next.config.mjs`'s immutable-cache list.

### One tier authority: `lib/config/deviceTier.ts`

Everything about *choosing* a preset moved here; `quality.ts` keeps the preset
table and nothing else. `presentation.ts` re-exports the names it used to own, so
no importer changed.

```ts
resolveTier({ surface, device, manifest, stored, downgrades })
//   stored ?? manifest ?? fallback,  capped to the ceiling,  then lowered
```

The order is the policy: an explicit choice outranks the manifest, the manifest
outranks the default, and the device outranks all three.

**It caps on read.** Capping in `setPreset` would look equivalent and would not
be: real users already have `ultra` sitting in `localStorage` from the shipped
build, and a write-side cap would let those values go on escaping forever.

Three surfaces, because the pages differ and flattening them would be the wrong
fix — `/product`'s phone ceiling is `low` because it allocates a shadow map and a
composer, and the plain viewer's is `medium` because it allocates neither:

| surface | pages | phone ceiling | honours the stored choice |
|---|---|---|---|
| `presentation` | `/product/[id]` | `low` | no — its tier is the manifest's |
| `viewer` | `/simple`, `/showroom`, `/view` | `medium` | yes |
| `walkthrough` | `/store` | `low` | yes |

`QualityChips` now renders only the rungs at or below the ceiling. It used to
offer `ultra`, store `ultra`, and then display `medium`.

`hooks/useDeviceClass` replaces four hand-rolled copies of the same effect, each
of which started at `desktop` and corrected afterwards — so the first value every
provider saw on a phone was the *desktop* tier, and the canvas below it could
mount, size its buffers and compile its programs against that before the
correction landed. `useSyncExternalStore` gets it right on the first render, and
picks up an orientation change for free.

### Giving the context back: `lib/three/releaseRenderer.ts`

Five steps, and the order is the whole function:

1. **Stop the loop** — `setFrameloop('never')`, `setAnimationLoop(null)`.
   Everything below invalidates state a frame in flight would read.
2. **Detach our own `webglcontextlost` listener.** `forceContextLoss()` dispatches
   a real event; with the listener still attached, a *deliberate* teardown fires
   the page's "graphics memory is full" ladder and burns a downgrade rung. It is
   the easiest bug in this file to ship, and it looks exactly like the crash it
   is meant to be fixing.
3. **`gl.dispose()`** — before the loss, never after. Once the context is gone,
   `deleteProgram` and `deleteTexture` are silent no-ops.
4. **`gl.forceContextLoss()`**, guarded: `WEBGL_lose_context` is absent under some
   Safari lockdown and low-power configurations.
5. **`canvas.width = canvas.height = 1`**, set on the attributes directly — not
   `gl.setSize()`, which walks disposed renderer state. This is the step that
   makes Safari drop the backing store while the element is still referenced.

Deliberately **not** in there: traversing the scene to dispose geometry. That is
all either drei-cache-owned and shared with the next mount on purpose, or already
paired with a `disposeTargets` on the component that cloned it. Add it and the AR
return path comes back to an empty stage.

`hooks/useCanvasLifecycle` wires it up and absorbs `PresentationScene`'s listener
pair — the only complete one in the codebase, with the `preventDefault()` that
makes a restore possible at all.

**Why the teardown is a macrotask from the Canvas host's cleanup.** It cannot be
`onCreated`'s return value: R3F discards it. It cannot be a `useThree` child —
React 18 tears deleted subtrees down parent-first, so a child would dispose the
renderer while `EffectComposer`, `OrbitControls` and `Environment` still have
cleanups pending, each of which touches renderer-owned state on the way out. And
it cannot be synchronous in the host's cleanup, which is one level further up and
therefore earlier still. A `setTimeout(…, 0)` from there is the first moment after
every child cleanup and after the element has left the DOM — comfortably inside
R3F's own 500 ms window.

**StrictMode guard.** The App Router defaults `reactStrictMode` to true, so in
development every Canvas mounts, unmounts and remounts — and R3F reuses the
**same `<canvas>` element**, which has exactly one WebGL context. Force-losing it
for the first root would black out the remount. A real unmount removes R3F's
wrapper div, so the teardown is skipped whenever `gl.domElement.isConnected`.

### Recovery: `hooks/useContextRecovery.ts`

Three things have to happen together, and doing any two is worse than useless:

1. **Unmount the Canvas**, not just draw a notice over it. The next render of the
   R3F tree calls into `EffectComposer` against the dead context and throws out of
   React, replacing the page with *"Application error: a client-side exception"*.
   That was the visible crash.
2. **Drop a rung.** The context went because the device ran out of room for what
   was asked, so coming back at the same tier asks again. Crash, reload, crash.
3. **Offer a way back**, while rungs remain.

The rung count lives in `sessionStorage`. `/product`'s version kept it in state,
which died with the tab — and on iOS the tab is reloaded *by the OS*, so every
crash came back at full tier. Per-tab is the right lifetime; it clears after a
minute of survival so one bad afternoon does not permanently dim the page.

The cache purge stays a caller-supplied callback rather than moving into the
hook, because clearing is right when the *files* are the problem and wrong for a
lost context: the files are fine, only the GPU's copy is gone, and clearing
re-suspends every layer so `/product`'s stack never republishes its framing —
leaving the camera rig with nothing to solve from.

Each page reuses the affordance it already had. `/simple`'s `Notice` gains a retry
button; `/showroom` folds the loss into `failed`, whose fallback plate it was
already drawing; `/store` reuses its "Gallery could not be loaded" panel, which
was the exact UI it needed wired to the wrong signal.

### Cache eviction: `hooks/useGltfCacheEviction.ts`

Clears at **page** unmount, not canvas unmount, and the distinction is the whole
design: a Canvas is torn down and rebuilt constantly here — AR round trip,
context-loss retry, StrictMode — and every one of those wants the cache warm on
the way back.

drei is imported *inside* the cleanup, not at module scope, and the reason is
measured: `/showroom` is a marketing page whose canvas is already
`dynamic(ssr: false)`, and a static `useGLTF` import put the whole of drei and
three back into its first-load bundle — 160 KB to 405 KB. By the time the cleanup
runs the module is loaded anyway, or there is nothing cached to clear.

### The readout: `components/three/RendererStats*`

Safari Web Inspector needs a Mac, and the phones that crash are not attached to
one. So the numbers are on the handset's own screen, under `?debug`.

Three modules, and the split is not cosmetic. A probe inside the Canvas cannot
render the overlay — inside a `<Canvas>` React is reconciling into three's scene
graph, where a `<div>` is not a thing that exists — and they cannot share a
module either, because a page-level overlay that transitively reaches `three`
drags the library into that page's bundle. Hence `rendererStatsStore.ts`, which
imports nothing, with the two halves either side of it.

```
VRAM 38MB · 1 renderer · 1 canvas · low
simple · 0fps · dpr 1.00 · 38MB
geo 41 · tex 12 · prog 18 · calls 22 · 104k tris
1024×1024 1.3MB fabric_1basecolor
```

**More than one renderer is a bug**, and the overlay says so in red. That is a
canvas that was not torn down, which is the failure this whole document is about
and which has no other tell.

### The environment map

`/hdr/200_hdrmaps_com_free_1kk.exr` was 5,687,982 bytes of 1000×500 **FLOAT32
RGBA**, loaded by `/simple` and `/showroom` both, against ~1.8 MB for every other
environment here. Its maximum value across all three channels is **1.00**: there
is no high dynamic range in it at all. An LDR image stored at 16 bytes a pixel,
decoded on the main thread into a float buffer before PMREM has even started.

At 512×256 in RGBE it is 524 KB and loses nothing — the environment is used for
lighting (`background={false}`) and PMREM blurs past that resolution anyway.
`scripts/exr-to-hdr.mjs` does the conversion (scanline EXR, ZIP/ZIPS/none, HALF
or FLOAT, box-filtered in linear light). The filename changed because `/hdr` is
served immutable for a year.

### Dependencies

`realism-effects` was gated on `settings.experimentalSSGI`, which is `false` on
all four presets — `ultra` included — so `SSGIComposer` was unreachable at runtime
and had been for as long as the current preset table existed. It was also the
only thing pinning three: it needs `WebGLMultipleRenderTargets`, removed in r172,
and **r172 is where the Safari WebGL2 context-retention work landed**.

three 0.170 → 0.180 needs no React or Next migration: `postprocessing@6.37.8`
peers `>= 0.157.0 < 0.181.0`, and drei 9.122 / fiber 8.17 have far lower floors.
The r170→r180 breaking changes are TSL/WebGPU/node-material renames plus
`RGBELoader → HDRLoader`, `CapsuleGeometry.length → height` and
`ParametricGeometries`; app code uses none of them, and three-stdlib vendors its
own loaders.

`components/car` is **not** dead — the homepage hero mounts `ConfigurableCar`, and
both `PresentationTopBar` and `StoreSidebar` use `QualitySelector`. A reachability
walk from the live entry points found 7 reachable files and 21 that nothing
outside the tree references; the 21 went, and `three-gpu-pathtracer` with them.
`PartErrorBoundary` moved to `components/three`, which is where a boundary used by
four pages belongs.

---

## Verifying

No local GLBs, so the loop is: `npx tsc --noEmit`, `npx next build`,
`npm run glb:budget` on the real files, then `?debug` on a real iPhone.

- `/product/test?debug` — VRAM under 96 MB, one renderer, one canvas.
- Ten cover swaps: `geo` / `tex` / `prog` must return to the same baseline. A
  climbing count is a clone that is not being disposed.
- Five AR round trips: the renderer count must stay at 1, and a `[teardown]` line
  appears in the console on each close.
- `/simple` → set the chips to the top rung → navigate to `/store`: the tier must
  read `low`, not the stored value.
- Rotate to landscape on `/store`: the tier must not move.
- Force a loss from a desktop console —
  `gl.getExtension('WEBGL_lose_context').loseContext()` — on each page: each must
  show its notice, drop a rung, and come back on retry.

The behavioural pass/fail: `/product/test` on the iPhone survives ten cover swaps
and five AR round trips without reloading.

---

## Deliberately not done

1. **WebGPU.** Baseline since Safari 26, and `WebGPURenderer` has been
   production-ready since three r171 with automatic WebGL2 fallback — genuinely
   better memory behaviour and no context-loss cliff. But it needs R3F v9, which
   needs React 19, which needs Next 15+. Getting onto modern three is the
   prerequisite and is now done; the rest is a separate piece of work.
2. **Runtime texture downscaling.** Nothing meaningful is possible in-page — by
   the time three has a `Texture` the decode has already happened. That is what
   the offline pipeline is for.
3. **Disposing geometry in `releaseRenderer`.** @see the note there; it breaks the
   AR return path.
4. **A `next build` step for the assets.** `public/models` is gitignored and
   copied to the server out of band, so the build has nothing to operate on.
5. **Raising `MAX_EDGE` above 1024.** 1024² as RGBA8 with mips is 5.6 MB; 2048² is
   22 MB and 4096² is 87 MB. A piece of furniture on a 390 pt screen cannot show
   more than the first.
6. **Geometry decimation.** `Test3 (velvet)` is 695,572 triangles, 4.6× the
   `AR_TRIANGLE_WARN` budget, and textures alone do not fix that. It needs an
   authored `arPath` — @see `AR_PIPELINE.md`, which has been saying so since the
   slots were added, and they are still empty.
