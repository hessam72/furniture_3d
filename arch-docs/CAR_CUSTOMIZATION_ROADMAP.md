# Car Customization System - Implementation Roadmap

## Implementation Status

**Completed:**
- ✅ Parts configuration JSON created (`public/config/car-parts.json`)
- ✅ Floor positioning adjusted (Y: -0.8)
- ✅ Horizontal drag rotation (Y-axis vitrine spin)
- ✅ Smooth lerp damping for drag interactions
- ✅ Vertical drag movement (Y-axis position, clamped 0 to 1.5) - *Modified from spec*
- ✅ Document-level event listeners for continuous drag

**Pending:**
- ⏳ Zustand store setup
- ⏳ ConfigurableCar.tsx component
- ⏳ DynamicPart.tsx component
- ⏳ CustomizationPanel.tsx UI
- ⏳ PartsGrid.tsx UI
- ⏳ PaintControls.tsx UI
- ⏳ Part swapping system implementation
- ⏳ Paint customization system

## Overview

Implementation of a full car customization system for the car tuning page, allowing users to swap parts (wheels, spoilers, hoods, etc.) and customize paint/materials in real-time 3D.

### Core Approach: Node-Based Positioning

Parts are positioned by finding named nodes in the base car model. JSON configuration defines node names (not hardcoded coordinates), making it designer-friendly and maintainable.

**Example:**
```json
{
  "id": "sport-rims",
  "url": "/models/parts/wheels/sport.glb",
  "attachNodes": ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"]
}
```

The code finds `Wheel_FL` in the base car → gets its position/rotation → places the new wheel there.

---

## Architecture

### Data Flow

```
User clicks part card
    ↓
Zustand store updates: selectPart('wheels', 'sport')
    ↓
ConfigurableCar re-renders
    ↓
DynamicPart loads new GLB
    ↓
findNodeByName() locates attachment points in base car
    ↓
Clone part model at each node position
    ↓
Three.js scene updated (~50ms)
```

### Tech Stack

- **State Management:** Zustand (3KB, zero boilerplate)
- **3D Rendering:** Three.js r161 + React Three Fiber 8.17.10
- **Model Format:** DRACO-compressed GLB files
- **Data Storage:** JSON configuration files
- **UI:** Tailwind CSS with bottom panel tabs

### Three Positioning Strategies

1. **`attachNodes`**: Place new part at each node's position (for wheels, mirrors)
2. **`replaceNode`**: Replace single node with new geometry (for hoods, bumpers)
3. **`hideNodes`**: Hide original nodes without replacement (for "none" option)

---

## Implementation Steps

### 1. Install Dependencies

```bash
npm install zustand
```

**Why Zustand:**
- Minimal boilerplate (vs Redux)
- Built-in TypeScript support
- Selective subscription (prevents unnecessary re-renders)
- Perfect fit for pmndrs ecosystem (same team as React Three Fiber)

---

### 2. Create Zustand Store

**File:** `stores/carConfigStore.ts`

```typescript
import { create } from 'zustand'

interface PaintConfig {
  color: string
  metalness: number
  roughness: number
  clearcoat: number
}

interface CarConfigState {
  // Current car being customized
  carId: string

  // Selected parts: { wheels: 'sport', spoiler: 'gt-wing', hood: 'carbon' }
  selectedParts: Record<string, string>

  // Paint configuration
  paintConfig: PaintConfig

  // Actions
  setCarId: (id: string) => void
  selectPart: (category: string, partId: string) => void
  updatePaint: (config: Partial<PaintConfig>) => void
  getTotalPrice: () => number
  resetToDefaults: (defaultParts: Record<string, string>) => void
}

export const useCarConfig = create<CarConfigState>((set, get) => ({
  carId: '',
  selectedParts: {},
  paintConfig: {
    color: '#ff0000',
    metalness: 0.9,
    roughness: 0.1,
    clearcoat: 1.0,
  },

  setCarId: (id) => set({ carId: id }),

  selectPart: (category, partId) =>
    set(state => ({
      selectedParts: { ...state.selectedParts, [category]: partId }
    })),

  updatePaint: (config) =>
    set(state => ({
      paintConfig: { ...state.paintConfig, ...config }
    })),

  getTotalPrice: () => {
    const { selectedParts } = get()
    // TODO: Calculate from parts.json prices
    return 0
  },

  resetToDefaults: (defaultParts) =>
    set({
      selectedParts: { ...defaultParts },
      paintConfig: {
        color: '#ff0000',
        metalness: 0.9,
        roughness: 0.1,
        clearcoat: 1.0,
      }
    })
}))
```

**Usage in Components:**
```typescript
// Only re-renders when wheels change
const selectedWheels = useCarConfig(s => s.selectedParts.wheels)

// Get action (never causes re-render)
const selectPart = useCarConfig(s => s.selectPart)

// Use in handler
<button onClick={() => selectPart('wheels', 'sport')}>
  Sport Rims
</button>
```

---

### 3. Create Parts Configuration ✅

**File:** `public/config/car-parts.json`

