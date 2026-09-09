# AR Pipeline

How a configured piece gets from the canvas into the customer's room, and why it is built the way it is.

---

## Overview

**Route:** `/product/[id]/simple` (the only page on the new pipeline)
**Patcher:** `lib/ar/glbPatch.ts`
**URL builder / validation:** `lib/ar/arSource.ts`
**Budgets:** `lib/ar/budget.ts`
**Server:** `app/api/ar/[key]/model.glb/route.ts`
**Viewer:** `components/store/ARProductViewer.tsx`
**Manifest:** `public/config/furniture-presentation.json` — `arPath` / `arModel`

Stack: three 0.170 · @google/model-viewer 4.3 (its own three r183 inlined) · Next 14.2 route handler on the Node runtime.

The customer picks colours on the page, taps «مشاهده در واقعیت افزوده», and the piece appears in their room wearing exactly those colours — through Scene Viewer on Android, Quick Look on iOS, or WebXR in the page.

---

## What was wrong

The page used to build its AR model with `GLTFExporter` (`lib/three/exportConfigured.ts`, still used by the layered page and the showroom):

```ts
await new GLTFExporter().parseAsync(root, { binary: true })
```

Three separate costs stacked up on that one call:

1. **Draco is undone and not redone.** The source GLBs are Draco-compressed and loaded through `useGLTF.setDecoderPath('/draco/')`. `GLTFLoader` decodes the geometry to raw `Float32`/`Uint16`; the exporter writes it back out uncompressed. Textures go through a `<canvas>` and are re-encoded on the way. A 1.4 MB file came back at **40 MB+** — the size the old console warning reported and then ignored.
2. **The blob is paid for three times.** Held in the page as a `Blob` + object URL, re-parsed by model-viewer's *own inlined copy of three r183* (the source of the `Multiple instances of Three.js` warning — the app runs r170), and on iOS handed to a USDZ generator.
3. **The USDZ generator had no limits.** model-viewer defers to `three/examples/jsm/exporters/USDZExporter.js`, whose `maxTextureSize` default is `1024` — but it overrides that from the `ar-usdz-max-texture-size` attribute, which defaults to the string `'auto'`:

   ```ts
   // google/model-viewer — packages/model-viewer/src/features/ar.ts
   maxTextureSize: isNaN(this.arUsdzMaxTextureSize as any)
       ? Infinity
       : Math.max(parseInt(this.arUsdzMaxTextureSize), 16),
   ```

   `isNaN('auto')` is `true`, so out of the box **every texture is re-encoded at full resolution** as PNG at quality 1 (`canvas.toBlob(resolve, 'image/png', 1)`) into a zip written with `zipSync(files, { level: 0 })` — STORE, no compression at all.

Result on iOS: Safari's per-tab ceiling is reached, `THREE.WebGLRenderer: Context Lost`, Quick Look crashes. On Android the failure was quieter and arguably worse — see *Why a URL* below.

---

## The pipeline

### 1. Patch the GLB, do not rebuild it

Nothing the configurator does touches geometry or textures. The whole of it is `applyFirstCoat` (`hooks/useZonePaint.ts:12`) setting four values per material — colour, metalness, roughness, clearcoat — and those are **numbers in the GLB's JSON chunk**.

`lib/ar/glbPatch.ts` rewrites that chunk and copies every chunk after it byte for byte:

```
[ 12-byte header ][ JSON chunk 0x4E4F534A ][ BIN chunk 0x004E4942 ][ … ]
      rebuilt            rewritten              copied verbatim
```

So Draco stays Draco, KTX2 would stay KTX2, no canvas is involved, and the output is the input's size.

| Function | Does |
|---|---|
| `readGlbJson(bytes)` | Parses the container, returns the glTF JSON |
| `zoneEditsFromJson(json, zone, paint)` | glTF material index → `MaterialEdit`, honouring per-mesh zone overrides |
| `patchGlbMaterials(bytes, edits)` | Applies the edits and re-emits the GLB |
| `hexToLinearRgb(hex)` | sRGB → linear-sRGB, the space `baseColorFactor` is defined in |

Written with **no `three` import** on purpose: the same module runs in the browser and in the route handler, so there is one implementation and no chance of the two drifting.

Details that matter:

