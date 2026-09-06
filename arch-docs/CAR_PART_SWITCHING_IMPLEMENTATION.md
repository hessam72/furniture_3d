# Car Part Switching Implementation

## Overview
Real-time car part customization system with paint controls, node-based part swapping, and memory-optimized preloading.

## Files Created

### State Management
**`stores/carConfigStore.ts`**
- Zustand store for customization state
- `selectedParts: Record<string, string>` - Category → Part ID mapping
- `paintConfig: { color, metalness, roughness, clearcoat }`
- Actions: `selectPart()`, `setPaintConfig()`, `resetConfig()`
- Devtools integration enabled

### Core 3D Components
**`components/car/ConfigurableCar.tsx`**
- Replaces `RotatableCar` with customization support
- Loads base car model via `useGLTF`
- Applies paint config to body meshes (checks `userData.paintable` flag + name matching)
- Renders `<DynamicPart>` for 7 categories
- Maintains drag rotation + vertical pan controls

**`components/car/DynamicPart.tsx`**
- Handles 3 part swap strategies from car-parts.json:
  1. **attachNodes** (wheels): Clone to multiple named nodes (Wheel_FL, Wheel_FR, etc.)
  2. **replaceNode** (hood/bumpers): Replace single named node
  3. **hideNodes** (none options): Hide original nodes without loading model
- Memory management: `useGLTF.clear()` on unmount + geometry/material disposal
- Recursive node finder (case-insensitive)

### UI Components
**`components/car/CustomizationPanel.tsx`**
- Fixed right sidebar (384px width)
- 8 category tabs (Paint + 7 part categories)
- Total price calculator
- Category-scoped preloading on tab change
- Idle prefetch via `requestIdleCallback` (2s timeout)
- Reset button

**`components/car/PartsGrid.tsx`**
- Grid layout (2 cols mobile, 3 cols desktop)
- Thumbnail images with fallback
- Price display (Stock vs $XXX)
- Selected state with checkmark indicator
- Click → `selectPart()` action

**`components/car/PaintControls.tsx`**
- Color picker (hex input + color wheel)
- 3 sliders: Metalness (0-1), Roughness (0-1), Clearcoat (0-1)
- 6 presets: Gloss Red, Satin Black, Matte Gray, Chrome, Gloss Blue, Pearl White

## Files Modified

**`components/car/CarTuningScene.tsx`**
- Changed import: `RotatableCar` → `ConfigurableCar`

**`app/car/[id]/page.tsx`**
- Added `CustomizationPanel` import + render
- Initialize default stock parts on car load via `resetConfig()`
- Moved specs overlay to bottom-left (avoid sidebar overlap)

## Data Structure

### car-parts.json Schema
```json
{
  "category": [
    {
      "id": "part-id",
      "name": "Display Name",
      "category": "category",
      "model_path": "/models/parts/category/file.glb",
      "price": 0,
      "thumbnail": "/images/parts/category/file.jpg",

      // Strategy 1: Attach to multiple nodes (wheels, mirrors)
      "attachNodes": ["Node_1", "Node_2"],

      // Strategy 2: Replace single node (hood, exhaust)
      "replaceNode": "Node_Name",

      // Strategy 3: Hide nodes (none options)
      "hideNodes": ["Node_To_Hide"]
    }
  ]
}
```

### Default Parts (Stock Config)
```typescript
wheels: 'wheel-stock'
spoilers: 'spoiler-stock'
hoods: 'hood-stock'
bumpers: 'bumper-front-stock'
mirrors: 'mirror-stock'
exhaust: 'exhaust-stock'
'side-skirts': 'skirts-none'
```

## Key Features

### Part Swapping Logic
1. **Load**: `useGLTF(partConfig.model_path)` with DRACO support
2. **Find**: Recursive search for named nodes in base car scene
3. **Clone**: Deep clone part model with `scene.clone(true)`
4. **Position**: Copy position/rotation/scale from target node
5. **Hide**: Set original node `visible = false`
6. **Render**: Add as `<primitive object={clone} />`

