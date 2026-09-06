# Quality Tier System

Dynamic graphics quality management for the /car page with user-selectable presets (Low/Medium/High/Ultra), plus the rendering-quality subsystems each tier drives.

---

## Overview

**Location:** `/car/[id]` route
**Config:** `lib/config/quality.ts`
**Context:** `contexts/QualityContext.tsx`
**UI:** `components/car/QualitySelector.tsx` (top-right overlay)
**Persistence:** localStorage (`car-quality-preset`, `car-experimental-ssgi`)
**Default:** Medium preset

Stack: three 0.170 · @react-three/fiber 8 · drei 9.122 · @react-three/postprocessing 2.19 · realism-effects 1.1.2 · three-gpu-pathtracer 0.0.23

> three version note: realism-effects relies on `WebGLMultipleRenderTargets`, which was removed in three r172 — keep three ≤ 0.171 while the experimental SSGI mode exists.

---

## Quality Settings Interface

```ts
interface QualitySettings {
  dpr: [number, number]              // Device pixel ratio [min, max]
  adaptiveDpr: boolean               // Drop DPR during camera movement
  shadowResolution: number           // Spotlight self-shadow map size
  floorReflectionResolution: number  // MeshReflector render target
  multisampling: number              // MSAA samples inside EffectComposer
  enableSMAA: boolean                // Edge AA (composer bypasses canvas AA!)
  enableN8AO: boolean                // Ambient occlusion effect
  n8aoQuality: 'performance' | 'medium' | 'high'
  anisotropyLevel: number            // Texture anisotropy — always applied
  groundShadows: 'contact' | 'accumulative'
  groundShadowResolution: number
  envResolution: number              // Studio environment cubemap size
  envIntensity: number               // scene.environmentIntensity / envMapIntensity
  cubeReflections: boolean           // True reflections via one-shot CubeCamera
  cubeReflectionResolution: number
  experimentalSSGI: boolean          // Gates the SSGI/TRAA opt-in toggle
}
```

## Presets (summary)

| Setting | Low | Medium | High | Ultra |
|---|---|---|---|---|
| dpr | 0.5–1 (adaptive) | 1–1.5 (adaptive) | 1–1.75 | 1–2 |
| AA | SMAA | MSAA 4 | MSAA 4 + SMAA | MSAA 4 + SMAA |
| Shadow map | 512 | 1024 | 2048 | 2048 |
| Floor reflection | 128 | 512 | 1024 | 2048 |
| Ground shadows | contact 256 | contact 512 | accumulative 1024 | accumulative 1024 |
| N8AO | – | – | medium | high |
| Anisotropy | 4 | 4 | 8 | 16 |
| Env resolution | 256 | 512 | 1024 | 1024 |
| Cube reflections | – | – | 256 | 512 |
| SSGI toggle offered | – | – | – | ✓ (off by default) |

Exact values: [lib/config/quality.ts](../lib/config/quality.ts)

---

## Rendering subsystems

### Anti-aliasing — `components/store/PostProcessing.tsx`
The EffectComposer renders offscreen, so canvas `antialias` never applies; AA must come from composer MSAA (`multisampling`) and/or SMAA. Every tier now has AA.

### Studio environment — `components/car/CarStudioEnvironment.tsx`
`<Environment files resolution frames={1}>` renders the EXR base plus a Lightformer rig (overhead strips, side softboxes, rim/front cards, dome ring) into one cubemap, once. `environmentIntensity` maps to `scene.environmentIntensity` (r163+). Rotate the rig via its group to aim highlights.

### Ground shadows — `components/car/CarGroundShadows.tsx`
Low/Medium: drei ContactShadows. High/Ultra: AccumulativeShadows + RandomizedLight, baked over ~45 frames (demand-loop safe), re-baked after part swaps (~0.9s delay) and door animations (~1.4s delay). Wrapped in `userData.photoModeHide` so photo mode can hide the raster catchers.

### Material prep — `lib/three/prepareCarMaterial.ts`
Single source of truth for envMapIntensity + anisotropy + shadow flags; applied to the base car (`ConfigurableCar`) and every DynamicPart clone so swapped parts match the body. DynamicPart materials return to opaque (`transparent=false, depthWrite=true`) after fades.

### True reflections — `lib/three/useCubeReflections.ts` (High/Ultra)
One-shot CubeCamera capture (car hidden, `scene.background = scene.environment`) applied as a real `envMap` to car materials; `needsPMREMUpdate` refreshes PMREM. Captures are **frame-counted** (≈60 rendered frames after trigger) so they always land after the shadow bake finishes on any GPU speed. Re-captures on part/door changes only — paint recolors never need one.

### Tone mapping — `components/car/CarTuningScene.tsx`
`NeutralToneMapping` (Khronos PBR Neutral): brand-accurate paint hues. AgX constant kept nearby for look-dev.

### Photo mode — `components/car/PhotoMode.tsx` + `PhotoModeUI.tsx` (desktop)
three-gpu-pathtracer progressive render; r3f frameloop frozen (`never`) while active; save-to-PNG reads canvas in-tick. Max 250 samples.