- **Colour space.** `baseColorFactor` is linear. `THREE.Color.set()` with `ColorManagement` on already stores linear-sRGB, so the page and the patch must agree — hence `hexToLinearRgb` rather than raw channel bytes. Getting this wrong is not subtle: the piece lands visibly pale in AR.
- **Alpha is preserved.** Only RGB is replaced; a glass or cut-out material does not go opaque because a swatch was picked.
- **`KHR_materials_clearcoat`** is written only where there is a coat to describe, and added to `extensionsUsed` when introduced.
- **Skipped:** materials carrying `KHR_materials_unlit` or `KHR_materials_pbrSpecularGlossiness` — no `pbrMetallicRoughness` to drive, and the viewer does not paint them either.
- **Zone overrides** are read from glTF `extras` on the mesh *and* on the node, because `GLTFLoader` merges both into `userData`, which is what `zoneOverride` (`lib/three/layerMaterials.ts:78`) reads. The mesh-name `match` rule is deliberately **not** reimplemented — the plain viewer never passes one, and a second copy of that rule would silently diverge.
- **Known limit.** One glTF material shared by two meshes tagged with *different* zones cannot be split by a byte patch; three clones per mesh and can. Not reachable on `/simple`, where a file is one zone.

### 2. Serve it from a URL, not a blob

`GET /api/ar/<key>/model.glb?layer=<frame|variantId>&zone=<wood|cover|cushion>&paint=<base64url>`

**Why a URL.** Android's Scene Viewer fetches the model itself and refuses `blob:`. `supportsBlobAR()` (`lib/device-utils.ts:40`) knew that and fell back to the static, uncustomised `product.glbPath` — so on every Android phone without WebXR the customer picked a colour and then saw the default one in their room. A real URL removes that split entirely. iOS gains too: Safari is not holding the model in the page's heap while Quick Look runs.

**Security shape.** `layer` **selects** a file from the manifest, it never names one. A traversal string simply finds no variant and falls through to the finished piece. `path.resolve` containment under `public/` is the second lock, for a manifest with a bad path rather than for a hostile request. `paint` is base64url JSON in a fixed key order, length-capped (`MAX_PAINT_PARAM_LENGTH`) and validated field by field — hex colour, 0–1 numbers — with a 400 on anything else.

**Caching.** The query fully determines the bytes, so responses are `public, max-age=31536000, immutable`, plus a 6-entry in-process LRU. The fixed key order in `encodePaint` is what makes the same configuration produce the same URL every time.

**Degrading.** A GLB that cannot be parsed is served as authored rather than 500 — the piece appears in its own colours, which beats no AR. A missing file 404s and the page falls back (`public/models` is gitignored, so a deploy without assets is a real case).

### 3. Cap what Quick Look bakes

`ARProductViewer` now sets `ar-usdz-max-texture-size` (`AR_USDZ_MAX_TEXTURE_SIZE = 1024`). This is the fix for §3 of *What was wrong*, not a tuning knob — raise it only with a device to test on.

`ios-src` stays **unset** so model-viewer generates the USDZ from the file it loaded, which is now the configured one. That is safe to allow once the cap is named.

### 4. The geometry problem no cap solves

three's USDZ exporter writes points, normals and UVs as **decimal text** into that same uncompressed zip. A dense piece is tens of megabytes of ASCII whatever its textures weigh, and nothing in code fixes it.

So the manifest carries an optional authored low-poly stand-in:

| Field | Where | Used for |
|---|---|---|
| `layers.frame.arPath` | frame layer | the bare frame |
| `layers.cover.variants[].arPath` | each cover variant | that variant |
| `simple.arModel` | `simple` block | the finished piece, when no variant is showing |

`arModelPath(config, layer)` in `lib/product/presentation.ts` resolves them. **Empty (`""`) counts as unset**, not as a path — the fields ship empty and AR keeps using the model the page is showing until a file is authored. `??` alone would have handed an empty string to the route as a real answer.

`AR_TRIANGLE_WARN` (150 k) is the signal that a product needs one; it is logged from `openAR`.

---

## Page flow — `SimpleViewerClient.tsx`