```json
{
  "parts": {
    "wheels": [
      {
        "id": "stock",
        "name": "Stock Wheels",
        "name_fa": "رینگ استاندارد",
        "url": null,
        "attachNodes": ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"],
        "price": 0,
        "thumbnail": "/thumbnails/wheels/stock.jpg"
      },
      {
        "id": "sport",
        "name": "Sport Rims 18\"",
        "name_fa": "رینگ اسپرت ۱۸ اینچ",
        "url": "/models/parts/wheels/sport.glb",
        "attachNodes": ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"],
        "price": 1500,
        "thumbnail": "/thumbnails/wheels/sport.jpg"
      },
      {
        "id": "chrome",
        "name": "Chrome Rims 19\"",
        "name_fa": "رینگ کروم ۱۹ اینچ",
        "url": "/models/parts/wheels/chrome.glb",
        "attachNodes": ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"],
        "price": 2200,
        "thumbnail": "/thumbnails/wheels/chrome.jpg"
      }
    ],
    "spoilers": [
      {
        "id": "none",
        "name": "No Spoiler",
        "name_fa": "بدون اسپویلر",
        "url": null,
        "hideNodes": ["Spoiler_Stock"],
        "price": 0,
        "thumbnail": "/thumbnails/spoilers/none.jpg"
      },
      {
        "id": "gt-wing",
        "name": "GT Wing",
        "name_fa": "اسپویلر GT",
        "url": "/models/parts/spoilers/gt-wing.glb",
        "attachNodes": ["Spoiler_Mount"],
        "hideNodes": ["Spoiler_Stock"],
        "price": 2500,
        "thumbnail": "/thumbnails/spoilers/gt-wing.jpg"
      },
      {
        "id": "ducktail",
        "name": "Ducktail Spoiler",
        "name_fa": "اسپویلر داک‌تیل",
        "url": "/models/parts/spoilers/ducktail.glb",
        "attachNodes": ["Spoiler_Mount"],
        "hideNodes": ["Spoiler_Stock"],
        "price": 1800,
        "thumbnail": "/thumbnails/spoilers/ducktail.jpg"
      }
    ],
    "hoods": [
      {
        "id": "stock",
        "name": "Stock Hood",
        "name_fa": "کاپوت استاندارد",
        "url": null,
        "price": 0,
        "thumbnail": "/thumbnails/hoods/stock.jpg"
      },
      {
        "id": "carbon",
        "name": "Carbon Fiber Hood",
        "name_fa": "کاپوت کربن",
        "url": "/models/parts/hoods/carbon.glb",
        "replaceNode": "Hood",
        "price": 3000,
        "thumbnail": "/thumbnails/hoods/carbon.jpg"
      }
    ],
    "bumpers": [
      {
        "id": "stock",
        "name": "Stock Front Bumper",
        "url": null,
        "price": 0
      },
      {
        "id": "aggressive",
        "name": "Aggressive Front Bumper",
        "url": "/models/parts/bumpers/aggressive-front.glb",
        "replaceNode": "Bumper_Front",
        "price": 2000
      }
    ],
    "side-skirts": [
      {
        "id": "none",
        "name": "No Side Skirts",
        "url": null,
        "price": 0
      },
      {
        "id": "racing",
        "name": "Racing Side Skirts",
        "url": "/models/parts/side-skirts/racing.glb",
        "attachNodes": ["SideSkirt_L", "SideSkirt_R"],
        "price": 1200
      }
    ],
    "exhaust": [
      {
        "id": "stock",
        "name": "Stock Exhaust",
        "url": null,
        "price": 0
      },
      {
        "id": "dual-titanium",
        "name": "Dual Titanium Exhaust",
        "url": "/models/parts/exhaust/dual-titanium.glb",
        "replaceNode": "Exhaust",
        "price": 1800
      }
    ],
    "mirrors": [
      {
        "id": "stock",
        "name": "Stock Mirrors",
        "url": null,
        "price": 0
      },
      {
        "id": "carbon",
        "name": "Carbon Fiber Mirrors",
        "url": "/models/parts/mirrors/carbon.glb",
        "attachNodes": ["Mirror_L", "Mirror_R"],
        "price": 600
      }
    ]
  },

  "categories": [
    {
      "id": "paint",
      "name": "Paint",
      "name_fa": "رنگ",
      "icon": "🎨"
    },
    {
      "id": "wheels",
      "name": "Wheels",
      "name_fa": "رینگ",
      "icon": "⚙️",
      "partType": "wheels"
    },
    {
      "id": "body",
      "name": "Body",
      "name_fa": "بدنه",
      "icon": "🚗",
      "subcategories": ["hoods", "bumpers", "side-skirts"]
    },
    {
      "id": "aero",
      "name": "Aerodynamics",
      "name_fa": "آیرودینامیک",
      "icon": "✈️",
      "subcategories": ["spoilers"]
    },
    {
      "id": "performance",
      "name": "Performance",
      "name_fa": "عملکرد",
      "icon": "⚡",
      "subcategories": ["exhaust"]
    },
    {
      "id": "accessories",
      "name": "Accessories",
      "name_fa": "لوازم جانبی",
      "icon": "🔧",
      "subcategories": ["mirrors"]
    }
  ],

  "paintPresets": [
    {
      "id": "glossy-red",
      "name": "Glossy Red",
      "name_fa": "قرمز براق",
      "color": "#DC0000",
      "metalness": 0.9,
      "roughness": 0.1,
      "clearcoat": 1.0
    },
    {
      "id": "matte-black",
      "name": "Matte Black",
      "name_fa": "مشکی مات",
      "color": "#1a1a1a",
      "metalness": 0.1,
      "roughness": 0.8,
      "clearcoat": 0.0
    },
    {
      "id": "chrome",
      "name": "Chrome",
      "name_fa": "کروم",
      "color": "#c0c0c0",
      "metalness": 1.0,
      "roughness": 0.0,
      "clearcoat": 1.0
    },
    {
      "id": "pearl-white",
      "name": "Pearl White",
      "name_fa": "سفید مروارید",
      "color": "#f8f8f8",
      "metalness": 0.5,
      "roughness": 0.2,
      "clearcoat": 0.9
    },
    {
      "id": "metallic-blue",
      "name": "Metallic Blue",
      "name_fa": "آبی متالیک",
      "color": "#0066cc",
      "metalness": 0.8,
      "roughness": 0.2,
      "clearcoat": 0.8
    }
  ]
}
```

**Field Explanations:**
- **`url: null`**: Stock/default option (show original car part)
- **`attachNodes`**: Array of node names where part should be cloned
- **`replaceNode`**: Single node name to replace geometry
- **`hideNodes`**: Nodes to hide when this part is selected
- **`thumbnail`**: Preview image for UI (optional for now)

---

### 4. Generate Placeholder Models

**Purpose:** Create simple geometry placeholders for testing before real car parts are ready.

**Script:** `scripts/generate-placeholders.js`

