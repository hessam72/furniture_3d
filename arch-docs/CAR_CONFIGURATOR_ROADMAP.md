# Car Configurator 3D Experience - Implementation Roadmap

> **Last Updated**: 2026-07-01
> **Status**: Planning Phase
> **Estimated Timeline**: 8-12 days (core) | 10-15 days (with advanced features)

---

## Table of Contents

1. [User Experience Flow](#user-experience-flow)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Decisions](#architecture-decisions)
4. [Implementation Phases](#implementation-phases)
5. [Code Patterns & Examples](#code-patterns--examples)
6. [Performance Optimization](#performance-optimization)
7. [Open-Source References](#open-source-references)
8. [File Structure](#file-structure)
9. [Next Steps](#next-steps)

---

## User Experience Flow

### Two-Stage Experience

**Stage 1: Car Showroom (Keep Existing System)**
- ✅ FPS movement with WASD + virtual joystick
- ✅ Physics-based collision (Rapier)
- ✅ Gyro support for mobile
- ✅ Walk around and explore multiple cars
- 🆕 Click on any car to enter configurator

**Stage 2: Car Configurator (New Page)**
- 🆕 Dedicated page: `/car-configurator/[car-id]`
- 🆕 OrbitControls (drag to rotate, scroll to zoom)
- 🆕 Part swapping (wheels, spoilers, body kits)
- 🆕 Material customization (paint color, metallic, roughness)
- 🆕 UI controls (no joystick)
- 🆕 Camera presets (front, rear, side, wheel views)

### User Journey

```
┌─────────────────────────────────────────────────────────┐
│  SHOWROOM (/showroom)                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ • Walk with WASD/Joystick                         │  │
│  │ • Explore multiple cars in 3D space               │  │
│  │ • Physics collision with walls/objects            │  │
│  │ • Click on Car A, B, or C                         │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ Click Car
                         ▼
┌─────────────────────────────────────────────────────────┐
│  CONFIGURATOR (/car-configurator/car-a)                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │ • Drag to rotate car 360°                         │  │
│  │ • Scroll to zoom in/out                           │  │
│  │ • Select parts via UI sidebar                     │  │
│  │ • Change paint color/materials                    │  │
│  │ • Camera presets (Front, Rear, Side, Wheel)      │  │
│  │ • Save configuration & export screenshot          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Why This Architecture?

**Advantages**:
1. **Reuse Existing System**: Showroom uses proven jewelry store code (no rewrite)
2. **Clear Separation**: Exploration vs customization are distinct experiences
3. **Performance**: Only load configurator UI/logic when needed
4. **Mobile UX**: Joystick for movement, drag for rotation (appropriate to context)
5. **Scalability**: Easy to add more cars to showroom

**Technical Benefits**:
- ✅ No changes to existing Scene.tsx (showroom)
- ✅ ProductInteraction.tsx handles car clicks (already works)
- ✅ Physics stays in showroom (not needed in configurator)
- ✅ OrbitControls isolated to configurator page

### Feature Comparison

| Feature | Showroom (Keep Existing) | Configurator (New Page) |
|---------|--------------------------|-------------------------|
| **Route** | `/showroom` | `/car-configurator/[carId]` |
| **Camera** | POV (FPS) | OrbitControls |
| **Controls** | WASD + Joystick | Drag to rotate, scroll to zoom |
| **Physics** | ✅ Rapier collision | ❌ No physics |
| **Movement** | Walk around freely | Static (car rotates) |
| **Cars** | Multiple cars in scene | Single car focused |
| **Interaction** | Click to select | UI sidebar controls |
| **Purpose** | Exploration | Customization |
| **State** | Local/none | Zustand (global) |
| **Post-processing** | ✅ Bloom, N8AO | ✅ Bloom (simpler) |
| **Mobile** | Virtual joystick | Touch gestures |

---

## Current State Analysis

### Tech Stack (Existing)

- **Framework**: Next.js 14 + React 18.3
- **3D Engine**: Three.js r161
- **React Integration**: @react-three/fiber 8.17.10
- **Helpers**: @react-three/drei 9.114.3
- **Physics**: @react-three/rapier 1.5.0
- **Post-Processing**: @react-three/postprocessing 2.16.3
- **Animation**: GSAP 3.12.5, Framer Motion 11.15.0
- **State**: React hooks (local only)

### Current Implementation (3D Jewelry Store)

✅ **Strengths We Can Leverage:**

- Config-driven model loading (`/public/config/stores.json`)
- DRACO compression for GLB files
- Dynamic material manipulation (emissive lights, reflections)
- Product interaction system (raycasting to JSON database)
- HDRI lighting + bloom post-processing
- Reflective floor with MeshReflectorMaterial
- Mobile optimization (virtual joystick, adaptive DPR)
- Physics-based collision (Rapier)

### Key Files (Reference)

- `/components/store/Scene.tsx` - Canvas setup, orchestration
- `/components/store/ModelLoader.tsx` - GLTF loader with DRACO
- `/components/store/ProductInteraction.tsx` - Raycasting system
- `/public/config/products.json` - Product database pattern

### Adaptability Assessment

Your existing codebase is **extremely well-suited** for this two-stage architecture:

**Showroom (No Changes Needed)**:

| Feature | Status | Action |
|---------|--------|--------|
| FPS Movement | ✅ Working | Keep as-is |
| Virtual Joystick | ✅ Working | Keep as-is |
| Physics Collision | ✅ Working | Keep as-is |
| Raycasting | ✅ Working | Extend for car clicks |
| Config-driven loading | ✅ Working | Add cars to stores.json |

**Configurator (New Page)**:

| Feature Needed | Already Have | Adaptation Required |
|----------------|--------------|---------------------|
| Dynamic GLB loading | ✅ ModelLoader | Reuse for parts |
| Config-driven data | ✅ stores.json pattern | Create car-parts.json |
| Material overrides | ✅ Emissive lights pattern | Add clearcoat for paint |
| State management | ❌ Local only | Add Zustand (configurator only) |
| Camera system | ✅ Three.js | New: OrbitControls (configurator only) |
| Performance | ✅ DRACO + optimization | Add preloading |

**Conclusion**:
- **Showroom**: 95% reusable (just add car models to existing system)
- **Configurator**: 70% reusable patterns (new page, new camera controls)
- **Overall**: Minimal refactoring, mostly additive development

---

## Architecture Decisions

### 1. State Management: **Zustand**

**Decision**: Use Zustand over Redux/Jotai/Context

**Rationale**:
- **3KB gzipped** vs Redux 8KB
- **Zero boilerplate** (5 lines vs 50)
- **React 19 compatible** (future-proof for Next.js 16 upgrade)
- **pmndrs ecosystem** (same team as R3F/Drei)
- **DevTools support** (debugging)
- **No Provider hell** (direct hook access)

**Alternative Considered**: Jotai (2KB, atom-based) - rejected due to more complex API for simple configurator state.

### 2. Part Loading: **Extend ModelLoader Pattern**

**Decision**: Reuse existing GLTF loader with category-based config

**Rationale**:
- Already using `useLoader(GLTFLoader, url)` successfully
- DRACO compression implemented
- Pattern proven with jewelry models
- Simple preloading strategy

**Pattern**:
```typescript
// public/config/car-parts.json
{
  "wheels": [
    { "id": "sport-rims", "url": "/car-models/wheels/sport.glb", "price": 500 }
  ],
  "spoilers": [...],
  "body-kits": [...]
}
```

### 3. Material System: **Traverse + Clearcoat**

**Decision**: Material override via Object3D traversal + Three.js clearcoat

**Rationale**:
- Already using traverse for emissive lights (ModelLoader.tsx:135-148)
- Clearcoat native in Three.js r161 (realistic car paint)
- Works with any GLB structure (no naming requirements)
- Real-time updates

**Code Pattern**:
```typescript
function applyCarPaint(object: Object3D, config: MaterialConfig) {
  object.traverse((child) => {
    if (child instanceof Mesh && child.material.name === 'CarPaint') {
      const mat = child.material as MeshStandardMaterial
      mat.color.set(config.color)
      mat.metalness = config.metallic
      mat.roughness = config.roughness
      mat.clearcoat = 1.0        // Car paint shine
      mat.clearcoatRoughness = 0.1
      mat.needsUpdate = true
    }
  })
}
```

### 4. Camera System: **Dual Camera Architecture**

**Decision**: Keep POV camera in showroom, add OrbitControls in configurator

**Showroom Camera**:
- ✅ Keep existing POV camera (FPS movement)
- ✅ WASD controls + virtual joystick
- ✅ Physics-based collision
- ✅ Gyro support
- **Use case**: Exploring multiple cars in 3D space

**Configurator Camera**:
- 🆕 OrbitControls (drag to rotate, scroll to zoom)
- 🆕 Camera presets (front, rear, side, wheel, interior)
- 🆕 Auto-rotate option
- 🆕 Touch-friendly gestures
- **Use case**: Detailed inspection of single car

**Rationale**:
- POV perfect for showroom exploration
- OrbitControls standard for product configurators
- Each camera type suited to its context
- No conflicts (separate pages/scenes)

### 5. Performance Strategy

**Decisions**:

| Technique | Use? | Rationale |
|-----------|------|-----------|
| **DRACO Compression** | ✅ Yes | Already implemented, 50-80% size reduction |
| **Preloading** | ✅ Yes | Critical for instant part swaps |
| **Instance Merging** | ❌ No | Overkill (not 100+ identical objects) |
| **LOD (Level of Detail)** | ❌ No | Close-up configurator (not large scene) |
| **KTX2/Basis Textures** | ❌ No | Small textures (<1K), not worth complexity |
| **Texture Atlasing** | ❌ No | <10 materials (not 50+) |

**Key Optimizations**:
1. Preload all part variants on mount
2. `useMemo` for cloned scenes
3. Adaptive DPR on mobile
4. Disable N8AO on low-end devices

---

## Implementation Phases

### Phase 0: Showroom Setup (1-2 days)

**Goals**:
- Extend existing jewelry store for car showroom
- Add car models to showroom
- Implement car click detection
- Setup routing to configurator page

**Tasks**:

1. **Add Cars to Showroom Config** (`/public/config/stores.json`):
   ```json
   {
     "models": [
       {
         "name": "Car_SportSedan",
         "url": "/models/showroom/sport-sedan.glb",
         "priority": 1,
         "position": [5, 0, 0],
         "rotation": [0, Math.PI / 4, 0]
       },
       {
         "name": "Car_SUV",
         "url": "/models/showroom/suv.glb",
         "priority": 1,
         "position": [-5, 0, 0],
         "rotation": [0, -Math.PI / 4, 0]
       },
       {
         "name": "Car_Supercar",
         "url": "/models/showroom/supercar.glb",
         "priority": 1,
         "position": [0, 0, 8],
         "rotation": [0, Math.PI, 0]
       }
     ]
   }
   ```

2. **Create Car Database** (`/public/config/cars.json`):
   ```json
   {
     "cars": [
       {
         "id": "sport-sedan",
         "name": "Sport Sedan",
         "model3d": "Car_SportSedan",
         "basePrice": 35000,
         "description": "Luxury sports sedan with high performance",
         "thumbnail": "/thumbnails/sport-sedan.jpg"
       },
       {
         "id": "suv",
         "name": "Luxury SUV",
         "model3d": "Car_SUV",
         "basePrice": 50000,
         "description": "Premium SUV with advanced features"
       },
       {
         "id": "supercar",
         "name": "Supercar",
         "model3d": "Car_Supercar",
         "basePrice": 150000,
         "description": "High-performance exotic supercar"
       }
     ]
   }
   ```

3. **Extend ProductInteraction for Cars** (`/components/store/CarInteraction.tsx`):
   ```typescript
   import { useRouter } from 'next/navigation'
   import { useState } from 'react'
   import { useFrame, useThree } from '@react-three/fiber'
   import { Raycaster, Vector2 } from 'three'
   import carsData from '@/public/config/cars.json'

   export function CarInteraction() {
     const router = useRouter()
     const { scene, camera } = useThree()
     const [hoveredCar, setHoveredCar] = useState<string | null>(null)

     const handleClick = (event: MouseEvent) => {
       const raycaster = new Raycaster()
       const mouse = new Vector2(
         (event.clientX / window.innerWidth) * 2 - 1,
         -(event.clientY / window.innerHeight) * 2 + 1
       )

       raycaster.setFromCamera(mouse, camera)
       const intersects = raycaster.intersectObjects(scene.children, true)

       if (intersects.length > 0) {
         const object = intersects[0].object

         // Find car by name (matches model3d in cars.json)
         const clickedCar = carsData.cars.find(car =>
           object.parent?.name === car.model3d
         )

         if (clickedCar) {
           // Redirect to configurator page
           router.push(`/car-configurator/${clickedCar.id}`)
         }
       }
     }

     useEffect(() => {
       window.addEventListener('click', handleClick)
       return () => window.removeEventListener('click', handleClick)
     }, [])

     return null
   }
   ```

4. **Add to Existing Scene.tsx**:
   ```typescript
   import { CarInteraction } from './CarInteraction'

   export function Scene() {
     return (
       <Canvas>
         {/* ... existing showroom setup ... */}
         <CarInteraction />
       </Canvas>
     )
   }
   ```

5. **Create Configurator Route** (`/app/car-configurator/[carId]/page.tsx`):
   ```typescript
   import { CarConfiguratorScene } from '@/components/car/CarConfiguratorScene'
   import { ConfigPanel } from '@/components/car/ConfigPanel'
   import carsData from '@/public/config/cars.json'
   import { notFound } from 'next/navigation'

   export default function ConfiguratorPage({ params }: { params: { carId: string } }) {
     const car = carsData.cars.find(c => c.id === params.carId)

     if (!car) return notFound()

     return (
       <main className="h-screen w-screen relative">
         <CarConfiguratorScene carId={car.id} />
         <ConfigPanel car={car} />

         {/* Back to showroom button */}
         <Link
           href="/showroom"
           className="fixed top-4 left-4 px-4 py-2 bg-white/90 rounded-lg"
         >
           ← Back to Showroom
         </Link>
       </main>
     )
   }
   ```

**Deliverables**:
- ✅ Cars visible in existing showroom
- ✅ Click detection working
- ✅ Redirect to configurator page
- ✅ No changes to existing POV camera/joystick

**Success Criteria**:
- Can walk around showroom (existing functionality intact)
- Clicking car navigates to `/car-configurator/[car-id]`
- Car ID passed correctly via URL params

---

### Phase 1: Configurator State & Config (1-2 days)

**Goals**:
- Install Zustand for configurator state
- Create car parts configuration system
- Setup base structure for configurator page

**Note**: This phase is **only for the configurator page**, not the showroom.

**Tasks**:

1. **Install Dependencies**:
   ```bash
   npm install zustand
   ```

2. **Create Zustand Store** (`/stores/carConfigStore.ts`):
   ```typescript
   import { create } from 'zustand'
   import { devtools } from 'zustand/middleware'

   interface CarPart {
     id: string
     category: 'wheels' | 'spoiler' | 'body-kit'
     url: string
     price: number
   }

   interface CarConfigState {
     selectedParts: Record<string, CarPart>
     paintColor: string
     metallic: number
     roughness: number

     selectPart: (category: string, part: CarPart) => void
     updateMaterial: (config: Partial<MaterialConfig>) => void
     resetConfig: () => void
   }

   export const useCarConfig = create<CarConfigState>()(
     devtools((set) => ({
       selectedParts: {},
       paintColor: '#ff0000',
       metallic: 0.9,
       roughness: 0.1,

       selectPart: (category, part) =>
         set((state) => ({
           selectedParts: { ...state.selectedParts, [category]: part }
         })),

       updateMaterial: (config) => set(config),

       resetConfig: () => set({
         selectedParts: {},
         paintColor: '#ff0000',
         metallic: 0.9,
         roughness: 0.1
       })
     }))
   )
   ```

3. **Create Parts Config** (`/public/config/car-parts.json`):
   ```json
   {
     "wheels": [
       {
         "id": "default",
         "name": "Standard Wheels",
         "url": "/car-models/wheels/default.glb",
         "price": 0,
         "thumbnail": "/thumbnails/wheels/default.jpg"
       },
       {
         "id": "sport-rims",
         "name": "Sport Rims",
         "url": "/car-models/wheels/sport.glb",
         "price": 500,
         "thumbnail": "/thumbnails/wheels/sport.jpg"
       }
     ],
     "spoilers": [
       {
         "id": "none",
         "name": "No Spoiler",
         "url": null,
         "price": 0
       },
       {
         "id": "gt-wing",
         "name": "GT Wing",
         "url": "/car-models/spoilers/gt-wing.glb",
         "price": 1200,
         "thumbnail": "/thumbnails/spoilers/gt-wing.jpg"
       }
     ],
     "paint": {
       "presets": [
         {
           "id": "ferrari-red",
           "name": "Ferrari Red",
           "color": "#DC0000",
           "metallic": 0.9,
           "roughness": 0.1
         },
         {
           "id": "matte-black",
           "name": "Matte Black",
           "color": "#1a1a1a",
           "metallic": 0.1,
           "roughness": 0.8
         },
         {
           "id": "chrome",
           "name": "Chrome",
           "color": "#ffffff",
           "metallic": 1.0,
           "roughness": 0.0
         }
       ]
     }
   }
   ```

4. **Add Base Car Model**:
   - Place base car GLB at `/public/car-models/base.glb`
   - Ensure materials are named correctly: `CarPaint`, `Chrome`, `Glass`, `Interior`

**Deliverables**:
- ✅ Zustand store with actions
- ✅ car-parts.json with 2-3 categories
- ✅ Base car model loads in scene

**Success Criteria**:
- Store state updates via DevTools
- Config loads without errors
- Base model visible in scene

---

### Phase 2: Dynamic Part Swapping (2-3 days)

**Goals**:
- Load parts from config dynamically
- Swap parts on user selection
- Implement preloading for instant swaps

**Implementation**:

1. **Create DynamicPart Component** (`/components/car/DynamicPart.tsx`):
   ```typescript
   import { useLoader } from '@react-three/fiber'
   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
   import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
   import { useMemo, useEffect } from 'react'
   import { useCarConfig } from '@/stores/carConfigStore'
   import { Object3D } from 'three'

   const dracoLoader = new DRACOLoader()
   dracoLoader.setDecoderPath('/draco/')

   const loader = new GLTFLoader()
   loader.setDRACOLoader(dracoLoader)

   export function DynamicPart({
     category,
     defaultUrl
   }: {
     category: string
     defaultUrl: string
   }) {
     const selectedPart = useCarConfig((s) => s.selectedParts[category])
     const url = selectedPart?.url || defaultUrl

     // Load model
     const gltf = useLoader(GLTFLoader, url, (loader) => {
       loader.setDRACOLoader(dracoLoader)
     })

     // Clone scene to avoid shared material issues
     const scene = useMemo(() => {
       return gltf.scene.clone(true)
     }, [gltf])

     return <primitive object={scene} />
   }
   ```

2. **Create CarModel Composite** (`/components/car/CarModel.tsx`):
   ```typescript
   import { DynamicPart } from './DynamicPart'
   import { useLoader } from '@react-three/fiber'
   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
   import { useCarConfig } from '@/stores/carConfigStore'
   import { useEffect, useMemo } from 'react'

   export function CarModel() {
     const { paintColor, metallic, roughness } = useCarConfig()

     // Load base car
     const baseGltf = useLoader(GLTFLoader, '/car-models/base.glb')

     // Clone and apply materials
     const baseScene = useMemo(() => {
       const clone = baseGltf.scene.clone(true)
       applyCarPaint(clone, { paintColor, metallic, roughness })
       return clone
     }, [baseGltf, paintColor, metallic, roughness])

     return (
       <group>
         <primitive object={baseScene} />
         <DynamicPart category="wheels" defaultUrl="/car-models/wheels/default.glb" />
         <DynamicPart category="spoiler" defaultUrl="/car-models/spoilers/none.glb" />
       </group>
     )
   }

   function applyCarPaint(object: Object3D, config: any) {
     object.traverse((child) => {
       if (child instanceof Mesh && child.material) {
         if (child.material.name === 'CarPaint') {
           const mat = child.material as MeshStandardMaterial
           mat.color.set(config.paintColor)
           mat.metalness = config.metallic
           mat.roughness = config.roughness
           mat.clearcoat = 1.0
           mat.clearcoatRoughness = 0.1
           mat.needsUpdate = true
         }
       }
     })
   }
   ```

3. **Implement Preloading** (in CarModel or Scene):
   ```typescript
   import carPartsConfig from '@/public/config/car-parts.json'

   useEffect(() => {
     // Preload all wheel variants
     carPartsConfig.wheels.forEach(part => {
       if (part.url) {
         useLoader.preload(GLTFLoader, part.url, (loader) => {
           loader.setDRACOLoader(dracoLoader)
         })
       }
     })

     // Preload spoilers
     carPartsConfig.spoilers.forEach(part => {
       if (part.url) {
         useLoader.preload(GLTFLoader, part.url, (loader) => {
           loader.setDRACOLoader(dracoLoader)
         })
       }
     })
   }, [])
   ```

**Deliverables**:
- ✅ Parts swap on state change
- ✅ No flicker during transitions
- ✅ All variants preloaded (<3s initial load)

**Success Criteria**:
- Part swap <200ms on desktop
- No memory leaks (check Chrome DevTools)
- Smooth transitions

---

### Phase 3: Material Customization (2 days)

**Goals**:
- Paint color picker
- Metallic/roughness sliders
- Material presets (Matte, Glossy, Chrome)
- Real-time updates

**Implementation**:

1. **Material Controls Component** (`/components/car/MaterialControls.tsx`):
   ```typescript
   import { useCarConfig } from '@/stores/carConfigStore'

   const PRESETS = {
     matte: { metallic: 0.1, roughness: 0.8 },
     glossy: { metallic: 0.9, roughness: 0.1 },
     chrome: { metallic: 1.0, roughness: 0.0 }
   }

   export function MaterialControls() {
     const { paintColor, metallic, roughness, updateMaterial } = useCarConfig()

     return (
       <div className="space-y-4 p-4 bg-white/90 rounded-lg">
         <h3 className="font-bold text-lg">Paint Customization</h3>

         {/* Color Picker */}
         <div>
           <label className="block text-sm font-medium mb-2">Color</label>
           <input
             type="color"
             value={paintColor}
             onChange={(e) => updateMaterial({ paintColor: e.target.value })}
             className="w-full h-12 rounded cursor-pointer"
           />
         </div>

         {/* Metallic Slider */}
         <div>
           <label className="block text-sm font-medium mb-2">
             Metallic: {metallic.toFixed(2)}
           </label>
           <input
             type="range"
             min="0"
             max="1"
             step="0.01"
             value={metallic}
             onChange={(e) => updateMaterial({ metallic: parseFloat(e.target.value) })}
             className="w-full"
           />
         </div>

         {/* Roughness Slider */}
         <div>
           <label className="block text-sm font-medium mb-2">
             Roughness: {roughness.toFixed(2)}
           </label>
           <input
             type="range"
             min="0"
             max="1"
             step="0.01"
             value={roughness}
             onChange={(e) => updateMaterial({ roughness: parseFloat(e.target.value) })}
             className="w-full"
           />
         </div>

         {/* Presets */}
         <div className="flex gap-2">
           <button
             onClick={() => updateMaterial(PRESETS.matte)}
             className="flex-1 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
           >
             Matte
           </button>
           <button
             onClick={() => updateMaterial(PRESETS.glossy)}
             className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
           >
             Glossy
           </button>
           <button
             onClick={() => updateMaterial(PRESETS.chrome)}
             className="flex-1 px-4 py-2 bg-gradient-to-r from-gray-300 to-gray-400 rounded"
           >
             Chrome
           </button>
         </div>
       </div>
     )
   }
   ```

2. **Enhanced Material Application**:
   - Update `applyCarPaint` to handle chrome materials
   - Add `envMapIntensity` control for reflections
   - Implement clearcoat normal maps (optional)

**Deliverables**:
- ✅ Real-time color changes
- ✅ Metallic/roughness sliders working
- ✅ 3 material presets functional

**Success Criteria**:
- Material updates instant (no lag)
- Clearcoat visible in reflections
- Presets apply correctly

---

### Phase 4: UI/UX Polish (2 days)

**Goals**:
- Part selector grid
- Category tabs
- Price calculator
- Mobile responsive design

**Implementation**:

1. **Main Config Panel** (`/components/car/ConfigPanel.tsx`):
   ```typescript
   import { useState } from 'react'
   import { PartSelector } from './PartSelector'
   import { MaterialControls } from './MaterialControls'
   import { PriceSummary } from './PriceSummary'

   const CATEGORIES = ['wheels', 'spoilers', 'body-kits', 'paint']

   export function ConfigPanel() {
     const [activeTab, setActiveTab] = useState('wheels')

     return (
       <div className="fixed right-4 top-20 w-96 max-h-[80vh] overflow-y-auto bg-white/95 backdrop-blur rounded-2xl shadow-2xl">
         {/* Header */}
         <div className="sticky top-0 bg-white border-b p-4">
           <h2 className="text-2xl font-bold">Customize Your Car</h2>
         </div>

         {/* Category Tabs */}
         <div className="flex border-b">
           {CATEGORIES.map(cat => (
             <button
               key={cat}
               onClick={() => setActiveTab(cat)}
               className={`flex-1 py-3 text-sm font-medium capitalize ${
                 activeTab === cat
                   ? 'border-b-2 border-blue-500 text-blue-600'
                   : 'text-gray-600'
               }`}
             >
               {cat}
             </button>
           ))}
         </div>

         {/* Content */}
         <div className="p-4">
           {activeTab === 'paint' ? (
             <MaterialControls />
           ) : (
             <PartSelector category={activeTab} />
           )}
         </div>

         {/* Price Summary */}
         <div className="sticky bottom-0 border-t bg-white p-4">
           <PriceSummary />
         </div>
       </div>
     )
   }
   ```

2. **Part Selector Grid** (`/components/car/PartSelector.tsx`):
   ```typescript
   import { useCarConfig } from '@/stores/carConfigStore'
   import carParts from '@/public/config/car-parts.json'
   import Image from 'next/image'

   export function PartSelector({ category }: { category: string }) {
     const { selectedParts, selectPart } = useCarConfig()
     const parts = carParts[category as keyof typeof carParts]

     if (!Array.isArray(parts)) return null

     return (
       <div className="grid grid-cols-2 gap-4">
         {parts.map(part => (
           <button
             key={part.id}
             onClick={() => selectPart(category, part)}
             className={`border-2 rounded-lg p-3 hover:border-blue-500 transition ${
               selectedParts[category]?.id === part.id
                 ? 'border-blue-500 bg-blue-50'
                 : 'border-gray-200'
             }`}
           >
             {part.thumbnail && (
               <Image
                 src={part.thumbnail}
                 alt={part.name}
                 width={150}
                 height={150}
                 className="w-full h-32 object-cover rounded mb-2"
               />
             )}
             <p className="font-medium text-sm">{part.name}</p>
             <p className="text-blue-600 font-bold">${part.price}</p>
           </button>
         ))}
       </div>
     )
   }
   ```

3. **Price Summary** (`/components/car/PriceSummary.tsx`):
   ```typescript
   import { useCarConfig } from '@/stores/carConfigStore'

   const BASE_PRICE = 25000

   export function PriceSummary() {
     const selectedParts = useCarConfig(s => s.selectedParts)

     const totalPrice = Object.values(selectedParts).reduce(
       (sum, part) => sum + (part?.price || 0),
       BASE_PRICE
     )

     return (
       <div className="space-y-2">
         <div className="flex justify-between text-sm">
           <span>Base Price</span>
           <span>${BASE_PRICE.toLocaleString()}</span>
         </div>

         {Object.entries(selectedParts).map(([category, part]) => (
           part && (
             <div key={category} className="flex justify-between text-sm">
               <span className="capitalize">{category}</span>
               <span>${part.price.toLocaleString()}</span>
             </div>
           )
         ))}

         <div className="border-t pt-2 flex justify-between font-bold text-lg">
           <span>Total</span>
           <span className="text-blue-600">${totalPrice.toLocaleString()}</span>
         </div>

         <button className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition">
           Save Configuration
         </button>
       </div>
     )
   }
   ```

4. **Mobile Responsive**:
   ```tsx
   // ConfigPanel mobile variant
   <div className="fixed md:right-4 md:top-20 md:w-96
                   bottom-0 left-0 right-0 md:bottom-auto
                   max-h-[70vh] md:max-h-[80vh]">
   ```

**Deliverables**:
- ✅ Functional part selector grid
- ✅ Tab navigation between categories
- ✅ Price updates in real-time
- ✅ Mobile bottom sheet layout

**Success Criteria**:
- All parts selectable via UI
- Price calculation accurate
- Touch-friendly on mobile
- Smooth scrolling

---

### Phase 5: Configurator Camera & Lighting (1-2 days)

**Goals**:
- Add OrbitControls to configurator page (showroom keeps POV camera)
- Implement camera presets (front, rear, wheel, interior)
- Studio lighting setup for configurator
- Auto-rotate option

**Note**: This is **only for the configurator page** (`/car-configurator/[carId]`). The showroom keeps its existing POV camera + joystick.

**Implementation**:

1. **Configurator Scene Setup** (`/components/car/CarConfiguratorScene.tsx`):
   ```typescript
   import { Canvas } from '@react-three/fiber'
   import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
   import { CarModel } from './CarModel'
   import { CameraPresets } from './CameraPresets'

   export function CarConfiguratorScene({ carId }: { carId: string }) {
     return (
       <Canvas
         camera={{ position: [5, 2, 5], fov: 50 }}
         shadows
         gl={{ antialias: true, alpha: false }}
         dpr={[1, 2]}
       >
         {/* OrbitControls - Drag to rotate, scroll to zoom */}
         <OrbitControls
           target={[0, 0.5, 0]}
           minDistance={3}
           maxDistance={10}
           minPolarAngle={Math.PI / 6}
           maxPolarAngle={Math.PI / 2.2}
           enablePan={false}
           autoRotate
           autoRotateSpeed={0.5}
           // Touch gestures for mobile
           enableDamping
           dampingFactor={0.05}
         />

         {/* Studio Lighting */}
         <Environment preset="studio" background={false} />

         {/* Additional lights for car details */}
         <directionalLight position={[5, 5, 5]} intensity={0.5} castShadow />
         <directionalLight position={[-5, 3, -5]} intensity={0.3} />
         <hemisphereLight intensity={0.5} />

         {/* Car Model with customizations */}
         <CarModel carId={carId} />

         {/* Ground shadow */}
         <ContactShadows
           position={[0, 0, 0]}
           opacity={0.5}
           scale={15}
           blur={2}
           far={5}
         />
       </Canvas>
     )
   }
   ```

   **Key Differences from Showroom**:
   - ✅ OrbitControls instead of POV camera
   - ✅ No physics (static scene)
   - ✅ No joystick
   - ✅ Drag to rotate, scroll to zoom
   - ✅ Touch-friendly damping

2. **Camera Presets** (`/components/car/CameraPresets.tsx`):
   ```typescript
   import { useThree } from '@react-three/fiber'
   import { useControls } from '@react-three/drei'
   import gsap from 'gsap'

   const PRESETS = {
     default: { position: [5, 2, 5], target: [0, 0.5, 0] },
     front: { position: [0, 1.5, 5], target: [0, 1, 0] },
     rear: { position: [0, 1.5, -5], target: [0, 1, 0] },
     side: { position: [6, 1.5, 0], target: [0, 1, 0] },
     wheel: { position: [3, 0.5, 3], target: [1.5, 0.3, 0] },
     interior: { position: [0.5, 1.3, 0], target: [0, 1.2, -1] }
   }

   export function CameraPresets() {
     const { camera, controls } = useThree()

     const animateCamera = (preset: keyof typeof PRESETS) => {
       const { position, target } = PRESETS[preset]

       gsap.to(camera.position, {
         x: position[0],
         y: position[1],
         z: position[2],
         duration: 1.5,
         ease: 'power2.inOut'
       })

       if (controls) {
         gsap.to(controls.target, {
           x: target[0],
           y: target[1],
           z: target[2],
           duration: 1.5,
           ease: 'power2.inOut',
           onUpdate: () => controls.update()
         })
       }
     }

     return null // UI rendered outside Canvas
   }
   ```

3. **Camera Buttons UI** (outside Canvas):
   ```tsx
   <div className="fixed bottom-4 left-4 flex gap-2">
     {Object.keys(PRESETS).map(preset => (
       <button
         key={preset}
         onClick={() => animateCamera(preset)}
         className="px-4 py-2 bg-white/90 rounded-lg hover:bg-white capitalize"
       >
         {preset}
       </button>
     ))}
   </div>
   ```

**Deliverables**:
- ✅ OrbitControls replacing POV camera
- ✅ 5-6 camera presets with smooth transitions
- ✅ Studio lighting with HDRI
- ✅ Auto-rotate toggle

**Success Criteria**:
- 360° rotation smooth
- Camera presets animate smoothly (GSAP)
- Lighting looks professional
- Shadows/reflections working

---

### Phase 6: Performance Optimization (1-2 days)

**Goals**:
- 60fps on desktop
- 30fps+ on mobile
- Fast part swapping (<200ms)
- Optimized loading

**Implementation**:

1. **Preloading Strategy**:
   ```typescript
   // In CarScene or App mount
   useEffect(() => {
     const preloadAssets = async () => {
       const allParts = [
         ...carParts.wheels,
         ...carParts.spoilers,
         ...carParts.bodyKits
       ]

       allParts.forEach(part => {
         if (part.url) {
           useLoader.preload(GLTFLoader, part.url, (loader) => {
             loader.setDRACOLoader(dracoLoader)
           })
         }
       })
     }

     preloadAssets()
   }, [])
   ```

2. **Mobile Optimizations**:
   ```typescript
   import { useDetectGPU } from '@react-three/drei'

   export function CarScene() {
     const gpu = useDetectGPU()
     const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)

     return (
       <Canvas dpr={isMobile ? [0.5, 1] : [1, 2]}>
         {/* Disable expensive effects on mobile */}
         {!isMobile && <N8AO />}

         <EffectComposer multisampling={isMobile ? 0 : 8}>
           <Bloom
             intensity={isMobile ? 0.5 : 1.0}
             luminanceThreshold={0.9}
           />
         </EffectComposer>
       </Canvas>
     )
   }
   ```

3. **Loading States**:
   ```typescript
   import { Suspense } from 'react'
   import { Html, useProgress } from '@react-three/drei'

   function Loader() {
     const { progress } = useProgress()
     return (
       <Html center>
         <div className="text-white text-2xl">
           Loading... {progress.toFixed(0)}%
         </div>
       </Html>
     )
   }

   export function CarScene() {
     return (
       <Canvas>
         <Suspense fallback={<Loader />}>
           <CarModel />
         </Suspense>
       </Canvas>
     )
   }
   ```

4. **Performance Monitoring**:
   ```typescript
   import { Stats, Perf } from '@react-three/drei'

   // Add during development
   <Canvas>
     <Stats />
     <Perf position="top-left" />
   </Canvas>
   ```

5. **Memory Management**:
   ```typescript
   // In DynamicPart cleanup
   useEffect(() => {
     return () => {
       // Dispose geometries and materials
       scene.traverse(child => {
         if (child.geometry) child.geometry.dispose()
         if (child.material) {
           if (Array.isArray(child.material)) {
             child.material.forEach(mat => mat.dispose())
           } else {
             child.material.dispose()
           }
         }
       })
     }
   }, [scene])
   ```

**Deliverables**:
- ✅ All parts preloaded on mount
- ✅ Mobile-specific optimizations
- ✅ Loading states with progress
- ✅ No memory leaks

**Success Criteria**:
- Desktop: 60fps sustained
- Mobile: 30fps+ on mid-range devices
- Part swap: <200ms
- Memory stable (<500MB)

---

### Phase 7: Advanced Features (Optional, 2-3 days)

**Goals**:
- Screenshot/export functionality
- Configuration URL sharing
- Part swap animations
- Save/load configurations

**Implementation**:

1. **Screenshot Feature**:
   ```typescript
   import { useThree } from '@react-three/fiber'

   export function Screenshot() {
     const { gl, scene, camera } = useThree()

     const captureScreenshot = () => {
       // Render one frame
       gl.render(scene, camera)

       // Get canvas data
       const dataURL = gl.domElement.toDataURL('image/png')

       // Download
       const link = document.createElement('a')
       link.download = `car-config-${Date.now()}.png`
       link.href = dataURL
       link.click()
     }

     return (
       <button
         onClick={captureScreenshot}
         className="px-4 py-2 bg-blue-600 text-white rounded"
       >
         📸 Screenshot
       </button>
     )
   }
   ```

2. **URL Configuration Sharing**:
   ```typescript
   // Encode config to URL
   const shareConfig = () => {
     const config = {
       parts: selectedParts,
       paint: { color: paintColor, metallic, roughness }
     }

     const encoded = btoa(JSON.stringify(config))
     const url = `${window.location.origin}?config=${encoded}`

     navigator.clipboard.writeText(url)
     alert('Configuration URL copied!')
   }

   // Load from URL
   useEffect(() => {
     const params = new URLSearchParams(window.location.search)
     const configParam = params.get('config')

     if (configParam) {
       try {
         const config = JSON.parse(atob(configParam))
         // Apply config to store
         Object.entries(config.parts).forEach(([cat, part]) => {
           selectPart(cat, part)
         })
         updateMaterial(config.paint)
       } catch (e) {
         console.error('Invalid config URL')
       }
     }
   }, [])
   ```

3. **Part Swap Animations**:
   ```typescript
   import { useSpring, animated } from '@react-spring/three'

   export function DynamicPart({ category, defaultUrl }) {
     const selectedPart = useCarConfig(s => s.selectedParts[category])
     const [isLoading, setIsLoading] = useState(false)

     const { scale, opacity } = useSpring({
       scale: isLoading ? 0.8 : 1,
       opacity: isLoading ? 0 : 1,
       config: { tension: 200, friction: 20 }
     })

     // Trigger loading state on part change
     useEffect(() => {
       setIsLoading(true)
       const timer = setTimeout(() => setIsLoading(false), 300)
       return () => clearTimeout(timer)
     }, [selectedPart])

     return (
       <animated.group scale={scale} opacity={opacity}>
         <primitive object={scene} />
       </animated.group>
     )
   }
   ```

4. **Save/Load Configurations** (localStorage):
   ```typescript
   const saveConfiguration = () => {
     const config = {
       name: `Config ${Date.now()}`,
       parts: selectedParts,
       material: { paintColor, metallic, roughness }
     }

     const saved = JSON.parse(localStorage.getItem('savedConfigs') || '[]')
     saved.push(config)
     localStorage.setItem('savedConfigs', JSON.stringify(saved))
   }

   const loadConfiguration = (config: SavedConfig) => {
     Object.entries(config.parts).forEach(([cat, part]) => {
       selectPart(cat, part)
     })
     updateMaterial(config.material)
   }
   ```

**Deliverables**:
- ✅ Screenshot downloads as PNG
- ✅ Shareable configuration URLs
- ✅ Smooth part swap animations
- ✅ Save/load from localStorage

**Success Criteria**:
- Screenshot captures current view
- URL sharing works across devices
- Animations feel polished
- Configurations persist

---

## Performance Optimization

### Target Metrics

| Metric | Desktop | Mobile | Critical? |
|--------|---------|--------|-----------|
| **FPS** | 60 | 30+ | ✅ Yes |
| **Initial Load** | <3s | <5s | ✅ Yes |
| **Part Swap** | <200ms | <500ms | ✅ Yes |
| **Material Update** | Instant | Instant | ✅ Yes |
| **Total GLB Size** | <5MB | <3MB | ⚠️ Recommended |
| **Memory Usage** | <500MB | <300MB | ⚠️ Monitor |

### Optimization Strategies

#### 1. Model Optimization

**DRACO Compression** (Already Implemented):
```bash
# Re-export models with gltf-pipeline
npm install -g gltf-pipeline
gltf-pipeline -i wheel.glb -o wheel-draco.glb -d
```

**Expected Results**:
- 50-80% file size reduction
- Minimal quality loss
- Faster downloads

**Model Checklist**:
- ✅ Merge meshes by material (reduce draw calls)
- ✅ Remove unused vertices/edges
- ✅ Bake ambient occlusion
- ✅ Use vertex colors for details (avoid textures)
- ✅ Keep poly count <50K per part

#### 2. Texture Optimization

**Best Practices**:
- Use 1K textures (512x512 or 1024x1024)
- JPG for diffuse/color maps
- PNG for alpha/transparency
- Avoid large normal maps (bake details into geometry)

**Tools**:
- Squoosh.app (web-based compression)
- TinyPNG (batch optimization)

#### 3. Code-Level Optimizations

**UseMemo for Expensive Operations**:
```typescript
// Clone scenes only when needed
const scene = useMemo(() => {
  return gltf.scene.clone(true)
}, [gltf])

// Material calculations
const materialConfig = useMemo(() => {
  return { color: paintColor, metallic, roughness }
}, [paintColor, metallic, roughness])
```

**Avoid Re-renders**:
```typescript
// Use Zustand selectors to avoid unnecessary re-renders
const paintColor = useCarConfig(s => s.paintColor) // ✅ Only re-renders on color change
const state = useCarConfig() // ❌ Re-renders on ANY state change
```

**Throttle Material Updates**:
```typescript
import { throttle } from 'lodash-es'

const updateMaterialThrottled = throttle((config) => {
  updateMaterial(config)
}, 16) // ~60fps
```

#### 4. Rendering Optimizations

**Adaptive DPR** (Device Pixel Ratio):
```typescript
<Canvas dpr={[0.5, 2]}> {/* Min 0.5, max 2 */}
```

**Conditional Effects**:
```typescript
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)

<EffectComposer>
  <Bloom intensity={isMobile ? 0.5 : 1.0} />
  {!isMobile && <N8AO />} {/* Expensive on mobile */}
</EffectComposer>
```

**Frustum Culling** (automatic in Three.js, but verify):
```typescript
// Ensure parts outside view aren't rendered
object.frustumCulled = true
```

#### 5. Network Optimization

**Preloading**:
```typescript
// Preload critical assets
useEffect(() => {
  const criticalParts = [
    '/car-models/base.glb',
    '/car-models/wheels/default.glb'
  ]

  criticalParts.forEach(url => {
    useLoader.preload(GLTFLoader, url)
  })
}, [])
```

**Lazy Loading**:
```typescript
// Load non-critical parts only when needed
const loadSpoiler = () => {
  import('@/components/car/Spoiler').then(mod => {
    setSpoilerComponent(mod.default)
  })
}
```

#### 6. Memory Management

**Dispose Unused Resources**:
```typescript
useEffect(() => {
  return () => {
    scene.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }
}, [scene])
```

**Monitor with Chrome DevTools**:
1. Open DevTools → Performance
2. Start recording
3. Swap parts multiple times
4. Check for memory leaks (sawtooth pattern = good, climbing = leak)

---

## Open-Source References

### 1. pmndrs/racing-game
- **URL**: github.com/pmndrs/racing-game
- **Stack**: React Three Fiber + Rapier (same physics engine!)
- **Key Learnings**:
  - Vehicle physics implementation
  - Wheel rotation sync with speed
  - Performance optimization for complex scenes
  - Mobile touch controls
- **Live Demo**: Search "pmndrs racing game vercel"

### 2. Bruno Simon - Portfolio
- **URL**: bruno-simon.com (source: github.com/brunosimon/my-room-in-3d)
- **Tech**: Three.js (pure, no R3F)
- **Key Learnings**:
  - Creative camera work
  - Low-poly aesthetic for performance
  - Custom car controls
  - Physics integration
- **Notable**: Won Awwwards Site of the Year

### 3. BMW i Visualizer
- **Type**: Commercial reference (study only)
- **Techniques**:
  - Environment mapping for reflections
  - ContactShadows for grounded look
  - Material presets (paint types)
  - Smooth part transitions
- **Takeaway**: Use drei's `<Environment>` + `<ContactShadows>`

### 4. Three.js Examples - Car Reflection
- **URL**: threejs.org/examples/?q=car#webgl_materials_car
- **Tech**: Pure Three.js
- **Key Learnings**:
  - Car paint material setup
  - Clearcoat implementation
  - Environment map intensity
  - Lighting for automotive

### 5. Sketchfab Car Configurators
- **URL**: sketchfab.com (search "car configurator")
- **Key Learnings**:
  - Many free GLB car models
  - Study material setup in exports
  - Lighting techniques
  - Camera angles
- **Action**: Download free models for testing

### 6. React Three Fiber Docs
- **URL**: docs.pmnd.rs/react-three-fiber
- **Critical Pages**:
  - `/advanced/pitfalls` - Common mistakes
  - `/tutorials/loading-models` - useLoader patterns
  - `/tutorials/using-with-react-spring` - Animations
- **Live Examples**: codesandbox.io/u/pmndrs

### 7. Drei Storybook
- **URL**: drei.pmnd.rs
- **Components to Study**:
  - `<Environment>` - HDRI backgrounds (already using!)
  - `<ContactShadows>` - Realistic ground shadows
  - `<MeshReflectorMaterial>` - Floor reflections (already using!)
  - `<useDetectGPU>` - Performance tier detection
  - `<Merged>` - Instance optimization

### 8. gltfjsx Tool
- **URL**: github.com/pmndrs/gltfjsx
- **Purpose**: Auto-generate R3F components from GLB
- **Usage**:
  ```bash
  npx gltfjsx model.glb
  ```
- **Output**: Typed React component with all meshes

### 9. Leva GUI
- **URL**: github.com/pmndrs/leva
- **Purpose**: Quick UI for tweaking values
- **Use Case**: During development to find perfect material values
- **Example**:
  ```typescript
  import { useControls } from 'leva'

  const { metallic, roughness } = useControls({
    metallic: { value: 0.9, min: 0, max: 1 },
    roughness: { value: 0.1, min: 0, max: 1 }
  })
  ```

### 10. Polyhaven Assets
- **URL**: polyhaven.com
- **Free Resources**:
  - HDRIs (already using one!)
  - Textures (CC0 license)
  - 3D models
- **Best HDRIs for Cars**:
  - `studio_small_09`
  - `photo_studio_loft_hall`
  - `empty_warehouse_01`

### 11. CodeSandbox Examples
- **Search**: "react three fiber car"
- **Filter**: Most starred, updated 2024-2025
- **Top Examples**:
  - Car configurator basics
  - Material swapping
  - Camera animations
- **Action**: Fork and experiment

### 12. R3F Performance Monitor
- **URL**: github.com/pmndrs/r3f-perf
- **Purpose**: Real-time FPS/memory monitoring
- **Usage**:
  ```tsx
  import { Perf } from 'r3f-perf'
  <Canvas>
    <Perf position="top-left" />
  </Canvas>
  ```

---

## File Structure

```
car-mansori/
├── app/
│   ├── showroom/
│   │   └── page.tsx                  # ✅ EXISTING - Showroom with POV camera
│   │
│   └── car-configurator/
│       └── [carId]/
│           └── page.tsx              # 🆕 NEW - Configurator route
│
├── components/
│   ├── store/                        # ✅ EXISTING - Keep as-is
│   │   ├── Scene.tsx                 # Showroom scene (POV camera + joystick)
│   │   ├── ModelLoader.tsx           # GLTF loader with DRACO
│   │   ├── ProductInteraction.tsx    # Raycasting system
│   │   ├── CarInteraction.tsx        # 🆕 NEW - Extend for car clicks
│   │   └── ...                       # Other existing components
│   │
│   └── car/                          # 🆕 NEW - Configurator components
│       ├── CarConfiguratorScene.tsx  # Canvas + OrbitControls + Lights
│       ├── CarModel.tsx              # Base car + DynamicParts composite
│       ├── DynamicPart.tsx           # Part loader with material override
│       ├── ConfigPanel.tsx           # Main UI sidebar
│       ├── PartSelector.tsx          # Category tabs + part grid
│       ├── MaterialControls.tsx      # Color picker + sliders
│       ├── CameraPresets.tsx         # View switcher (front/rear/etc)
│       ├── PriceSummary.tsx          # Price calculator
│       ├── Screenshot.tsx            # Export functionality
│       └── Loader.tsx                # Loading state component
│
├── stores/
│   └── carConfigStore.ts             # 🆕 NEW - Zustand state (configurator only)
│
├── public/
│   ├── config/
│   │   ├── stores.json               # ✅ EXISTING - Add showroom cars here
│   │   ├── cars.json                 # 🆕 NEW - Car database (id, name, price)
│   │   └── car-parts.json            # 🆕 NEW - Parts database (wheels, spoilers)
│   │
│   ├── models/
│   │   └── showroom/                 # 🆕 NEW - Full car models for showroom
│   │       ├── sport-sedan.glb
│   │       ├── suv.glb
│   │       └── supercar.glb
│   │
│   ├── car-models/                   # 🆕 NEW - Configurator parts
│   │   ├── base/                     # Base car models (by car type)
│   │   │   ├── sport-sedan-base.glb
│   │   │   ├── suv-base.glb
│   │   │   └── supercar-base.glb
│   │   │
│   │   ├── wheels/                   # Wheel variants
│   │   │   ├── default.glb
│   │   │   ├── sport-rims.glb
│   │   │   └── chrome-rims.glb
│   │   │
│   │   ├── spoilers/                 # Spoiler variants
│   │   │   ├── none.glb
│   │   │   └── gt-wing.glb
│   │   │
│   │   └── body-kits/                # Body kit variants
│   │       └── racing-kit.glb
│   │
│   ├── thumbnails/                   # 🆕 NEW - Part preview images
│   │   ├── cars/
│   │   ├── wheels/
│   │   ├── spoilers/
│   │   └── body-kits/
│   │
│   └── draco/                        # ✅ EXISTING - DRACO decoder
│
└── arch-docs/
    └── CAR_CONFIGURATOR_ROADMAP.md   # This document
```

### Legend
- ✅ **EXISTING**: Keep as-is, minimal or no changes
- 🆕 **NEW**: Create from scratch
- 🔧 **MODIFY**: Extend existing file

### File Size Guidelines

| File Type | Max Size | Recommended |
|-----------|----------|-------------|
| Base car GLB | 2MB | 1-1.5MB |
| Part GLB | 500KB | 200-300KB |
| Thumbnail JPG | 50KB | 20-30KB |
| HDRI | 2MB | 1MB (1K resolution) |

---

## Code Patterns & Examples

### Pattern 1: Zustand Store Setup

```typescript
// stores/carConfigStore.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface CarPart {
  id: string
  name: string
  category: 'wheels' | 'spoiler' | 'body-kit'
  url: string
  price: number
  thumbnail?: string
}

interface MaterialConfig {
  paintColor: string
  metallic: number
  roughness: number
}

interface CarConfigState extends MaterialConfig {
  selectedParts: Record<string, CarPart>
  selectPart: (category: string, part: CarPart) => void
  updateMaterial: (config: Partial<MaterialConfig>) => void
  resetConfig: () => void
  getTotalPrice: () => number
}

const BASE_PRICE = 25000
const DEFAULT_MATERIAL: MaterialConfig = {
  paintColor: '#ff0000',
  metallic: 0.9,
  roughness: 0.1
}

export const useCarConfig = create<CarConfigState>()(
  devtools(
    (set, get) => ({
      ...DEFAULT_MATERIAL,
      selectedParts: {},

      selectPart: (category, part) =>
        set((state) => ({
          selectedParts: { ...state.selectedParts, [category]: part }
        }), false, 'selectPart'),

      updateMaterial: (config) =>
        set(config, false, 'updateMaterial'),

      resetConfig: () =>
        set({
          selectedParts: {},
          ...DEFAULT_MATERIAL
        }, false, 'resetConfig'),

      getTotalPrice: () => {
        const { selectedParts } = get()
        return Object.values(selectedParts).reduce(
          (sum, part) => sum + (part?.price || 0),
          BASE_PRICE
        )
      }
    }),
    { name: 'CarConfig' }
  )
)
```

### Pattern 2: Dynamic Part Loading

```typescript
// components/car/DynamicPart.tsx
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { useMemo } from 'react'
import { useCarConfig } from '@/stores/carConfigStore'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

export function DynamicPart({
  category,
  defaultUrl,
  position = [0, 0, 0],
  rotation = [0, 0, 0]
}: {
  category: string
  defaultUrl: string
  position?: [number, number, number]
  rotation?: [number, number, number]
}) {
  const selectedPart = useCarConfig((s) => s.selectedParts[category])
  const url = selectedPart?.url || defaultUrl

  // Load model with DRACO
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.setDRACOLoader(dracoLoader)
  })

  // Clone scene to avoid shared material references
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)

    // Optional: Apply transforms
    clone.position.set(...position)
    clone.rotation.set(...rotation)

    return clone
  }, [gltf, position, rotation])

  return <primitive object={scene} />
}
```

### Pattern 3: Material Override

```typescript
// utils/materialHelpers.ts
import { Object3D, Mesh, MeshStandardMaterial } from 'three'

