# Visual Improvements Guide for Car Scene

Complete reference for enhancing 3D car visualization with lighting, post-processing, materials, and rendering techniques.

---

## Current Setup

**Lighting:** Three-point spotlight setup (key, fill, rim) + ambient
**Environment:** HDRI (`main_hdr.exr`) at 0.8 intensity
**Post-processing:** Bloom + Vignette (N8AO & SMAA disabled)
**Materials:** MeshPhysicalMaterial with clearcoat, metalness 0.9, roughness 0.3
**Reflections:** MeshReflectorMaterial floor
**Tone mapping:** ACESFilmic at 1.0 exposure
**Anti-aliasing:** Built-in WebGL AA

---

## 1. Lighting Options

### Ground Bounce Light
Adds realistic reflected light from the floor.

```tsx
// In CarLighting.tsx
<pointLight
  position={[0, 0.5, 0]}
  intensity={40}
  distance={6}
  decay={2}
  color="#ffeedd"
/>
```

### Enhanced Rim Light
Better edge definition with cooler blue tone.

```tsx
<directionalLight
  position={[-2, 4, -8]}
  intensity={2}
  color="#88aaff"
/>
```

### Three-Point Car Setup (Complete)
```tsx
// Key (main): Strong from 45° front-right
<directionalLight
  position={[6, 8, 6]}
  intensity={2.5}
  castShadow
  shadow-mapSize={[2048, 2048]}
  shadow-camera-left={-10}
  shadow-camera-right={10}
  shadow-camera-top={10}
  shadow-camera-bottom={-10}
/>

// Fill: Soft from opposite side
<spotLight
  position={[-8, 6, 4]}
  intensity={80}
  angle={0.7}
  penumbra={0.9}
/>

// Rim/Back: Edge definition
<directionalLight
  position={[-2, 5, -8]}
  intensity={1.8}
  color="#88aaff"
/>

// Ground bounce
<pointLight
  position={[0, 0.5, 0]}
  intensity={30}
  distance={5}
  decay={2}
  color="#ffffff"
/>
```

### RectAreaLight Panels (Studio Quality)
Soft, professional studio lighting panels.

```tsx
import { RectAreaLight } from '@react-three/drei'

// Left panel
<RectAreaLight
  width={5}
  height={5}
  intensity={10}
  position={[-8, 5, 0]}
  rotation={[0, Math.PI / 2, 0]}
/>

// Right panel
<RectAreaLight
  width={5}
  height={5}
  intensity={10}
  position={[8, 5, 0]}
  rotation={[0, -Math.PI / 2, 0]}
/>
```

### HDRI Environment Control
```tsx
import { Environment } from '@react-three/drei'

// Rotate HDRI for better reflections
<Environment
  files="/hdr/main_hdr.exr"
  environmentRotation={[0, Math.PI / 4, 0]}  // Adjust angle
  environmentIntensity={1.0}                  // Increase from 0.8
  blur={0.8}                                  // Softer reflections
/>

// Alternative: Use presets
<Environment preset="studio" background={false} />
// Options: apartment, city, dawn, forest, lobby, night, park, studio, warehouse
```

### Light Types Reference
```tsx
// Directional - Sun-like parallel rays
<directionalLight position={[10, 10, 5]} intensity={1} castShadow />

// Spot - Cone-shaped beam
<spotLight position={[5, 8, 5]} angle={0.5} penumbra={0.5} />

// Point - Omnidirectional bulb
<pointLight position={[0, 5, 0]} intensity={100} decay={2} />

// Hemisphere - Sky/ground gradient fill
<hemisphereLight args={['#87CEEB', '#545454', 0.6]} />
```

---

## 2. Post-Processing Effects

### SMAA Anti-Aliasing
Sharpest edge quality.

```tsx
import { SMAA } from '@react-three/postprocessing'

<EffectComposer multisampling={0}>
  <SMAA />
  {/* other effects */}
</EffectComposer>
```

### Screen-Space Reflections (SSR)
Mirror-like paint reflections.

```tsx
import { SSR } from '@react-three/postprocessing'

<SSR
  intensity={0.45}
  exponent={1}
  distance={10}
  fade={2}
  roughnessFade={1}
  thickness={10}
  ior={1.45}
  maxRoughness={0.1}
  maxDepthDifference={10}
  blend={0.95}
/>
```

**Performance:** Heavy - desktop only

### Ambient Occlusion (N8AO)
Contact shadows in crevices for depth.

```tsx
import { N8AO } from '@react-three/postprocessing'

<N8AO
  aoRadius={0.5}
  intensity={3}
  quality="medium"  // "performance" | "medium" | "high"
/>
```

**Performance:** Heavy - use "performance" on mobile

