# furniture_3d — storefront guide

What this app is, how to run it, and how each part works — written from the code on branch
`claude/admiring-galileo-bhl63b`. The data it shows comes from
[`furniture_backend`](https://github.com/hessam72/furniture_backend); that repo has its own
`arch-docs/GUIDE.md` for the API and its two panels (admin and showroom).

> The root `README.md` describes an older jewellery try-on project and is out of date.
> Start here instead.

---

## 1. What it is

The public storefront of a multi-showroom furniture platform. Each showroom (a tenant of
the backend) gets:

- a **brand page** with an inline 3D viewer — `/showroom/<slug>`;
- a **product list** and a **product page** — `/showroom/<slug>/products`, `/products/<key>`;
- a **layered 3D configurator** (frame, cushions, covers, colours, AR) — `/showroom/<slug>/product/<key>`
  and a lighter single-model viewer at `…/product/<key>/simple`;
- a **walkable 3D room** with the showroom's products standing on numbered places —
  `/showroom/<slug>/store`.

Visitors never sign in. Everything a showroom edits in its panel reaches these pages
through the backend's public API.

| | |
|---|---|
| Framework | Next.js **14.2** (App Router), React 18.3, TypeScript |
| 3D | three 0.180, @react-three/fiber 8, drei 9.122, @react-three/rapier (physics), postprocessing |
| AR | @google/model-viewer 4.3 (Scene Viewer on Android, Quick Look on iOS, WebXR) |
| i18n | next-intl 4 — Persian (default, unprefixed URLs) and English (`/en/…`) |
| State | zustand |
| Styling | Tailwind CSS 4 |

---

## 2. Set it up

### 2.1 Run it locally

You need **Node 18.17 or newer** (Next 14's minimum; the backend uses Node 22, which works
here too) and the **backend running** with data in it.

```bash
# 1. The backend (other repo) — see its arch-docs/QUICKSTART.md
#    npm run db:deploy && npm run db:seed && npm run db:seed:demo && npm run dev   → API on :3010

# 2. This app
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:3010
npm ci
npm run dev                       # http://localhost:3000
```

With the backend's demo seed loaded, open:

| URL | What you see |
|---|---|
| `/showroom/shahr-omid` | the brand page |
| `/showroom/shahr-omid/products` | the product list |
| `/showroom/shahr-omid/products/atlas-sofa` | a product page |
| `/showroom/shahr-omid/product/atlas-sofa` | the layered configurator |
| `/showroom/shahr-omid/store` | the walkable room |
| `/showroom/shahr-omid/store?view-stage=1` | the room with every slot's number floating over it |
| `/en/showroom/shahr-omid` | the same pages with English interface text |

### 2.2 Environment variables

| Variable | Meaning | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | The backend's origin, no trailing slash. The app calls `${NEXT_PUBLIC_API_URL}/api/v1/public/…` | `http://localhost:3010` |
| `NEXT_PUBLIC_MEDIA_URL` | Where the backend's `/uploads/*` files are served. Set it **empty** when a reverse proxy serves `/uploads` on this site's own domain | same as `NEXT_PUBLIC_API_URL` |

Both are `NEXT_PUBLIC_*`, so Next.js **bakes them into the build**. Set them before
`npm run build`; changing them later needs a rebuild. If `NEXT_PUBLIC_API_URL` is missing
in production, the site silently points at `localhost:3010`.

### 2.3 Build and deploy

```bash
npm run build      # the backend must be reachable now — see below
npm run start      # next start, port 3000
# or
npm run deploy     # build, then pm2 with ecosystem.config.cjs (next start -p 3045)
```

- **The API must be up during `next build`.** The pages' `generateStaticParams` ask the
  API for every published showroom and product and pre-render them. If the API is down the
  build fails.
- Pages are re-generated in the background every **60 seconds** (ISR), and new showrooms or
  products published after the build are rendered on first visit. There is no "publish
  webhook": an edit in a panel appears on the site within about a minute.
- `httpdconf.md` is an example Apache reverse-proxy config. It proxies to port **3011**,
  while `ecosystem.config.cjs` starts Next on **3045** — make the two agree on your server.
- The backend sends `Access-Control-Allow-Origin: *` on its public API and `/uploads`, so
  the storefront can live on a different domain with no proxy.

### 2.4 Files that are not in git

`public/models`, `public/ktx-optimized` and `public/store-models` are gitignored and copied
to servers by hand. Only the leftover static demo pages (`/ar`, `/view`, and the local AR
routes for the three demo products) read them. Everything a showroom shows comes from the
backend's `/uploads`. What *is* committed and needed: `public/draco` and `public/basis`
(the Draco and KTX2 decoders), `public/hdr/main_hdr.exr` (the room's lighting), fonts,
audio and the logo.

---

## 3. How it fits together

```
 Admin panel ─┐                        ┌─> /showroom/<slug>              (server-rendered, ISR 60 s)
              ├─> backend API ─> Postgres  /showroom/<slug>/products[/<key>]
 Showroom   ──┘      │                 │   /showroom/<slug>/product/<key>[/simple]
 panel               │                 └─> /showroom/<slug>/store       (3D room, loads in the browser)
                     └── /api/v1/public/showrooms/<slug>/…  ◄── lib/api.ts (the only place this app calls the backend)
```

### 3.1 `lib/api.ts` — the one door to the backend

| Function | Public endpoint | Used by |
|---|---|---|
| `fetchShowroomList()` | `GET /showrooms` | `generateStaticParams` of every route |
| `fetchShowroom(slug)` | `GET /showrooms/:slug` | brand page, header/footer of the sub-pages, `/store` guard |
| `fetchProducts(slug)` | `GET /showrooms/:slug/products` | product list, store (names, prices, click matching) |
| `fetchProduct(slug, key)` | `GET /showrooms/:slug/products/:key` | product page, configurator |
| `fetchPresentations(slug)` | `GET /showrooms/:slug/presentations` | configurator's `generateStaticParams` |
| `fetchCatalog(slug)` | `GET /showrooms/:slug/catalog` | the store's category menu |
| `fetchRoom(slug)` | `GET /showrooms/:slug/room` | the store, and "does this showroom have a room?" |

Rules every call follows:

- **404 → `null`**, and the page calls `notFound()`. The backend answers 404 for an unknown
  slug, a suspended showroom, an unpublished page (on `/showrooms/:slug` and `/room`), and
  an unpublished or deleted product.
- Any other failure throws (a 500 is not "this showroom doesn't exist").
- Server-side fetches are cached for 60 s (`next: { revalidate: 60 }`), matching the API's
  own `Cache-Control: max-age=60`.
- **Media paths are fixed up on arrival.** The backend sends files as relative
  `/uploads/<key>`; `withMediaUrls` rewrites every such string in every payload to
  `${NEXT_PUBLIC_MEDIA_URL}/uploads/<key>`, so no component has to remember to.

### 3.2 Routes

All pages live under `app/[locale]/`. Persian has no prefix; English adds `/en`.

| Route | Rendering | Notes |
|---|---|---|
| `/` | static | the platform's own landing page, copy in `lib/content/home.ts` |
| `/about` | static | the company page |
| `/showroom/[slug]` | ISR | brand page |
| `/showroom/[slug]/products` | ISR | every published product, searchable |
| `/showroom/[slug]/products/[key]` | ISR | photo, specs, 3D turntable |
| `/showroom/[slug]/product/[key]` | ISR | layered configurator; 404 when the product has no presentation |
| `/showroom/[slug]/product/[key]/simple` | ISR | single-model viewer of the same product |
| `/showroom/[slug]/store` | server guard + client scene | 404 when the page is unpublished or the showroom has no room |
| `/ar`, `/manage`, `/view/[id]` | — | old demo and local upload tools, not backend data (see §9) |
| `/api/ar/[key]/model.glb`, `model.usdz` | Node route | local AR builders for the static demo products (see §7) |

### 3.3 Languages

`i18n/routing.ts`: locales `fa` (default) and `en`, `localePrefix: 'as-needed'`,
`localeDetection: false` — the URL alone decides the language, never the browser. Interface
text lives in `messages/fa.json` and `messages/en.json`. Content from the backend is
**Persian only**: the panels cannot author English copy, so `/en/…` pages show English
buttons and labels around Persian product and page text.

---

## 4. The brand page — `/showroom/<slug>`

`lib/showroom/config.ts` → `resolveShowroom(slug)`:

1. Fetches the page config and the room at the same time. A failing `/room` request is
   treated as "has a room", so a room outage never takes the brand page down.
2. **Re-points links.** Old hrefs authored for the single-brand site (`/store`,
   `/product/<key>`, `/product/<key>/simple`) are rewritten under `/showroom/<slug>/…`.
   Links into the store are **removed** when the showroom has no room, so no button leads
   to a 404.
3. If `featured.presentationKey` names a product with a presentation, loads it and merges
   the page's own `featured.viewer` overrides (frame, HDR, covers, palettes) over it.

`components/showroom/ShowroomPage.tsx` then renders, in order: header, hero, stats,
featured (the inline 3D viewer with colour chips and an AR button), virtual (the door into
the 3D room), collection (product cards; «همه محصولات» goes to the product list), closing,
footer. Hero and footer contact lines come from the showroom's address, phone and hours
unless the section authored its own.

---

## 5. Product list and product page

`lib/showroom/products.ts`:

- **List** (`/products`): every product from `GET /products`, in the showroom's order.
  Search (`?q=`) and sort (`?sort=default|price-asc|price-desc|name`) run in the browser
  (`lib/showroom/productQuery.ts`). Products without a price sort last.
- **Picture:** `ProductData.thumbnail` (uploaded in the showroom panel); without one, the
  image of a homepage collection card that links to the product.
- **Product page** (`/products/<key>`): photo, the short description, fixed specs
  (dimensions, material, weight…) plus the showroom's own extra spec rows, and a 3D
  turntable. The turntable shows `presentation.simple.model` when the product has a
  presentation, otherwise the product's finished GLB on studio defaults. A link to the
  configurator appears only when a presentation exists.

---

## 6. The walkable 3D room — `/showroom/<slug>/store`

### 6.1 What the room payload contains

`GET /room` (types in `components/store/hooks/useStoreConfig.ts`):

```
{
  id,                                   // the room's slug
  files: [{ priority, quality: 'low'|'high', url, isCollider }],
  sun?, lamps?, camera?,                // lighting and entry camera (showroom overrides already merged)
  slots: [{ number, anchor, label? }],  // every numbered place, empty or not
  placements: [{ slot, anchor, product, glbPath }]   // what stands where — only loadable pieces
}
```

No position is ever sent. A slot is only a **name** (`anchor`) of a node inside the room's
GLB; the loaded file is the single source of where that place is.

### 6.2 Loading the room

`components/store/Scene.tsx` and `ModelLoader.tsx`:

1. **Pick the files.** The collider plus **one** quality rung: `low` on phones and on the
   `low` quality tier, otherwise `high`; if the room has no file on the preferred rung, the
   other is used (`roomFilesFor`). `low` and `high` are the same room at two costs, never
   two halves of it.
2. **Start the product downloads at the same time** — every `placements[].glbPath` is
   preloaded alongside the room.
3. **Mount the files** in `priority` order. The collider (`isCollider: true`) is made fully
   transparent and becomes a static **trimesh** physics body — it is what the visitor
   walks on and bumps into. Visual files cast and receive shadows and are **shifted up so
   their lowest point sits at Y = 0**. The collider is *not* shifted.
4. **Intro flight.** The camera flies from `camera.transitionStart` to
   `camera.transitionTarget` while looking from `lookAtStart` to `lookAtEnd`, with a
   particle reveal.
5. **The visitor.** A physics capsule appears at `camera.playerStart`, eyes
   `camera.cameraHeight` (default 1.3 m) above it. Gravity, collisions and walking are
   Rapier physics.

Controls: **W A S D** on a keyboard, the on-screen **joystick** on touch screens, **drag** to
look, an optional **gyro** toggle on phones, and the menu's **reset view** (flies back to
`playerStart` looking at `lookAtEnd`) and sound switch.

### 6.3 How a product finds its place — slot recognition

This is the chain from a 3D artist's file to a sofa standing in the room. The backend
side (admin scan, slot table, placements board) is in the backend's `GUIDE.md`; this is
what happens here.

```
room GLB node "stage_3"  ──►  backend slot #3 (anchor "stage_3")  ──►  showroom puts "atlas-sofa" on #3
                                                                            │
storefront:  find node "stage_3" in the mounted room  ◄──  /room → placements[{ slot: 3, anchor: "stage_3", product: "atlas-sofa", glbPath }]
             read its world position + heading
             stand atlas-sofa's GLB there
```

Step by step (`components/store/RoomPlacements.tsx`, `lib/store/roomAnchors.ts`):

1. **Wait for the room.** Placement runs only after the room files are mounted (and
   re-based), because that is where the slots are read from.
2. **Find the anchor** — `findAnchor(roots, anchor)`:
   - exact name first (`getObjectByName`), looking in the **visual files before the
     collider**, each in priority order;
   - then a case-insensitive search through the same files.

   The backend already stores anchor names exactly as three.js will name the nodes
   (spaces → `_`, the characters `[ ] . : /` removed, a repeated name gets `_1`, `_2`…), so
   the exact match is the one that should hit.
3. **Read the pose** — `slotPose(anchor)`: the node's **world position** and its
   **heading** (the direction of its local +Z axis, flattened onto the floor). The node's
   tilt and scale are ignored: furniture always stands upright and product files are
   already at real size.
4. **Seat the piece** — `footprintOf(piece)`: the bounding box of the product GLB is
   measured and the piece is moved so the **bottom-centre of its box** sits exactly on the
   anchor. The GLB's own origin does not matter.
5. **Turn it** to the anchor's heading: the piece's **+Z side (its front)** faces where the
   anchor's +Z points.
6. **Give it a collider.** A box collider the size of the piece, in its own collision
   group (the camera flight looks through it; the visitor still bumps into it). Skipped for
   flat things under 15 cm tall (rugs) and for anything with a side over 8 m (a stray
   node or ground plane in the GLB).
7. **Make it clickable.** The piece is wrapped in a group named after the product slug,
   tagged `userData.productKey`, and a second group named after its raycast name
   (`ProductData.id`). A tap on it therefore always resolves to the right product.

Failures stay local:

- **No node with that name** → the piece is skipped and the console says
  `[RoomPlacements] Slot 3: no node named "stage_3" in the room — "atlas-sofa" is not placed.`
- **A broken or missing product GLB** → only that piece fails (each has its own error
  boundary); the room and the other pieces still load.

#### What the 3D artist must do

**In the room file (Blender):**

1. Add an **Empty** where each piece should stand, on the floor, and name it
   `stage_1`, `stage_2`, … The backend's importer recognises `stage`, `slot` or `place`,
   an optional `_` or `-`, and a number from 1 to 999 (leading zeros allowed):
   `stage_3`, `slot-12`, `Place7`, `stage_007`.
2. **Point it.** The piece's front turns to face the empty's **+Z** axis in glTF terms.
   With Blender's default glTF export (+Y up), glTF +Z is Blender's **−Y**: point the
   empty's −Y axis toward where customers should see the piece from (usually into the
   room).