```javascript
// Node.js script to generate simple GLB placeholders
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import fs from 'fs'
import path from 'path'

const exporter = new GLTFExporter()

// Wheel placeholder (cylinder)
function createWheel() {
  const geometry = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 32)
  const material = new THREE.MeshStandardMaterial({
    color: 0x333333,
    metalness: 0.8,
    roughness: 0.2
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.z = Math.PI / 2 // Rotate to face forward
  return mesh
}

// Spoiler placeholder (box)
function createSpoiler() {
  const geometry = new THREE.BoxGeometry(1.2, 0.05, 0.3)
  const material = new THREE.MeshStandardMaterial({ color: 0x000000 })
  return new THREE.Mesh(geometry, material)
}

// Export function
function exportGLB(mesh, outputPath) {
  const scene = new THREE.Scene()
  scene.add(mesh)

  exporter.parse(
    scene,
    (gltf) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, Buffer.from(gltf))
      console.log(`✓ Generated: ${outputPath}`)
    },
    { binary: true }
  )
}

// Generate all placeholders
exportGLB(createWheel(), 'public/models/parts/wheels/sport.glb')
exportGLB(createWheel(), 'public/models/parts/wheels/chrome.glb')
exportGLB(createSpoiler(), 'public/models/parts/spoilers/gt-wing.glb')
// ... more parts
```

**Alternative:** Use Blender with simple primitives and manual export.

---

### 5. Create `ConfigurableCar.tsx`

**File:** `components/car/ConfigurableCar.tsx`

```typescript
'use client'

import { useRef, useState, useMemo, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { useCarConfig } from '@/stores/carConfigStore'
import { DynamicPart } from './DynamicPart'
import * as THREE from 'three'

interface ConfigurableCarProps {
  modelPath: string
}

export default function ConfigurableCar({ modelPath }: ConfigurableCarProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const [isDragging, setIsDragging] = useState(false)
  const [previousPointer, setPreviousPointer] = useState({ x: 0, y: 0 })

  const targetRotationY = useRef(0)
  const targetRotationX = useRef(0)

  // Get paint config from store
  const paintConfig = useCarConfig(s => s.paintConfig)

  // Load base car
  const gltf = useLoader(GLTFLoader, modelPath, (loader) => {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')
    loader.setDRACOLoader(dracoLoader)
  })

  // Prepare car scene with paint applied
  const carScene = useMemo(() => {
    const clone = gltf.scene.clone(true)

    // Apply paint to body meshes
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true

        // Check if mesh is paintable (userData flag OR name matching)
        const isPaintable = child.userData.paintable === true
        const nameMatch =
          child.material?.name?.toLowerCase().includes('body') ||
          child.material?.name?.toLowerCase().includes('paint') ||
          child.name?.toLowerCase().includes('body')

        if (isPaintable || nameMatch) {
          const mat = child.material as THREE.MeshStandardMaterial
          mat.color.set(paintConfig.color)
          mat.metalness = paintConfig.metalness
          mat.roughness = paintConfig.roughness
          mat.clearcoat = paintConfig.clearcoat
          mat.clearcoatRoughness = 0.1
          mat.needsUpdate = true
        }

        // Enhanced reflections for all materials
        if (child.material) {
          child.material.envMapIntensity = 1.5
        }
      }
    })

    // Center model
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    clone.position.sub(center)

    return clone
  }, [gltf, paintConfig])

  // Drag rotation handlers (from RotatableCar)
  const handlePointerDown = (e: any) => {
    setIsDragging(true)
    setPreviousPointer({ x: e.clientX, y: e.clientY })
    e.stopPropagation()
  }

  const handlePointerMove = (e: any) => {
    if (!isDragging) return

    const deltaX = e.clientX - previousPointer.x
    const deltaY = e.clientY - previousPointer.y

    targetRotationY.current += deltaX * 0.01

    const newRotationX = targetRotationX.current - deltaY * 0.01
    targetRotationX.current = THREE.MathUtils.clamp(
      newRotationX,
      -Math.PI / 6,
      Math.PI / 6
    )

    setPreviousPointer({ x: e.clientX, y: e.clientY })
  }

  const handlePointerUp = () => {
    setIsDragging(false)
  }

  // Smooth damping
  useFrame(() => {
    if (!groupRef.current) return

    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      targetRotationY.current,
      0.1
    )

    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      targetRotationX.current,
      0.1
    )
  })

  return (
    <group
      ref={groupRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Base car with paint */}
      <primitive object={carScene} />

      {/* Dynamic parts (wheels, spoilers, etc.) */}
      <DynamicPart category="wheels" baseCarScene={carScene} />
      <DynamicPart category="spoilers" baseCarScene={carScene} />
      <DynamicPart category="hoods" baseCarScene={carScene} />
      <DynamicPart category="bumpers" baseCarScene={carScene} />
      <DynamicPart category="side-skirts" baseCarScene={carScene} />
      <DynamicPart category="exhaust" baseCarScene={carScene} />
      <DynamicPart category="mirrors" baseCarScene={carScene} />
    </group>
  )
}
```

---

### 6. Create `DynamicPart.tsx`

**File:** `components/car/DynamicPart.tsx`

