# Mobile / iOS WebGL stability — full review and remediation

## Context

`/product/test`, `/product/test/simple`, `/store` and `/showroom/[slug]` reload or crash Safari
tabs on iPhones, flagships included. The codebase already carries a serious, well-documented
budget system — `DEVICE_TIER_CEILING`, `SHADOW_BUDGET`, `clampDprToBudget`, `lib/ar/budget.ts`,
the AR GLB-patch pipeline — all built during earlier rounds of exactly this problem.

I measured the three GLBs added at `public/test-models/`. **The renderer settings are not the
main problem.** The textures are:

| file | on disk | textures | texture pixels | VRAM as RGBA8 + mips | triangles |
|---|---|---|---|---|---|
| `final-scene.glb` (the room) | 19.5 MB | 39 | **145.5 MP** | **740 MB** | 373,391 |
| `Furniture high Test2` (leather) | 13.0 MB | 12 | 55.8 MP | **284 MB** | 104,103 |
| `Furniture high Test3` (velvet) | 13.1 MB | 11 | 9.7 MP | 50 MB | **695,572** |

The room contains three separate **4096×4096** maps and one 4000×4000 (81–85 MB of VRAM each),
plus a dozen at 2000×2000. The leather sofa contains **three separate 4000×4000** maps.
`/product/test` mounts room + frame + cover at once — **over 1 GB of texture memory** on a device
where Safari's whole-tab ceiling is ~1.5 GB and, on several iOS versions, canvas-backed memory
alone is capped at 256 MB.

The trap is that the files look small. WebP compresses a 4000×4000 map to 850 KB, so a 13 MB GLB
carries 284 MB of VRAM. **File size tells you nothing about GPU memory** — `width × height × 4 ×
1.33` does, and nothing in the repo currently measures it.

For scale: the DPR and MSAA settings the tier system fights over are worth ~5–25 MB of
framebuffer on a phone. The textures are worth a thousand. Both need fixing, in that order.

Everything below is phased so each phase ships and is verifiable alone.

**Branch:** `perf/mobile-gpu-budget`, cut from `development` (currently `0e703b6`).

---

## Phase 0 — See the number (do this first; nothing else is verifiable without it)

You have an iPhone but no Mac, so there is no Web Inspector. The debug readout has to be
**on the phone's screen**.

- **`lib/three/textureBudget.ts`** — `estimateTextureVram(root: THREE.Object3D)`: traverse,
  collect unique `Texture.image`, sum `w × h × bytesPerPixel × 4/3`, where bytes-per-pixel is 4
  for uncompressed and derived from `texture.format` for a `CompressedTexture`. Also
  `describeTextures()` returning the worst offenders, sorted. This is the function the whole
  plan is measured against.
- **`components/three/RendererStats.tsx`** — a fixed-position overlay, mounted under `?debug` in
  all four canvases. Reports, refreshed every 2 s: estimated texture VRAM, `gl.info.memory.geometries`
  / `.textures`, `gl.info.programs.length`, `gl.info.render.triangles` / `.calls`, current DPR,
  effective tier, device class, and a live count of WebGL contexts on the page. Lift the polling
  body out of `components/product/PresentationDiagnostics.tsx:41-45` — the scene-specific room and
  screen-Y lines stay where they are.
- **`scripts/glb-budget.mjs`** — a CLI that prints the table at the top of this document for any
  GLB path, and exits non-zero past a budget. Reuses the chunk reader already written for AR
  (`lib/ar/glbPatch.ts:readGlbJson`) so there is one GLB parser in the repo, not two. Budgets go
  in `lib/perf/budget.ts` alongside the existing AR constants (`AR_GLB_MAX_BYTES`,
  `AR_TRIANGLE_WARN` — same idea, wider scope).

**Verify:** `node scripts/glb-budget.mjs public/test-models/*.glb` reproduces the table above.
Open `/product/test?debug` on the iPhone and read the VRAM figure before it dies.

---

## Phase 1 — The asset pipeline (this is the crash fix)

An offline CLI step you run against source models, checked in as a script plus a doc — never a
`next build` step, because `public/models` is gitignored and copied to the server out of band.

**`scripts/optimize-glb.sh`** wrapping `@gltf-transform/cli`:

```
gltf-transform resize   in.glb t1.glb --width 1024 --height 1024
gltf-transform uastc    t1.glb t2.glb --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}" --level 4 --rdo 4 --zstd 18
gltf-transform etc1s    t2.glb t3.glb --slots "!{normalTexture,occlusionTexture,metallicRoughnessTexture}" --quality 200
gltf-transform prune    t3.glb t4.glb
gltf-transform dedup    t4.glb out.glb
```

