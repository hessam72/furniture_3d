# Backend cutover — implementation state

Companion to `furniture_backend`'s `arch-docs/panel-roadmap.md` (the plan) and
`implementation-state.md` (the backend's own state). This is the state on the
frontend side, branch `claude/connect-showroom-backend`.

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

Verified against the backend's `shahr-omid` seed (`atlas-sofa`,
`vira-armchair`, `noor-coffee-table`): real DB content renders on
`/showroom/shahr-omid` and `/showroom/shahr-omid/store`, an unknown slug
404s, and `/showroom/shahr-omid/product/atlas-sofa` correctly 404s — that
seed's products have no `frame`-role layer yet, so the backend serializes
`presentation: null` for them by design (a product with no 3D layers has
nothing for this route to draw). Typecheck (`npx tsc --noEmit`) is clean.

## What's not done

**The rest of `/store`'s 3D pipeline still reads the static demo manifest**,
not this showroom's backend data:

- `components/store/FurnitureColorApplier.tsx`
- `components/store/ProductDrawer.tsx`
- `components/store/hooks/useStoreAR.ts`
- `lib/ar/configuredModel.ts`
- `app/api/ar/[key]/model.usdz/route.ts`

These all call the original sync `resolvePresentation`/`hasPresentation`
(static `furniture-presentation.json`/`products.json`), which is why those
two files' module-scope imports are still in `lib/product/presentation.ts`.
Converting them means either threading a pre-fetched, slug-scoped
presentations map down through the 3D click/color/AR flow, or converting
each to an async fetch-on-mount — real additional work against WebGL
material code, not just a URL swap, and risked breaking a complex
Three.js pipeline blind in one pass.

**AR against the backend has a functionality gap even once wired**: the
local AR route (`lib/ar/arSource.ts` → `app/api/ar/[key]/model.glb`) accepts
a `tex` query param carrying the customer's chosen fabric per zone; the
backend's equivalent (`GET /showrooms/:slug/products/:key/ar/model.glb`)
only reads `layer`, `zone` and `paint` — a swatch pick would not travel to
AR through it today. Confirmed by reading
`furniture_backend/src/controllers/api/v1/publicProductController.ts`.

**Also out of scope, by design, not oversight**: `/manage`, `/view/[id]`,
`app/api/uploads/*` (local dev upload tooling, no DB), the homepage/`/about`/
`/ar` demo page, `RoomPlacement` (backend ships `placements: []` on
purpose — deferred on the backend side too), and the `POST /inquiries` lead
form (a natural fast-follow, not attempted this round).

## Verifying locally

```
# backend (separate repo), from its root:
npm run dev:api            # port 3010, needs Postgres up + shahr-omid seeded

# this repo:
echo "NEXT_PUBLIC_API_URL=http://localhost:3010" > .env.local
npm run dev
```

Then load `/fa/showroom/shahr-omid`, `/fa/showroom/shahr-omid/store`, and
`/fa/showroom/shahr-omid/product/<slug>` for a product that does have a
`frame` layer once one exists in the seed.
