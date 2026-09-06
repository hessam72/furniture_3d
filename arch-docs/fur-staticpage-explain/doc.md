# Documentation task (new, post-implementation)

The feature below is already built, committed (`c830087`), and pushed to
`furncher`. The user now wants a `.md` doc explaining what it is and how it
works — a reference doc, not new code.


**Plan:** write `arch-docs/PRODUCT_PRESENTATION_PAGE.md` covering:
1. What the page is and why it exists (the Context section below, condensed)
2. Route and file map (the file manifest below)
3. Data model — the `furniture-presentation.json` shape, and how it joins
   with `products.json`
4. Layer system — how the 3 GLBs stack, how zones are resolved, centering
5. Camera/gesture model — static camera, auto-framing math, drag-to-spin,
   pinch/wheel dolly
6. Cover reveal — the clipping-plane wipe mechanics
7. Color system — the 3-zone paint pipeline (ported from `ConfigurableCar`)
8. Performance — what's stripped vs. the showroom, why
9. Adding a new product — the asset checklist (already drafted in
   `arch-docs/FURNITURE_SETUP_GUIDE.md`'s "Layered presentation assets"
   section from this session — cross-reference rather than duplicate)
10. Debugging — `?debug=1` output

This is a pure documentation task on already-shipped code — no exploration
or design agents needed, everything below is drawn from the implementation
just completed in this session.

No verification beyond a readability pass; not a code change.

---

# Product Presentation Page — `/product/[id]` (original implementation plan, kept for reference)

## Context

The showroom (`/store`) is a walkable first-person space: Rapier physics, joystick, POV camera, sun + PCSS soft shadows, reflective floor, a whole mall GLB. That frame budget is spent on the *room*, so any single piece of furniture inside it renders at a fraction of the quality it could — and the user has no way to study one product closely.

This adds a dedicated presentation route that spends the entire budget on **one** piece. Everything that exists to support walking around a room is removed, and reinvested in the product. The page also introduces two things the showroom cannot express: a **layered model** (wood frame → soft parts → swappable cover material) that can be stepped through and exploded, and **three independent color zones** instead of the showroom's single global color.

It is a sibling of `/car/[id]`, which already proved the pattern. Three components written for that page are currently unreferenced dead code and together are ~90% of the interaction layer: `components/car/RotatableCar.tsx`, `components/store/ProductViewer3D.tsx`, `components/store/ConfigurableFurniture.tsx`.

## Decisions (settled)

| | |
|---|---|
| Route | `/product/[id]`, `id` = the **`products.json` object key** (`test`, `dining-chair`, …) |
| Layers | `frame.glb` (wood) · `soft.glb` (fiber + cushions) · `cover-<material>.glb` (variants) |
| Color zones | `wood` (4 fixed tones) · `cover` · `cushion` — independent swatch rows, lerped |
| Cover reveal | Bottom-up **clipping-plane wipe**, ~900 ms |
| Layer section | Cumulative stepper **and** an explode toggle |
| Environment | New trimmed, front-facing-only presentation-room GLB |
| Grounding | **None** — no sun, no shadow maps, no contact shadow, no reflective floor |
| AR | Existing `ARProductViewer` + static `glbPath`/`usdzPath`; does not reflect live config |

---

## 1. Data model

New manifest **`public/config/furniture-layers.json`**, keyed by the same `products.json` key.

*Why a separate file, not a `layers` block inside `products.json`:* `products.json` is imported at **build time** by `app/ar/page.tsx` and fetched at runtime by `Scene.tsx` and `ProductInteraction.tsx`; every consumer would pay for the layer data. This also matches the existing `public/config/car-parts.json` precedent — variant manifests live apart from the product record.

