# /simple — iOS visual quality, inside the crash budget

## Context

`perf/mobile-gpu-budget` fixed the iPhone tab reloads: textures 1074 MB → 42 MB, canvas
MSAA off on touch (86 MB → 18 MB on an iPad), contexts actually released, a 7-day crash
memory. The page survives now. It does not look good on a phone.

Reading the branch, the reason is specific and it is not a memory problem:

- `furniture-presentation.json` pins `nilper.simple.quality.mobile = "medium"` → `dpr [1, 1.6]`.
  An iPhone 15 has `devicePixelRatio` 3, so the viewer renders **1.6 of a possible 3** — about
  28 % of the panel's pixels — with **no MSAA** (correctly removed on touch) and **no post AA**.
  The pixel budget would allow DPR 3.23 on that device. The tier ratio, not the budget, is
  what is holding the page soft.
- The piece **floats**. `shadows={false}`, no ground, no plinth, flat `#ffffff`. There is no
  contact and no horizon, so a sofa reads as a cut-out.
- The rig is one `ambientLight` + two `directionalLight`s. No rim, so the silhouette dissolves
  into the white.
- `anisotropyLevel` is 4 at `medium`. Fabric at a grazing angle blurs.

None of those cost memory to fix. This plan spends a measured, bounded amount of the phone's
remaining headroom on the things that actually read, and adds the one guard the budget
document says is missing — downward pressure *before* the allocation that kills the tab.

**Decisions taken** (asked and answered): scope is `/simple` and the shared `SimpleViewer`
(so `/showroom` and `/view` inherit); DPR ceiling **2.2**, not native 3; all four visual
upgrades; verification on a real iPhone.

**Invariant for the whole plan:** everything added here is **off at the `low` tier**. `low` is
the rung `useContextRecovery` lands a crashed device on, and after this change it must still
be byte-for-byte today's page.

## Branch

The designated branch `claude/inspiring-brahmagupta-p00chp` currently sits on
`08d9224 Revert "Merge pull request #11 …"` — i.e. it is `development` *with the perf work
backed out*. Building on it would undo the branch we are asked to improve. So:

```
git fetch origin perf/mobile-gpu-budget
git checkout -B claude/inspiring-brahmagupta-p00chp origin/perf/mobile-gpu-budget
```

and push with `--force-with-lease` (the branch carries only already-merged history plus the
revert). Work lands on `claude/inspiring-brahmagupta-p00chp`; merging it into
`perf/mobile-gpu-budget` is yours to do.

## Budget arithmetic (iPhone 15, 393×852 CSS = 0.335 MP, `gpu: 'normal'`)

| | today | after |
|---|---|---|
| DPR | 1.6 | 2.2 |
| drawing buffer | 0.86 MP → **6.9 MB** | 1.62 MP → **13.0 MB** |
| contact-shadow targets | — | 512² ×2 → **~2.1 MB** |
| phone allowance (`PIXEL_BUDGET.normal.phone`) | 3.5 MP → 28 MB | 28 MB |
| headroom left | 21 MB | **~13 MB** |

A DPR-2 device (every iPad, iPhone SE) is **unchanged** — R3F clamps `devicePixelRatio` into
`[min, max]`, so a ceiling above 2 buys a DPR-2 panel nothing. A `weak` GPU is capped to `low`
by `resolveTier` and opts out of all of this. Desktop is untouched (`antialias` weight 4.5 and
the `low`/desktop guard both apply).

---

## The work

### 1. Resolution — `components/product/SimpleViewer.tsx`

The tier's `dpr` is a *ratio* and `clampDprToBudget` is the real limiter; raise the ratio on
touch so the budget is what binds, exactly as `lib/three/dprBudget.ts:53-56` intends.

- Add `VIEWER_TOUCH_DPR_MAX = 2.2` beside the other module constants (`:41`, `:45`).
- In the `dpr` memo at `:510-516`, lift `settings.dpr[1]` to that value **only** when
  `device !== 'desktop'` **and** the resolved `preset !== 'low'`. Pull `preset` from
  `useQuality()` (`:504` already destructures `settings, device, gpu`).
- Then `clampDprToBudget(...)` unchanged.

