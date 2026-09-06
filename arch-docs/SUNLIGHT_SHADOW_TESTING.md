# Testing the /store window-sunlight effect

## 1. Prep
- Make sure `main.glb` has a window opening and a mesh named with `glass` for the pane(s).
- `npm run dev`, open `http://localhost:3000/store`.

## 2. Aim the sun
Open `http://localhost:3000/store?sundebug=1` (dev-only).

You'll see:
- A **yellow gizmo** at the sun's position/direction.
- A **wireframe box** = the shadow camera frustum.

Check the box fully encloses the room. If it doesn't, sunlight will leak through walls outside the box.

Controls:
| Key | Effect |
|---|---|
| Arrow keys | Move sun on X/Z |
| Shift + Arrow keys | Move target (aim point) on X/Z |
| Page Up / Page Down | Move sun on Y |
| `+` / `-` | Intensity up/down |
| `[` / `]` | Shrink / grow the shadow box |

Every keypress logs to the browser console:
```
[sundebug] paste into stores.json →
{ "sun": { ... } }
```

## 3. Save your tuned values
Copy the last console block and paste it over the `sun` object in
`public/config/stores.json` (under the `mall` store).

## 4. Verify
- Reload `/store` (no `?sundebug=1`) — floor should show a soft-edged, window-shaped
  light patch that blurs more at the edges (PCSS signature).
- Walk around — shadow should stay stable, no flicker.
- Set `"enabled": false` in the `sun` block — shadow/sun should disappear, scene back to normal.

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| No shadow at all | `sun.enabled` is `false`, or GLB has no `main.glb` loaded |
| Light leaks through walls | Shadow box too small — grow it with `]` in sundebug and re-save |
| Whole window is one solid dark shadow (no light through glass) | Pane mesh isn't named with `glass` |
| Hard edges, not soft | Check `soft.samples`/`soft.size` in the `sun` config didn't get zeroed out |
| Washed out / blown out patch | Lower `sun.intensity` (try steps of 4-5 from current value) |

---

# The same sun on /product

The presentation page reads the identical `sun` block, and mounts /store's own
`SunLight` / `ShadowSystem` / `SunDebug` — imported, not forked — so a
`?sundebug=1` printout pastes into either manifest unchanged.

- **Where:** `public/config/furniture-presentation.json`, per product, as a
  sibling of `room` / `lighting` / `camera`.
- **Off by default.** No `sun` block, or `"enabled": false`, and the page
  renders with no shadow maps at all, as it did before. The trimmed
  front-facing-only room is what made dropping the shadow pass worth it, so
  turn this on for a room that actually has a window.
- **Tune it at** `http://localhost:3000/product/test?sundebug=1` — same keys as
  the table above.

## One difference: the shadow box fits itself

`shadow.left/right/top/bottom` are optional here. Leave all four out and the
frustum is solved from the room GLB's measured bounds every time it loads
(`PresentationSun`), instead of being hand-tuned per product — the light's
eight box corners are projected into its view space and the extents taken
there, so it holds for a sun aimed diagonally across the room. `target`
defaults to the measured room centre for the same reason.

Name all four and yours win, unchanged. `bias` / `normalBias` are always yours.

This removes the failure at the top of the troubleshooting table: an undersized
box does not clip the shadow, it makes drei's PCSS shader return *fully lit*
outside the frustum, so sunlight pours through the walls.

## GLB naming contract

Unchanged, and now enforced in `preparePresentationObject` for the room and the
furniture alike:

| Mesh name contains | Effect |
|---|---|
| `glass` | never casts — the depth pass is alpha-blind, so a pane blacks out the whole sun patch. The frames around it cast, and that is what paints the window pattern on the floor |
| `lamp` | never casts, so a glowing shade throws no hard sun shadow |
| `ceiling` | already double-sided by PresentationRoom |

---

# Reflective floor on /product

Not /store's `ReflectiveFloor` component. That one is an **opaque** plane
carrying its own concrete texture — it *is* the salon floor. A room GLB already
has a floor, so `PresentationFloor` ports the technique instead: the same drei
planar reflector (scene re-rendered from a camera mirrored through the plane,
obliquely clipped at it) on a **transparent plane with no map**, sitting 4mm
above the real floor. What the reflection does not cover, the room's own texture
shows through.