```jsonc
{
  "test": {
    "layers": {
      "frame": { "url": "/models/furniture/test/frame.glb",
                 "label": "اسکلت چوبی", "desc": "چوب راش خشک‌شده" },
      "soft":  { "url": "/models/furniture/test/soft.glb",
                 "label": "الیاف و پارچه پایه", "desc": "فوم سرد تراکم ۳۵" }
    },
    "covers": [
      { "id": "leather", "name": "چرم طبیعی",
        "url": "/models/furniture/test/cover-leather.glb",
        "thumbnail": "/images/covers/leather.jpg", "priceDelta": 4500000,
        "material": { "roughness": 0.38, "metalness": 0 },
        "palette": [ { "name": "قهوه‌ای تلخ", "hex": "#4A2C17" } ] }
    ],
    "woodTones": [
      { "id": "oak",    "name": "بلوط طبیعی", "hex": "#C19A6B", "roughness": 0.55 },
      { "id": "ash",    "name": "ون روشن",    "hex": "#DCC7A1", "roughness": 0.60 },
      { "id": "walnut", "name": "گردوی تیره",  "hex": "#5C4033", "roughness": 0.50 },
      { "id": "wenge",  "name": "ونگه",        "hex": "#2E211B", "roughness": 0.45 }
    ],
    "cushionPalette": [ { "name": "کرم", "hex": "#E8DCC8" } ],
    "view": { "position": [0, 1.15, 3.4], "target": [0, 0.55, 0],
              "fov": 40, "minDistance": 1.8, "maxDistance": 6.0 },
    "room": "/store-models/present/booth.glb"
  }
}
```

**Zone resolution — the key simplification:** the *layer file is the zone*. Meshes from `frame.glb` are `wood`, meshes from `cover-*.glb` are `cover`. Only `soft.glb` needs name matching, to split `cushion` (mesh name contains `cushion`) from the fixed fiber base. This is far more robust than the showroom's whole-model keyword matching in `components/store/FurnitureColorApplier.tsx:75-115`. A `userData.paintZone` on a mesh still overrides, matching `components/car/ConfigurableCar.tsx:104`.

**Blender authoring contract** (goes in `arch-docs/FURNITURE_SETUP_GUIDE.md`):
- All layer GLBs exported from **one scene at a shared world origin**, no per-file recentering, no applied transforms that differ between files.
- Cushion meshes in `soft.glb` named `cushion_*`.
- `MeshStandardMaterial`/`MeshPhysicalMaterial`, no baked color textures on colorable surfaces.
- The room GLB is authored front-facing only — no geometry behind the static camera.

---

## 2. File manifest

**New**

| Path | Purpose |
|---|---|
| `app/product/[id]/page.tsx` | RSC shell: `generateStaticParams` over `products.json` keys, `generateMetadata`, `notFound()`. Copy of `app/car/[id]/page.tsx:1-30`. |
| `app/product/[id]/ProductPageClient.tsx` | `QualityProvider`, dynamic `ssr:false` scene import, cache warming, error-recovery overlay, UI composition. Copy of `app/car/[id]/CarPageClient.tsx`. |
| `app/product/[id]/not-found.tsx` | Styled 404. |
| `components/product/PresentationScene.tsx` | The `<Canvas>`. |
| `components/product/PresentationLighting.tsx` | Studio rig with **no** `castShadow`. |
| `components/product/PresentationRoom.tsx` | Trimmed room GLB, graceful when absent. |
| `components/product/LayeredFurniture.tsx` | Owns the shared centering offset, rotation group, explode offsets, mounts layers. |
| `components/product/FurnitureLayer.tsx` | One GLB layer: clone, material clone + zone tagging, color lerp, clip plane. |
| `components/product/StaticCameraRig.tsx` | Static camera + clamped pinch/wheel dolly + drag-to-rotate input. |
| `components/product/ProductSheet.tsx` | Bottom sheet, 4 tabs. |
| `components/product/LayerStepper.tsx` | Cumulative stepper + explode toggle. |
| `components/product/ZoneSwatches.tsx` | Three labeled swatch rows. |
| `components/product/CoverGrid.tsx` | Cover-variant thumbnail grid. |
| `components/product/ProductTopBar.tsx` | Back-to-showroom, name, like/cart, AR. |
| `stores/productPresentationStore.ts` | Zone paint, cover, step, explode. |
| `lib/product/layers.ts` | Manifest types + `resolveProductLayers(key)`. |
| `public/config/furniture-layers.json` | The manifest above. |