Manifest, `public/config/furniture-presentation.json` — the `simple` block (~`:820-839`):
- `"quality": { "preset": "high", "mobile": "high" }` — this is now only about
  **anisotropy 4 → 8**; the DPR part is already handled above. Set at clone time
  (`SimpleViewer.tsx:138-146`), so it costs no mip re-upload
  (`lib/three/swatchTextures.ts:238-240` is the runtime path, and we do not take it).
- Delete the dead `"path"` key. `SimpleViewerMeta` declares `model`, not `path`
  (`lib/product/presentation.ts:450`), so this line reads as config and is not. Deleting is a
  no-op; renaming it to `model` is **not** — don't.

### 2. Grounding — a frozen contact shadow

The piece is centred on the origin, so the ground is at the `bottom` that `Piece` already
computes at `SimpleViewer.tsx:187-191` and currently throws away.

- Extend `Fit` (`:54-58`) with `bottom` and `footprint`; report them from `onFit` (`:254-268`,
  keeping the ×1.2 plinth widening). `EMPTY_FIT` (`:60`) gains the two zeros.
- Mount `<ContactShadows>` from drei beside `<Frame>` (~`:604`):
  `frames={1}` (the piece never moves — only the camera orbits), `position={[0, fit.bottom, 0]}`,
  `scale` from `fit.footprint`, `resolution` from `settings.groundShadowResolution` clamped to
  **≤512 on touch**, `blur`/`opacity`/`far` authored from a new optional
  `simple.ground` manifest block with defaults that look right on white.
  `groundShadows` / `groundShadowResolution` (`lib/config/quality.ts:47-49`) are tier knobs
  **nothing in the app currently reads** — this gives them their first consumer, so the tier
  table needs no change.
- `key` on `modelPath` so a cover swap re-bakes it.
- **Gate:** `device === 'desktop' || (gpu !== 'weak' && preset !== 'low')`.
- **Pay for it:** add an optional `reserveBytes` argument to `clampDprToBudget`
  (`lib/three/dprBudget.ts:75-88`) and subtract the shadow targets from the allowance, so the
  one place that does this accounting keeps doing all of it.

`ViewerPlinth` (`components/product/ViewerPlinth.tsx`) is the ready-made alternative and
`SimpleViewer` already widens the fit for it (`:254-268`). A plinth is a *showroom* device,
though — on a product page the customer wants the sofa on a floor, not on a podium. Contact
shadow first; the plinth stays available behind `simple.plinth` if you want it later.

### 3. Backdrop sweep — a cyclorama instead of a void

`alpha:false` is correct and stays, so the gradient has to be drawn in-scene. Cheapest
correct form: a **fullscreen triangle** with `depthTest:false`, `depthWrite:false`,
`renderOrder:-1`, a `ShaderMaterial` computing the gradient + vignette from `vUv`. No texture,
no render target, one draw call, nothing per-frame.

- New `components/product/ViewerBackdrop.tsx`.
- Manifest: `simple.backdrop = { top?, bottom?, vignette? }`, resolved in `simpleViewer()`
  (`lib/product/presentation.ts:515-535`) and defaulting to today's flat `simple.background` at
  both stops with `vignette: 0` — so an unauthored product renders exactly as now.
- Keep `simple.background` as the clear colour, the CSS page background
  (`SimpleViewerClient.tsx:372`) and the loading splash (`:470-482`), so the splash → canvas
  handoff still has no flash.

### 4. Lighting rig

Don't invent a vocabulary — this codebase already has the rig. `PresentationConfig.lighting`
is `{ key, fill, rim, bounce, ambient, hemi? }` (`lib/product/presentation.ts:745-753`) and
`components/product/PresentationLighting.tsx:244-264` is it working, including the note that
the floor bounce is *"what keeps the piece grounded now that contact shadows are gone"* and a
cool `#88aaff` rim for *"edge separation from the backdrop"*. `/simple` has a stripped
three-light version of the same idea.

- Widen `SimpleViewerMeta.lighting` (`lib/product/presentation.ts:495`) from
  `{ambient, key, fill}` to the same six keys, defaults in `simpleViewer()` (`:530-532`)
  keeping today's values and `rim`/`bounce`/`hemi` at 0 so an unauthored product is unchanged.
- In `SimpleViewer.tsx:575-587` add the rim (behind and above, opposite the key, cool),
  the low warm floor bounce, and a `hemisphereLight` (sky from the backdrop's top stop, ground
  from its bottom) beside the existing `ambientLight`.