Expected on the measured files: room **740 MB → ~52 MB**, leather **284 MB → ~10 MB**,
velvet **50 MB → ~7 MB**. Roughly **14× less texture memory**, and the transfer shrinks too.
KTX2/Basis is the key: it transcodes to ASTC on iOS and **stays compressed in VRAM**, which no
amount of PNG/WebP tuning can do.

Three supporting code changes:

1. **`lib/three/gltfLoaders.ts`** — one place that configures DRACO *and* the KTX2 transcoder.
   Today DRACO is set up three times (`app/product/[id]/ProductPageClient.tsx:36` and
   `components/product/SimpleViewer.tsx:26` at module scope, plus the shared singleton at
   `components/store/ModelLoader.tsx:14-21`), each with a comment about drei otherwise reaching
   for its CDN decoder. Collapse them, then the KTX2 wiring lands once. Ship the basis transcoder
   to `public/basis/` and add `/basis/:path*` to `IMMUTABLE_ASSET_PATHS` in `next.config.mjs`
   (`/textures/*` and `/store-models/*` are missing from that list too).
2. **Per-device model variants.** The manifest already declares `arPath` / `simple.arModel` slots,
   empty since `623eb88`. Generalise the same idea to a `mobilePath`, resolved next to
   `arModelPath()` in `lib/product/presentation.ts`, so a phone can be served a 1024-capped,
   simplified GLB while a desktop keeps the authored one. Falling through to the authored path
   when unset means declaring nothing changes nothing — the pattern `arModelPath` already uses.
3. **`/hdr/200_hdrmaps_com_free_1kk.exr`** — 5,687,982 bytes of **1000×500 FLOAT32 RGBA**, loaded
   by `/simple` *and* `/showroom`, against ~1.8 MB for every other HDR here (1024×512 half PIZ).
   Re-encode to 512×256 half-float: same lighting on a piece of furniture, a fraction of the
   decode heap and the PMREM cost. **New filename required** — `/hdr/:path*` is served
   `immutable, max-age=31536000`. Update both call sites and the manifest together.
   `simple_hdr.exr`, `garage.exr`, `showroom.exr`, `sunset.exr` are referenced by nothing; delete.

Also worth doing while in here: `public/images/covers/leather.png` is a **1.37 MB PNG rendered as a
~40 px swatch chip**. And `velvet.glb`'s 695,572 triangles is 4.6× `AR_TRIANGLE_WARN` — that model
wants `gltf-transform simplify` for its AR stand-in.

**Verify:** run the script over the three test models, re-run `scripts/glb-budget.mjs`, confirm the
numbers. Then `/product/test?debug` on the phone — the VRAM line should read tens of MB, not
hundreds, and the page should stop reloading.

---

## Phase 2 — Close the tier escapes (small diff, independent of Phase 1)

Four one-liners first, biggest relief per byte changed:

1. `lib/config/quality.ts:118` — `high.lampMaxLights: 80` → `8`. `high` currently asks for more
   real point lights than `ultra`'s 24; the stale `quality copy.ts` says 8. Every one of them is
   a per-fragment loop iteration in every store material.
2. `components/store/PostProcessing.tsx:67` — `multisampling={settings.multisampling}` has **no
   touch guard**, unlike `components/product/PresentationPostProcessing.tsx:52`. The composer
   buffer is HalfFloat, 8 B/px, ×5 at 4× MSAA. Copy that file's guard *and* its
   `const smaa = multisampling === 0` line, or touch devices end up with no AA at all.
3. `components/store/Scene.tsx:477-481` — `SunLight` is mounted with no `maxResolution` and
   `samples: 16` straight from JSON, so `/store` allocates a 2048² shadow map on a phone.
   `SunLight` already accepts and documents `maxResolution` (`SunLight.tsx:52-58`); `/store` is
   simply the caller that never passed it. Mirror `PresentationSun.tsx:121-124`.
4. Delete `lib/config/quality copy.ts`.

Then the structural fix — **one tier authority**, `lib/config/deviceTier.ts`:

- Move (verbatim, doc comments included) `PHONE_QUERY`, `TOUCH_QUERY`, `DeviceClass`,
  `readDeviceClass`, `capTier`, `lowerTier`, `SHADOW_BUDGET`, `DEVICE_TIER_CEILING` out of
  `lib/product/presentation.ts`, and **re-export them from there** so no importer changes.