3. **Avoid Blender's `.001` duplicates.** A duplicated `stage_3` becomes `stage_3.001`,
   which loads as `stage_3001` and matches nothing. The admin's scan lists such names.
4. **Put the empties in every visual file.** Only one quality rung is mounted (`low` on
   phones), so an anchor that exists only in the `high` file is missing on phones. Anchors
   in the collider file are found too, as a last resort.
5. **Keep the floor at Y = 0** in every file. Visual files are re-based to their lowest
   point and the collider is not, so geometry below the floor (a foundation, a ground
   plane) would lift the visuals off the collider.

**In each product file:** real-world size in metres, the front facing glTF +Z (Blender −Y,
the side you see in Blender's *Front* view), and no stray geometry far from the piece — the
bounding box decides both where it stands and its collider.

**Then check it:** open `/showroom/<slug>/store?view-stage=1`. Every slot shows
«جایگاه N», its label, and «خالی» when nothing stands on it, 1.1 m above its anchor
(`components/store/SlotLabels.tsx`). A slot with no label is a slot whose node was not
found. The showroom panel's placements board links straight to this view; it works only
once the showroom's page is published.

### 6.4 Clicking a product, the camera flight and the drawer

- **Tap matching** (`ProductInteraction.tsx`): from the mesh that was hit, walk up its
  parents. A node with `userData.productKey` (a placed piece) names the product directly;
  otherwise a node whose name equals a product's raycast name (case-insensitive) does —
  that is how furniture modelled *into* the room GLB is matched. A drag of more than 10 px
  is a look, not a tap.
- **Camera flight** (`ProductFocusCamera.tsx`): finds the object by slug and raycast name
  (exact, then prefix, then substring — `lib/store/sceneObject.ts`), measures it, picks
  the side of the piece that faces the middle of the room as its front, backs off to frame
  it, checks the path against the room so the camera does not land inside a wall, and flies
  there in 1.4 s. Then the visitor's body is moved under the camera.
- **Drawer** (`ProductDrawer.tsx`): name, price, spec tabs, AR, add-to-cart and a link to
  the product's page. It closes by itself when the visitor walks more than 2.5 m away.
- **Category menu** (`CategoryBar.tsx`): categories → sub-categories → items from
  `GET /catalog`. Picking one runs the same flight. A product that is not placed in this
  room opens where the visitor stands.

### 6.5 Lights and room-file naming rules

| In the room GLB | What the storefront does |
|---|---|
| a mesh whose name contains `glass` | never casts shadows (a pane would black out the sunlight) |
| a mesh whose name contains `ceiling`, or sits higher than 3 m | rendered double-sided |
| a mesh whose name contains `lamp` | never casts shadows; when the room's `lamps.enabled` is true it becomes a lamp — a warm glowing shade on every tier, plus a real point light where the quality tier allows (one mesh per fixture; parts closer than 25 cm count as one) |
| a mesh whose name contains `light` | gets a fixed warm emissive glow — don't use the word for anything that should not glow |
| `stage_<n>` empties | product slots (§6.3) |
| the file flagged collider | invisible walking and collision surface |

Lighting comes from `public/hdr/main_hdr.exr` (the same for every room), a fixed overhead
point light, and optionally:

- `sun` — sunlight through a window with soft (PCSS) shadows. Off unless the room's `sun`
  block says `enabled: true`. Tune it live with `?sundebug=1` (development builds only); the
  printed JSON pastes straight into the room's **sun** block in the admin panel.
- `lamps` — see the table. Off unless `enabled: true`. `?lampdebug=1` (development builds
  only) logs every lamp it found and opens a tuning panel.

The room's `sun`, `lamps` and `camera` blocks are edited per room in the admin panel; a
showroom can override any of the three for itself in its own panel (a whole block replaces
the room's, it is not merged key by key).

### 6.6 Debug switches

| Query | Effect |
|---|---|
| `?view-stage=1` | slot numbers over every anchor (`/store`) |
| `?debug` | renderer statistics overlay (draw calls, memory) |
| `?sundebug=1` | sun alignment helper — development builds only |
| `?lampdebug=1` | lamp list and tuning panel — development builds only |

---

## 7. The configurator — `/showroom/<slug>/product/<key>`

Exists only for products that have a **presentation** in the backend (a product with a
`frame` layer). Its config (`PresentationConfig`, `lib/product/presentation.ts`) holds:

- **Layers.** `frame` — the bare structure, painted with the `wood` palette. `soft`
  (optional) — cushions, painted with `cushion`. `cover` — one or more **cover variants**
  («رویه»), each its own GLB with an optional price change (`totalPrice = price +
  priceDelta`), painted with `cover`. `stage` (optional) — a plinth that turns with the
  piece but takes no colour and never goes to AR. `startStep` opens on the bare frame (0)
  or the finished piece (1).
- **Palettes.** Per zone (`wood`, `cover`, `cushion`; the viewer also knows `shawl`), a list
  of swatches `{ id, name, hex, roughness? }`. **The first swatch is the opening colour.**
- **Which mesh gets which colour.** A layer's meshes take that layer's zone; `zoneMatch`
  limits a layer to meshes whose name contains a substring; a mesh can also be tagged in
  the GLB itself with a custom property `zone` (or `paintZone`); and `parts` rules can split
  one file into several zones by node or material name (`lib/three/layerMaterials.ts`).
- **Camera** as angles and ratios, not metres (azimuth, elevation, field of view, zoom
  limits); optional lighting, `sun`, quality tier, explode and wipe animations.

`/simple` shows one model (`presentation.simple.model`) with the same palettes, a quality
picker and AR — lighter on phones.

**How a product gets a presentation:** today only the backend's demo seed and legacy
importer create the `frame` layer; neither panel can (see §11).

---

## 8. AR

`components/store/ARProductViewer.tsx` wraps model-viewer: `src` is a GLB (Android Scene
Viewer, WebXR), `ios-src` a USDZ (iOS Quick Look).

| Where | Android | iPhone |
|---|---|---|
| Brand page, featured piece | the static GLB of the shown cover, else the product's GLB | the product's USDZ when the product's own GLB is shown; otherwise model-viewer converts in the browser |
| `/product/<key>` | the selected cover's static GLB (chosen colours are not baked in) | **broken for backend products** — points at the local USDZ route, which only knows the static demo products (§11) |
| `/simple` and `/store` | tries the local colour-patched route first (`HEAD` check), falls back to the static GLB | same, falls back to the product's USDZ |

The local routes (`app/api/ar/[key]/model.glb` and `model.usdz`) build a recoloured copy of
a model and convert GLB to USDZ in Node. They resolve products through the **static** demo
manifest and read files from `public/`, so for backend products every page falls back to
the static files. The backend has its own colour-patching AR route (GLB only), not used
here yet.

---

## 9. Performance and quality tiers

- **Four tiers** (`lib/config/quality.ts`): `low`, `medium`, `high`, `ultra` — resolution,
  shadows, anti-aliasing, ambient occlusion, reflections, texture sharpness.
- **Device ceilings** (`lib/config/deviceTier.ts`): a phone can never get more than its
  ceiling, whatever is stored. The chosen tier is remembered in `localStorage` and capped
  every time it is read.
- **Run-time safety nets:** a frame-rate ladder lowers resolution under sustained load
  (`PerfLadder`); a VRAM watchdog demotes the tier before memory runs out; a lost WebGL
  context remounts the scene one tier lower (`useContextRecovery`); the store's render loop
  stops entirely while the visitor stands still.
- **Caching:** `next.config.mjs` serves `/models`, `/hdr`, `/draco`, `/basis`, `/textures`,
  `/images`, `/audio`, `/fonts` and similar as immutable for a year — replace such a file by
  **renaming** it, never in place. `public/sw.js` keeps those same-origin files in Cache
  Storage, because iOS Safari will not keep large files in its normal cache.

Deeper notes: `QUALITY_TIER_SYSTEM.md`, `MOBILE_GPU_BUDGET.md`.

### Preparing 3D files

GLBs are decoded with **Draco**, **Meshopt** and **KTX2** (textures stay compressed on the
GPU — `lib/three/gltfLoaders.ts`). Before uploading a model:

```bash
# needs: npm i -g @gltf-transform/cli, and KTX-Software's `ktx` on the PATH
npm run glb:optimize -- out/ in.glb       # cap textures at 1024 px, KTX2 (UASTC normals, ETC1S the rest), prune, Draco
MAX_EDGE=512 npm run glb:optimize -- out/ in.glb   # a lighter mobile variant
npm run glb:budget -- out/*.glb           # GPU memory each file will really cost
```

A WebP texture that is 850 KB on disk can cost 64 MB of GPU memory; KTX2 is what keeps a
room affordable on a phone. Fabric and texture helpers: `npm run tex:encode`,
`tex:fabric`, `tex:thumbs`, `tex:optimize`.

---

## 10. Local-only tools

| Route | What it is |
|---|---|
| `/manage` | upload a GLB (+ optional HDR), up to 100 MB, into `data/uploads`; get a `/view/<id>` link |
| `/view/[id]` | a standalone viewer for one uploaded model |
| `/ar` | the old AR demo, reading the static `public/config/products.json` |

These have **no login** and write to this server's disk. Remove or protect them before
production.

---

## 11. Known gaps

Full list: [`BACKEND_CUTOVER_STATE.md`](BACKEND_CUTOVER_STATE.md). The ones you will notice
first:

- In `/store`, the drawer's colour chips, the colour applier and colour-aware AR still read
  the static demo manifest, so backend products show no swatches there; the drawer's
  "details" link is hard-coded to the demo showroom and 404s.
- The store's category menu lists only catalogue entries, which no panel creates — a
  product added in the panel stands in the room but is missing from the menu.
- iPhone AR on `/product/<key>` points at a route that only knows the demo products.
- No lead form yet; the cart is browser-only with no checkout.
- Backend textures (KTX2 maps on swatches) are not mapped yet — swatches render as flat
  colours.
- Palettes set in the showroom panel only reach products that have a presentation, and the
  panels cannot create one. Decided fix: the backend will send palettes outside
  `presentation` and the `/products/<key>` turntable will apply them (not built).

---

## 12. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every showroom page is 404 | `NEXT_PUBLIC_API_URL` points at the wrong place, or the page is not published in the showroom panel |
| `/store` is 404 but the brand page works | the showroom has not picked a room in its panel |
| The room loads but a product is missing | its slot's node name is not in the mounted file (check the console warning and `?view-stage=1`), the product is unpublished, or it has no finished GLB |
| Products appear on desktop but not on phones | the `stage_<n>` empties are only in the `high` room file |
| A piece floats or sinks | its empty is not at floor height, or it was found only in the collider file while the visual files were re-based (§6.3) |
| The visitor walks above or below the visible floor | a visual file has geometry below Y = 0, so it was lifted away from the collider |
| A piece faces the wall | the empty's −Y axis (Blender) points the wrong way, or the product model's front is not glTF +Z |
| Images and models fail to load | the API is down, or `NEXT_PUBLIC_MEDIA_URL` points somewhere that does not serve `/uploads` |
| An edit in the panel does not show | wait up to 60 s (ISR); a hard refresh helps in `/store`, which fetches in the browser |
| `next build` fails fetching `/showrooms` | the API is not reachable from the build machine |

---

## 13. Where to read more

| File | Topic |
|---|---|
| `BACKEND_CUTOVER_STATE.md` | what reads the backend today and what does not |
| `QUALITY_TIER_SYSTEM.md`, `MOBILE_GPU_BUDGET.md` | the tier system and phone GPU budgets |
| `3D_COLLISION_SYSTEM.md`, `PRODUCT_CLICK_SYSTEM.md`, `STORE_PRODUCT_FOCUS.md` | collision, clicks and the camera flight |
| `MULTI_ZONE_PAINT_SYSTEM.md`, `TEXTURE_SWAP_PLAN.md` | zones, palettes and fabric swaps |
| `AR_PIPELINE.md` | how the local AR routes patch and convert models |
| `FURNITURE_SETUP_GUIDE.md` | authoring presentation manifests |

These predate the backend cut-over: they mention `public/config/*.json` and the old
`/product/<id>` and `/store` URLs, which now live under `/showroom/<slug>/…` and come from
the API. The mechanics they describe still apply.