- **Where:** `public/config/furniture-presentation.json`, per product, a `floor`
  block beside `sun`. Absent, or `"enabled": false`, and no reflection pass runs.
- **On at every quality tier**, unlike /store's floor, which `low` switches off
  outright. /store pays the reflection pass for a walkable salon whose contents
  change with every step; this is one piece in a booth under a camera that only
  dollies, on a demand loop that draws nothing while the viewer is still. So the
  tier scales it by *resolution* rather than removing it — 128² on low up to
  2048² on ultra. Set `floor.resolution` to overrule that; the test product
  pins 512 because 128 is visibly coarse on a floor that fills half the shot.
- **`enabled: false` is the only way off**, and it leaves the room's own floor —
  which is why nothing looks missing when it is.
- **Tune it at** `http://localhost:3000/product/test?floordebug=1`:

| Key | Effect |
|---|---|
| `[` / `]` | opacity — how much floor texture survives |
| `-` / `+` | mix strength |
| `,` / `.` | blur |
| `b` | flip `normal` ⇄ `additive` |

Each keypress logs a paste-ready `{ "floor": { ... } }` block.

## opacity, and which blend

`opacity` is the whole feature: 1 is a mirror with the texture gone, 0.35 (the
default) leaves the tiles as the thing you read and the reflection as a sheen.

`blend` decides what the reflection is allowed to do to it:

- **`normal`** alpha-blends. Dark reflections darken the floor, which is what a
  surface actually does as it turns mirror-like. The default.
- **`additive`** only ever adds reflected light — nothing darkens, so the
  texture survives at any opacity. Better over a dark floor; a bright
  reflection can blow out.

`size` and the plane's centre are fitted to the room's measured footprint, like
the sun's frustum. Give `size` explicitly for a photographed backdrop, which has
no room to measure.

## Why it neither casts nor receives

Casting would print a hard-edged rectangle of shade on the floor 4mm underneath
it. Receiving would apply the sun's shadow a second time over a floor that has
already taken it — and a shadow across a polished floor dims its diffuse, not
what is reflected in it, so leaving the shadow to the real floor is also the
truer answer.

---

# /product manifest: quality, loading, camera

## `quality` — the tier, per product instead of per device

`QualityProvider` drops to `low` under 768px on a first visit, and otherwise
restores whatever /car's quality selector last stored (they share the
`car-quality-preset` key). On `low` that means **floor reflections off**, a 512
shadow map instead of 2048, dpr `[0.5, 1]` and a 256 environment — the phone
was rendering a visibly different scene from the desktop.

Right for /car and /store, which are free-roaming and cost whatever the player
walks into. Wrong here: a presentation is one piece in a booth under a camera
that only dollies, so its frame cost is known up front and is the same
everywhere. The manifest names the tier and `QualityProvider` is pinned to it,
bypassing both the stored preset and the phone downgrade.

```json
"quality": { "preset": "high", "mobile": "low" }
```

`quality.mobile` **defaults to `preset`** — nothing is downgraded silently.
Omit the block entirely and the app-wide default (`medium`) applies everywhere.

Which device gets `mobile` is `PHONE_QUERY`, and it is a phone test, not a
narrow-window test:

```
(pointer: coarse) and ((max-width: 767px) or (max-height: 767px))
```

`pointer: coarse` keeps a desktop browser dragged narrow on the desktop tier.
The **short side** under 768px then splits phone from tablet in either
orientation — an iPad is 768 across even in portrait, a phone in landscape is
~430 tall — which testing width alone gets backwards.

Note the two runtime scalers are unaffected and still apply on both: `PerfLadder`
steps DPR down under sustained load, and `clampDprToBudget` caps it on very
high-resolution screens.

## Loading

`useAssetProbe` HEAD-checks the manifest's URLs before mounting the canvas, but
that only proves the files exist. Everything after it streamed in behind
`Suspense fallback={null}` — blank, then a room, then a piece, in whatever order
the network delivered.

`PresentationLoading` now covers the canvas until `SceneReady` fires, which
takes its cue from the scene's own products rather than a loader count: the
stack has published `framing`, the room (when there is one) has published its
bounds, and one `gl.compile` has run, so the first visible frame is not the one
that stalls compiling shaders. `useProgress` drives the bar only — it reports
0 of 0 both before the first request and after a warm cache, so it cannot decide
readiness. A 20s failsafe reveals the scene anyway rather than hanging.