```
openAR()
 ├ layer   = showingFrame ? 'frame' : coverId ?? 'default'
 ├ url     = arModelUrl(productKey, layer, zone, usePresentation.getState().paint)
 ├ HEAD url                       ← proves the file exists, reports its size
 │   ├ !ok / over AR_GLB_MAX_BYTES → throw
 │   ├ over AR_GLB_WARN_BYTES      → console.warn
 │   └ triangles > AR_TRIANGLE_WARN → console.warn "author an arPath"
 ├ phone: useGLTF.clear() the warmed-but-unshown variants
 └ <ARProductViewer glbPath={url} arModes="webxr scene-viewer quick-look" arScale="fixed" />

catch → arStale = true, static product.glbPath, sheet says the colour will not appear
        (no published GLB either → stay on the page, do not open an empty viewer)
```

The `HEAD` is what makes the fallback honest: without it a missing or oversized asset is only discovered by model-viewer failing in front of the customer.

The R3F canvas is unmounted while AR is open (`live && !showAR`) and remounted with a bumped `canvasKey` on close — a context that went with the unmount has to be rebuilt, not re-rendered. `sourceRef` is still published by `SimpleViewer`, but nothing is serialised from it any more; it is read only to count triangles.

### Budgets — `lib/ar/budget.ts`

| Constant | Value | Effect |
|---|---|---|
| `AR_GLB_WARN_BYTES` | 15 MB | console warning |
| `AR_GLB_MAX_BYTES` | 30 MB | falls back to the static asset |
| `AR_TRIANGLE_WARN` | 150 000 | console warning — author an `arPath` |
| `AR_USDZ_MAX_TEXTURE_SIZE` | 1024 | `ar-usdz-max-texture-size` |

This replaces the old check in `ProductPageClient.tsx`, which warned past 40 MB to the console and then handed the file over anyway — which is how a customer got a crashed Quick Look instead of a message.

---

## Measured

Against real GLBs in the repo, patch vs. source (one paint, three files — the delta is the JSON growing by a few factors, so it moves a little with the values written):

| File | Source | Materials edited | Delta |
|---|---|---|---|
| `jewel-2.glb` | 1 456 436 | 2 | +124 B |
| `showroom-stage.glb` | 712 948 | 3 | +244 B |
| `jewel-5.glb` | 855 300 | 1 | +80 B |

BIN chunk byte-identical in every case. `GLTFLoader` re-parsing the patched output reports exactly the colour, roughness, metalness and clearcoat `applyFirstCoat` would have set on the live page.

Manifest fall-through, against the running route: `arPath: ""` → 1 456 668 bytes (the display model); `arPath: "…/lowpoly-ar.glb"` → 489 384 bytes (the named file).

---

## Not on this pipeline

- **`app/product/[id]/ProductPageClient.tsx`** — the layered page mounts three GLBs (frame, soft, cover) and `exportConfiguredGLB` merges them. A byte patch cannot merge files, so it still uses `GLTFExporter` and still carries the old costs. The modules above are shaped so it can adopt them once there is a merge story.
- **`components/showroom/ShowroomFeatured.tsx`** — still `exportSinglePieceGLB`, and additionally keeps its `ShowroomStage` canvas mounted underneath the AR overlay, which is a second live context on a phone.
- **`components/car/ARCarViewer.tsx`, `components/ar/HomeARViewer.tsx`, the store drawer** — static files only, never configured.

## Deliberately not done

- **Deduping three.js.** model-viewer 4.x inlines r183 against the app's pinned r170; aliasing them together breaks one or the other. It is a constant ~1 MB of JS, not the crash.
- **Generating the USDZ ourselves + a `POST /api/ar/usdz` cache** so `ios-src` could be a real URL. model-viewer already calls the exact exporter we would have called; naming the texture cap gets the same result without a write endpoint, a temp-file sweeper and an upload on the customer's connection. Worth revisiting only if a real iPhone still busts the budget *after* an authored `arPath` exists.
- **Runtime decimation.** Nothing meaningful is possible in-page; that is what `arPath` is for.

---

## Testing

```bash
npm run dev
# Empty arPath → the display model, ~= source size
curl -sI 'http://localhost:3000/api/ar/test/model.glb?layer=leather&zone=cover&paint=<base64url>'
# Rejections
#   unknown key → 404 · bad zone / paint / oversized / non-base64 → 400
```

On device, `?debug` logs the resolved path, the patched size and the triangle count from `openAR`.

The proof that the texture cap is the iOS fix is a toggle: `ar-usdz-max-texture-size="1024"` succeeds where removing the attribute — back to model-viewer's `Infinity` default — reproduces the crash.

> `public/models` is gitignored. Local verification needs real GLBs copied to the manifest's paths.