```typescript
'use client'

import { useMemo, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useCarConfig } from '@/stores/carConfigStore'
import * as THREE from 'three'
import partsConfig from '@/public/config/car-parts.json'

interface DynamicPartProps {
  category: string
  baseCarScene: THREE.Group
}

/**
 * Recursively find a node by name in a Three.js scene
 */
function findNodeByName(object: THREE.Object3D, name: string): THREE.Object3D | null {
  if (object.name === name) return object

  for (const child of object.children) {
    const found = findNodeByName(child, name)
    if (found) return found
  }

  return null
}

export function DynamicPart({ category, baseCarScene }: DynamicPartProps) {
  // Get selected part ID from store
  const selectedPartId = useCarConfig(s => s.selectedParts[category])

  // Find part config
  const parts = partsConfig.parts[category] || []
  const partConfig = parts.find((p: any) => p.id === selectedPartId)

  // Load part model if URL exists (useGLTF has built-in DRACO + caching)
  const gltf = partConfig?.url ? useGLTF(partConfig.url) : null

  // Memory management: clear from cache on unmount
  useEffect(() => {
    return () => {
      if (partConfig?.url) {
        useGLTF.clear(partConfig.url)
      }
    }
  }, [partConfig?.url])

  // Process part placement
  const partInstances = useMemo(() => {
    if (!partConfig) return null

    // Handle hideNodes (hide original parts)
    if (partConfig.hideNodes) {
      partConfig.hideNodes.forEach((nodeName: string) => {
        const node = findNodeByName(baseCarScene, nodeName)
        if (node) node.visible = false
      })
    }

    // No model to load (stock option)
    if (!gltf) return null

    // Strategy 1: attachNodes (clone part at multiple positions)
    if (partConfig.attachNodes) {
      const instances: THREE.Object3D[] = []

      partConfig.attachNodes.forEach((nodeName: string) => {
        const targetNode = findNodeByName(baseCarScene, nodeName)
        if (!targetNode) {
          console.warn(`Node not found: ${nodeName}`)
          return
        }

        // Clone part model
        const clone = gltf.scene.clone(true)

        // Copy position/rotation from target node
        clone.position.copy(targetNode.position)
        clone.rotation.copy(targetNode.rotation)
        clone.scale.copy(targetNode.scale)

        // Hide original node
        targetNode.visible = false

        instances.push(clone)
      })

      return instances
    }

    // Strategy 2: replaceNode (replace single node)
    if (partConfig.replaceNode) {
      const targetNode = findNodeByName(baseCarScene, partConfig.replaceNode)
      if (!targetNode) {
        console.warn(`Replace node not found: ${partConfig.replaceNode}`)
        return null
      }

      const clone = gltf.scene.clone(true)
      clone.position.copy(targetNode.position)
      clone.rotation.copy(targetNode.rotation)
      clone.scale.copy(targetNode.scale)

      targetNode.visible = false

      return [clone]
    }

    return null
  }, [gltf, partConfig, baseCarScene])

  // Dispose geometries/materials when instances change
  useEffect(() => {
    return () => {
      partInstances?.forEach(instance => {
        instance.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose()
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose())
            } else {
              child.material?.dispose()
            }
          }
        })
      })
    }
  }, [partInstances])

  if (!partInstances) return null

  return (
    <group>
      {partInstances.map((instance, i) => (
        <primitive key={i} object={instance} />
      ))}
    </group>
  )
}
```

**Key Functions:**
- `findNodeByName()`: Recursive search through scene graph
- **attachNodes logic**: Clone part at each node position (for wheels, mirrors)
- **replaceNode logic**: Replace single node (for hoods, bumpers)
- **hideNodes**: Hide original parts when custom part selected

---

### 7. Create Customization Panel

**File:** `components/car/CustomizationPanel.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useCarConfig } from '@/stores/carConfigStore'
import { PartsGrid } from './PartsGrid'
import { PaintControls } from './PaintControls'
import partsConfig from '@/public/config/car-parts.json'

export function CustomizationPanel() {
  const [activeTab, setActiveTab] = useState<string>('paint')
  const [expanded, setExpanded] = useState(false)

  const categories = partsConfig.categories

  const handleTabClick = (tabId: string) => {
    if (activeTab === tabId) {
      setExpanded(!expanded)
    } else {
      setActiveTab(tabId)
      setExpanded(true)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-md border-t border-gray-700 z-50">
      {/* Category Tabs */}
      <div className="flex gap-2 px-6 py-3 overflow-x-auto">
        {categories.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => handleTabClick(cat.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-t-lg transition-all whitespace-nowrap
              ${activeTab === cat.id && expanded
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }
            `}
          >
            <span className="text-xl">{cat.icon}</span>
            <span className="font-medium">{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Content Area (expandable) */}
      <div
        className={`
          transition-all duration-300 overflow-hidden
          ${expanded ? 'max-h-96' : 'max-h-0'}
        `}
      >
        <div className="p-6 overflow-y-auto max-h-96">
          {activeTab === 'paint' ? (
            <PaintControls />
          ) : (
            <PartsGrid categoryId={activeTab} />
          )}
        </div>
      </div>

      {/* Price Summary */}
      <div className="px-6 py-2 border-t border-gray-700 text-right">
        <span className="text-gray-400">Total Upgrades: </span>
        <span className="text-2xl font-bold text-green-400">
          ${useCarConfig(s => s.getTotalPrice())}
        </span>
      </div>
    </div>
  )
}
```

**Features:**
- Click tab to expand/collapse
- Active tab highlighted
- Smooth height transition
- Price summary at bottom
- Mobile-friendly horizontal scroll

---

### 8. Create Parts Grid

**File:** `components/car/PartsGrid.tsx`

```typescript
'use client'

import { useCarConfig } from '@/stores/carConfigStore'
import partsConfig from '@/public/config/car-parts.json'

interface PartsGridProps {
  categoryId: string
}