**Modified**

- `components/store/ProductDrawer.tsx` — add a «نمایش با کیفیت بالا» button linking to `/product/<key>`. The component currently only receives `ProductData`, which carries `id` (`"modern-sofa-01"`), *not* the key (`"test"`); add a `productKey` prop.
- `components/store/Scene.tsx` — the key is `pending.sceneObject` inside `revealProduct` (`Scene.tsx:346-361`), and it is **not** currently stored — `focusedName` holds a display name and `focusedId` a catalogue id. Add a `focusedSceneObject` state set alongside them, and pass it to `ProductDrawer`.
- `arch-docs/FURNITURE_SETUP_GUIDE.md` — append the layer authoring contract.

---

## 3. Store — `stores/productPresentationStore.ts`

Mirrors `stores/carConfigStore.ts` conventions (zustand + `devtools`, a `paintInitialized` gate so the first coat is instant and later changes blend).

```ts
export type FurnitureZone = 'wood' | 'cover' | 'cushion'
export interface ZonePaint { color: string; roughness: number; metalness: number }
export type ZonePaintConfig = Record<FurnitureZone, ZonePaint>
export type LayerStep = 'frame' | 'soft' | 'cover'   // cumulative, in order

// state
productKey: string | null
zones: ZonePaintConfig
activeZone: FurnitureZone
paintInitialized: boolean
coverId: string | null
outgoingCoverId: string | null      // kept mounted during a swap wipe
step: LayerStep
exploded: boolean
autoRotate: boolean

// actions
hydrate(key, manifest)   // seeds zones from woodTones[0] / covers[0].palette[0] / cushionPalette[0]
setZonePaint(patch: Partial<ZonePaint>, zone?)   // defaults to activeZone
setActiveZone(zone)
initializePaint()
selectCover(id)          // sets outgoingCoverId, drives the swap wipe
clearOutgoingCover()
setStep(step)
toggleExplode()
reset()
```

---

## 4. Layer stacking — `LayeredFurniture.tsx` / `FurnitureLayer.tsx`

- Each layer is its own `useGLTF(url)` inside its own `<Suspense>` + `components/car/PartErrorBoundary.tsx`, so a missing `cover-velvet.glb` degrades to "that variant unavailable" instead of white-screening.
- **Alignment is the one thing that must not be copied from the existing components.** `RotatableCar.tsx:47-49`, `ProductViewer3D.tsx:56-71` and `ConfigurableFurniture.tsx` all center *per model* via their own `Box3`. Doing that per layer would misalign the stack. Instead: `LayeredFurniture` computes the offset **once from the frame layer's bbox** (`center.x`, `box.min.y`, `center.z`) and applies it to the shared parent group. Every layer renders as `<primitive>` at identity transform.
- That frame bbox is also the source for the clip-wipe range and the explode offsets, so it's computed once and passed down as a prop.
- Per layer, a single `useMemo` clones the GLB scene, runs `prepareCarObject` from `lib/three/prepareCarMaterial.ts` (with `envMapIntensity`/`anisotropy` from `useQuality()`), clones each colorable material and collects `PaintTarget[] = { material, zone }` — same structure as `ConfigurableCar.tsx:76-112`.
- Color application copies `ConfigurableCar.tsx:143-207` verbatim in shape: a `useEffect` for static props + instant first coat gated on `paintInitialized`, a `useFrame` lerping with `d = 1 - Math.exp(-10 * delta)` and `MathUtils.damp` for roughness/metalness, `invalidate()` while moving, flag cleared when settled.
- Cleanup `useEffect` disposes **only the cloned materials** (`ConfigurableCar.tsx:210-214`, `DynamicPart.disposeClone`); geometry stays in drei's cache.
- **Explode**: each layer group's `position.y` targets `index * gap` (frame 0, soft +0.22, cover +0.44 × bbox height factor) when `exploded`, damped in `useFrame` with `invalidate()`. Labels are drei `<Html>` anchored per layer, visible only while exploded.
- **Stepper**: `step` controls which layers are mounted. Layers appearing get the same reveal wipe; layers leaving wipe out then unmount.

