# Remaining Implementation Phases

## Completed ✓
- **Phase 1**: English-only content + Interior parts (seats, steering, calipers, headlights)
- **Phase 2**: Color palette presets (8 factory palettes with 3-zone configs)
- **Phase 3**: Dynamic suspension (GSAP animations, -5cm to +10cm range)

---

## Phase 4 - Lighting Studio

**Objective**: User-controllable lighting environment with HDRI swapping and intensity controls

### Implementation Steps

#### 1. Create `stores/lightingStore.ts`
```typescript
interface LightingState {
  hdriPath: string              // Current HDRI file path
  keyIntensity: number          // Key light strength (0-100)
  fillIntensity: number         // Fill light strength (0-100)
  rimIntensity: number          // Rim light strength (0-100)
  envRotation: number           // Environment rotation (0-360)
  envIntensity: number          // HDRI brightness (0-2)
  activePreset: string | null   // Current preset ID
  setHdri: (path: string) => void
  adjustLight: (key: string, value: number) => void
  applyPreset: (presetId: string) => void
  setEnvRotation: (degrees: number) => void
}

export const LIGHTING_PRESETS = [
  {
    id: 'studio',
    name: 'Studio',
    hdri: '/hdr/main_hdr.exr',
    key: 70,
    fill: 40,
    rim: 30,
    envIntensity: 1.5,
    rotation: 0
  },
  {
    id: 'sunset',
    name: 'Sunset',
    hdri: '/hdr/sunset.exr',
    key: 50,
    fill: 60,
    rim: 20,
    envIntensity: 1.8,
    rotation: 90
  },
  {
    id: 'showroom',
    name: 'Showroom',
    hdri: '/hdr/showroom.exr',
    key: 80,
    fill: 30,
    rim: 40,
    envIntensity: 1.2,
    rotation: 0
  },
  {
    id: 'garage',
    name: 'Garage',
    hdri: '/hdr/garage.exr',
    key: 40,
    fill: 50,
    rim: 10,
    envIntensity: 1.0,
    rotation: 180
  }
]
```

#### 2. Update `components/car/CarLighting.tsx`
- Import `useLightingStore`
- Replace static intensity values with store-driven values
- Make spotlights reactive to `keyIntensity`, `fillIntensity`, `rimIntensity`

**Current structure:**
```typescript
// CarLighting.tsx lines ~15-30
<spotLight position={[5, 8, 5]} intensity={70} ... />
<spotLight position={[-5, 6, -3]} intensity={40} ... />
<spotLight position={[0, 10, -8]} intensity={30} ... />
```

**Update to:**
```typescript
const keyIntensity = useLightingStore((s) => s.keyIntensity)
const fillIntensity = useLightingStore((s) => s.fillIntensity)
const rimIntensity = useLightingStore((s) => s.rimIntensity)

<spotLight position={[5, 8, 5]} intensity={keyIntensity} ... />
<spotLight position={[-5, 6, -3]} intensity={fillIntensity} ... />
<spotLight position={[0, 10, -8]} intensity={rimIntensity} ... />
```

#### 3. Update `components/car/CarStudioEnvironment.tsx`
- Add `rotation` prop to `<Environment>` component (drei supports this)
- Make HDRI path dynamic via store
- Add `envIntensity` control

**Changes:**
```typescript
const hdriPath = useLightingStore((s) => s.hdriPath)
const envRotation = useLightingStore((s) => s.envRotation)
const envIntensity = useLightingStore((s) => s.envIntensity)

<Environment
  files={hdriPath}
  environmentRotation={[0, (envRotation * Math.PI) / 180, 0]}
  environmentIntensity={envIntensity}
  // ... rest
/>
```

#### 4. Create `components/car/LightingControls.tsx`
- Preset thumbnails (4 cards with mini HDRI preview images)
- Sliders for key/fill/rim intensities (0-100)
- Environment rotation slider (0-360°)
- HDRI brightness slider (0-2)

**UI Structure:**
```
┌─────────────────────────────────┐
│ LIGHTING PRESETS                │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│ │STU │ │SUN │ │SHO │ │GAR │    │
│ └────┘ └────┘ └────┘ └────┘    │
│                                  │
│ KEY LIGHT        [====|---] 70  │
│ FILL LIGHT       [==|-----] 40  │
│ RIM LIGHT        [=|------] 30  │
│                                  │
│ ENVIRONMENT                      │
│ Rotation         [====|---] 90° │
│ Intensity        [====|---] 1.5 │
└─────────────────────────────────┘
```

#### 5. Add to `CustomizationPanel.tsx`
- Add `{ id: 'lighting', name: 'Lighting', icon: MdLightbulbOutline }` to CATEGORIES
- Position after Suspension
- Render `<LightingControls />` when active

#### 6. Download HDRI Assets

