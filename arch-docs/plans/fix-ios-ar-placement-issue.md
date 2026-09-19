# iOS AR floor placement + AR experience

Constraints confirmed: **days, not weeks** · **web-only** (no App Clip, no native) ·
no server-tooling changes. Branch `perf/mobile-gpu-budget`.

## Context

At an exhibition the stand is crowded, so when a visitor taps «مشاهده در واقعیت افزوده»
on an iPhone, Quick Look lands the sofa on a table or a crate instead of the floor.

Researching that turned up **three verified bugs underneath it that matter more than the
placement bug does** — two of which can kill the AR button outright at a venue. The
placement complaint is real, but it is not the thing most likely to ruin the demo.

Everything below was verified this session against upstream source (three r180
`USDZExporter.js`, model-viewer `features/ar.ts`, `features/loading.ts`,
`CachingGLTFLoader.ts`) and against the repo. `node_modules` is not installed here, so
items needing a local bundle grep are marked **VERIFY**.

---

## A. The honest answer on iOS floor placement

**There is no file-side fix. Stop looking for one.**

1. **The anchoring metadata is already there.** three's `USDZExporter.parseAsync` defaults to
   `ar: { anchoring: {type:'plane'}, planeAnchoring: {alignment:'horizontal'} }` with
   `includeAnchoringProperties: true`, and model-viewer's `prepareUSDZ()` passes **only**
   `maxTextureSize`. Every USDZ this app ships already contains
   `preliminary:planeAnchoring:alignment = "horizontal"`. Injecting it is a no-op.
2. **There is no floor token.** Apple's `Preliminary_AnchoringAPI` allows only
   `horizontal | vertical | any`. A table is horizontal.
3. **`ar-placement="floor"` is dead on iOS.** In `ar.ts`, `arPlacement` is read only by the
   WebXR renderer, by Scene Viewer's `enable_vertical_placement`, and by `updateShadow()`.
   The Quick Look path never touches it. `ARProductViewer.tsx:130` is decoration on iOS.
4. **No WebXR in iOS Safari**, so we cannot hit-test and pick the lowest plane ourselves.

Quick Look raycasts from the screen-centre reticle. In a hall the demoer holds the phone at
chest height pointing forward, and the reticle lands on a table 1.5 m away. **The lever is
where the camera is pointing at launch, and how obvious a wrong landing is.** That makes the
UX work the actual fix available to us, not a consolation prize.

---

## B. Fix first — verified bugs that break AR outright

### B1. KTX2 textures make Quick Look throw. Highest priority.
three's `USDZExporter.parseAsync`:

```js
if ( texture.isCompressedTexture === true ) {
  if ( this.textureUtils === null ) {
    throw new Error( 'THREE.USDZExporter: setTextureUtils() must be called to process compressed textures.' );
  }
}
```

model-viewer's `prepareUSDZ()` does `new USDZExporter()` and **never calls
`setTextureUtils`** — `WebGLTextureUtils` is not even imported in `ar.ts`. So **any GLB
carrying `KHR_texture_basisu` that reaches Quick Look without an `ios-src` throws during
USDZ generation.**

This lands *after* `openAR`'s HEAD probe passes, *after* `setShowAR(true)`, *after* the R3F
canvas unmounts — so the fallback ladder at `SimpleViewerClient.tsx:277-286` cannot see it.
The customer taps the AR button and nothing happens.

`furniture-presentation.json:36,49` point at `/ktx-optimized/…` files, and `arModel` at
`:199` is `""`, so `arModelPath()` falls through to exactly those. **It also explains the
"sometimes" in your report** — the products where iOS AR *works* are the ones whose AR asset
is not KTX2, and those are the only ones where you can observe a placement problem at all.

**First action, before any of this plan: find out which products are affected.**
```bash
npm run glb:budget            # flag KHR_texture_basisu in extensionsUsed
```
Then, two fixes:
- **Now (~20 lines):** `readGlbJson` in `app/api/ar/[key]/model.glb/route.ts:100` already has
  `extensionsUsed`. Emit `X-AR-Basisu: 1`; in `openAR`'s HEAD handler
  (`SimpleViewerClient.tsx:249`), `isIOS() && header` → `throw` into the existing catch, which
  already sets `arStale` and falls back. Turns a dead button into the designed fallback.
