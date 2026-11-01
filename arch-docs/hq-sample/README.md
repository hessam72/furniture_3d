# OmidCity / Nilper Studio

A self-hosted, Persian single-page 3D viewer using the supplied Nilper GLB.

## Integration in this repo (served at `/hq-sample`)
- The former `dist/` lives in `public/hq-sample/` and is served as-is by `next start`; no extra build step. (Paths below that say `dist/` now mean `public/hq-sample/`.)
- `next.config.mjs` rewrites `/hq-sample` → `/hq-sample/index.html`; `<base href="/hq-sample/">` in index.html resolves the relative asset/import-map URLs.
- `middleware.ts` excludes `hq-sample` from next-intl locale routing.
- `vendor/` and `assets/` are cached for 1 day. After replacing any file there, rename it or expect up to 1 day of stale copies.
- WebGPU, and so the path-traced "رندر دقیق" mode, needs HTTPS. Over plain HTTP the page falls back to WebGL2 live mode.
- Photo mode (`app.js`), interactive:
  - When the camera stops, the path-traced image forms visibly on screen.
  - Denoising happens in stages: 16 → 64 → 256 spp on desktop, 8 → 32 → 96 on mobile. Later stages cross-fade in.
  - Finished views are kept in an LRU cache keyed by camera, lights, structure, exposure and size.
  - Exposure changes never restart tracing.
- Final render: «رندر نهایی با کیفیت بالا».
  - Desktop: long edge ≥ 2560 px, 512 spp, 10 bounces. Mobile: long edge ≥ 1600 px, 192 spp, 8 bounces.
  - Shows progress and ETA and can be cancelled.
  - The result opens in a before/after compare viewer with PNG download.
- `frameBudget` stays fixed, because changing it rebuilds every compute kernel. Throughput instead adapts through several tracer passes per frame (target ≈ 25–30 ms of GPU work).
- Fallbacks: no canvas snapshot means the render is shown as it forms; a denoiser failure shows the raw converged image; no progress for 20–30 s gives a clear message.
- `?debug` adds a HUD (renderer, adapter, state, spp, spp/s, passes, denoiser) for remote diagnosis.
- The page redirects http → https, since WebGPU only exists in secure contexts.
- The standalone `server.mjs`, `START-WINDOWS.cmd` and `vercel.json` were removed. They remain in git history (commit cc4b68e).

## Rendering
- Three.js 0.185.1, WebGPU with WebGL2 fallback.
- PBR materials, original compressed KTX2 textures and Draco geometry.
- Poly Haven Studio Small 09 HDR environment; large key/fill/rim area lights.
- A live-mode shadow-casting directional light (excluded from the path-traced light set), GTAO contact occlusion in WebGPU live mode.
- Seamless curved studio backdrop and AgX tone mapping.
- Optional WebGPU progressive path tracing with six bounces, 128 samples and OIDN auxiliary-guided denoising. It returns to raster display while moving the camera.
- Full-resolution live raster display, adaptive device pixel ratio; path tracing uses 85% of backing-buffer resolution.
- Light presets, exposure/direction, camera presets, zoom/orbit, original internal structure visibility, PNG capture and fullscreen.
- The input model is preserved unchanged. Display normalization changes the scene transform only; original fabric and wood textures are retained. Fabric gets a modest physical sheen.

## Scope and limitations
The asset is 5,281,880 bytes and has 1,037,704 triangles across four mesh primitives. Its compressed file size does not represent GPU geometry cost. It has no supplied normal map; this viewer does not claim to recreate measured fabric microgeometry. Exact color depends on the HDR lighting, exposure and display.
Path tracing needs WebGPU and can take tens of seconds or longer on slower GPUs; low initial samples are noisy. Browsers without WebGPU use the live WebGL2 mode. No mobile hardware performance guarantee.
The structure switch only hides the fabric meshes already present in the supplied model.
The optional file picker loads files locally in the browser; it does not upload them.

## Sources and attribution
- Three.js: https://threejs.org/ — MIT; license included under dist/vendor/three/LICENSE.
- three-gpu-pathtracer: https://github.com/gkjohnson/three-gpu-pathtracer — MIT.
- three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh — MIT.
- OIDN web renderer: https://github.com/pissang/oidn-web — MIT. The pinned 0.4.0 release is the compatibility name used by the tracer; upstream has renamed the package to oidn-webgpu.
- Denoising weights: upstream three-gpu-pathtracer v0.0.25, example/src/denoise/rt_hdr_alb_nrm.tza.
- HDRI Studio Small 09 by Sergej Majboroda / Poly Haven: https://polyhaven.com/a/studio_small_09 — CC0.
- Vazirmatn by Saber Rastikerdar: https://github.com/rastikerdar/vazirmatn — SIL Open Font License.
- Nilper_Final-optimized.glb: user-provided asset.

## Validation
Syntax checked and tested with the actual supplied GLB in the in-app browser. Live WebGPU rendering, light presets, camera changes, structure visibility and progressive path tracing were exercised. Further verification notes are recorded in QA.md.