- Add `SURFACE_POLICY: Record<'presentation'|'viewer'|'walkthrough', { ceiling, fallback, honoursStored }>`
  and `resolveTier({ surface, device, manifest, stored, downgrades })`, which is:
  **`stored ?? manifest ?? fallback`, capped to the surface ceiling, then lowered by `downgrades`.**
- **Cap on read, not on write.** Real users already have `ultra` sitting in `car-quality-preset`
  from the shipped build; a cap that only ran in `setPreset` would let those keep escaping forever.
- This closes three holes at once: `simpleViewerQuality` is uncapped today
  (`presentation.ts:507-511`); `QualityChips` on `/simple` writes the shared localStorage key and
  `/store`'s provider then takes the stored branch and **skips its phone downgrade entirely**
  (`QualityContext.tsx:63-67`); and that downgrade uses `window.innerWidth < 768`
  (`QualityContext.tsx:68`) rather than `readDeviceClass()`, so a phone in landscape reads as a
  tablet.

**`hooks/useDeviceClass.ts`** — `useSyncExternalStore` over the two media queries, server snapshot
`'desktop'`. Replaces four hand-rolled copies (`ProductPageClient.tsx:86-98`,
`SimpleViewerClient.tsx:65-72`, `ShowroomStage.tsx:54-63`, `app/view/[id]/ViewerClient.tsx`), each
of which starts at `'desktop'` and corrects in an effect — meaning the first `QualityProvider`
value on a phone is today the desktop tier.

**`contexts/QualityContext.tsx`** — `preset` stops meaning "pin, bypassing everything" and becomes
"what the manifest asked for"; whether it wins is now `SURFACE_POLICY[surface].honoursStored`.
Resolve in the `useState` initialiser and drop the mount effect at `:52-72`. Safe to read
synchronously because every canvas is `dynamic(ssr:false)` and `QualityChips` renders behind
`live`, which is false during SSR — write that invariant down, or someone will "fix" it back.

**`components/product/QualityChips.tsx`** — render only rungs at or below the device ceiling.
Today the control lies: it offers `ultra`, stores `ultra`, and shows `medium`.

**Verify:** on the phone, `/simple` → top rung → navigate to `/store` → `?debug` must report `low`,
not the stored tier. Rotate to landscape on `/store`; the tier must not move.

---

## Phase 3 — Guarantee exactly one live WebGL context

Correcting a common assumption: R3F 8.17 **does** call `forceContextLoss()` — but 500 ms after the
React commit, inside a swallowing `try/catch`
(`node_modules/@react-three/fiber/dist/events-*.esm.js:2080-2105`). What it never calls is
**`gl.dispose()`**, which is what frees the program cache, properties, binding states, render
states and shadow targets. Its `dispose(state)` helper iterates *string keys* and disposes nothing.
Nothing shrinks the canvas backing store. On Safari that combination is what accumulates.

- **`lib/three/releaseRenderer.ts`** — `releaseRenderer(state, { label, debug })`, idempotent via a
  `WeakSet` keyed on `state.gl`. Order matters and each step exists because the next is unsafe
  without it: (1) `setFrameloop('never')` + `gl.setAnimationLoop(null)`; (2) **detach our own
  `webglcontextlost` listener first** — `forceContextLoss()` dispatches a real event, and a
  deliberate teardown would otherwise fire the recovery ladder and burn a downgrade rung;
  (3) `gl.dispose()` — must precede the loss, since after it `deleteProgram`/`deleteTexture` are
  silent no-ops; (4) `gl.forceContextLoss()` in its own try/catch; (5) `canvas.width = canvas.height = 1`
  set directly, *not* via `gl.setSize()`. Read `gl.info` before step 3 or it reports zeros.
  Explicitly **not** here: traversing the scene to dispose geometries — those are drei-cache-owned
  and shared with the next mount on purpose (`ProductPageClient.tsx:196-199` explains what breaks).
- **`hooks/useCanvasLifecycle.ts`** — returns the `onCreated` handler; absorbs the complete
  listener pair from `PresentationScene.tsx:99-131` (the only correct one in the repo) and
  registers the teardown as a `setTimeout(…, 0)` from the Canvas *host's* cleanup. Not a child
  inside the Canvas: React 18 tears deleted subtrees down parent-first, so a child would dispose
  the renderer while `EffectComposer`, `OrbitControls` and `Environment` still have cleanups
  pending. **StrictMode guard:** R3F reuses the same `<canvas>` element across a dev double-mount,
  so skip the teardown when `state.gl.domElement.isConnected` — otherwise dev gets a black canvas.
