# Car Tuning View Implementation

## Overview
Single car viewing page with drag-to-rotate interaction. No physics engine, no player controls, no POV camera. Static camera with rotatable car model on reflective floor.

## Architecture

### Route
- **Path**: `/car/[id]`
- **File**: [app/car/[id]/page.tsx](../app/car/[id]/page.tsx)
- **Type**: Dynamic Next.js route with client-side rendering

### Components

#### 1. CarTuningScene ([components/car/CarTuningScene.tsx](../components/car/CarTuningScene.tsx))
Main Three.js Canvas orchestrator.

**Props**: `{ modelPath: string }`

**Features**:
- Canvas with ACESFilmic tone mapping
- Static camera: `position: [5, 2, 5]`, `fov: 50`
- HDRI environment (`/hdr/main_hdr.exr`)
- Reflective floor (reused from showroom)
- Post-processing (Bloom + Vignette)

**Removed from Showroom**:
- ❌ Physics (Rapier)
- ❌ PlayerController
- ❌ POVCamera
- ❌ Joystick

#### 2. RotatableCar ([components/car/RotatableCar.tsx](../components/car/RotatableCar.tsx))
Handles car model loading and drag rotation.

**Features**:
- DRACO-compressed GLB loader
- Material enhancement (metalness: 0.9, roughness: 0.3, envMapIntensity: 1.5)
- Auto-centering via `Box3`

**Interaction**:
```typescript
// Horizontal drag (X delta) → Y-axis rotation (spin left/right)
targetRotationY += deltaX * 0.01

// Vertical drag (Y delta) → X-axis tilt (pitch up/down)
targetRotationX = clamp(
  targetRotationX - deltaY * 0.01,
  -Math.PI / 6,  // -30°
  Math.PI / 6    // +30°
)
```

**Damping**: Smooth lerp interpolation via `useFrame` (factor: 0.1)

**Events**:
- `onPointerDown` → Enable dragging
- `onPointerMove` → Update target rotations
- `onPointerUp/Leave` → Disable dragging

#### 3. CarLighting ([components/car/CarLighting.tsx](../components/car/CarLighting.tsx))
Studio 3-point lighting setup.

```
Key Light:     position: [5, 8, 5],   intensity: 150
Fill Light:    position: [-5, 5, 3],  intensity: 60
Rim Light:     position: [0, 4, -6],  intensity: 80
Ambient Light: intensity: 0.3
```

### Data Structure

#### cars.json ([public/config/cars.json](../public/config/cars.json))
```json
[
  {
    "id": "sample-car",
    "name": "Sample Car",
    "name_fa": "خودرو نمونه",
    "model_path": "/models/cars/sample-car.glb",
    "specs": {
      "engine": "V6 Turbo",
      "horsepower": 350,
      "torque": "450 Nm",
      "top_speed": "250 km/h"
    }
  }
]
```

## Usage

### 1. Add Car Model
Place DRACO-compressed GLB file in:
```
/public/models/cars/{car-id}.glb
```

### 2. Register in Config
Add entry to `/public/config/cars.json`:
```json
{
  "id": "porsche-911",
  "name": "Porsche 911",
  "model_path": "/models/cars/porsche-911.glb",
  "specs": { ... }
}
```

### 3. Access Page
Navigate to:
```
/car/porsche-911
```

## Controls

| Input | Action |
|-------|--------|
| **Drag Horizontal** | Rotate car on Y-axis (spin) |
| **Drag Vertical** | Tilt car on X-axis (±30° clamp) |

## Technical Details

### Reused from Showroom
- ✅ `ReflectiveFloor` component
- ✅ `PostProcessing` (Bloom + Vignette)
- ✅ HDRI environment setup
- ✅ DRACO loader configuration

### Performance
- Static camera (no real-time camera calculations)
- No physics engine overhead
- DRACO compression for models
- Single car instance per page

### Material Pipeline
```typescript
model.traverse((child) => {
  if (isMesh) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    material.envMapIntensity = 1.5
    material.metalness = 0.9
    material.roughness = 0.3
  }
})
```

## File Structure
```
app/car/[id]/
└── page.tsx           # Route + car config loader

components/car/
├── CarTuningScene.tsx # Canvas orchestrator
├── RotatableCar.tsx   # Model loader + drag rotation
└── CarLighting.tsx    # Studio lights

public/
├── config/
│   └── cars.json      # Car database
└── models/cars/
    └── *.glb          # Car 3D models
```

## Future Enhancements
- Color/material swapping
- Part customization (wheels, spoilers)
- Camera presets (front, side, rear views)
- Animation sequences
- AR mode