export function PartsGrid({ categoryId }: PartsGridProps) {
  const selectPart = useCarConfig(s => s.selectPart)
  const selectedParts = useCarConfig(s => s.selectedParts)

  // Get category config
  const category = partsConfig.categories.find((c: any) => c.id === categoryId)
  if (!category) return null

  // Get part types (handle subcategories)
  const partTypes = category.subcategories || [category.partType || categoryId]

  return (
    <div className="space-y-8">
      {partTypes.map((partType: string) => {
        const parts = partsConfig.parts[partType] || []
        const selectedPartId = selectedParts[partType]

        return (
          <div key={partType}>
            <h3 className="text-xl font-bold text-white mb-4 capitalize">
              {partType.replace('-', ' ')}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {parts.map((part: any) => {
                const isSelected = selectedPartId === part.id

                return (
                  <button
                    key={part.id}
                    onClick={() => selectPart(partType, part.id)}
                    className={`
                      border-2 rounded-lg p-4 transition-all text-left
                      ${isSelected
                        ? 'border-blue-500 bg-blue-900/20 shadow-lg shadow-blue-500/20'
                        : 'border-gray-600 bg-gray-800/50 hover:border-gray-400'
                      }
                    `}
                  >
                    {/* Thumbnail */}
                    <div className="w-full h-32 bg-gray-900 rounded mb-3 flex items-center justify-center overflow-hidden">
                      {part.thumbnail ? (
                        <img
                          src={part.thumbnail}
                          alt={part.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl opacity-30">📦</span>
                      )}
                    </div>

                    {/* Part name */}
                    <p className="font-medium text-white mb-1">{part.name}</p>
                    {part.name_fa && (
                      <p className="text-sm text-gray-400 mb-2" dir="rtl">
                        {part.name_fa}
                      </p>
                    )}

                    {/* Price */}
                    <div className="flex items-center justify-between">
                      <span className="text-blue-400 font-bold">
                        {part.price === 0 ? 'Stock' : `$${part.price}`}
                      </span>

                      {isSelected && (
                        <span className="text-green-400 text-sm">✓ Installed</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**Features:**
- Handles subcategories (e.g., "body" has hoods, bumpers)
- Shows thumbnails (or placeholder emoji)
- Selected state with blue border + checkmark
- Responsive grid (2-4 columns)
- Persian name support

---

### 9. Create Paint Controls

**File:** `components/car/PaintControls.tsx`

```typescript
'use client'

import { useCarConfig } from '@/stores/carConfigStore'
import partsConfig from '@/public/config/car-parts.json'

export function PaintControls() {
  const { paintConfig, updatePaint } = useCarConfig()

  const presets = partsConfig.paintPresets || []

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Color Picker */}
      <div>
        <label className="block text-white font-medium mb-3">
          Color
        </label>
        <input
          type="color"
          value={paintConfig.color}
          onChange={(e) => updatePaint({ color: e.target.value })}
          className="w-full h-16 rounded-lg cursor-pointer"
        />
      </div>

      {/* Metalness Slider */}
      <div>
        <label className="block text-white font-medium mb-2">
          Metallic: {(paintConfig.metalness * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={paintConfig.metalness}
          onChange={(e) => updatePaint({ metalness: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Roughness Slider */}
      <div>
        <label className="block text-white font-medium mb-2">
          Roughness: {(paintConfig.roughness * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={paintConfig.roughness}
          onChange={(e) => updatePaint({ roughness: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Clearcoat Slider */}
      <div>
        <label className="block text-white font-medium mb-2">
          Clearcoat: {(paintConfig.clearcoat * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={paintConfig.clearcoat}
          onChange={(e) => updatePaint({ clearcoat: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Preset Buttons */}
      <div>
        <label className="block text-white font-medium mb-3">
          Presets
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {presets.map((preset: any) => (
            <button
              key={preset.id}
              onClick={() => updatePaint({
                color: preset.color,
                metalness: preset.metalness,
                roughness: preset.roughness,
                clearcoat: preset.clearcoat,
              })}
              className="
                flex items-center gap-3 p-3 rounded-lg
                bg-gray-800 hover:bg-gray-700 transition-all
                border-2 border-gray-600
              "
            >
              <div
                className="w-10 h-10 rounded-full border-2 border-white"
                style={{ backgroundColor: preset.color }}
              />
              <div className="text-left">
                <p className="text-white font-medium text-sm">{preset.name}</p>
                {preset.name_fa && (
                  <p className="text-gray-400 text-xs" dir="rtl">
                    {preset.name_fa}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Features:**
- HTML5 color picker
- Real-time sliders for metalness, roughness, clearcoat
- Preset buttons with color preview
- Percentage display

---

### 10. Update `CarTuningScene.tsx`

**File:** `components/car/CarTuningScene.tsx`

```typescript
'use client'

import { Canvas } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import { ReflectiveFloor } from '@/components/store/ReflectiveFloor'
import { PostProcessing } from '@/components/store/PostProcessing'
import CarLighting from './CarLighting'
import ConfigurableCar from './ConfigurableCar' // Changed from RotatableCar

interface CarTuningSceneProps {
  modelPath: string
}

export default function CarTuningScene({ modelPath }: CarTuningSceneProps) {
  return (
    <div className="w-full h-screen">
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        camera={{
          position: [5, 2, 5],
          fov: 50,
          near: 0.1,
          far: 1000,
        }}
      >
        <Environment
          files="/hdr/main_hdr.exr"
          background={false}
          environmentIntensity={0.8}
        />

        <CarLighting />
        <ReflectiveFloor />

        {/* Changed component */}
        <ConfigurableCar modelPath={modelPath} />

        <PostProcessing />
      </Canvas>
    </div>
  )
}
```

**Change:** Replace `<RotatableCar>` with `<ConfigurableCar>`.

---

### 11. Update Car Page

**File:** `app/car/[id]/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCarConfig } from '@/stores/carConfigStore'
import { CustomizationPanel } from '@/components/car/CustomizationPanel'

const CarTuningScene = dynamic(() => import('@/components/car/CarTuningScene'), {
  ssr: false,
})

interface Car {
  id: string
  name: string
  name_fa: string
  model_path: string
  defaultParts: Record<string, string>
  specs: {
    engine: string
    horsepower: number
    torque: string
    top_speed: string
  }
}

export default function CarPage() {
  const params = useParams()
  const [car, setCar] = useState<Car | null>(null)
  const [loading, setLoading] = useState(true)

  const { setCarId, resetToDefaults } = useCarConfig()

  useEffect(() => {
    fetch('/config/cars.json')
      .then((res) => res.json())
      .then((cars: Car[]) => {
        const foundCar = cars.find((c) => c.id === params.id)
        setCar(foundCar || null)

        if (foundCar) {
          setCarId(foundCar.id)
          resetToDefaults(foundCar.defaultParts || {})
        }

        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load car config:', err)
        setLoading(false)
      })
  }, [params.id, setCarId, resetToDefaults])

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        Loading...
      </div>
    )
  }

  if (!car) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        Car not found
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <CarTuningScene modelPath={car.model_path} />

      {/* Car Info Overlay - Moved to top-right */}
      <div className="absolute top-8 right-8 text-white text-right pointer-events-none">
        <h1 className="text-4xl font-bold mb-2">{car.name}</h1>
        <p className="text-xl text-gray-300" dir="rtl">{car.name_fa}</p>
      </div>

      {/* Specs moved to top-left */}
      <div className="absolute top-8 left-8 text-white bg-black/50 p-6 rounded-lg backdrop-blur-sm">
        <h2 className="text-xl font-bold mb-4">Specifications</h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-400">Engine:</span> {car.specs.engine}
          </div>
          <div>
            <span className="text-gray-400">Power:</span> {car.specs.horsepower} HP
          </div>
          <div>
            <span className="text-gray-400">Torque:</span> {car.specs.torque}
          </div>
          <div>
            <span className="text-gray-400">Top Speed:</span> {car.specs.top_speed}
          </div>
        </div>
      </div>

      {/* Customization Panel (bottom) */}
      <CustomizationPanel />
    </div>
  )
}
```

**Changes:**
- Initialize Zustand store with car ID and default parts
- Add `<CustomizationPanel />` at bottom
- Move specs overlay to avoid UI overlap

---

### 12. Update `cars.json`

**File:** `public/config/cars.json`

Add `defaultParts` and `compatibleParts` to each car:

```json
[
  {
    "id": "sample-car",
    "name": "Sample Car",
    "name_fa": "خودرو نمونه",
    "model_path": "/models/cars/sample-car.glb",
    "defaultParts": {
      "wheels": "stock",
      "spoilers": "none",
      "hoods": "stock",
      "bumpers": "stock",
      "side-skirts": "none",
      "exhaust": "stock",
      "mirrors": "stock"
    },
    "compatibleParts": {
      "wheels": ["stock", "sport", "chrome"],
      "spoilers": ["none", "gt-wing", "ducktail"],
      "hoods": ["stock", "carbon"],
      "bumpers": ["stock", "aggressive"],
      "side-skirts": ["none", "racing"],
      "exhaust": ["stock", "dual-titanium"],
      "mirrors": ["stock", "carbon"]
    },
    "specs": {
      "engine": "V6 Turbo",
      "horsepower": 350,
      "torque": "450 Nm",
      "top_speed": "250 km/h"
    }
  }
]
```

**Fields:**
- `defaultParts`: Initial configuration when page loads
- `compatibleParts`: Which parts can be installed (optional, for future filtering)

---

## Blender Workflow

### Preparing Base Car Model

**Requirements:**
1. Named nodes for attachment points
2. Proper origin positioning
3. Correct forward direction (-Z in Blender = +Z in Three.js)

**Node Naming Convention:**
```
Wheel_FL      → Front-left wheel
Wheel_FR      → Front-right wheel
Wheel_RL      → Rear-left wheel
Wheel_RR      → Rear-right wheel
Hood          → Hood (for replacement)
Bumper_Front  → Front bumper
Bumper_Rear   → Rear bumper
Spoiler_Mount → Empty object where spoiler attaches
Spoiler_Stock → Stock spoiler (to hide when custom installed)
Mirror_L      → Left mirror
Mirror_R      → Right mirror
SideSkirt_L   → Left side skirt mount point
SideSkirt_R   → Right side skirt mount point
Exhaust       → Exhaust system
```

**Steps in Blender:**

1. **Import car model** (if not already in Blender)

2. **Name meshes/empties** (in Outliner panel):
   - Select wheel mesh → Rename to `Wheel_FL`
   - Repeat for all attachment points

3. **Mark paintable meshes** (recommended):
   - Select car body mesh
   - Object Properties panel → Custom Properties
   - Click `+` → Add Property
   - Name: `paintable`, Type: Integer, Value: `1`
   - Repeat for hood, doors, bumpers, etc.
   - **Why:** Survives re-exports, no naming convention dependency

4. **Create empty objects for mount points**:
   - `Shift+A` → Empty → Plain Axes
   - Position at spoiler mount location
   - Name: `Spoiler_Mount`

5. **Check origins**:
   - Car origin should be at ground center
   - Part origins at attachment point

6. **Export settings**:
   - Format: glTF 2.0 (.glb)
   - Include: Selected Objects (or entire scene)
   - Transform: +Y Up
   - Compression: Apply (use Draco if available)
   - **Note:** Custom properties export automatically as `userData`

### Preparing Part Models

**Example: Spoiler**

1. Model spoiler in Blender
2. Set origin at mount point (bottom center of spoiler)
3. Rotate to face forward (-Y in Blender)
4. Export as GLB: `gt-wing.glb`

**Example: Wheel**

1. Model wheel (centered on hub)
2. Origin at wheel hub center
3. Rotate: cylinder axis = X (so it faces sideways when placed)
4. Export as GLB: `sport.glb`

---

## File Structure

```
car-mansori/
├── app/
│   └── car/
│       └── [id]/
│           └── page.tsx                    # Updated with CustomizationPanel
│
├── components/
│   └── car/
│       ├── CarTuningScene.tsx              # Updated (ConfigurableCar)
│       ├── CarLighting.tsx                 # Existing
│       ├── ConfigurableCar.tsx             # NEW (replaces RotatableCar)
│       ├── DynamicPart.tsx                 # NEW
│       ├── CustomizationPanel.tsx          # NEW
│       ├── PartsGrid.tsx                   # NEW
│       └── PaintControls.tsx               # NEW
│
├── stores/
│   └── carConfigStore.ts                   # NEW (Zustand)
│
├── public/
│   ├── config/
│   │   ├── cars.json                       # Updated (defaultParts)
│   │   └── car-parts.json                  # NEW
│   │
│   └── models/
│       ├── cars/
│       │   └── sample-car.glb              # Existing (needs named nodes)
│       │
│       └── parts/                          # NEW directory
│           ├── wheels/
│           │   ├── sport.glb
│           │   └── chrome.glb
│           ├── spoilers/
│           │   ├── gt-wing.glb
│           │   └── ducktail.glb
│           ├── hoods/
│           │   └── carbon.glb
│           ├── bumpers/
│           │   └── aggressive-front.glb
│           ├── side-skirts/
│           │   └── racing.glb
│           ├── exhaust/
│           │   └── dual-titanium.glb
│           └── mirrors/
│               └── carbon.glb
│
├── scripts/
│   └── generate-placeholders.js            # Optional (for placeholder GLBs)
│
└── arch-docs/
    ├── CAR_TUNING_VIEW_IMPLEMENTATION.md   # Existing
    └── CAR_CUSTOMIZATION_ROADMAP.md        # This document
```

---

## Testing Checklist

### Functionality Tests

- [ ] **Part Swapping**
  - [ ] Wheels change when selected
  - [ ] Spoilers attach correctly
  - [ ] Hoods replace properly
  - [ ] "None" option hides parts
  - [ ] Original nodes hidden when custom part installed

- [ ] **Paint System**
  - [ ] Color picker updates car body
  - [ ] Metalness slider works
  - [ ] Roughness slider works
  - [ ] Clearcoat slider works
  - [ ] Presets apply correctly
  - [ ] Changes visible in real-time

- [ ] **Drag Rotation**
  - [x] Horizontal drag rotates Y-axis
  - [ ] Vertical drag tilts X-axis (clamped ±30°) - Modified: vertical drag moves car up/down instead
  - [x] Smooth damping (no jitter)
  - [ ] Works with parts attached

- [ ] **UI/UX**
  - [ ] Tabs expand/collapse smoothly
  - [ ] Active tab highlighted
  - [ ] Part cards show selected state
  - [ ] Price calculation accurate
  - [ ] Mobile responsive (tabs scroll horizontally)

- [ ] **State Management**
  - [ ] Selected parts persist during session
  - [ ] Reset to defaults works
  - [ ] Multiple cars have separate configs
  - [ ] No unnecessary re-renders

### Performance Tests

- [ ] Initial load time < 3 seconds
- [ ] Part swap time < 200ms (after category preload)
- [ ] Paint change instant (< 50ms)
- [ ] 60 FPS maintained during rotation
- [ ] Memory management:
  - [ ] No memory leaks after 20+ part swaps
  - [ ] Memory stays under 500MB desktop / 300MB mobile
  - [ ] Check Chrome DevTools Memory profiler
  - [ ] Verify `useGLTF.clear()` is called on unmount
  - [ ] Geometry/material disposal working

### Current Configuration Notes

- Floor position: Y = -0.8 (ReflectiveFloor.tsx)
- Vertical movement range: 0 to 1.5 (prevents floor penetration)
- Drag sensitivity: 0.01 (rotation), 0.05 (vertical movement)

### Edge Cases

- [ ] Missing node names (console warning, no crash)
- [ ] Invalid part URL (fallback to stock)
- [ ] No default parts in cars.json (graceful handling)
- [ ] Extremely large models (loading indicator?)
- [ ] Multiple rapid part changes (debouncing?)
- [ ] Paint not applying (check userData.paintable flag)
- [ ] Memory leak on rapid category switching
- [ ] 50+ parts in one category (category-scoped preload working)

---

## Performance Optimization Strategies

### 1. Preloading Parts (Category-Scoped Strategy)

**Problem:** First-time part swap loads GLB (slow). Preloading ALL parts on mount breaks at 50+ parts (memory + initial load time).

**Solution:** Category-scoped preloading + idle prefetch for adjacent categories.

```typescript
// In ConfigurableCar.tsx or CustomizationPanel.tsx
import { useEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import partsConfig from '@/public/config/car-parts.json'

function preloadCategory(categoryId: string) {
  const parts = partsConfig.parts[categoryId] || []
  parts.forEach((part: any) => {
    if (part.url) {
      useLoader.preload(GLTFLoader, part.url)
    }
  })
}

// In CustomizationPanel.tsx
function CustomizationPanel() {
  const [activeTab, setActiveTab] = useState('paint')

  // Preload current category immediately
  useEffect(() => {
    if (activeTab !== 'paint') {
      preloadCategory(activeTab)
    }
  }, [activeTab])

  // Prefetch adjacent categories during idle time
  useEffect(() => {
    const categories = partsConfig.categories
      .filter(c => c.id !== 'paint' && c.id !== activeTab)
      .map(c => c.partType || c.subcategories?.[0])
      .filter(Boolean)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleCallback = window.requestIdleCallback(() => {
        categories.forEach(cat => preloadCategory(cat))
      }, { timeout: 2000 })

      return () => window.cancelIdleCallback(idleCallback)
    }
  }, [activeTab])

  // ... rest of component
}
```

**Benefits:**
- Fast initial load (only preload wheels/default category)
- Instant swaps within active category
- Background loading doesn't block interaction
- Scales to 100+ parts without memory issues

### 2. Memory Management (Critical)

**Problem:** Swapped parts remain in GPU memory, causing memory leaks and eventual crashes on mobile.

**Solution:** Explicit disposal registry + cleanup on unmount.

```typescript
// In DynamicPart.tsx
import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'

export function DynamicPart({ category, baseCarScene }: DynamicPartProps) {
  const selectedPartId = useCarConfig(s => s.selectedParts[category])
  const partConfig = partsConfig.parts[category]?.find((p: any) => p.id === selectedPartId)

  // Load with useGLTF (has built-in caching)
  const gltf = partConfig?.url ? useGLTF(partConfig.url) : null

  // Cleanup on unmount or when part changes
  useEffect(() => {
    return () => {
      if (partConfig?.url) {
        // Clear from cache when component unmounts or part changes
        useGLTF.clear(partConfig.url)
      }
    }
  }, [partConfig?.url])

  const partInstances = useMemo(() => {
    // ... existing part placement logic
  }, [gltf, partConfig, baseCarScene])

  // Dispose geometries/materials when instances change
  useEffect(() => {
    return () => {
      partInstances?.forEach(instance => {
        instance.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose()
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose())
            } else {
              child.material?.dispose()
            }
          }
        })
      })
    }
  }, [partInstances])

  // ... rest of component
}
```

**Alternative: Global Disposal Registry**
```typescript
// lib/disposeRegistry.ts
const disposeQueue = new Set<THREE.Object3D>()

export function registerForDisposal(object: THREE.Object3D) {
  disposeQueue.add(object)
}

export function disposeAll() {
  disposeQueue.forEach(obj => {
    obj.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material?.dispose()
        }
      }
    })
  })
  disposeQueue.clear()
}
```

**Benefits:**
- Prevents memory leaks during part swaps
- Mobile devices stay under 300MB threshold
- No crashes after 20+ part changes

### 3. Memoization

Already using `useMemo` in:
- `ConfigurableCar`: Car scene with paint
- `DynamicPart`: Part instances

### 3. Selective Re-renders

Zustand selector pattern prevents full tree re-renders:

```typescript
// ✓ Good: Only re-renders when wheels change
const selectedWheels = useCarConfig(s => s.selectedParts.wheels)