### Paint System - Multi-Zone Support
**3 Independent Paint Zones:**
- **Body**: Exterior panels (doors, hood, bumpers, fenders)
- **Trim**: Exterior accents (grilles, mirror caps, side trim)
- **Interior**: Seats, dashboard, door panels

**Zone Detection:**
- Primary: `userData.paintZone = "body"` / `"trim"` / `"interior"` (set in Blender)
- Fallback: Defaults to "body" if no zone specified
- Legacy: `userData.paintable === true` flag still required

**Material Properties per Zone:**
- `color` (hex string)
- `metalness` (0-1)
- `roughness` (0-1)
- `clearcoat` (0-1, if material supports)

**Example Logic:**
```typescript
const zone = child.userData.paintZone || 'body'
const config = paintConfig[zone]
mat.color.set(config.color)
mat.metalness = config.metalness
```

**UI Features:**
- Zone selector tabs (Body/Trim/Interior)
- "Copy to All Zones" utility button
- Independent color pickers + sliders per zone
- Presets apply to active zone only

### Performance Optimizations
**Category-Scoped Preloading**:
```typescript
// Immediate: Load current category on tab change
useEffect(() => {
  if (activeTab !== 'paint') {
    preloadCategory(activeTab)
  }
}, [activeTab])

// Deferred: Prefetch other categories during idle
requestIdleCallback(() => {
  categories.forEach(cat => preloadCategory(cat))
}, { timeout: 2000 })
```

**Memory Management**:
- Clear GLTF cache: `useGLTF.clear(url)` on component unmount
- Dispose geometries: `mesh.geometry?.dispose()`
- Dispose materials: `mesh.material?.dispose()`

### UI/UX Flow
1. User opens `/car/sample-car`
2. Stock parts initialize automatically
3. User clicks category tab (e.g., "Wheels")
4. Parts grid loads + preloads wheel models
5. User clicks part → `selectPart('wheels', 'wheel-chrome')`
6. `DynamicPart` re-renders with new part
7. Old part disposed, new part cloned to 4 wheel nodes
8. Adjacent categories prefetch during browser idle time

## Categories

| Category | attachNodes | replaceNode | hideNodes |
|----------|-------------|-------------|-----------|
| Wheels | ✓ (4x) | | |
| Spoilers | ✓ | | ✓ |
| Hoods | | ✓ | |
| Bumpers | | ✓ | |
| Mirrors | ✓ (2x) | | ✓ |
| Exhaust | | ✓ | |
| Side Skirts | ✓ (2x) | | |

## Known Node Names (Required in Base Car GLB)

**Wheels**: `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`
**Spoilers**: `Spoiler_Mount`, `Stock_Spoiler`
**Hoods**: `Hood`
**Bumpers**: `Front_Bumper`, `Rear_Bumper`
**Mirrors**: `Mirror_L`, `Mirror_R`
**Exhaust**: `Exhaust`
**Side Skirts**: `Skirt_L`, `Skirt_R`

## Blender Workflow

### Multi-Zone Paint Setup

**Option 1: Blender Custom Properties (Flat Structure)**
1. **Select paintable mesh** (e.g., car hood)
2. **Object Properties panel** → Custom Properties
3. **Add property**: `paintable` = 1 (Integer)
4. **Add property**: `paintZone` = "body" (String)
   - Options: `"body"`, `"trim"`, `"interior"`
5. **Repeat** for all paintable meshes:
   - Body panels → `paintZone = "body"`
   - Trim/grilles/accents → `paintZone = "trim"`
   - Seats/dashboard → `paintZone = "interior"`

**Option 2: Three.js Editor (Nested Structure)**
1. **Open model in Three.js Editor** (threejs.org/editor)
2. **Select mesh** → Right panel → Object → User Data
3. **Add to `userdata` object**:
   - `paintable: true`
   - `paintZone: "body" | "trim" | "interior"`