### Depth of Field
Blur background for focus on car.

```tsx
import { DepthOfField } from '@react-three/postprocessing'

<DepthOfField
  focusDistance={0.01}
  focalLength={0.02}
  bokehScale={3}
/>
```

### Chromatic Aberration
Lens edge color fringing.

```tsx
import { ChromaticAberration } from '@react-three/postprocessing'

<ChromaticAberration offset={[0.0005, 0.0005]} />
```

### Enhanced Bloom
Better glow on bright reflections.

```tsx
import { Bloom } from '@react-three/postprocessing'

<Bloom
  intensity={0.3}
  luminanceThreshold={0.8}  // Only bright reflections bloom
  luminanceSmoothing={0.3}
  mipmapBlur                 // Better quality
/>
```

### Complete Studio-Quality Stack
```tsx
import {
  EffectComposer,
  SMAA,
  SSR,
  N8AO,
  Bloom,
  DepthOfField,
  ChromaticAberration,
  Vignette,
  ColorGrading,
} from '@react-three/postprocessing'

<EffectComposer multisampling={0}>
  <SMAA />
  <SSR
    intensity={0.45}
    maxRoughness={0.1}
  />
  <N8AO
    aoRadius={0.5}
    intensity={3}
    quality="medium"
  />
  <Bloom
    intensity={0.25}
    luminanceThreshold={0.85}
    mipmapBlur
  />
  <DepthOfField
    focusDistance={0.01}
    focalLength={0.02}
    bokehScale={3}
  />
  <ChromaticAberration offset={[0.0005, 0.0005]} />
  <ColorGrading
    brightness={0.05}
    contrast={0.1}
    saturation={0.15}
  />
  <Vignette darkness={0.5} />
</EffectComposer>
```

---

## 3. Material Enhancements

### Iridescent Paint
Color shift at angles (exotic/pearl paints).

```tsx
// In ConfigurableCar.tsx where materials are applied
material.iridescence = 0.3
material.iridescenceIOR = 1.3
material.iridescenceThicknessRange = [100, 800]
```

### Enhanced Clearcoat
Glossier top coat for paint.

```tsx
material.clearcoat = 1.0
material.clearcoatRoughness = 0.03  // Lower = glossier
```

### Boost Environment Reflections
```tsx
material.envMapIntensity = 1.5  // Multiply HDRI reflections
```

### Complete Car Paint Material
```tsx
const carPaint = new THREE.MeshPhysicalMaterial({
  color: '#ff0000',
  metalness: 0.9,
  roughness: 0.2,

  // Clearcoat (glossy top layer - critical for cars)
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,

  // Iridescence (optional - exotic paints)
  iridescence: 0.3,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 800],

  // Reflections
  envMapIntensity: 1.5,
  reflectivity: 1,
  ior: 1.5,
})
```

### Chrome Material
```tsx
const chrome = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  metalness: 1,
  roughness: 0.05,
  envMapIntensity: 2,
})
```

### Glass Material (Windows)
```tsx
const glass = new THREE.MeshPhysicalMaterial({
  color: '#88ccff',
  metalness: 0,
  roughness: 0,
  transmission: 0.95,
  thickness: 0.5,
  ior: 1.5,
  envMapIntensity: 1,
})
```

### Carbon Fiber Material
```tsx
const carbonFiber = new THREE.MeshPhysicalMaterial({
  color: '#0a0a0a',
  metalness: 0.5,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  normalMap: carbonNormalMap,
  normalScale: [0.5, 0.5],
})
```

---

## 4. Shadow Improvements

### Higher Resolution Shadows
```tsx
// In CarLighting.tsx on directional/spot lights
<directionalLight
  castShadow
  shadow-mapSize={[2048, 2048]}  // Up from 1024
  shadow-bias={-0.0001}
  shadow-normalBias={0.02}
/>
```

### Contact Shadows
Soft ground contact shadows.

```tsx
import { ContactShadows } from '@react-three/drei'

<ContactShadows
  position={[0, -0.79, 0]}
  opacity={0.6}
  scale={10}
  blur={2}
  far={4}
  resolution={512}
  color="#000000"
/>
```

### Soft Shadows Helper
```tsx
import { SoftShadows } from '@react-three/drei'

<SoftShadows
  size={25}       // Light size (larger=softer)
  samples={16}    // Quality (4-64)
  focus={0}
/>
```

### Canvas Shadow Configuration
```tsx
<Canvas
  shadows="soft"  // false | 'basic' | 'percentage' | 'soft' | 'variance'
  gl={{
    shadowMapType: THREE.VSMShadowMap,  // VSMShadowMap for soft shadows
  }}
>
```