## Camera: portrait no longer reverses through the wall

Two defects, both invisible on desktop:

1. **The lift aimed the camera under the floor.** To clear the bottom sheet the
   rig aimed *below* the piece, by a distance scaling with both the framed
   distance and the sheet's screen coverage. A phone maximises both — roughly a
   2m dive on a sofa whose centre is 0.4m up, which a 10° elevation cannot climb
   back out of. It is now a **lens shift** (`camera.setViewOffset`), which skews
   the frustum down and moves the image up on screen for the identical result,
   from a camera that stays on the piece's level. Every metre of that dive also
   came off the pull-back the room could afford, since the wall limit was
   measured from the sunken point.
2. **The wall clamp failed open.** A room too tight to hold `WALL_MARGIN`
   returned `Infinity` — read as "unclamped" — in precisely the case that needed
   the clamp. It now returns the smallest usable distance.

And the reason lowering `maxZoom` "fixed" the phone at the cost of the desktop:
`fov` is vertical, so a portrait canvas needs roughly twice the pull-back, and a
booth modelled around the piece does not have it. Rather than crop or reverse,
the rig now **opens the lens** until the piece fits at the distance the room
actually affords, capped by `camera.maxFov` (default 75; set it equal to `fov`
to refuse and take the crop). Desktop never reaches the limit, so its lens never
widens and its full zoom range is untouched. `camera.wallMargin` (default 0.35m)
tunes the clearance.

---

# The stage layer

A plinth for the piece to stand on, added under `layers.stage`:

```json
"layers": {
  "frame":  { "path": "/models/presentation/test/frame.glb", "label": "..." },
  "cover":  { "...": "..." },
  "stage":  {
    "path": "/models/presentation/test/stage.glb",
    "liftPiece": true
  }
}
```

| Key | Meaning |
|---|---|
| `path` | the GLB. Probed with the others, so a wrong path shows the missing-assets notice rather than a hole in the scene |
| `liftPiece` | raise the piece to stand on top, by the stage's own **measured** height — re-export a thicker plinth and nothing needs re-tuning |
| `scale` | uniform, for a stage exported in the wrong unit |
| `offset` | moved after it is centred under the piece and seated on the floor |
| `envIntensity` | its own reflection strength (default 1) |

## What it is, and the two things it deliberately is not

**It spins with the piece.** `stageYawRef` takes the same damped yaw the piece
does in the same frame, so the two never shear apart mid-drag. Yaw *only*, and
mounted as a sibling of `furniture-stack` rather than a child, so it stays
outside the tilt pivot: a plinth that tipped with a vertical drag would lift off
the floor along one edge, and a turntable does not tilt.

**It takes no colour.** `collectZoneTargets` is never run over it, so no mesh of
its can become a paint target however it is named or tagged in Blender. The
swatches dress the piece; a plinth that changed with them would read as part of
the product.

**It never reaches AR.** `ExportSources` has room for the frame, the soft layer
and the cover and nothing else, and the stage is simply never registered, so
`exportConfiguredGLB` has no way to include it. What the customer places in
their own room is the furniture, not the showroom it was shot in.

Both exclusions are structural — there is no flag to get wrong.

## Framing follows the lift

With `liftPiece`, everything that seats or measures the piece reads the deck
height instead of `room.floorY` — the framing included, because a piece raised
onto a plinth has genuinely moved up in the room, and a camera that ignored it
would frame the plinth and crop the piece. That is the opposite of
`room.pieceOffsetY`, which is a screen-space nudge the camera is deliberately
blind to.

The stage shares the piece's Suspense boundary rather than taking one of its
own, so the loading splash waits for it — the soft and cover layers get their
own boundary precisely because they may arrive late, and the stage may not.

---

# Zoom target and furniture height

## `camera.aimHeight` — where the dolly converges

The camera rides a ray at a fixed elevation, so its height above the aim point
is `sin(elevation) × distance`. Zoom in and that shrinks to nothing, leaving the
camera at the aim point's own height:

```
camera.y = target.y + sin(8°) × distance
far  (d=4m):  0.40 + 0.56 = 0.96m   → above the sofa
near (d=1m):  0.40 + 0.14 = 0.54m   → below its top edge
```