No `castShadow` anywhere, so still no shadow pass — the invariant at `:581-584` holds, and a
light costs a uniform, not a buffer. `simple.envIntensity` is authored at `1` against a tier
default of `1.5`; worth a pass on the phone once the rest is in.

### 5. Fabric

Upholstery without sheen reads as painted plastic; velvet and bouclé are the two fabrics in
the palette that need it most.

- `lib/three/layerMaterials.ts:146-186` clones with `mat.clone() as THREE.MeshPhysicalMaterial`
  — a **cast**. Add an opt-in `CollectOptions.physical` that makes the clone a real
  `MeshPhysicalMaterial` (`.copy()` from the standard one keeps every map). Opt-in so
  `FurnitureStack`/`CoverLayer` on `/product` are untouched.
- `stores/presentationStore.ts` `ZonePaint` gains `sheen`, `sheenRoughness`, `sheenColor`;
  set from `swatchPaint()` (`lib/product/presentation.ts:926-937`) and `coverSurface()`
  (`:841-850`); applied in `applyFirstCoat` (`hooks/useZonePaint.ts:21-30`) behind the same
  `!== undefined` guard `clearcoat` uses.
- **Apply sheen instantaneously, not damped**, and keep a non-zero floor on a zone that uses
  it: `three` keys the `USE_SHEEN` define on `sheen > 0`, so damping across zero would
  recompile the program mid-blend.
- **`encodePaint` stays a 4-tuple.** `lib/ar/arSource.ts:50-56` and `decodePaint` are a strict
  inverse and AR URLs are immutable-cached for a year — a fifth element invalidates every
  cached AR model and 400s old links. USD's preliminary surface has no sheen anyway, so
  nothing is lost in AR.
- Per-swatch `normalScale` on `ZoneSwatch` for the same reason: bouclé should read deeper than
  twill off the same shared `fabric-weave-normal.v1` map.

### 6. The guard — a VRAM watchdog

`arch-docs/MOBILE_GPU_BUDGET.md:493-496` names the hole: *"`PerfLadder` cannot help here. It
reacts to sustained FPS, and the tab dies at allocation time, before a frame is drawn."* True
of the first allocation — but `/simple` dies on the **second**, the cover swap. That one is
catchable.

- New `hooks/useVramWatchdog.ts`, mounted inside the Canvas. After the first drawn frame and
  after each `modelPath` change, on touch only: `estimateTextureVram(scene)`
  (`lib/three/textureBudget.ts:146`) + `gl.getDrawingBufferSize()` × 8 bytes, against
  `TEXTURE_VRAM_WARN_BYTES` (96 MB, `components/three/rendererStatsStore.ts:95`).
- Over it → demote **one rung live**: DPR shrinks and R3F resizes the buffer; no context is
  lost and nothing unmounts. `useContextRecovery` needs a `demote()` that raises `downgrades`
  without counting a loss or writing the 7-day crash record — `remount()` (`:191`) is the
  precedent for "a change that is not a failure".
- Always on, not `?debug`-gated, but it logs only under `?debug`.

---

### 7. Small things, same pass, no memory

- **The splash must match the sweep.** `SimpleViewerClient.tsx:470-482` fades a flat
  `view.background` plate over the canvas. Once the canvas draws a gradient, give the plate the
  same gradient in CSS or the handoff flashes at the edges.
- **`minZoom: 0.1`** in the manifest (default is 0.35) lets the customer dolly to a tenth of
  the framed distance. At that range a 1024² map is far past its texel density and reads as
  mush, and `camera.near = radius/100` (`SimpleViewer.tsx:343`) starts to matter. Raise it to
  ~0.3 unless the close-up is a deliberate feature.
- **Tone mapping is hard-coded** — `NeutralToneMapping` at exposure 1 (`SimpleViewer.tsx:557-558`).
  Neutral is the right default for a page whose job is colour accuracy; expose
  `simple.toneMapping` / `simple.exposure` so it can be tuned per product without a code change.