---

## 5. Floor Reflections Upgrade

### Enhanced MeshReflectorMaterial
```tsx
// In ReflectiveFloor.tsx
<MeshReflectorMaterial
  resolution={2048}        // Up from 1024 (quality)
  mixStrength={40}         // More reflective (from 30)
  mixBlur={1}              // Blur amount
  blur={[400, 100]}        // [horizontal, vertical] samples
  mirror={0.9}             // Reflection mix (higher = more mirror-like)
  metalness={0.9}
  roughness={0.8}
  depthScale={0.4}
  minDepthThreshold={0.35}
  maxDepthThreshold={1.5}
  color="#2a2a2a"
/>
```

### Mobile Alternative (ContactShadows)
```tsx
{isMobile ? (
  <ContactShadows
    position={[0, -0.79, 0]}
    opacity={0.5}
    scale={10}
    blur={2}
  />
) : (
  <ReflectiveFloor />
)}
```

---

## 6. Tone Mapping & Color

### Increase Exposure
Brighter metals and reflections.

```tsx
// In CarTuningScene.tsx Canvas
<Canvas
  gl={{
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.2,  // Up from 1.0
    outputColorSpace: THREE.SRGBColorSpace,
  }}
/>
```

### Color Grading
Fine-tune colors, brightness, contrast.

```tsx
import { ColorGrading } from '@react-three/postprocessing'

<ColorGrading
  brightness={0.05}   // -1 to 1
  contrast={0.1}      // -1 to 1
  saturation={0.15}   // -1 to 1
  hue={0}             // -180 to 180
/>
```

### Tone Mapping Options
```tsx
import {
  ACESFilmicToneMapping,  // Cinematic (current)
  LinearToneMapping,      // No tone mapping
  ReinhardToneMapping,    // Simple, fast
  CineonToneMapping       // Film-like
} from 'three'

<Canvas
  gl={{
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.2,
  }}
/>
```

---

## Implementation Tiers

### Tier 1: Quick Wins (No Performance Cost)

**Time:** 5 minutes
**Performance Impact:** None

```tsx
// 1. Ground bounce light
<pointLight position={[0, 0.5, 0]} intensity={40} distance={6} decay={2} color="#ffeedd" />

// 2. Better rim light
<directionalLight position={[-2, 4, -8]} intensity={2} color="#88aaff" />

// 3. Tone mapping exposure
toneMappingExposure: 1.2  // In Canvas gl prop

// 4. (Optional) Iridescence on paint
material.iridescence = 0.3
```

### Tier 2: Quality Boost (Moderate Cost)

**Time:** 15 minutes
**Performance Impact:** ~5-10% FPS reduction

```tsx
// 5. SMAA anti-aliasing
<SMAA />

// 6. Chromatic aberration
<ChromaticAberration offset={[0.0005, 0.0005]} />

// 7. Shadow resolution
shadow-mapSize={[2048, 2048]}

// 8. HDRI rotation
<Environment
  files="/hdr/main_hdr.exr"
  environmentRotation={[0, Math.PI / 4, 0]}
  environmentIntensity={1.0}
/>

// 9. Enhanced floor reflections
<MeshReflectorMaterial
  resolution={2048}
  mixStrength={40}
  mirror={0.9}
/>
```

### Tier 3: Studio Quality (Heavy)

**Time:** 30 minutes
**Performance Impact:** ~20-30% FPS reduction
**Recommendation:** Desktop only

```tsx
// 10. SSR (screen-space reflections)
<SSR intensity={0.45} maxRoughness={0.1} />

// 11. N8AO (ambient occlusion)
<N8AO aoRadius={0.5} intensity={3} quality="medium" />

// 12. Depth of Field
<DepthOfField focusDistance={0.01} focalLength={0.02} bokehScale={3} />

// 13. RectAreaLight panels
<RectAreaLight width={5} height={5} intensity={10} position={[-8, 5, 0]} />
<RectAreaLight width={5} height={5} intensity={10} position={[8, 5, 0]} />

// 14. Soft shadows
<SoftShadows size={25} samples={16} />
```

---

## Performance Tips

1. **Use `frameloop="demand"`** (current) - Only renders on interaction
2. **AdaptiveDpr** (current) - Drops quality during camera movement
3. **Conditional heavy effects** - Enable SSR/N8AO only on high-end devices:
   ```tsx
   {!isMobile && <SSR />}
   {!isMobile && <N8AO />}
   ```
4. **Shadow resolution tiers:**
   - Mobile: 512
   - Desktop: 1024
   - High-end: 2048