### Experimental SSGI/TRAA — `components/store/PostProcessing.tsx` (Ultra, opt-in)
realism-effects `VelocityDepthNormalPass + SSGIEffect + TRAAEffect` replaces N8AO/SMAA/MSAA. Temporal accumulation requires continuous frames, so the demand loop is driven while enabled. Known-fragile library — behind `experimentalSSGI` gate + localStorage toggle.

---

## Performance architecture

The scene runs `frameloop="demand"` — it renders only on invalidation, so an idle car costs nothing. Frame drops therefore come from **per-interactive-frame cost** and **one-shot spikes**, which these systems target. Ordered by impact:

### Frozen static shadows — `components/car/ShadowFreeze.tsx`
`gl.shadowMap.autoUpdate` is turned **off**; shadow maps re-render only during frame-counted windows (`needsUpdate=true` for ~150 rendered frames) opened on mount, part swaps, door animations and quality changes. Orbiting a static car no longer repays a 2048² depth pass every frame. The AccumulativeShadows bake runs *inside* these windows, so soft ground shadows are unaffected.

### On-change ContactShadows — `CarGroundShadows.tsx`
The low/medium contact catcher uses `frames={160}` and a `key` keyed to part/door state, so it renders scene-from-below + blur only right after geometry changes instead of every frame. (High/ultra use the already-baked AccumulativeShadows.)

### Cube-capture floor swap — `lib/three/useCubeReflections.ts`
During a reflection capture the `reflective-floor` mesh is temporarily swapped to a plain dark material, so the 6 cube faces don't each re-render the live MeshReflector (was a 6× scene-render spike after every tuning change). Visually identical inside a rough paint reflection.

### DPR pixel budget — `CarTuningScene.tsx` `clampDprToBudget()`
Effective max DPR is capped so total pixels stay ≤ ~4.5MP (`min(tierMax, sqrt(BUDGET/(w·h)))`, never below native). Only bites on 4K/5K screens where DPR 2 was invisible overspend against a real fill-rate cost (× MSAA × post).

### Reflector resolution cap — `lib/config/quality.ts`
`floorReflectionResolution` 128/256/512/512. The reflector re-renders the scene into its FBO whenever it's visible; on a roughness-1, depth-faded floor, 1024/2048 targets looked identical to 512 — pure savings on the single most expensive recurring pass.

### Half-res AO — `PostProcessing.tsx`
N8AO runs with `halfRes` (+ depth-aware upsampling): ~3× cheaper AO, near-identical on a car scene.

### Adaptive DPR ladder — `CarTuningScene.tsx`
`AdaptiveDpr` (all tiers) drops resolution *during* camera motion and snaps back on the idle frame — the drop is hidden by motion. On top, drei `PerformanceMonitor` steps the tier's max DPR down a ladder (×1 → ×0.85 → ×0.7) on sustained FPS decline and back up on incline (`flipflops` guard locks a stable point; an `fps>=5` filter ignores the poisoned sample a demand-loop idle gap produces). Quality yields only under real load and recovers automatically; silent, no UI.

### Mobile default — `contexts/QualityContext.tsx`
First visit on a `<768px` screen with nothing stored defaults to the **low** preset instead of medium.

> **Measuring frame rate:** must be done on real GPU hardware. Software-GL/headless environments render the whole scene at <1 FPS, drowning these deltas in noise.

---

## Usage

```tsx
<QualityProvider>
  <CarTuningScene />
  <QualitySelector />
</QualityProvider>

const { preset, settings, setPreset, ssgiEnabled, setSsgiEnabled } = useQuality()
```

Settings apply immediately; canvas invalidates on change; persists across sessions.

---

## Troubleshooting

- **Quality changes not applied** → component not inside `QualityProvider`
- **No ground shadow after a part swap** → re-bake timers (0.9s/1.4s) run after transitions; check `CarGroundShadows` mounted
- **Paint reflections stale after door open** → re-capture is scheduled ~1.45s after `openParts` changes and lands ~60 rendered frames later (after the shadow re-bake)
- **SSGI black screen / artifacts** → turn the toggle off (localStorage `car-experimental-ssgi=0`); library is experimental
- **Ultra stutters** → VRAM bound; drop floor reflection/env resolution first

---

## File Reference

**Config/Context:** `lib/config/quality.ts`, `contexts/QualityContext.tsx`
**Scene:** `components/car/CarTuningScene.tsx`, `CarStudioEnvironment.tsx`, `CarGroundShadows.tsx`, `CarLighting.tsx`, `ConfigurableCar.tsx`, `DynamicPart.tsx`, `PhotoMode.tsx`, `PhotoModeUI.tsx`
**Shared:** `lib/three/prepareCarMaterial.ts`, `lib/three/useCubeReflections.ts`
**Post:** `components/store/PostProcessing.tsx`
**UI:** `components/car/QualitySelector.tsx`
**Page:** `app/car/[id]/CarPageClient.tsx`
