## Implementation Analysis Report

### 1. Before/After Comparison Slider

**Current State:**
- `/Users/hesam/Documents/GitHub/car-mansori/components/car/PartsGrid.tsx` - Grid layout with thumbnail previews
- Parts selected via `selectPart()` → triggers fade transition in `DynamicPart.tsx`
- Thumbnails defined in `/Users/hesam/Documents/GitHub/car-mansori/public/config/car-parts.json`

**Implementation Strategy:**
- **Library:** Use `react-compare-slider` (npm package) or build custom with `framer-motion`
- **Approach:** 
  - Add "Compare" button in `PartsGrid` when part selected
  - Store `beforePartId` in `carConfigStore.ts`
  - Render two `<Canvas>` instances side-by-side with divider
  - Left: `selectedParts.before`, Right: `selectedParts.current`
  - Slider controls split percentage (0-100%)
- **Files to modify:**
  - `PartsGrid.tsx` - Add compare mode toggle
  - `carConfigStore.ts` - Add `compareMode: boolean, beforeSnapshot: Record<string,string>`
  - New: `components/car/ComparisonSlider.tsx`

---

### 2. Interior Parts (Seats, Steering Wheels, Brake Calipers, Headlights)

**Current State:**
- `/Users/hesam/Documents/GitHub/car-mansori/public/config/car-parts.json` - 3 strategies:
  - `attachNodes[]` - Multiple instances (wheels)
  - `replaceNode` - Single swap (hood, bumpers)
  - `hideNodes[]` - Toggle visibility (none options)
- `/Users/hesam/Documents/GitHub/car-mansori/components/car/DynamicPart.tsx` - Handles all 3 strategies
- `/Users/hesam/Documents/GitHub/car-mansori/components/car/ConfigurableCar.tsx` - Categories array (line 236-244)

**Implementation Strategy:**
```json
// Add to car-parts.json:
"seats": [
  {
    "id": "seat-leather-black",
    "name": "Leather Black",
    "model_path": "/models/parts/seats/leather-black.glb",
    "price": 2500,
    "thumbnail": "/images/parts/seats/leather-black.jpg",
    "replaceNode": "Seat_FL" // or attachNodes for all 4
  }
],
"steering-wheels": [
  {
    "id": "steering-sport",
    "name": "Sport Wheel",
    "model_path": "/models/parts/steering/sport.glb",
    "price": 800,
    "thumbnail": "/images/parts/steering/sport.jpg",
    "replaceNode": "Steering_Wheel"
  }
],
"brake-calipers": [
  {
    "id": "caliper-brembo-red",
    "name": "Brembo Red",
    "model_path": "/models/parts/calipers/brembo.glb",
    "price": 3500,
    "thumbnail": "/images/parts/calipers/brembo-red.jpg",
    "attachNodes": ["Caliper_FL", "Caliper_FR", "Caliper_RL", "Caliper_RR"]
  }
],
"headlights": [
  {
    "id": "headlight-led",
    "name": "LED Matrix",
    "model_path": "/models/parts/headlights/led-matrix.glb",
    "price": 1200,
    "thumbnail": "/images/parts/headlights/led.jpg",
    "attachNodes": ["Headlight_L", "Headlight_R"]
  }
]
```

**Files to modify:**
- `car-parts.json` - Add new categories
- `CustomizationPanel.tsx` line 32-41 - Add to CATEGORIES array
- `ConfigurableCar.tsx` line 236-244 - Add to partCategories
- `carConfigStore.ts` line 38-46 - Add defaults to DEFAULT_PARTS

**Mesh naming in GLB:**
- Must match Blender export exactly (case-sensitive)
- Check with: `DoorController.ts` line 59-64 logs all mesh names

---

### 3. Color Palette Presets

**Current State:**
- `/Users/hesam/Documents/GitHub/car-mansori/components/car/PaintControls.tsx` - 6 hardcoded presets (line 11-18)
- `/Users/hesam/Documents/GitHub/car-mansori/stores/carConfigStore.ts` - `paintConfig: MultiZonePaintConfig` (line 17)
- Multi-zone system: `body`, `trim`, `interior` (line 4)

**Implementation Strategy:**
```typescript
// New structure in carConfigStore.ts:
interface PalettePreset {
  id: string
  name: string
  zones: MultiZonePaintConfig // All 3 zones configured
}

const FACTORY_PALETTES: PalettePreset[] = [
  {
    id: 'racing-red',
    name: 'Racing Red',
    zones: {
      body: { color: '#ff0000', metalness: 0.9, roughness: 0.3, clearcoat: 1.0 },
      trim: { color: '#000000', metalness: 0.5, roughness: 0.7, clearcoat: 0.3 },
      interior: { color: '#1a1a1a', metalness: 0.1, roughness: 0.9, clearcoat: 0.0 }
    }
  },
  // ... more presets
]

// Add to state:
applyPalettePreset: (presetId: string) => void
```

**Files to modify:**
- `carConfigStore.ts` - Add `PalettePreset[]`, `applyPalettePreset()`
- `PaintControls.tsx` - Replace single-zone presets with palette grid
- New section above zones selector showing full palette cards

---

### 4. Lighting Studio

**Current State:**
- `/Users/hesam/Documents/GitHub/car-mansori/components/car/CarLighting.tsx` - 5 spotlights + ambient (static intensities)
- `/Users/hesam/Documents/GitHub/car-mansori/components/car/CarStudioEnvironment.tsx` - Uses drei `<Environment>` with EXR + Lightformers
- `/Users/hesam/Documents/GitHub/car-mansori/public/hdr/main_hdr.exr` - Current HDRI
- `@react-three/drei` available (package.json)