---

## 5. Cover reveal — clipping-plane wipe

- Enable once, in the scene's `onCreated`: `state.gl.localClippingEnabled = true`.
- One `THREE.Plane(new THREE.Vector3(0, -1, 0), c)` per cover layer instance. Three keeps points where `normal·p + c >= 0` → with normal `(0,-1,0)` that is `y <= c`, so animating `c` from `bbox.min.y` to `bbox.max.y` reveals bottom-up. Assign the *same plane instance* to `material.clippingPlanes = [plane]` on every cloned material in that layer. Mutating `plane.constant` needs no `needsUpdate`.
- **Driver is `useFrame`, not gsap.** gsap's ticker does not drive R3F under `frameloop="demand"` — a gsap tween would need `invalidate()` in its `onUpdate` anyway. A `useFrame` with a progress ref, `easeInOutCubic`, and `invalidate()` while `progress < 1` is simpler and matches the paint-lerp precedent already in the codebase.
- **Swap sequencing** (`selectCover(next)`): outgoing cover wipes **down** (`c`: max→min, 450 ms) while still mounted via `outgoingCoverId`; on completion it calls `clearOutgoingCover()` and unmounts; the incoming cover mounts at `c = min` and wipes **up** (450 ms). Total ≈ 900 ms.
- **Interactions:** while `exploded`, the wipe is skipped and `c` is pinned to `max` — a wipe reads as broken on separated layers. Color lerping is orthogonal (clipping is geometric); both `useFrame`s call `invalidate()`, which is idempotent.
- Only the cover layer clips. Frame and soft never receive clipping planes, so the "material grows over the wireframe" reading is preserved.

---

## 6. Camera + interaction — `StaticCameraRig.tsx`

The camera **never rotates and never orbits**. It sits at `view.position`, looks at `view.target`; only its distance along `(position − target)` changes.

- Listeners attach to `gl.domElement`, not the R3F event system — multi-touch has to be visible. Precedent: `components/store/POVCamera.tsx` attaches directly for the same reason. Canvas gets `style={{ touchAction: 'none' }}` (as `Scene.tsx:417` already does).
- **1 pointer → model rotates.** `targetRotationY += dx * 0.01` (from `RotatableCar.tsx:67`). Vertical drag → clamped **X-axis tilt ±18°**, *not* `RotatableCar`'s vertical position lift — furniture sitting on a floor should not levitate.
- **2 pointers → camera dolly.** Track the initial pinch distance, `distance *= startDist / currDist`, clamp to `[view.minDistance, view.maxDistance]`.
- **The pinch→jump bug to avoid:** suppress rotation entirely while two pointers are down, and reset `previousPointer` whenever the active pointer count changes, so lifting one finger doesn't feed a huge stale delta into the rotation.
- Desktop `wheel` → the same clamped dolly, with `preventDefault`.
- All damping in `useFrame` with `invalidate()` while `|target − current| > ε`; stop calling when settled. **`RotatableCar.tsx:88-102` never calls `invalidate()`** — under `frameloop="demand"` its damping would render one frame and freeze. Do not inherit that.
- Optional slow auto-rotate while idle, cancelled on first interaction (`ProductViewer3D.tsx:27-31` precedent, but gated on `autoRotate` and `invalidate()`-driven).
- The bottom sheet is a sibling DOM layer with its own framer-motion drag; since canvas listeners are on `gl.domElement`, sheet drags never reach the model. Keep the sheet backdrop-less, the deliberate choice `ProductDrawer.tsx:39-40` documents.