- **Properly:** author the `arPath` stand-ins with **uncompressed textures** (§C4).

### B2. model-viewer fetches its decoders from `gstatic.com`.
```
DEFAULT_DRACO_DECODER_LOCATION   = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/'
DEFAULT_KTX2_TRANSCODER_LOCATION = 'https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/'
```
The repo never calls `setDRACODecoderLocation` / `setKTX2TranscoderLocation`. Your assets are
Draco+KTX2, this is a Persian-market storefront, and the demo runs on venue wifi. If gstatic
is slow or blocked, the AR button is dead on **both** platforms — Quick Look included, since
the USDZ is built from the decoded scene.

The repo already ships `/public/draco/` and `/public/basis/`, cached immutably
(`next.config.mjs:14`). Fix is one effect in `ARProductViewer.tsx` after the side-effect
import at `:6` — `await customElements.whenDefined('model-viewer')`, then set
`dracoDecoderLocation = '/draco/'` and `ktx2TranscoderLocation = '/basis/'` on the
constructor. **VERIFY** model-viewer's inlined three r183 accepts the shipped
`basis_transcoder.wasm`.

### B3. `ProductPageClient.closeAR` throws away the customer's colours.
`ProductPageClient.tsx:216-219` re-runs `initProduct(… defaultPaint(config) …)` on close.
`/simple`'s `closeAR` (`SimpleViewerClient.tsx:299`) correctly does not. Delete the reset.

---

## C. Floor placement — what will actually change what the visitor sees

### C1. Pre-AR aiming coach (iOS and Android). Half a day, no risk.
New `components/ar/ARFloorCoach.tsx`. Render our own overlay and only call `mv.activateAR()`
after the visitor taps «آماده‌ام»:

- گوشی را به سمت **کف اتاق** بگیرید، ۱ تا ۲ متر جلوتر — از میز و مبل فاصله بگیرید
- اگر مبل روی میز قرار گرفت، **آن را با انگشت روی کف بکشید**

The drag hint matters on its own: Quick Look's drag-to-reposition always works and almost no
visitor knows it exists. Add the same two lines to the AR tab copy in
`components/product/ProductSheet.tsx:296-304`.

### C2. Make `ar-scale="fixed"` the default. Trivial.
`fixed` gives `#allowsContentScaling=0` on Quick Look and `resizable=false` on Scene Viewer.
It does **not** change placement — it makes a wrong placement *legible*, because a 240 cm
sofa at true size parked on a coffee table is unmistakable, where an auto-scaled one shrinks
to look plausible. That legibility is most of the fix.

Flip the default at `ARProductViewer.tsx:34` from `'auto'` to `'fixed'` and make `'auto'`
require a reason. Gaps today: `components/store/Scene.tsx:649` (a visitor can pinch-resize a
wardrobe) and `components/ar/HomeARViewer.tsx:111`.

### C3. Visible contact disc in the AR asset. Authoring, zero code.
A piece with no contact shadow reads as *floating*, which is what lets a tabletop landing
pass unnoticed. Author a thin unlit alpha-blended disc with a baked radial shadow at the
floor contact, slightly wider than the footprint, lifted ~3 mm. On a table it overhangs
visibly. Do this in the `arPath` models — the manifest field already exists and is empty, so
nothing regresses.

⚠️ `prepareUSDZ()` hides `scene.shadow` but **not** `bakedShadows`. You are safe today only
because `shadow-intensity={1}` (`ARProductViewer.tsx:142`) makes model-viewer hide them. Do
not set `shadow-intensity` to 0 or the disc gets exported twice and inflates the bbox.

### C4. Author the AR stand-ins. The one fix that compounds.
Every `arPath`/`arModel` in `public/config/furniture-presentation.json` (`:23, :37, :50,
:199`) is `""`, while velvet is 695,572 triangles (`mobile-3d-op-roadmap.md:107`) — 4.6×
`AR_TRIANGLE_WARN`. three writes geometry as **decimal text into an uncompressed zip**
(~110-125 bytes/triangle), so 150 k triangles is ~18 MB of ASCII before a single pixel.

