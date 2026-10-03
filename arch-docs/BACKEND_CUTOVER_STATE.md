# Backend cutover — implementation state

Companion to `furniture_backend`'s `arch-docs/panel-roadmap.md` (the plan) and
`implementation-state.md` (the backend's own state). This is the state on the
frontend side, branch `claude/connect-showroom-backend` (continued on
`claude/admiring-galileo-bhl63b`). Audited against the code on 2026-10-03.

## What's done

`/showroom/[slug]`, `/showroom/[slug]/product/[key]`, `/showroom/[slug]/product/[key]/simple`
and `/showroom/[slug]/store` all read real per-showroom data from
`furniture_backend`'s public API (`GET /api/v1/public/showrooms/:slug/*`)
instead of the static JSON under `public/config/`.

- **`lib/api.ts`** (new) — the one place this app talks to the backend. One
  function per endpoint (`fetchShowroom`, `fetchProducts`, `fetchPresentations`,
  `fetchCatalog`, `fetchProduct`, `fetchRoom`, `fetchShowroomList`), reading
  `NEXT_PUBLIC_API_URL`, ISR-cached at 60s to mirror the backend's own
  `Cache-Control: max-age=60`, `null` on 404 so callers can `notFound()`.
- **`lib/showroom/config.ts`** — `resolveShowroom`/`showroomSlugs` are now
  async and backend-backed.
- **`lib/product/presentation.ts`** — gained async, slug-scoped siblings of
  the existing resolvers: `resolveShowroomPresentation`,
  `presentationKeysForShowroom`, `hasPresentationInShowroom`. The original
  sync, static-JSON-backed `resolvePresentation`/`presentationKeys`/
  `hasPresentation` are **kept**, not removed — see "What's not done" below.
- **Routing** — old top-level `/store` and `/product/[id]` (+ `/simple`)
  removed; their content moved under `/showroom/[slug]/store` and
  `/showroom/[slug]/product/[key]` (+ `/simple`). This matches the backend's
  own settled routing decision (`panel-roadmap.md`), which reserves the
  slugs `store`/`product`/`showroom`/etc. specifically so a tenant slug can
  never collide with these segments.
- **`/store`'s data loading** — `useStoreConfig`, `Scene`'s catalogue/products
  fetch, and `ProductInteraction` now take a `slug` (threaded from the new
  route) and call `fetchRoom`/`fetchCatalog`/`fetchProducts` instead of the
  static `stores.json`/`catalog.json`/`products.json`. `useStoreConfig` also
  dropped its `?id=` query param — the backend's `/room` is already scoped
  to one showroom, so there's nothing left to pick between.
- **`ShowroomHeader`** — `nav.links` is now optional-chained. The showroom
  panel dropped menu management in an earlier round, so real showroom data
  carries no `nav.links` array where the old static fixture always did.
- **Room placements** — `/room`'s `placements` stand each product on its
  numbered slot (`components/store/RoomPlacements.tsx`): anchor looked up in
  the mounted room clone (exact, then case-insensitive; visual files before
  the collider), piece footprint-centred on it with the anchor's yaw, GLBs
  preloaded alongside the room, one error boundary per piece, a cuboid
  collider per piece (own collision group, ignored by the focus flight's
  obstruction cast). `?view-stage=1` labels every slot (`SlotLabels.tsx`).
  Room files use the `isCollider` flag, not priority 0, and only one rung of
  the `low`/`high` LOD ladder is mounted (`roomFilesFor`: `low` on phones and
  the low tier). `/uploads/*` URLs go through `mediaUrl()`
  (`NEXT_PUBLIC_MEDIA_URL`, default the API origin).
- **Store entry** — `/showroom/[slug]/store` 404s when the showroom has no
  room, and the showroom page drops CTAs into it; a legacy `/store` href is
  re-pointed to `/showroom/<slug>/store`.
- **Product list + product page** — `/showroom/[slug]/products` (search and
  sort in the browser over `/products`, state in `?q=`/`?sort=`) and
  `/showroom/[slug]/products/[key]` (photo, specs, and the homepage's
  `ShowroomStage` turntable, lazy-mounted, GLB shown as authored). Exists for
  every published product and links on to `/product/[key]` when there is a
  presentation. Photo: `ProductData.thumbnail` (uploaded in the showroom panel),
  else the homepage collection card linking to the product. `shortDescription` and
  the panel's extra `specs` rows render too (sent since backend `f1d3b94`). Entry points: the header's
  search icon and «همه محصولات» on the collection rail. Code:
  `lib/showroom/{paths,products,productQuery}.ts`, `components/showroom/products/`.
- **Media URLs** — `lib/api.ts` runs every payload through `mediaUrl()`, so
  `/uploads/*` loads from `NEXT_PUBLIC_MEDIA_URL` (default: the API origin,
  which serves it with CORS `*`) everywhere, not only in `/room`. No consumer
  calls it again, and no `public/uploads` symlink is needed.
- **Store product list** — the category drill-down's rows show
  `ProductData.thumbnail` too (`CategoryBar`).
- **Legacy links** — authored `/store`, `/product/<key>` and
  `/product/<key>/simple` hrefs anywhere on the page (nav, CTAs, collection
  cards, footer) are re-pointed under `/showroom/<slug>/`
  (`resolveShowroomConfig`). The demo seed's collection cards use
  `/product/<key>`, which 404'd.

Verified against backend branch `claude/confident-johnson-e6taef`'s demo seed
(Postgres 16, `db:seed:demo`): `/showroom/shahr-omid`, `/products`,
`/products/<key>` (fa and en) and `/store` render real DB content, unknown slugs
and keys 404, and `next build` prerenders every showroom × product × locale.
That seed gives every product a `frame` layer, so `/product/<key>` renders too
(a product without one gets `presentation: null` and that route 404s by design).

## What's not done

**The rest of `/store`'s 3D pipeline still reads the static demo manifest**,
not this showroom's backend data:

- `components/store/FurnitureColorApplier.tsx`
- `components/store/ProductDrawer.tsx`
- `components/store/hooks/useStoreAR.ts`
- `lib/ar/configuredModel.ts`
- `app/api/ar/[key]/model.usdz/route.ts`

These all call the original sync `resolvePresentation`/`hasPresentation`
(static `furniture-presentation.json`/`products.json`, keys `nilper`,
`dining-chair`, `coffee-table` only), which is why those two files'
module-scope imports are still in `lib/product/presentation.ts`. For every
backend product the drawer offers no swatches, the colour applier does
nothing, and store AR falls back to the static `glbPath`/`usdzPath`.
Converting them means either threading a pre-fetched, slug-scoped
presentations map (`fetchPresentations(slug)`) down through the 3D
click/color/AR flow, or converting each to an async fetch-on-mount.

**Hard-coded demo slugs** (broken outside the demo seed):

- `ProductDrawer.tsx` — the details link is
  `/showroom/shahr-omid/product/<key>` for a static-manifest key, else
  `/showroom/shahr-omid/product/nilper/simple`, whatever the current showroom.
  No backend product is in the static manifest, so every drawer links to the
  second — a 404.
- `SimpleViewerClient.tsx` — the back link is `/showroom/nilper`, which no
  seed creates.
- `lib/content/home.ts` and `components/sections/HeroSection.tsx` — the
  homepage CTAs go to `/showroom/shahr-omid/store`, which exists only in
  `db:seed:demo`, not in production.

**iOS AR on `/showroom/[slug]/product/[key]` is broken.** `ProductPageClient`'s
`openAR` always sets `ios-src` to the local `/api/ar/<key>/model.usdz`, which
resolves through the static manifest and reads `public/` files
(`lib/ar/configuredModel.ts`) — a 404 for every backend product. Unlike
`/simple`, there is no `HEAD` preflight and no fallback to
`product.usdzPath`. Android is unaffected (`src` is the backend's static GLB).
The backend's AR route answers GLB only, so there is no backend path to a
configured USDZ at all.

**AR contract mismatch with the backend**, to fix before wiring
`lib/api.ts`'s `arModelUrl` (unused today; its "query contract matches"
comment is wrong):

- `paint` — this app encodes 4 zones (`PRESENTATION_ZONES` includes `shawl`);
  the backend decodes exactly 3 (`[wood, cover, cushion]`) and returns 400
  on anything else. Its `PresentationZone` enum has no `shawl`.
- `tex` — the chosen fabric per zone; the backend ignores it, so a swatch
  pick would not travel to AR.

**Commerce still points at the old demo.** `ProductPageClient` and
`components/product/ViewerDock.tsx` import the static `catalog.json` for the
cart id, so on `/simple` add-to-cart is disabled for every backend product.
The cart (`stores/storeShopStore.ts`) is localStorage-only, not scoped per
showroom, with no checkout. The backend is inquiry-only, and the
`POST /inquiries` lead form is not wired anywhere.

**Draft showrooms leak through the configurator.** `/product/[key]` and
`/simple` call only `fetchProduct`, and the backend's product endpoints do
not check `page.isPublished` — so an unpublished showroom's configurator
pages render for anyone with the URL. `/showroom/[slug]`, `/products` and
`/store` do 404.

**Panel palettes reach no page for panel-created products.** Palettes are
only sent inside `presentation`, and no panel can give a product the `frame`
layer that makes one (backend `HANDOFF.md` §9). Decided direction: the
backend sends palettes outside `presentation`, and the `/products/[key]`
turntable applies them. Not built.

**Also out of scope, by design, not oversight**: `/manage`, `/view/[id]`,
`app/api/uploads/*` (local upload tooling, no DB — unauthenticated, so
remove before production), and the homepage/`/about`/`/ar` demo page.

**The store's drill-down lists catalogue entries only**, and no backend panel
writes those (the importer and the demo seed do) — so a product created in the
showroom panel is on `/products` but not in the store's menu. The menu
(`CategoryBar`) also prints `CatalogEntry.price`, while the drawer prints
`Product.price`, so a price edited in the panel does not reach the menu.
Backend `HANDOFF.md` §9.

**Unused backend features** — `GET /product-list` (server search, filters,
facets, pages) and `related` on `/products/:key`. `/products` still
searches and sorts in the browser over the whole `/products` map.

**Textured swatches** — the API's swatch/cover `texture` object (`cover`,
`map`, `normalMap`, `repeat`, …) is not mapped onto the viewer's
`maps`/`thumbnail`, so backend fabrics render as their flat `hex`.

## Verifying locally

```
# backend (separate repo), from its root:
npm run dev:api            # port 3010, needs Postgres up + shahr-omid seeded

# this repo:
echo "NEXT_PUBLIC_API_URL=http://localhost:3010" > .env.local
npm run dev
```

Then load `/showroom/shahr-omid`, `/showroom/shahr-omid/products`,
`/showroom/shahr-omid/products/atlas-sofa`, `/showroom/shahr-omid/product/atlas-sofa`
and `/showroom/shahr-omid/store` (`/en/...` for English).