---

## 7. UI composition

**`ProductSheet.tsx`** — same shell as `components/store/ProductDrawer.tsx` (identical `SPRING`, `bg-[var(--surface-2)]/85 backdrop-blur-2xl`, rounded-t-[28px], grab handle, `drag="y"` dismiss at `offset.y > 90 || velocity.y > 600`, RTL, `.font-persian`), with four tabs:

| Tab | Content |
|---|---|
| `مشخصات` | dimensions / material / weight / capacity, `detailedDescription`, `fabricMaterials`, price via `faPrice` from `lib/store/catalog.ts` |
| `رنگ‌بندی` | `ZoneSwatches` — three labeled rows (چوب / رویه / کوسن), each wired to `setZonePaint({color, roughness}, zone)`. Active ring reuses the `layoutId="swatch-ring"` motion trick from `ProductDrawer.tsx:127-132` |
| `لایه‌ها` | `CoverGrid` (thumbnail + name + price delta, gold `#d4af37` selected state from `components/car/PartsGrid.tsx`) + `LayerStepper` (3 segmented steps) + explode toggle |
| `ابعاد` | dimension table |

AR is a button in `ProductTopBar`, not a tab, with a one-line note: «نمای واقعیت افزوده، پیکربندی فعلی را نشان نمی‌دهد».

**`ProductTopBar.tsx`** — back-to-showroom (`router.push('/store')`), product name chip, like/cart from `stores/storeShopStore.ts` (those are keyed on **catalog ids**, so resolve via `findCatalogItemBySceneObject` in `lib/store/catalog.ts`), AR button gated on `isARCapable()` from `lib/device-utils.ts`.

---

## 8. Performance

Dropped vs `/store`: Rapier `<Physics>`, `PhysicsSystem`, `PlayerController`, `POVCamera`, `Joystick`/nipplejs, `ProductFocusCamera`, `ProductInteraction` raycast, `LampLights`, `SunLight`, `ShadowSystem`, `ReflectiveFloor`, multi-file `ModelLoader`, `AudioPlayer`, `CategoryBar`.