Add an `AR=1` mode to `scripts/optimize-glb.sh` that keeps resize/prune/dedup/join, adds
`gltf-transform simplify`, and **drops `uastc`/`etc1s` entirely** (per B1):

| Axis | Target | Ceiling |
|---|---|---|
| Triangles | **≤ 60 k** | 100 k |
| Textures | ≤ 3 (baseColor, ORM, normal) | 4 |
| Texture edge | 1024 base, 512 ORM/normal | 1024 |
| Codec | **PNG/JPEG — never KTX2** | — |
| GLB on disk | ≤ 4 MB | 8 MB |

Start with **one** asset (velvet, `--ratio 0.086`) to prove the pipeline before the show.
Gate it with an `--ar` mode in `scripts/glb-budget.mjs` that fails on `KHR_texture_basisu`.

### C5. Model origin + metres assertion. Cheap, prevents silent disasters.
Quick Look places the model so its **origin** meets the anchor, and `prepareUSDZ` discards the
export group's own position — so the authored origin is what ships. A piece whose origin is at
its centroid lands half-buried, and that gets blamed on plane detection.

Separately, `ar-scale="fixed"` makes authored units load-bearing: a sofa exported in
centimetres becomes a 200-metre sofa with `resizable=false` and no way out.
`PresentationLighting.tsx:167-172` asserts this for the *room* and nothing does it for the
*piece*. Add both checks to `scripts/glb-budget.mjs` (min-Y ≈ 0, longest edge 0.2-4 m).

---

## D. Android — where a real fix exists

1. **Consider `scene-viewer webxr quick-look` instead of the current WebXR-first order.**
   model-viewer's WebXR fires one viewer-space hit-test straight ahead at session start and
   re-hit-tests from the touch point on drag — so the sofa hops onto a coffee table happily.
   Scene Viewer has real plane detection, a scan/coaching flow, depth occlusion and localised
   UI. For floor-locked furniture it is better than anything reachable from the page. **Test
   on device before committing** — you lose the in-page session.
2. **`disable_occlusion=false`, `link`, `title`.** model-viewer seeds Scene Viewer's intent
   params from the **`src` URL's query string**, and the route ignores unknown params
   (`route.ts:55-57`), so this is ~10 lines in `arModelUrl()` (`lib/ar/arSource.ts:96`). `link`
   gives the visitor a chip back to your product page from inside their living room — the best
   cheap exhibition feature on Android. Keep the HEAD probe and the `src` on the *same* string
   or the route's LRU hit rate halves.
3. **Android keeps KTX2+Draco** — no USDZ blow-up. The low-poly stand-in should be the *iOS*
   path only; `arModelPath` currently returns one path for both.

---

## E. Exhibition features (the side project you asked about)

**The unlock:** model-viewer copies the `src` URL's hash onto the generated Quick Look URL
before appending its own params:

```js
if (srcUrl.hash) { modelUrl.hash = srcUrl.hash; }
if (this.arScale === 'fixed') { modelUrl.hash += 'allowsContentScaling=0'; }
```

So **the whole Quick Look banner surface is reachable today** — by putting a hash on `src` —
without `ios-src` and without giving up live-configured USDZ generation. `ar.ts` also already
re-dispatches Apple's `_apple_ar_quicklook_button_tapped` as a **`quick-look-button-tapped`**
DOM event; nothing in this repo listens. Ranked by exhibition value:

1. **Configuration-in-the-URL.** `encodePaint`/`decodePaint` (`arSource.ts:45-79`) already
   produce a deterministic round-trippable string, but nothing hydrates `usePresentation` from
   `?layer=&zone=&paint=`. Wire that one hydration — **half a day, and it is the precondition
   for everything below.**
2. **QR handoff, kiosk → visitor's phone.** The configured piece leaves the booth in their
   pocket. Nothing else on this list changes an exhibition outcome as much.
3. **`#canonicalWebPageURL=`** — Quick Look's Share sheet then shares your product page
   instead of a 40 MB `.usdz`. One string.