**Implementation Strategy:**
```typescript
// New store: stores/lightingStore.ts
interface LightingState {
  hdriPath: string // '/hdr/studio-1.exr'
  keyIntensity: number
  fillIntensity: number
  rimIntensity: number
  envRotation: number // 0-360
  envIntensity: number
  setHdri: (path: string) => void
  adjustLight: (key: string, value: number) => void
}

// Presets:
const LIGHTING_PRESETS = [
  { id: 'studio', name: 'Studio', hdri: '/hdr/main_hdr.exr', key: 70, fill: 40 },
  { id: 'sunset', name: 'Sunset', hdri: '/hdr/sunset.exr', key: 50, fill: 60 },
  { id: 'showroom', name: 'Showroom', hdri: '/hdr/showroom.exr', key: 80, fill: 30 }
]
```

**Files to modify:**
- `CarLighting.tsx` - Replace static values with store-driven intensities
- `CarStudioEnvironment.tsx` - Add rotation prop, dynamic HDRI path
- `CustomizationPanel.tsx` - Add "Lighting" category
- New: `components/car/LightingControls.tsx` (sliders + preset thumbnails)

**HDRI assets needed:**
- Place in `/Users/hesam/Documents/GitHub/car-mansori/public/hdr/`
- Format: `.exr` or `.hdr` (drei supports both)
- Sources: Poly Haven, HDRI Haven (free CC0)

---

### 5. English-Only Content

**Current State:**
- `/Users/hesam/Documents/GitHub/car-mansori/public/config/cars.json` - Has `name_fa` field (line 5)
- `/Users/hesam/Documents/GitHub/car-mansori/public/config/products.json` - All entries have `name_fa` (line 6, 21, 36, 50)
- `/Users/hesam/Documents/GitHub/car-mansori/components/sections/HeroSection.tsx` - Persian text (lines 64, 84, 407, 494)
- No i18n system detected (no react-intl, next-intl)

**Files with Persian content:**
```
/Users/hesam/Documents/GitHub/car-mansori/public/config/cars.json (name_fa)
/Users/hesam/Documents/GitHub/car-mansori/public/config/products.json (name_fa)
/Users/hesam/Documents/GitHub/car-mansori/components/sections/HeroSection.tsx (شهر امید, museum text)
/Users/hesam/Documents/GitHub/car-mansori/components/car/TopBar.tsx (shows carNameFa if provided)
```

**Implementation Strategy:**
- **JSON files:** Remove all `name_fa` fields, keep only `name`
- **HeroSection.tsx:**
  - Line 84: "شهر امید" → "Lumina Museum"
  - Line 407: Persian subtitle → English
  - Line 494: Already English
  - Line 558: "Enter the Showroom" (already English)
- **TopBar.tsx:** Line 72-76 - Remove conditional Persian name display
- **Search all TSX:** Grep for remaining Persian characters `[\u0600-\u06FF]`

---

### 6. Dynamic Suspension

**Current State:**
- `/Users/hesam/Documents/GitHub/car-mansori/lib/DoorController.ts` - Uses GSAP for animations (line 2, 259-266)
- `/Users/hesam/Documents/GitHub/car-mansori/components/car/ConfigurableCar.tsx` - Car in `<group>` (line 247)
- GSAP available (package.json v3.12.5)
- `invalidate()` from drei for demand rendering

**Implementation Strategy:**
```typescript
// New: lib/SuspensionController.ts
export class SuspensionController {
  constructor(
    private carGroup: THREE.Group,
    private invalidate: () => void
  ) {
    this.baseY = carGroup.position.y
  }
  
  setHeight(cm: number) {
    const targetY = this.baseY + (cm / 100)
    gsap.to(this.carGroup.position, {
      y: targetY,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => this.invalidate()
    })
  }
  
  setStance(preset: 'stock' | 'lowered' | 'raised') {
    const offsets = { stock: 0, lowered: -3, raised: 5 }
    this.setHeight(offsets[preset])
  }
}

// Add to carConfigStore.ts:
suspensionHeight: number // cm offset
setSuspensionHeight: (cm: number) => void
```

**Files to modify:**
- `ConfigurableCar.tsx` - Initialize `SuspensionController`, react to store changes
- `CustomizationPanel.tsx` - Add "Suspension" category or in paint panel
- New: `components/car/SuspensionControls.tsx` (slider -5cm to +10cm, preset buttons)
- New: `lib/SuspensionController.ts`

**Alternative (simpler):**
- Skip controller class, just GSAP directly in `useEffect` watching `suspensionHeight`

---

## Summary Table

| Feature | Complexity | Key Files | External Deps |
|---------|-----------|-----------|---------------|
| **Comparison Slider** | Medium | `PartsGrid.tsx`, `carConfigStore.ts`, new `ComparisonSlider.tsx` | `react-compare-slider` or none (framer-motion) |
| **Interior Parts** | Low | `car-parts.json`, `CustomizationPanel.tsx`, `ConfigurableCar.tsx` | None (existing system) |
| **Color Palettes** | Low | `carConfigStore.ts`, `PaintControls.tsx` | None |
| **Lighting Studio** | Medium | `CarLighting.tsx`, `CarStudioEnvironment.tsx`, new `LightingControls.tsx` | None (drei already has `<Environment>`) |
| **English-Only** | Low | `cars.json`, `products.json`, `HeroSection.tsx`, `TopBar.tsx` | None |
| **Dynamic Suspension** | Low-Medium | `ConfigurableCar.tsx`, new `SuspensionController.ts`, `carConfigStore.ts` | None (GSAP already available) |

All features compatible with existing architecture. No breaking changes required.