interface MaterialConfig {
  paintColor: string
  metallic: number
  roughness: number
}

export function applyCarPaint(object: Object3D, config: MaterialConfig) {
  object.traverse((child) => {
    if (child instanceof Mesh && child.material) {
      const material = child.material as MeshStandardMaterial

      // Target specific materials by name
      if (material.name === 'CarPaint') {
        material.color.set(config.paintColor)
        material.metalness = config.metallic
        material.roughness = config.roughness
        material.clearcoat = 1.0
        material.clearcoatRoughness = 0.1
        material.envMapIntensity = 1.5
        material.needsUpdate = true
      }

      // Chrome parts
      else if (material.name === 'Chrome') {
        material.metalness = 1.0
        material.roughness = 0.0
        material.envMapIntensity = 2.0
        material.needsUpdate = true
      }

      // Glass parts
      else if (material.name === 'Glass') {
        material.transparent = true
        material.opacity = 0.3
        material.metalness = 0.0
        material.roughness = 0.1
        material.needsUpdate = true
      }
    }
  })
}

export const MATERIAL_PRESETS = {
  matte: { metallic: 0.1, roughness: 0.8 },
  glossy: { metallic: 0.9, roughness: 0.1 },
  chrome: { metallic: 1.0, roughness: 0.0 },
  satin: { metallic: 0.6, roughness: 0.4 }
} as const
```

### Pattern 4: Camera Presets with Animation

```typescript
// hooks/useCameraPresets.ts
import { useThree } from '@react-three/fiber'
import { useCallback } from 'react'
import gsap from 'gsap'