4. **`#callToAction=` + `#price=`** — «قیمت / درخواست مشاوره» *inside* the AR view while the
   sofa stands in the room, wired to `quick-look-button-tapped`. Prices already in
   `products.json`. **VERIFY** Apple requires `canonicalWebPageURL` alongside.
5. **`#custom=` + `#customHeight=`** — a same-origin RTL HTML banner (Vazir, swatch chips,
   Telegram button) via a new `/ar-banner/[key]` route. The native banner handles Persian
   poorly; this doesn't. **VERIFY** `#custom` accepts a relative URL.
6. **`title`/`link` on Scene Viewer** — the Android equivalent of 3+4, already free (§D2).
7. **People occlusion** — automatic on A12+ in Quick Look. No code. Free.
8. **Web Share / `mailto:` configuration** — ~15 lines each once (1) exists.

**Skip:** Apple Pay (no Iranian rails), USDZ audio and `preliminary:behaviors` animations
(both require `ios-src`, which forfeits live colour), `sound`, `mode=ar_only` (removes Scene
Viewer's graceful 3D fallback), WebXR DOM overlay (no public slot in 4.3).

---

## F. Smaller findings, fold into the above

- `Scene.tsx:651` `usdzPath={arProduct.usdzPath || ''}` — **not** the bug the comment fears
  (`''` is falsy, the guard drops it). The real problem: it is the only call site that trusts
  an authored USDZ unconditionally, so iOS silently shows the **uncustomised** model when the
  file exists and generates when it doesn't. Use the equality guard `ProductPageClient.tsx:295`
  already uses, and pass `undefined`.
- `ARProductViewer.tsx:190-207` — the AR instructions are `slot="poster"`, and with
  `reveal="auto"` + `seamless-poster` the poster is dismissed the instant the model loads.
  **Nobody has ever read them.** Move to a normal child.
- `ARProductViewer.tsx:44-73` — effect keyed on `[productName]`, not `[glbPath]`; `isLoading`
  never resets on `src` change. Bites `Scene.tsx`, which swaps `arProduct` under a live element.
- `ARProductViewer.tsx:51` — `canActivateAR` is synced only on `load`/`ar-status`, but mode
  selection is async and fires no event when it settles. Losing that race hides the AR button
  on a capable phone. Render the button unconditionally; model-viewer manages the slot itself.
- `getARModeName()` (`lib/device-utils.ts:37-41`) is a UA sniff shown to the customer at
  `ARProductViewer.tsx:200`. Drive the copy off the reflected `ar-status` / `ar-tracking`
  attributes instead — surfacing `not-tracking` as «دوربین را روی کف اتاق بگیرید» is nearly
  free and directly serves §C1.
- `budget.ts` measures the wrong axis for iOS: `AR_GLB_MAX_BYTES` is a *transfer* budget, but
  USDZ size is a function of triangles and texels — a 12 MB KTX2/Draco GLB is the worst case.
  Worse, `SimpleViewerClient.tsx:251` counts triangles on `source.current` (what the **canvas**
  draws), not on the file `arModelPath()` resolves to — so the guard goes blind the day an
  `arPath` is authored. Emit `X-AR-Triangles` from the route; add an iOS-only
  `estimateUsdzBytes()` budget.
- `route.ts:66` keys the LRU on the whole query string — key on `(key, layer, zone, paint)`
  before adding `title`/`link`.
- `HomeARViewer.tsx` sets `ios-src` unconditionally and omits `ar-usdz-max-texture-size` (so
  `'auto'` → `Infinity` → the documented crash) and `xr-environment`. Delete it and use
  `ARProductViewer`.
- Pin `three-stdlib` (imported at `lib/three/gltfLoaders.ts:26` — the repo's only source of
  `DRACOLoader`/`KTX2Loader` — but resolved transitively via drei).
- Delete dead `ProductViewer3D.tsx` / `ConfigurableFurniture.tsx`; migrate
  `ConfigurableCar.tsx:17` (live on the homepage hero) to `extendGltfLoader`.
- Doc pass: `AR_PIPELINE.md:17,34,171,172,173,177,178` (three 0.170; a deleted `ARCarViewer`;
  a `lib/three/exportConfigured.ts` that no longer exists; §"Not on this pipeline" is wholly
  obsolete; §"Deliberately not done" is overturned by B1), `HomeARViewer.tsx:6`,
  `FURNITURE_SETUP_GUIDE.md:182,184`.

---

## G. Live colour on `/product/[id]` (you asked for this specifically)

`ProductPageClient.tsx:124` uses a **static** `arModelPath()`, so the chosen colour never
reaches AR. `AR_PIPELINE.md:171` explains this as "a byte patch cannot merge three GLBs" — but
that applies to the on-screen layered scene; `arModelPath` already resolves to a **single
file**. So the page can adopt `/api/ar` as-is.

Extract `openAR` (`SimpleViewerClient.tsx:240-291`) into `hooks/useArSource.ts` — HEAD probe,
budget checks, cache eviction, `arStale` fallback — and call it from `ProductPageClient` and
`ShowroomFeatured` too.

**One blocker:** `/simple` shows one layer at a time and sends a single `zone`; the layered
page shows all three at once. Make `zone` repeatable (`?zone=wood&zone=cover&zone=cushion`) and
merge the edit maps in the route — `zoneEditsFromJson` (`glbPatch.ts:211`) is already a pure
`(json, zone, paint) → Map`, so merging is ~5 lines, and `decodePaint` already carries all
three zones. Keep the single-zone form so `/simple`'s immutable cache keys don't move.

---

## Order of work

**Day 1 (correctness — do before anything else):** B1 KTX2 guard · B2 local decoders ·
B3 colour reset · C2 `fixed` default · `Scene.tsx:651`.
**Day 2 (the floor problem):** C1 coach + drag hint · C5 assertions · poster-slot fix ·
`canActivateAR` race.
**Day 3 (assets + Android):** C4 one `arPath` for velvet, with C3's disc authored in ·
D2 `title`/`link`/occlusion.
**If time remains:** E1 config-in-URL → E2 QR handoff → E3 `canonicalWebPageURL`.
**After the show:** G, then D1 on real devices.

## Verification

- `npm install` first — `node_modules` is absent, and every **VERIFY** item needs a bundle grep:
  ```bash
  grep -o 'gstatic.com[^"]\{0,80\}'          node_modules/@google/model-viewer/dist/model-viewer.min.js
  grep -o 'setTextureUtils'                  node_modules/@google/model-viewer/dist/model-viewer.min.js  # expect none
  grep -o 'allowsContentScaling[^;]\{0,80\}' node_modules/@google/model-viewer/dist/model-viewer.min.js
  ```
- `npm run glb:budget` over every asset `arModelPath()` can resolve → **which carry
  `KHR_texture_basisu`** (that is the B1 blast radius), triangles, min-Y ≈ 0, metres.
- `curl -sI 'http://localhost:3000/api/ar/test/model.glb?layer=…&zone=cover&paint=…'` → expect
  `model/gltf-binary`, unchanged BIN size, and the new `X-AR-Basisu` / `X-AR-Triangles`.
- Crash regression (`AR_PIPELINE.md:195`): removing `ar-usdz-max-texture-size` must still
  reproduce the Quick Look crash; 1024 must still fix it.
- **The floor test — reproduce it deliberately:** stand at a desk, point at the desk, tap AR.
  *Before:* sofa on the desk, plausibly scaled. *After:* the coach sends you to the floor; at
  fixed scale the desk placement is absurd; the disc overhangs the edge.
- **Venue-wifi test:** block `gstatic.com` in devtools and open AR. Must still work (B2).
- Devices: one iPhone (Quick Look), one ARCore Android (WebXR), one without (Scene Viewer).

## Not doing

Injecting `preliminary:anchoring:*` (already written by default — verified), waiting on
google/model-viewer#3989 (no ARQL API behind it), an invisible oversized footprint plane
(ARKit does not reject planes smaller than the object — sofas overhang coffee tables all day;
you get an inflated bbox and a floating model), forking `ARRenderer` or `@react-three/xr`
(the placement decision sits behind unregistered `Symbol` keys), server-side USDZ, an ARKit
App Clip, RoomPlan, WebXR on iOS.