// ✗ Bad: Re-renders on any state change
const state = useCarConfig()
```

### 4. Material Override Enhancement

**Problem:** Relying solely on `material.name === 'CarBody'` breaks when naming conventions change in Blender exports.

**Solution:** Support `userData.paintable` flag as primary check, fallback to name matching.

```typescript
// In Blender: Set custom property on paintable meshes
// Object → Custom Properties → Add "paintable" = true

// In ConfigurableCar.tsx
clone.traverse((child) => {
  if (child instanceof THREE.Mesh) {
    child.castShadow = true
    child.receiveShadow = true

    // Primary check: userData flag (set in Blender)
    const isPaintable = child.userData.paintable === true

    // Fallback: name/material name matching
    const nameMatch =
      child.material?.name?.toLowerCase().includes('body') ||
      child.material?.name?.toLowerCase().includes('paint') ||
      child.name?.toLowerCase().includes('body')

    if (isPaintable || nameMatch) {
      const mat = child.material as THREE.MeshStandardMaterial
      mat.color.set(paintConfig.color)
      mat.metalness = paintConfig.metalness
      mat.roughness = paintConfig.roughness
      mat.clearcoat = paintConfig.clearcoat
      mat.clearcoatRoughness = 0.1
      mat.needsUpdate = true
    }

    // Enhanced reflections for all materials
    if (child.material) {
      child.material.envMapIntensity = 1.5
    }
  }
})
```

**Blender Workflow Update:**
1. Select paintable mesh (car body, hood, etc.)
2. Object Properties → Custom Properties → Add Property
3. Name: `paintable`, Type: Integer, Value: `1`
4. Export GLB (userData preserved automatically)

**Benefits:**
- Survives model re-exports with different naming
- Designer-controlled (no code changes needed)
- Backwards compatible (name matching still works)

### 5. Geometry Instancing (Future)

For identical parts (4 wheels), use `InstancedMesh`:

```typescript
const wheelGeometry = gltf.scene.children[0].geometry
const wheelMaterial = gltf.scene.children[0].material

