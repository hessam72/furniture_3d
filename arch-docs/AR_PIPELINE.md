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

So Draco stays Draco, KTX2 stays KTX2, no canvas is involved, and the output is the input's size — **plus the one fabric the customer chose**, where they chose one. See *Injecting a texture* below; nothing is ever decompressed or re-encoded either way.

| Function | Does |
|---|---|
| `readGlbJson(bytes)` | Parses the container, returns the glTF JSON |
| `zoneEditsFromJson(json, zone, paint)` | glTF material index → `MaterialEdit`, honouring per-mesh zone overrides |
| `materialIndicesByName(json, names)` | Material *names* → indices, so AR dresses what the page dressed |
| `patchGlbMaterials(bytes, edits, injection?)` | Applies the edits, appends any injected texture, and re-emits the GLB |
| `hexToLinearRgb(hex)` | sRGB → linear-sRGB, the space `baseColorFactor` is defined in |

Written with **no `three` import** on purpose: the same module runs in the browser and in the route handler, so there is one implementation and no chance of the two drifting.

Details that matter:

- **Colour space.** `baseColorFactor` is linear. `THREE.Color.set()` with `ColorManagement` on already stores linear-sRGB, so the page and the patch must agree — hence `hexToLinearRgb` rather than raw channel bytes. Getting this wrong is not subtle: the piece lands visibly pale in AR.
- **Alpha is preserved.** Only RGB is replaced; a glass or cut-out material does not go opaque because a swatch was picked.
- **`KHR_materials_clearcoat`** is written only where there is a coat to describe, and added to `extensionsUsed` when introduced.
- **Skipped:** materials carrying `KHR_materials_unlit` or `KHR_materials_pbrSpecularGlossiness` — no `pbrMetallicRoughness` to drive, and the viewer does not paint them either.
- **Zone overrides** are read from glTF `extras` on the mesh *and* on the node, because `GLTFLoader` merges both into `userData`, which is what `zoneOverride` (`lib/three/layerMaterials.ts:78`) reads. The mesh-name `match` rule is deliberately **not** reimplemented — the plain viewer never passes one, and a second copy of that rule would silently diverge.
- **Known limit.** One glTF material shared by two meshes tagged with *different* zones cannot be split by a byte patch; three clones per mesh and can. Not reachable on `/simple`, where a file is one zone.

### 1b. Injecting a texture

A colour is a number and fits in the JSON chunk. A **fabric is an image**, and showing the customer the cloth they picked means putting it in the file. `TextureInjection` does that, and it is still all append:

```
[ header ][ JSON ][ BIN ................................ | ktx2 | ktx2 ]
            rewritten   copied verbatim, byte for byte      appended
```

Per injected map: a `bufferViews` entry over the appended bytes, an `images` entry (`image/ktx2`), a `textures` entry carrying `KHR_texture_basisu`, a rewritten `index` on the material's existing texture reference, and `buffers[0].byteLength` bumped to match. Nothing already in the file moves.

Details that matter:

- **The reference's `extensions` object is left alone, and that is load-bearing.** `KHR_texture_transform` lives on the material's texture *reference*, not on the texture — so repointing `index` and nothing else reproduces the page's inherit rule for free. `vray_rene_sofa_012` keeps its 90° rotation, `fabric_03` its 3×3, with no second copy of that logic to drift.
- **The BIN chunk is found by type** (`0x004E4942`), never by position. `readChunks` tolerates a trailing chunk some tool appended, and `chunks[1]` would put the fabric inside it.
- **A material with nothing in the slot is skipped**, exactly as on the page: there is no sampler to inherit and no reference to repoint. The new texture borrows the displaced one's sampler, because a standalone `.ktx2` has none of its own.
- **`KHR_texture_basisu` goes in `extensionsRequired`**, not just `extensionsUsed` — the injected texture ships no uncompressed fallback `source`, so the spec makes it required. Both pushes are guarded so they cannot accumulate per request.
- **Material selection is by name**, via `materialIndicesByName`, from the same `materials[]` list the page matches on. Two rules over one asset is exactly how AR ends up dressing different parts than the screen did.
- **Size.** Base colour plus normal at 1024² is roughly 1.4MB on a ~5MB file — well under `AR_GLB_WARN_BYTES` (15MB), and the page's HEAD-before-open measures the real response anyway.
- **iOS is fine with this.** `ios-src` is unset on `/simple`, so model-viewer builds the USDZ from the GLB it loaded, transcoding the KTX2 on the way. Android's Scene Viewer reads the GLB directly, and these assets already require `KHR_texture_basisu` today — one more Basis texture is not a new risk.