5. **HDRI resolution** - Use 1K-2K HDRs, not 8K
6. **Post-processing order matters** - SMAA last for best quality
7. **Monitor FPS** - Use `<Stats />` from drei during development
8. **Texture compression** - Use KTX2/Basis for large textures

---

## Best Practices for Automotive Rendering

### Lighting
✅ Always use three-point lighting (key, fill, rim)
✅ Add ground bounce for realism
✅ Cool rim light (blue-tinted) for edge separation
✅ HDRI for reflections, intensity 0.6-1.0

### Materials
✅ Clearcoat is mandatory for car paint
✅ Metalness 0.8-1.0, roughness 0.2-0.4 for paint
✅ Chrome: metalness=1, roughness=0.05
✅ Glass: transmission=0.95, ior=1.5
✅ Carbon fiber: normalMap + clearcoat

### Reflections
✅ Floor reflections are critical (MeshReflectorMaterial or ContactShadows)
✅ HDRI environment provides realistic lighting
✅ SSR for paint reflections (optional, expensive)

### Post-Processing
✅ Bloom on bright reflections (luminanceThreshold=0.8)
✅ SMAA for sharp edges
✅ Vignette for focus
✅ N8AO for depth (disable on mobile)

### Shadows
✅ Soft shadows (VSMShadowMap or ContactShadows)
✅ High resolution (2048x2048 for hero light)
✅ Shadow bias tuning to prevent acne

### Camera
✅ ACESFilmic tone mapping (cinematic look)
✅ Exposure 1.0-1.2 (brighter metals)
✅ FOV 35-50 (less distortion)

---

## Device-Specific Optimization

### Mobile
```tsx
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

<Canvas
  dpr={isMobile ? [1, 1.5] : [1, 2]}
  gl={{
    toneMappingExposure: isMobile ? 1.0 : 1.2,
  }}
>
  <EffectComposer>
    <SMAA />
    <Bloom />
    <Vignette />
    {/* Skip heavy effects */}
  </EffectComposer>

  {isMobile ? (
    <ContactShadows />
  ) : (
    <ReflectiveFloor resolution={2048} />
  )}
</Canvas>
```

### Desktop
```tsx
<Canvas dpr={[1, 2]}>
  <EffectComposer>
    <SMAA />
    <SSR />
    <N8AO quality="medium" />
    <Bloom />
    <ChromaticAberration />
    <Vignette />
  </EffectComposer>

  <ReflectiveFloor resolution={2048} />
  <SoftShadows />
</Canvas>
```

### High-End (RTX/M1+)
```tsx
<Canvas dpr={[1, 2]} shadows="soft">
  <EffectComposer multisampling={8}>
    <SMAA />
    <SSR intensity={0.5} />
    <N8AO quality="high" />
    <DepthOfField />
    <Bloom mipmapBlur />
    <ChromaticAberration />
    <ColorGrading />
    <Vignette />
  </EffectComposer>

  <ReflectiveFloor resolution={2048} />
  <SoftShadows samples={32} />
  <RectAreaLight />
</Canvas>
```

---

## Quick Reference: Effect Performance Cost

| Effect | Cost | Mobile | Desktop | High-End |
|--------|------|--------|---------|----------|
| SMAA | Low | ✅ | ✅ | ✅ |
| Bloom | Low | ✅ | ✅ | ✅ |
| Vignette | Minimal | ✅ | ✅ | ✅ |
| ChromaticAberration | Minimal | ✅ | ✅ | ✅ |
| ColorGrading | Low | ✅ | ✅ | ✅ |
| ContactShadows | Low | ✅ | ✅ | ✅ |
| N8AO (performance) | Medium | ⚠️ | ✅ | ✅ |
| N8AO (medium/high) | High | ❌ | ⚠️ | ✅ |
| SSR | High | ❌ | ⚠️ | ✅ |
| DepthOfField | Medium | ❌ | ✅ | ✅ |
| SoftShadows | Medium | ❌ | ✅ | ✅ |
| ReflectorFloor (2048) | Medium | ❌ | ✅ | ✅ |
| RectAreaLight | Medium | ❌ | ✅ | ✅ |

---

## Files Referenced

- `/components/car/CarTuningScene.tsx` - Main scene
- `/components/car/CarLighting.tsx` - Light setup
- `/components/car/ConfigurableCar.tsx` - Car model & materials
- `/components/store/PostProcessing.tsx` - Post-processing effects
- `/components/store/ReflectiveFloor.tsx` - Floor reflections

---

## Next Steps

1. Choose implementation tier based on target devices
2. Test performance with `<Stats />` component
3. A/B test visual quality improvements
4. Monitor frame rate on target devices
5. Adjust based on user feedback

**Recommended starting point:** Tier 1 (Quick Wins) - immediate visual improvement with zero performance cost.