- **Adopt at:** `PresentationScene.tsx` (deletes ~20 lines), `SimpleViewer.tsx` (replaces the
  handler at `:330-334`, which adds a listener it never removes, has no `restored` pair and reports
  nothing — add an `onContextLost` prop so `/simple`, `/showroom` and `/view` can wire it),
  `store/Scene.tsx` (`:437-439`, which has no listeners at all). Follow-on:
  `components/sections/HeroSection.tsx` matters more than it looks — a client nav from `/` to
  `/store` overlaps the hero's context with the store's.
- **Two AR gates.** `components/store/Scene.tsx:605` mounts `ARProductViewer` — model-viewer, its
  own context, plus its inlined three r183 — while its own `<Canvas>` at `:423` stays mounted.
  `components/showroom/ShowroomFeatured.tsx:280` gates `ShowroomStage` on `canRender` but not on
  `!arOpen`. Both need the gate `/product` and `/simple` already have. For `/store` this drops the
  physics world: capture the player's position into the existing `playerStartPosRef` and feed it
  back as `playerStart` on remount (the prop is already config-driven at `:481`/`:521`).
- `components/store/Scene.tsx:37` imports `ARProductViewer` **statically** — model-viewer's ~1 MB
  is in `/store`'s critical path. Make it `dynamic(ssr:false)` like every other call site.

**Verify:** `?debug` overlay on `/store` — open and close AR five times; geometries, textures and
programs must return to the same baseline each cycle and the context count must stay at 1. The
real signal is behavioural: the tab stops reloading on the third or fourth cycle.

---

## Phase 4 — Shared context-loss recovery

**`hooks/useContextRecovery.ts`** generalises the working ladder at `ProductPageClient.tsx:47-70,
189-208, 238-244`: `{ lost, canvasKey, downgrades, retryable, handleContextLost, retry(purge?), remount() }`.
`retry` takes the cache purge as a *callback* so the "clear the cache only when the files are the
problem" reasoning stays on the only page that has a probe key to bump.

Adopt on all four pages. `/store` needs no special case — because the tier now resolves from
`(surface, device, stored, downgrades)`, it gets a downgrade rung for free, and its `lost` branch
can reuse the styled panel already at `Scene.tsx:630-640` (it has the exact UI it needs, wired to
the wrong signal). `/showroom` folds `lost` into its existing `failed` state so the
`sr-viewer-fallback` plate covers it.

Persist `downgrades` in `sessionStorage` per surface, cleared after ~60 s without a loss. Today the
counter dies with the tab — and on iOS **the OS reloads the tab**, which is precisely the
"crash, reload, crash" loop `DEVICE_TIER_CEILING`'s comment describes.

---

## Phase 5 — Cache and material hygiene

- **Nothing calls `useGLTF.clear` on unmount or route change.** Navigating
  `/showroom → /product/test → /simple` accumulates ~8–9 parsed GLBs for the life of the tab. Clear
  at *page* unmount, not canvas unmount — the AR and retry remounts deliberately keep them.
  `/showroom` is worst: it accumulates a GLB per layer toggle and never clears.
- **`components/store/FurnitureColorApplier.tsx:103,128`** clones materials with no `dispose()`
  anywhere in the file. It already stashes `userData.originalMaterial`, so the cleanup is: restore
  the original, dispose the clone. Model it on `lib/three/layerMaterials.ts:98-125` +
  `disposeTargets` and cite that file, so the two are visibly one pattern.
- **`components/product/SimpleViewer.tsx:116`** includes `settings.anisotropyLevel` in the clone
  `useMemo` deps, so a chip tap re-clones the whole scene and rebuilds every material — on the one
  page that has chips. `FurnitureStack.tsx:55-67` deliberately excludes it; do the same and apply
  anisotropy in a separate effect.

---

## Phase 6 — Dependencies

- **Delete `components/store/SSGIComposer.tsx` and the `realism-effects` dependency.**
  `settings.experimentalSSGI` is `false` on all four presets, so it is unreachable at runtime — and
  it is the *only* thing pinning three to 0.170 (it needs `WebGLMultipleRenderTargets`, removed in
  r172). Drop `ssgiEnabled`/`SSGI_STORAGE_KEY` from the context in the same pass.
- **Remove the `/car` tree** (no such route exists): `components/car/PhotoMode*`, and the
  `three-gpu-pathtracer` dependency. `PartErrorBoundary` is used by `SimpleViewer` and
  `PresentationScene` — move it to `components/three/`. Note `three-mesh-bvh` cannot go: drei
  requires it at module top level.