### 2. Serve it from a URL, not a blob

`GET /api/ar/<key>/model.glb?layer=<frame|variantId>&zone=<wood|cover|cushion>&paint=<base64url>&tex=<swatchId>`

**Why a URL.** Android's Scene Viewer fetches the model itself and refuses `blob:`. `supportsBlobAR()` (`lib/device-utils.ts:40`) knew that and fell back to the static, uncustomised `product.glbPath` — so on every Android phone without WebXR the customer picked a colour and then saw the default one in their room. A real URL removes that split entirely. iOS gains too: Safari is not holding the model in the page's heap while Quick Look runs.

**Security shape.** `layer` **selects** a file from the manifest, it never names one. A traversal string simply finds no variant and falls through to the finished piece. `tex` is the same kind of token for the fabric: a **swatch id** looked up in the palette, never a texture URL, with a 400 for an id the manifest does not publish. `path.resolve` containment under `public/` is the second lock on both, for a manifest with a bad path rather than for a hostile request. `paint` is base64url JSON in a fixed key order, length-capped (`MAX_PAINT_PARAM_LENGTH`) and validated field by field — hex colour, 0–1 numbers — with a 400 on anything else.

**Why `tex` is its own parameter.** `decodePaint` rejects any zone entry that is not exactly four elements long, and the encoded string is the cache key for both the browser and the route's LRU. Growing the tuple would make every AR URL issued before this change answer 400. `swatchId`, `maps` and the rest are optional fields on `ZonePaint` that stay out of the codec entirely; `arModelUrl` omits `tex` when there is no textured swatch, so those URLs remain byte-identical to the ones already cached.

**Caching.** The query fully determines the bytes, so responses are `public, max-age=31536000, immutable`, plus a 6-entry in-process LRU. The fixed key order in `encodePaint` is what makes the same configuration produce the same URL every time.

**Degrading.** A GLB that cannot be parsed is served as authored rather than 500 — the piece appears in its own colours, which beats no AR. A missing model 404s and the page falls back (`public/models` is gitignored, so a deploy without assets is a real case). A swatch whose `.ktx2` files are missing from disk is **not** an error: it falls through to the colour-only patch, so a half-deployed texture set shows the authored cloth instead of breaking AR. An unknown `tex` id *is* a 400 — that is a bad request, not a bad deploy.

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
# With a fabric → the same file plus ~1.4MB
curl -s 'http://localhost:3000/api/ar/test/model.glb?layer=leather&zone=cover&paint=<b64>&tex=wool-oat' -o /tmp/ar.glb
node scripts/glb-budget.mjs /tmp/ar.glb   # walks the container: a bad append fails here, not on a phone
# Rejections
#   unknown key → 404 · bad zone / paint / oversized / non-base64 / unknown tex → 400
```

The injection is worth checking on the bytes rather than the phone, because all of
it is verifiable offline: that the container still parses, that exactly the named
materials were repointed, that `KHR_texture_transform` survived on the ones that
carried it, and that each new `bufferViews[n].byteOffset` is 4-byte aligned and
lands on the KTX2 magic (`AB 4B 54 58 20 32 30 BB`). A URL with no `tex` must
come back byte-identical to the pre-change build.

On device, `?debug` logs the resolved path, the patched size and the triangle count from `openAR`.

The proof that the texture cap is the iOS fix is a toggle: `ar-usdz-max-texture-size="1024"` succeeds where removing the attribute — back to model-viewer's `Infinity` default — reproduces the crash.

> `public/models` is gitignored. Local verification needs real GLBs copied to the manifest's paths.