<instancedMesh args={[wheelGeometry, wheelMaterial, 4]}>
  {/* Set matrix for each wheel position */}
</instancedMesh>
```

---

## Future Enhancements

### Phase 2 Features

1. **Save Configurations**
   - localStorage persistence
   - URL sharing (encode config in query params)
   - User accounts with saved configs

2. **Advanced Materials**
   - Custom decals/vinyls
   - Carbon fiber patterns
   - Window tint color

3. **Animation Sequences**
   - Doors opening
   - Hood lifting
   - Wheel spin during rotation

4. **AR Mode**
   - View car in real environment
   - WebXR integration

5. **Part Filtering**
   - Price range slider
   - Compatibility warnings
   - Sort by popularity/price

6. **3D Part Preview**
   - Hover over part card → 3D mini viewer
   - Spin part in thumbnail

7. **Undo/Redo**
   - History stack for changes
   - Ctrl+Z support

8. **Comparison Mode**
   - Split screen with before/after
   - Compare two configurations

---

## Troubleshooting

### Common Issues

**Issue:** Parts not appearing

**Solutions:**
- Check console for "Node not found" warnings
- Verify node names in Blender match JSON `attachNodes`
- Confirm GLB files exist at specified URLs

---

**Issue:** Paint not applying

**Solutions:**
- Check material name contains "Body" or "Paint" (case-insensitive)
- Verify base car has `MeshStandardMaterial` (not `MeshBasicMaterial`)
- Set `userData.paintable = true` in Blender custom properties (recommended)
- Console log materials during `traverse()` to debug
- Check if `child.userData.paintable` exists on expected meshes

---

**Issue:** Drag rotation broken

**Solutions:**
- Ensure `pointer-events: none` on UI overlays
- Check `onPointerMove` is on canvas group
- Verify `groupRef` is assigned correctly

---

**Issue:** Slow performance

**Solutions:**
- Reduce Bloom intensity in PostProcessing
- Enable DRACO compression for all models
- Use category-scoped preloading (not all parts at once)
- Implement proper disposal on part unmount
- Use geometry instancing for wheels
- Check memory usage in DevTools Performance monitor

---

**Issue:** Parts positioned incorrectly

**Solutions:**
- Check Blender export settings (+Y Up)
- Verify part origin is at attachment point
- Console log `targetNode.position` to debug
- Ensure `clone.position.copy()` is called

---

**Issue:** Memory leaks / browser crash after many part swaps

**Solutions:**
- Implement `useGLTF.clear(url)` on part unmount
- Add disposal logic for geometries/materials
- Monitor memory in Chrome DevTools (Performance → Memory)
- Use dispose registry pattern for cleanup
- Limit concurrent loaded parts per category

---

## Implementation Timeline

**Phase 1: Core System** (3-5 days)
- Day 1: Zustand store + data structure
- Day 2: ConfigurableCar + DynamicPart components
- Day 3: CustomizationPanel + PartsGrid UI
- Day 4: PaintControls + testing
- Day 5: Bug fixes + polish

**Phase 2: Content** (ongoing)
- Create/acquire real car part models
- Generate thumbnails
- Add more car variants
- Persian translations

---

## Conclusion

This roadmap provides a complete, node-based car customization system that:

✅ Positions parts via named nodes (designer-friendly)
✅ Supports multiple strategies (attach, replace, hide)
✅ Real-time paint customization
✅ Clean Zustand state management
✅ Reusable component architecture
✅ Mobile-responsive UI
✅ Performance-optimized
✅ Extensible for future features

**Next Steps:** Begin implementation with Step 1 (install Zustand) and proceed sequentially through the roadmap.