- **three 0.170 → 0.180.** `postprocessing@6.37.8` peers `three >= 0.157.0 < 0.181.0`; drei 9.122
  and fiber 8.17 have far lower floors. **No React 19 / Next 15 migration needed.** r172 is where
  the Safari WebGL2 context-retention work landed. A grep of app code found zero uses of anything
  removed between r170 and r180 (`RGBELoader`→`HDRLoader`, `CapsuleGeometry.length`→`height`,
  `ParametricGeometries`, and the TSL/WebGPU renames). Watch one thing at build time: r176 removed
  GLTFLoader's automatic WebP/AVIF support detection, and every texture in your models is
  `EXT_texture_webp`. Do this phase last — it reverts with a lockfile revert and nothing else.

---

## Better tools & tech — the standing recommendations

- **KTX2 / Basis Universal is the single highest-leverage technology available to you** and you
  are not using it. It is the only glTF texture format that stays compressed *in VRAM*
  (ASTC on iOS, ETC2 on Android, BC7 on desktop). Phase 1.
- **`@gltf-transform/cli`** as the asset pipeline of record, with `glb-budget` in CI/pre-deploy so
  a 4096² map can never reach production again. The budget check is more valuable than any single
  optimisation, because it makes the regression impossible rather than fixed once.
- **Meshopt (`EXT_meshopt_compression`)** is worth evaluating alongside Draco for the 695k-triangle
  model: decode is far faster and does not stall on a WASM worker pool, which matters on a phone.
  Note `/store`'s `useLoader(GLTFLoader)` path (`ModelLoader.tsx:78-81`) sets DRACO only — a
  meshopt GLB would fail there today.
- **WebGPU** is now Baseline (Safari 26+, Chrome, Edge, Firefox), and three's `WebGPURenderer` has
  been production-ready since r171 with automatic WebGL2 fallback. It is a genuine future
  direction — better memory behaviour, no context-loss cliff — but it needs R3F v9, which needs
  React 19, which needs Next 15+. **Not now.** Getting onto modern three in Phase 6 is the
  prerequisite step, and it is worth doing for its own sake.
- **`useDetectGPU`** (drei) is not used anywhere. A GPU tier probe is a better ceiling input than
  a media query, especially for distinguishing an iPhone 12 from an iPhone 17.
- **`AdaptiveEvents`** is not used either; on `/store` it would cut raycast cost during movement.
- **Lenis + a 60 Hz `gsap.ticker` run on `/store`** alongside a `frameloop="demand"` canvas.
  `LenisProvider.tsx:18-27` already disables this for `/product` with an excellent explanation of
  why; `/store` was never added to `NO_SCROLL_ROUTES`.
- **Serving:** Apache proxies *everything* to Node (`httpdconf.md`), so GLB and HDR bytes go
  through the app process — no `sendfile`, no brotli negotiation. Serve `/public` directly from
  Apache, or put a CDN in front. Also note the port mismatch: the vhost proxies to 3011, pm2 starts
  on 3040.
- **Dead weight to delete while nearby:** `components/store/{ProductBillboard3D,ProductViewer3D,ConfigurableFurniture,TexturedFloor,HomeReflectiveFloor}.tsx`
  (imported by nothing), `public/textures/*` (the floor maps are never mounted —
  `Scene.tsx:566-578` is commented out), and the stale `README.md` / `CAR_*` docs, which describe
  a different product and will mislead the next reader.

---

## Verification

You have an iPhone and no Mac, so the harness is the point:

1. `npx tsc --noEmit` and `npx next build` clean after every phase.
2. `node scripts/glb-budget.mjs` on the real models — the table at the top of this document is the
   before; re-run it as the after.
3. `?debug` overlay on the phone, per page: texture VRAM estimate, geometries / textures /
   programs, context count, effective tier, DPR. Watch it while toggling covers, opening and
   closing AR, and rotating the device — the numbers must come back to the same baseline.
4. The behavioural pass/fail: `/product/test` on the iPhone survives ten cover swaps and five AR
   round-trips without a reload.

## Critical files

- `lib/product/presentation.ts` · `contexts/QualityContext.tsx` · `lib/config/quality.ts`
- `components/product/{PresentationScene,SimpleViewer,PresentationPostProcessing,QualityChips}.tsx`
- `app/product/[id]/ProductPageClient.tsx` · `app/product/[id]/simple/SimpleViewerClient.tsx`
- `components/store/{Scene,PostProcessing,ModelLoader,FurnitureColorApplier}.tsx`
- `components/showroom/ShowroomFeatured.tsx` · `next.config.mjs`