- **Optional, only if a fabric still reads mushy at DPR 2.2:** every cover colour map is ETC1S
  (`scripts/optimize-texture.sh:23-24`, verified from the KTX2 headers — all 1024², ~1.33 MB
  resident on iOS either way). Re-encoding the two or three hero fabrics as UASTC+zstd, which is
  what the *normals* already use, costs **zero extra VRAM** and ~+600 KB of download each.
  Treat it as an A/B on the phone, not a given — at 1024² on a 393 pt screen the piece samples
  mip 1–2 and the difference may not survive being looked at, which is exactly what the script's
  comment claims.

## Files

| file | change |
|---|---|
| `components/product/SimpleViewer.tsx` | DPR ceiling, `Fit` + `bottom`/`footprint`, ContactShadows, backdrop + rim light mount |
| `components/product/ViewerBackdrop.tsx` | **new** — fullscreen gradient + vignette |
| `hooks/useVramWatchdog.ts` | **new** |
| `hooks/useContextRecovery.ts` | add `demote()` |
| `lib/three/dprBudget.ts` | `reserveBytes` on `clampDprToBudget` |
| `lib/three/layerMaterials.ts` | opt-in `physical` clone |
| `lib/product/presentation.ts` | `simple.backdrop`, `simple.ground`, `lighting.rim`; sheen/`normalScale` through `swatchPaint`/`coverSurface` |
| `stores/presentationStore.ts` | `ZonePaint` sheen fields |
| `hooks/useZonePaint.ts` | apply sheen in `applyFirstCoat` (undamped) |
| `app/[locale]/product/[id]/simple/SimpleViewerClient.tsx` | splash plate gets the same gradient as the sweep |
| `public/config/furniture-presentation.json` | `mobile: "high"`, drop dead `"path"`, author `backdrop`/`ground`/`lighting`, raise `minZoom` |

Unchanged on purpose: `ViewerDock.tsx`, the AR pipeline, `encodePaint`, `/product`, `/store`,
`QUALITY_PRESETS`, `PIXEL_BUDGET`.

## Order

1. DPR ceiling + manifest tier. Smallest diff, biggest visible change. Verify first.
2. `Fit` carries `bottom`/`footprint` (pure refactor, no visual change).
3. Backdrop sweep (zero memory).
4. Rim light + hemisphere (zero memory).
5. Watchdog + `demote()` — **before** the contact shadow, so the guard is in place before the
   thing it guards.
6. `reserveBytes` + contact shadow.
7. Fabric sheen + `normalScale`.
8. The small things in §7 (splash gradient, `minZoom`, manifest-driven tone mapping).

Steps 1–4 are each independently shippable and independently revertable. If the phone says no
at any point, stop there — the page is already better than it was at step 1.

## Verification

`node_modules` is absent here and `public/models` / `public/ktx-optimized` are gitignored, so
the local loop is install-then-static:

```
npm ci
npx tsc --noEmit
npx next build
```

Then, on the real iPhone, `/product/nilper/simple?debug` — the overlay contract is
`MOBILE_PERFORMANCE.md:148-165`:

- **`dpr` reads ~2.2** (not 1.6) and **VRAM stays under 96 MB**. One renderer, one canvas —
  more than one renderer is printed in red and is a bug.
- **Ten cover swaps**: `geo` / `tex` / `prog` return to the same baseline. A climbing `prog`
  count after step 7 means sheen is recompiling — that is the `USE_SHEEN` floor not holding.
- **Five AR round trips**: renderer count stays 1, `[teardown]` on each close.
- Background the tab, reopen: the page must not have been reloaded.
- Force a loss from a desktop console —
  `gl.getExtension('WEBGL_lose_context').loseContext()` — then confirm the retry comes back at
  `low` with **no contact shadow, no sheen and DPR unraised**. That is the `low`-is-untouched
  invariant, and it is the single most important check here.
- Desktop DPR must not move. `arch-docs/MOBILE_GPU_BUDGET.md:453-454` calls this "the
  regression this work is most likely to ship by accident."
- iPad: DPR unchanged from today (it is a DPR-2 panel), contact shadow present, VRAM under 96 MB.
- `/showroom/[slug]` and `/view/[id]` mount the same `SimpleViewer` on the same `viewer` budget,
  so they inherit all of this. Check `/showroom` on the phone too — it is the one that mounts the
  viewer *embedded in a scrolling page*, so it is where a heavier canvas would show up first.

Side by side against today's build on the same phone is the actual acceptance test: the sofa
should sit on something, hold its edge against the backdrop, and stop shimmering when you turn it.