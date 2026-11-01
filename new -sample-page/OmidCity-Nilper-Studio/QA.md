# Validation

- JavaScript syntax checked.
- Actual user GLB loaded successfully with both Draco and KTX2 decoding.
- Live WebGPU, light presets, camera presets, internal structure switch, reset and 390×844 responsive layout verified in the in-app browser.
- Progressive WebGPU path tracing and auxiliary-guided denoising executed.
- PNG export downloaded and visually inspected: non-empty sofa image with floor shadows.
- Added one-in-flight GPU submission pacing for photo mode to avoid building a backlog of compute work.
- WebGL2 fallback is implemented but was not exercised on a physical non-WebGPU device. Mobile layout was tested by viewport, not on phone hardware.
- Model emits clustered-BVH warnings for a few densely overlapping primitives; no fatal render errors were observed.