**✅ PHASE 4 IMPLEMENTATION STATUS: COMPLETE**
All code is implemented. Only HDRI asset downloads remain.

**Required files** (place in `/public/hdr/`):

1. **sunset.exr** - Warm outdoor lighting
   - Recommended: [Kloppenheim 06](https://polyhaven.com/a/kloppenheim_06)
   - Download 2K EXR format
   - Rename to `sunset.exr`

2. **showroom.exr** - Bright indoor studio
   - Recommended: [Studio Small 09](https://polyhaven.com/a/studio_small_09)
   - Download 2K EXR format
   - Rename to `showroom.exr`

3. **garage.exr** - Industrial indoor
   - Recommended: [Industrial Sunset 02](https://polyhaven.com/a/industrial_sunset_02)
   - Download 2K EXR format
   - Rename to `garage.exr`

**Download Instructions:**
1. Visit [Poly Haven HDRIs](https://polyhaven.com/hdris)
2. Search for the recommended HDRI name
3. Click "Download" → Select "2K" resolution → Choose "EXR" format
4. Rename the downloaded file as specified above
5. Place in `/public/hdr/` directory

**Note**: The existing `main_hdr.exr` is used for the "Studio" preset. If it doesn't exist, download any studio HDRI and name it `main_hdr.exr`

**Alternative HDRIs** (if you want different aesthetics):
- Sunset: `sunset_in_the_chalk_quarry_4k.exr`, `fireplace_4k.exr`
- Showroom: `photo_studio_loft_hall_4k.exr`, `studio_garden_4k.exr`
- Garage: `autoshop_01_4k.exr`, `warehouse_4k.exr`

**Formats**: Use `.exr` (recommended) or `.hdr`
**Resolutions**: 2K (2048x1024) for best quality, 1K for faster loading

---

## Phase 5 - Before/After Comparison Slider

**Objective**: Side-by-side view of two configurations with draggable divider

### Implementation Steps

#### 1. Install Dependencies (Optional)
```bash
npm install react-compare-slider
```
*Alternative: Build custom with framer-motion (already installed)*

#### 2. Add Comparison State to `stores/carConfigStore.ts`
```typescript
interface CarConfigState {
  // ... existing
  compareMode: boolean
  beforeSnapshot: {
    parts: Record<string, string>
    paint: MultiZonePaintConfig
    suspension: number
  } | null

  enableCompareMode: () => void
  disableCompareMode: () => void
  saveBeforeSnapshot: () => void
}

// Implementation
enableCompareMode: () =>
  set((state) => {
    if (state.compareMode) return {}
    return {
      compareMode: true,
      beforeSnapshot: {
        parts: { ...state.selectedParts },
        paint: { ...state.paintConfig },
        suspension: state.suspensionHeight
      }
    }
  }),

disableCompareMode: () =>
  set({ compareMode: false, beforeSnapshot: null }),

saveBeforeSnapshot: () =>
  set((state) => ({
    beforeSnapshot: {
      parts: { ...state.selectedParts },
      paint: { ...state.paintConfig },
      suspension: state.suspensionHeight
    }
  }))
```

#### 3. Create `components/car/ComparisonSlider.tsx`
**Two Approaches:**

##### A. Using react-compare-slider
```typescript
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider'
import { Canvas } from '@react-three/fiber'

export default function ComparisonSlider() {
  const compareMode = useCarConfig((s) => s.compareMode)
  const beforeSnapshot = useCarConfig((s) => s.beforeSnapshot)
  const currentConfig = useCarConfig((s) => ({
    parts: s.selectedParts,
    paint: s.paintConfig,
    suspension: s.suspensionHeight
  }))

  if (!compareMode || !beforeSnapshot) return null

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <ReactCompareSlider
        itemOne={<ConfiguratorCanvas config={beforeSnapshot} label="Before" />}
        itemTwo={<ConfiguratorCanvas config={currentConfig} label="After" />}
        position={50}
      />
    </div>
  )
}
```

##### B. Custom Implementation (Recommended)
```typescript
'use client'

import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import ConfigurableCar from './ConfigurableCar'

export default function ComparisonSlider() {
  const [sliderPosition, setSliderPosition] = useState(50)
  const compareMode = useCarConfig((s) => s.compareMode)
  const beforeSnapshot = useCarConfig((s) => s.beforeSnapshot)
  const disableCompareMode = useCarConfig((s) => s.disableCompareMode)

  if (!compareMode || !beforeSnapshot) return null

  return (
    <div className="fixed inset-0 z-50 flex bg-black">
      {/* Left Canvas - Before */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <Canvas>
          <ConfigurableCar
            modelPath={beforeSnapshot.modelPath}
            overrideConfig={beforeSnapshot}
          />
        </Canvas>
        <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded text-white text-sm">
          Before
        </div>
      </div>

      {/* Right Canvas - After */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
      >
        <Canvas>
          <ConfigurableCar modelPath={currentModelPath} />
        </Canvas>
        <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded text-white text-sm">
          After
        </div>
      </div>

      {/* Draggable Divider */}
      <div
        className="absolute inset-y-0 w-1 bg-white cursor-ew-resize"
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={(e) => {
          const handleMove = (moveEvent: MouseEvent) => {
            const newPos = (moveEvent.clientX / window.innerWidth) * 100
            setSliderPosition(Math.max(0, Math.min(100, newPos)))
          }
          const handleUp = () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
          }
          window.addEventListener('mousemove', handleMove)
          window.addEventListener('mouseup', handleUp)
        }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center">
          <svg className="w-4 h-4">
            <path d="M4 8L8 4L8 12L4 8ZM12 8L16 12L16 4L12 8Z" fill="black" />
          </svg>
        </div>
      </div>

      {/* Close Button */}
      <button
        onClick={disableCompareMode}
        className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 rounded-full text-white"
      >
        Exit Comparison
      </button>
    </div>
  )
}
```

#### 4. Update `components/car/PartsGrid.tsx`
Add "Compare" button next to part cards:

```typescript
const compareMode = useCarConfig((s) => s.compareMode)
const enableCompareMode = useCarConfig((s) => s.enableCompareMode)

// Add button in header or above grid
{!compareMode && (
  <button
    onClick={enableCompareMode}
    className="text-xs px-3 py-1.5 border border-white/20 rounded"
  >
    Compare Changes
  </button>
)}
```

#### 5. Modify `ConfigurableCar.tsx` for Override Support
Allow comparison mode to override current config:

```typescript
interface ConfigurableCarProps {
  modelPath: string
  overrideConfig?: {
    parts: Record<string, string>
    paint: MultiZonePaintConfig
    suspension: number
  }
}

// Use overrideConfig if provided, else use store
const effectiveParts = overrideConfig?.parts ?? selectedParts
const effectivePaint = overrideConfig?.paint ?? paintConfig
const effectiveSuspension = overrideConfig?.suspension ?? suspensionHeight
```

---

## Additional Enhancements (Future Phases)

### Phase 6 - Configuration Sharing
- URL params encoding (base64 compressed JSON)
- `useEffect` to parse on mount
- Share button → copy link
- Social meta tags with screenshot

### Phase 7 - Screenshot Export
- Activate `PhotoMode` component (already exists)
- Add UI button in TopBar
- Export path-traced renders
- Preset camera angles dropdown

### Phase 8 - Save/Load Configurations
- localStorage persistence with names
- "My Builds" modal/page
- Quick restore on revisit
- Export/import JSON

### Phase 9 - Mobile Optimization
- Bottom sheet for `CustomizationPanel` (instead of drawer)
- Swipe gestures for categories
- Simplified quality tier UI
- Touch-optimized controls

### Phase 10 - AR Integration
- Activate `ARCarViewer` component
- QR code for phone handoff
- "View in Your Garage" flow

---

## Implementation Priority

### High Priority
1. **Lighting Studio** - Enhances visual appeal, easy to implement
2. **Comparison Slider** - Key feature for decision-making

### Medium Priority
3. Configuration Sharing (URL params)
4. Screenshot Export (PhotoMode already built)
5. Save/Load (localStorage first, then backend)

### Low Priority
6. Mobile UX refinements
7. AR viewer activation
8. Advanced analytics

---

## Technical Notes

### Lighting Studio
- HDRI files can be large (2K = ~10-20MB each)
- Consider lazy loading HDRIs on preset click
- Cache downloaded HDRIs in browser
- Use quality tier to determine HDRI resolution (low=512, med=1K, high=2K)

### Comparison Slider
- Dual Canvas approach is GPU-intensive (monitor FPS)
- Alternative: Single canvas with state toggle + screenshot cache
- Consider using `demand` frameloop for both canvases
- Mobile: Stack vertically instead of side-by-side

### Performance Considerations
- Total new features add ~3-5 new components
- Lighting presets add ~40-60MB of HDRI assets
- Comparison mode doubles GPU load (2 canvases)
- Use `React.lazy()` for comparison slider (code-split)

---

## Estimated Effort

| Phase | Complexity | Estimated Time | Dependencies |
|-------|-----------|----------------|--------------|
| **Phase 4 - Lighting** | Medium | 1.5-2 hours | HDRI downloads |
| **Phase 5 - Comparison** | High | 2-3 hours | None |
| **Phase 6 - URL Sharing** | Low | 30-45 min | None |
| **Phase 7 - Screenshots** | Low | 20-30 min | PhotoMode (exists) |
| **Phase 8 - Save/Load** | Medium | 1-1.5 hours | None (localStorage) |

**Total for Phases 4-5**: ~4-5 hours
**Total for all remaining**: ~6-8 hours