Aimed at the piece's geometric centre — the old fixed behaviour — a close dolly
therefore ends at seat level, looking at the sofa from underneath its top. It is
not the zoom that is wrong, it is what the zoom converges on.

`camera.aimHeight` is that point as a fraction of the piece's height: `0` its
base, `0.5` its centre (the previous behaviour, still the default), `1` its top.
The test product uses `0.8`.

The piece does not move on screen as you change it. The lens shift that keeps
the piece clear of the bottom sheet is now **re-solved per distance**, because
the aim point sits `aimOffset` metres above the piece's centre and a metre
covers a larger share of the screen the closer you get. A fixed shift would let
the piece slide down the frame as the dolly came in; the correction has to track
the perspective exactly. It is clamped to ±0.45 of the viewport, since a frustum
skewed most of its own height off-axis is degenerate.

## `room.pieceLift` — the furniture's height in the room

```json
"room": { "floorY": 0, "pieceLift": 0.25 }
```

Metres above `floorY`, and **the camera follows it**. This is the opposite of
`room.pieceOffsetY` in the one way that matters: that one is a screen-space
nudge the framing is deliberately blind to, for landing a piece on a
photographed floor, while this is where the piece actually is — so everything
that seats or measures it reads the raised height, framing included. A piece
lifted in the room has moved, and a camera that ignored it would frame the empty
space underneath.

It adds to a stage's `liftPiece`, so a plinth and a manual nudge compose.

---

# Zoom-out: why the phone left the room and the desktop did not

The camera never left the room's **bounding box** — the clamp works. The box is
just a bad proxy for the room. `PresentationRoom`'s booth is authored
front-facing only ("there is no geometry behind the static camera"), which is
where its download saving comes from, so the box reaches past the built walls
and over the ceiling. A camera inside the box but outside the modelled room
looks exactly like one that flew out through the back of it. Add a `room.offset`
that drops the GLB a metre or two and the box carries that dead air with it.

A phone reached that dead air and a desktop never did, for one reason: **`fov`
is vertical**, so on a portrait canvas the horizontal fit — `radius / aspect` —
blows up, and the same shot costs roughly twice the metres. It is the metres
that differ between the two devices, not the shot. Which is exactly why a
per-device `maxZoom` looks like the answer and is not: it fixes the phone by
making its zoom-out mean something different from the desktop's.

## What it does instead

`zoom` means one thing: the fraction of the framed band the piece covers. That
is already device-independent. So the rig caps the *metres* and spends the
remainder on the **lens** — `solveShot` returns a distance and a field of view
together. Once the pull-back limit is reached the camera stops moving and the
fov opens toward `camera.maxFov`, shrinking the piece by exactly as much as the
metres would have. Both are damped on the same clock, so a zoom-out that runs
out of room reads as one continuous movement rather than a hand-off.

The limit is the tightest of three:

| Source | What it is |
|---|---|
| room bounds | the ray-box exit less `camera.wallMargin` — a ceiling, not a fit |
| **landscape ceiling** | what a landscape window would need at `maxZoom`, computed from the same solve with `aspect` floored at 1. **A phone is never further from the piece than a desktop would be.** Automatic; a desktop's aspect is already ≥ 1 so this is the distance it was already using, and nothing there changes |
| `camera.maxDistance` | an explicit metre cap, for a trimmed booth whose box lies about where the room ends. Optional |

## `camera.startZoom` and the opening shot

It used to be expressed against the *achievable* distance, precisely because the
room could truncate the range — which quietly pulled a phone in, since the room
truncated it there and not on a desktop. The range is honest now, so the same
`0.9 × maxZoom` opened both at the same zoom and the phone looked far out.

It is a fraction of `maxZoom`, scaled by how much of the framing the piece's
*height* accounts for. `zoom` is a share of the framed band, so the same number
gives the same share on any screen — but in portrait the framing is set by the
piece's **width**, and a shot that just fits a sofa across a narrow canvas
leaves it small down the middle with the band half empty above and below.
Identical by the numbers, much further away to look at.

Scaling by the vertical share cancels exactly the part of the pull-back the
width imposed, so the piece opens at the same on-screen height it does on a
desktop — where the share is 1 and nothing changes. It is floored at the
just-fits shot, so it can only bring the opening closer, never crop the piece,
unless the configured value asked to open inside the framing to begin with.

`?debug=1` prints `vShare` and the resolved opening `zoom`.