4. **Export as GLB**

**Code Support**: Both structures supported via `getUserData()` helper:
- Flat: `userData.paintable`, `userData.paintZone`
- Nested: `userData.userdata.paintable`, `userData.userdata.paintZone`

### Model Export
1. Export base car with named nodes matching node list (Wheel_FL, Hood, etc.)
2. Export individual parts with same pivot/scale as target nodes
3. Enable DRACO compression (decoder at `/public/draco/`)

**Note**: userData properties auto-export with GLB format

## Phase 2: Coordinate Space Fix (July 2026)

### Problem Identified
Parts were appearing at incorrect positions despite correct position values being copied. Root cause: **coordinate space mismatch**.

**Original Implementation:**
```typescript
// useMemo returned instances
const clone = gltf.scene.clone(true)
clone.position.copy(targetNode.position) // Local position
return instances // Rendered via <primitive> in <group> wrapper
```

**Issue:**
- `targetNode.position` = local position relative to parent in baseCarScene hierarchy
- Clones rendered in React `<group>` wrapper = different coordinate space
- Local coordinates interpreted as world coordinates = wrong final position

**Debug Output:**
```javascript
[DynamicPart] targetNode: Wheel_FL { x: 0.829, y: -1.306, z: 0.370 }
[DynamicPart] clone assigned: { x: 0.829, y: -1.306, z: 0.370 }
// Values correct, but wheel appeared far from expected location
```

### Solution Implemented
**Changed from React rendering to direct scene manipulation:**

```typescript
// useEffect adds clones directly to targetNode.parent
useEffect(() => {
  const clone = gltf.scene.clone(true)
  clone.position.copy(targetNode.position)
  targetNode.parent?.add(clone) // Same parent = same coordinate space
  // Cleanup on unmount
}, [gltf, partConfig, baseCarScene])

return null // No React rendering
```

**Key Changes:**
1. Switched from `useMemo` to `useEffect` (side effects)
2. Add clones via `targetNode.parent.add()` instead of React `<primitive>`
3. Maintain same parent hierarchy = correct coordinate space
4. Return `null` - component only handles logic, scene manipulation in THREE.js
5. Cleanup removes clones + disposes geometries/materials

**Files Modified:**
- [components/car/DynamicPart.tsx:46-146](components/car/DynamicPart.tsx#L46-L146)
- Removed `import { useMemo }`
- Removed `<primitive>` render logic

**Result:**
- Parts now position correctly at target node locations
- Local coordinates interpreted in correct parent space
- No coordinate transformation needed

## Testing Checklist
- [x] Build successful (TypeScript validation)
- [ ] Test all 7 part categories swap correctly
- [ ] Verify multi-zone paint applies correctly:
  - [ ] Body zone paints exterior panels
  - [ ] Trim zone paints accents independently
  - [ ] Interior zone paints seats/dashboard
  - [ ] Zone selector tabs switch correctly
  - [ ] "Copy to All Zones" button works
- [ ] Check memory usage stays <500MB after 20+ swaps
- [ ] Confirm preloading works (Network tab shows requests on tab change)
- [ ] Test idle prefetch (wait 2s, check Network tab)
- [ ] Validate total price calculation updates
- [ ] Test reset button restores stock config (all 3 zones)
- [ ] Verify drag rotation still works with parts attached

## Dependencies Added
```json
"zustand": "^5.0.2" (installed with --legacy-peer-deps)
```

## Next Steps (Not Implemented)
- Camera presets (front/rear/side views)
- OrbitControls upgrade (professional camera system)
- Save/share configuration (URL params or database)
- Mobile optimization (bottom sheet UI)
- Loading states for part swaps
- Part swap animation (fade/scale transition)
- Performance overlay (FPS counter)
- Mobile GPU detection (`useDetectGPU`)
