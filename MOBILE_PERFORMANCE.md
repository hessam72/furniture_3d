# Mobile performance — what changed

Branch `perf/mobile-gpu-budget`. Fixes the iPhone tab reloads on `/product/[id]`,
`/product/[id]/simple`, `/store` and `/showroom/[slug]`.

Full detail: [`arch-docs/MOBILE_GPU_BUDGET.md`](arch-docs/MOBILE_GPU_BUDGET.md).

---

## The problem, in one number

`/product/test` was asking a phone for **over 1 GB of texture memory**. iOS gives a
Safari tab around 1.5 GB in total, and caps canvas-backed memory at 256 MB on
several versions. So the tab was killed and reloaded — repeatedly.

| file | on disk | texture VRAM |
|---|---|---|
| `final-scene.glb` (the room) | 20.5 MB | **740 MB** |
| leather cover | 13.0 MB | **284 MB** |
| velvet cover | 13.1 MB | 50 MB |
| **all three, as `/product` mounts them** | 45.6 MB | **1074 MB** |

The room has three separate 4096×4096 maps. The leather sofa has three 4000×4000.

**Why nobody caught it:** WebP compresses a 4000×4000 map to 850 KB, so the files
look tiny. The GPU still unpacks it to `4000 × 4000 × 4` bytes plus a third again
for mips — 81 MB, from a file that looked like a rounding error.

**File size tells you nothing about GPU memory.** `width × height × 4 × 1.33` does.

---

## After

**1074 MB → 42 MB** of texture memory, and half the download.

---

## What was changed

1. **Asset pipeline** — every texture capped at 1024 and converted to KTX2/Basis,
   which stays compressed *in GPU memory* (ASTC on iOS). This is the fix; the rest
   is the difference between a page that survives and a page that survives well.
2. **Tier ceilings** — a phone could reach `ultra` three different ways. Closed.
3. **WebGL contexts** — R3F never calls `gl.dispose()`, so contexts piled up on
   every AR round trip and route change. They are released properly now, and no
   page keeps a canvas alive under an AR overlay any more.
4. **Crash recovery** — a lost context now unmounts, drops a quality rung and
   offers a retry, on all four pages. Only `/product` had this before.
5. **Leaks** — material clones that were never disposed, a scene that re-cloned
   itself on every quality-chip tap, and a GLB cache that never released anything.
6. **Dependencies** — dropped a dead code path that was pinning three.js to 0.170;
   now on 0.180, which contains Safari's context-cleanup fixes. No React or Next
   upgrade needed.
7. **HDR** — the 5.7 MB environment map turned out to be an LDR image stored at 16
   bytes a pixel. Now 524 KB, with nothing lost.

---

## What you need to do

### 1. Re-encode the models (required — this is the actual fix)

`public/models` is gitignored, so nothing in the repo is converted yet.

```bash
npm i -g @gltf-transform/cli
brew install ktx                     # or the KTX-Software release on Linux

npm run glb:optimize  out/  public/models/**/*.glb
npm run glb:budget    out/*.glb      # confirm the numbers
```

Copy `out/` up to the server over the existing paths. About 20 seconds per model.

### 2. Check any model before it ships

```bash
npm run glb:budget public/models/presentation/test/*.glb
```

Green ✔ under 96 MB, ⚠ over it, ✖ over 256 MB. Add `--strict` to make it exit
non-zero — worth putting in front of a deploy so a 4096² map can never reach
production again.

### 3. Verify on the phone

Open any of the four pages with **`?debug`**. An overlay appears in the corner:

```
VRAM 38MB · 1 renderer · 1 canvas · low
simple · 0fps · dpr 1.00 · 38MB
geo 41 · tex 12 · prog 18 · calls 22 · 104k tris
1024×1024 1.3MB fabric_1basecolor
```

- **VRAM** is the number that matters. Under 96 MB is comfortable.
- **More than one renderer is a bug** — the overlay says so in red. That is a
  canvas that was not torn down, which is what filled the memory up.
- Open and close AR five times. The numbers must come back to the same baseline.

The pass/fail test: `/product/test` on the iPhone survives ten cover swaps and
five AR round trips without reloading.

---

## Still to do

`velvet.glb` is **695,572 triangles** — 4.6× what iOS Quick Look can carry.
Textures are fixed, geometry is not. That model needs a decimated stand-in
(`gltf-transform simplify`) wired to the `arPath` slot in
`public/config/furniture-presentation.json`, which is still empty.