- **`shadows` prop omitted from `<Canvas>`** → no shadow map allocated, no shadow passes. No `castShadow` anywhere in `PresentationLighting` (this is why it can't just reuse `components/car/CarLighting.tsx`, whose key light casts).
- `camera.far` 1000 → **30**; the room is a booth.
- `frameloop="demand"`, `dpr` from `clampDprToBudget(settings.dpr) * perfScale` with `<PerfLadder>` — same as `CarTuningScene.tsx:44-49,74`.
- Tone mapping `NeutralToneMapping` @ exposure 1.0 (the car page's choice — hue-stable, which matters when the whole page is about judging fabric color).
- Post: reuse `components/store/PostProcessing.tsx` unchanged — it is already tier-gated (SMAA + Bloom + Vignette always, N8AO on high/ultra, lazy SSGI on ultra opt-in).
- Because there are no shadow or reflection passes, spend the reclaimed budget on IBL: `envResolution` one tier up and `envIntensity` ≈ 1.0 on the product materials.
- Preload in `ProductPageClient` before mount, per `CarPageClient.tsx:62-75`: `useGLTF.setDecoderPath('/draco/')`, `useGLTF.preload` for frame + soft + default cover + room, `useEnvironment.preload({ files: '/hdr/main_hdr.exr' })`.
- **On "nothing behind the camera":** three.js already frustum-culls off-screen geometry out of the *render*, so there is no code-side win there. The real costs are download, parse, and GPU memory — which only a trimmed room GLB removes. That is an asset-authoring task, and the code side is just the `room` slot in the manifest plus the reduced `camera.far`.

---

## 9. Verification

1. `npm run dev` → `http://localhost:3000/product/test`.
2. `public/models/` and `public/store-models/` are **gitignored**, so the GLBs are absent in a fresh clone. First verify the *failure* path: the page must show the styled recovery overlay (`CarPageClient.tsx:124-138` pattern) with a working retry, and a missing single cover variant must degrade to "unavailable" without killing the page.
3. With assets present, check by hand:
   - one-finger drag spins the model, camera does not move;
   - two-finger pinch dollies within `[minDistance, maxDistance]` and clamps hard at both ends;
   - lifting one finger after a pinch does **not** snap the rotation;
   - wheel dolly on desktop matches the pinch clamps;
   - stepper Frame → +Soft → +Cover plays the bottom-up wipe each step;
   - switching cover material wipes out then in (~900 ms), and repeated fast clicks don't leave an orphan layer mounted;
   - explode toggle separates layers with labels and suppresses the wipe;
   - all three swatch rows change only their own zone;
   - AR opens `ARProductViewer` with the static GLB/USDZ;
   - back button returns to `/store`.
4. **Idle-cost check** (the easiest thing to get wrong): with no interaction, the canvas must stop rendering. Confirm via Chrome DevTools Performance that frames stop being submitted once every animation settles — a missing `invalidate()` guard shows up as a continuous 60 fps trace.
5. `npx tsc --noEmit` and `npm run lint`, then `npm run build` to confirm `generateStaticParams` resolves every `products.json` key.

## Assets to author (hand-off)

- `public/models/furniture/test/{frame,soft,cover-leather,cover-velvet,cover-plastic}.glb` — shared world origin, cushions named `cushion_*`.
- `public/store-models/present/booth.glb` — front-facing only.
- `public/images/covers/*.jpg` — cover thumbnails.

---

## Addendum — corrections from the design pass

Five things the first draft got wrong or left implicit. These override the sections above.

1. **Clipping planes are evaluated in WORLD space.** A fixed `(0,-1,0)` plane is invariant under the Y spin but is broken by the X tilt and the explode Y-offset — the cover would slice along the wrong axis. Keep the plane in the cover group's local space and re-derive a world plane each animated frame: `coverGroup.updateWorldMatrix(true,false); worldPlane.copy(localPlane).applyMatrix4(coverGroup.matrixWorld)`. Materials hold a stable reference to `worldPlane`, so mutation needs no `needsUpdate`.
2. **Park the plane, never detach it.** On wipe completion set `constant = maxY + 1e3` rather than `material.clippingPlanes = null` — detaching flips the shader variant and forces a program recompile on every cover swap.
3. **Do not call `prepareCarObject`.** `lib/three/prepareCarMaterial.ts:49-57` force-sets `castShadow`/`receiveShadow` on every mesh, which contradicts the no-shadows requirement. Add `preparePresentationObject` that applies `envMapIntensity` + anisotropy only.
4. **Center X/Z, but seat Y on the floor** (`floorY - box.min.y`). `RotatableCar.tsx:47-49` and `ProductViewer3D.tsx:56-63` center all three axes; here the piece must sit on the room floor, not float at the origin. No autoscale either — room and furniture share one coordinate system.
5. **Gesture listeners go on `gl.domElement`, not `document`.** `RotatableCar.tsx:56-57` uses `document`, so a `pointerdown` on the bottom sheet would start a model spin. Canvas-scoping removes the framer-motion conflict structurally. Also needs `touch-action:none` + `overscroll-behavior:none` on the wrapper and `preventDefault` on iOS `gesturestart`, or Safari eats the pinch as page zoom.

Plus: the cover needs its **own inner `<Suspense>`** (a suspending child hides the nearest boundary's whole subtree, so a cover swap would otherwise blank the frame and cushions); each swatch row needs a **distinct framer-motion `layoutId`** or the single gold ring flies between rows; and `params` stays **synchronous** — Next is pinned at 14.2.18 despite `AGENTS.md`'s warning.