interface CameraPreset {
  position: [number, number, number]
  target: [number, number, number]
}

const PRESETS: Record<string, CameraPreset> = {
  default: { position: [5, 2, 5], target: [0, 0.5, 0] },
  front: { position: [0, 1.5, 5], target: [0, 1, 0] },
  rear: { position: [0, 1.5, -5], target: [0, 1, 0] },
  side: { position: [6, 1.5, 0], target: [0, 1, 0] },
  wheel: { position: [3, 0.5, 3], target: [1.5, 0.3, 0] },
  interior: { position: [0.5, 1.3, 0], target: [0, 1.2, -1] }
}

export function useCameraPresets() {
  const { camera, controls } = useThree()

  const animateToPreset = useCallback((presetName: string) => {
    const preset = PRESETS[presetName]
    if (!preset) return

    const { position, target } = preset

    // Animate camera position
    gsap.to(camera.position, {
      x: position[0],
      y: position[1],
      z: position[2],
      duration: 1.5,
      ease: 'power2.inOut'
    })

    // Animate controls target
    if (controls && 'target' in controls) {
      gsap.to(controls.target, {
        x: target[0],
        y: target[1],
        z: target[2],
        duration: 1.5,
        ease: 'power2.inOut',
        onUpdate: () => controls.update()
      })
    }
  }, [camera, controls])

  return { animateToPreset, presets: Object.keys(PRESETS) }
}
```

### Pattern 5: Preloading All Assets

```typescript
// components/car/AssetPreloader.tsx
import { useEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import carParts from '@/public/config/car-parts.json'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

export function AssetPreloader() {
  useEffect(() => {
    const allUrls: string[] = []

    // Collect all GLB URLs
    Object.values(carParts).forEach(category => {
      if (Array.isArray(category)) {
        category.forEach(part => {
          if (part.url) allUrls.push(part.url)
        })
      }
    })

    // Preload all
    allUrls.forEach(url => {
      useLoader.preload(GLTFLoader, url, (loader) => {
        loader.setDRACOLoader(dracoLoader)
      })
    })

    console.log(`Preloading ${allUrls.length} assets...`)
  }, [])

  return null
}
```

---

## Next Steps

### Immediate Actions (Day 1 - Phase 0)

**Goal**: Get showroom working with car click detection

1. **Get Car Models for Showroom**:
   - Download 2-3 free car GLB models from Sketchfab
   - Place in `/public/models/showroom/`
   - Test loading in existing showroom

2. **Create Cars Database** (`/public/config/cars.json`):
   - Copy example from Phase 0
   - Add 2-3 cars with IDs, names, base prices
   - Link to model names in stores.json

3. **Extend stores.json**:
   - Add car models to existing config
   - Set positions in showroom (spread them out)
   - Test that they load in existing Scene.tsx

4. **Create CarInteraction Component**:
   - Copy ProductInteraction.tsx as template
   - Modify to detect car clicks
   - Add router.push to configurator page

5. **Create Configurator Route**:
   - Create `/app/car-configurator/[carId]/page.tsx`
   - Add basic page structure (placeholder for now)
   - Test routing works when clicking car

**Day 1 Success Criteria**:
- ✅ Walk around showroom (existing functionality)
- ✅ See 2-3 cars in showroom
- ✅ Click car → redirect to configurator page

---

### Days 2-3: Phase 1 (Configurator State)

1. **Install Zustand**:
   ```bash
   npm install zustand
   ```

2. **Create Directory Structure**:
   ```bash
   mkdir -p components/car
   mkdir -p stores
   mkdir -p public/car-models/{base,wheels,spoilers,body-kits}
   mkdir -p public/thumbnails/{cars,wheels,spoilers,body-kits}
   ```

3. **Create car-parts.json**:
   - Copy example from Phase 1
   - Add 2-3 categories with sample data

4. **Create Zustand Store**:
   - Copy `carConfigStore.ts` from Phase 1
   - Test with React DevTools

---

### Week 1 Goals

- ✅ Phase 0: Showroom with car clicks
- ✅ Phase 1: Configurator state & config
- ✅ Phase 2: Basic part swapping
- ⚠️ Phase 3: Material controls started

### Week 2 Goals

- ✅ Phase 3: Material controls complete
- ✅ Phase 4: UI polish
- ✅ Phase 5: Camera presets (configurator)
- ⚠️ Phase 6: Performance optimization

### Testing Checklist

- [ ] Desktop (Chrome, Firefox, Safari)
- [ ] Mobile (iPhone, Android)
- [ ] Tablet (iPad)
- [ ] Low-end device (3+ years old)
- [ ] Slow network (3G simulation)

### Performance Checklist

- [ ] 60fps on desktop
- [ ] 30fps+ on mobile
- [ ] Part swap <200ms
- [ ] Initial load <3s
- [ ] No memory leaks (30min stress test)
- [ ] Lighthouse score >80

### Accessibility Checklist

- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Color contrast (WCAG AA)
- [ ] Touch targets >44px
- [ ] Focus indicators visible

---

## Estimated Timeline

| Phase | Days | Blocker? | Can Parallelize? |
|-------|------|----------|------------------|
| **Phase 0: Showroom Setup** | 1-2 | Yes | No |
| Phase 1: Configurator State | 1-2 | Yes | No |
| Phase 2: Part Swapping | 2-3 | Yes | No |
| Phase 3: Materials | 2 | No | Yes (with Phase 4) |
| Phase 4: UI/UX | 2 | No | Yes (with Phase 3) |
| Phase 5: Configurator Camera | 1-2 | No | Yes (with Phase 6) |
| Phase 6: Performance | 1-2 | No | Continuous |
| Phase 7: Advanced Features | 2-3 | No | Optional |

**Total Core Timeline**: 8-12 days (with Phase 0)
**With Advanced Features**: 10-15 days
**With Parallelization**: 7-10 days

### Phase Breakdown

**Showroom (Phase 0)**:
- Add cars to existing stores.json: 0.5 day
- Create cars.json database: 0.5 day
- Extend ProductInteraction for car clicks: 0.5 day
- Create configurator route: 0.5 day

**Configurator (Phases 1-6)**:
- State & parts config: 1-2 days
- Dynamic part loading: 2-3 days
- Material customization: 2 days
- UI polish: 2 days
- Camera & lighting: 1-2 days
- Performance optimization: 1-2 days

---

## Risk Mitigation

### Risk 1: Model Size Too Large
- **Impact**: Slow loading, poor mobile experience
- **Mitigation**:
  - DRACO compression mandatory
  - Target <1MB per part
  - Use gltf-pipeline for optimization
  - Test on 3G network

### Risk 2: Performance Issues on Mobile
- **Impact**: <30fps, crashes
- **Mitigation**:
  - Adaptive DPR
  - Disable expensive effects (N8AO)
  - Lower bloom quality
  - Use `useDetectGPU` for tier detection

### Risk 3: Memory Leaks
- **Impact**: Browser crashes after extended use
- **Mitigation**:
  - Dispose geometries/materials on unmount
  - Test with Chrome DevTools Memory profiler
  - Limit cached models to 10-15

### Risk 4: Complex Material Setup in Blender
- **Impact**: Materials don't export correctly
- **Mitigation**:
  - Name materials clearly (CarPaint, Chrome, etc.)
  - Test export early
  - Use gltfjsx to verify structure
  - Keep materials simple (no procedural nodes)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Load Time** | <3s (desktop) | Lighthouse Performance |
| **FPS** | 60fps (desktop) | Stats component |
| **Part Swap** | <200ms | Chrome DevTools Performance |
| **Mobile FPS** | 30fps+ | iPhone 12/13 testing |
| **Bundle Size** | <500KB (JS) | Next.js build output |
| **Lighthouse** | >80 | Chrome DevTools |
| **User Engagement** | >2min avg session | Analytics |

---

## Free Tools & Resources

### 3D Modeling
- **Blender** (blender.org) - Industry-standard 3D software
- **SketchUp Free** - Simpler alternative
- **Polyhaven Models** (polyhaven.com/models) - Free CC0 assets

### Textures
- **Polyhaven Textures** (polyhaven.com/textures)
- **CC0 Textures** (cc0textures.com)
- **AmbientCG** (ambientcg.com)

### HDRIs
- **Polyhaven HDRIs** (polyhaven.com/hdris)
- Best for cars: `studio_small_09`, `photo_studio_loft_hall`

### Optimization Tools
- **gltf-pipeline** (GitHub) - DRACO compression CLI
- **glTF Transform** (gltf-transform.dev) - Advanced GLB optimization
- **Squoosh** (squoosh.app) - Image compression

### Color Resources
- **Coolors.co** - Color palette generator
- **Car Paint Codes** (paintref.com) - Real automotive colors
- **Adobe Color** (color.adobe.com) - Color wheel tool

### Development
- **Leva** (github.com/pmndrs/leva) - Quick GUI for tweaking
- **R3F Perf** (github.com/pmndrs/r3f-perf) - Performance monitoring
- **gltfjsx** (github.com/pmndrs/gltfjsx) - GLB to React component

---

## Conclusion

This roadmap provides a comprehensive, step-by-step guide to building a production-ready car showroom + configurator 3D experience using a **two-stage architecture**.

### Architecture Summary

**Stage 1: Showroom** (95% reusable)
- Keep existing POV camera + joystick
- Add car models to stores.json
- Extend ProductInteraction for car clicks
- Route to configurator on click

**Stage 2: Configurator** (70% reusable patterns)
- New page with OrbitControls
- Zustand state management
- Dynamic part swapping
- Material customization UI

### Timeline: 8-12 days

**Phase 0** (1-2d): Showroom setup
**Phases 1-6** (7-10d): Configurator implementation

### Key Advantages

**Showroom**:
- ✅ Zero changes to existing Scene.tsx
- ✅ POV camera + physics stay intact
- ✅ Proven jewelry store code reused
- ✅ Just add car models + click detection

**Configurator**:
- ✅ R3F + Drei patterns already proven
- ✅ DRACO compression implemented
- ✅ Material override system working
- ✅ OrbitControls isolated (no conflicts)

### Recommended Approach

1. **Start with Phase 0**: Validate showroom + routing (1-2 days)
2. **Build configurator incrementally**: Phases 1-2 first (state + parts)
3. **Parallelize UI + materials**: Phases 3-4 together
4. **Continuous optimization**: Phase 6 throughout
5. **Advanced features optional**: Phase 7 if time permits

### Next Immediate Step

**Phase 0, Day 1**:
1. Download 2-3 car GLB models for showroom
2. Add to `/public/models/showroom/`
3. Create `cars.json` database
4. Test cars load in existing showroom
5. Add click detection → route to `/car-configurator/[carId]`

**Success**: Click car in showroom → see placeholder configurator page

---

**Document Version**: 2.0 (Updated for two-stage architecture)
**Last Updated**: 2026-07-01
**Status**: Ready for Implementation
