# Car Tuning Platform - Research Guide

> **Purpose**: Best approach analysis for web-based car customization

---

## Architecture Decision: Two-Stage System

### Stage 1: Showroom
- **Camera**: POV (FPS) with WASD + joystick
- **Purpose**: Exploration, multi-car browsing
- **Tech**: Existing R3F + Rapier physics
- **Action**: Click car → navigate to configurator

### Stage 2: Configurator
- **Camera**: OrbitControls (drag rotate, scroll zoom)
- **Purpose**: Part customization, material editing
- **Tech**: Zustand state, dynamic part loading
- **Route**: `/car-configurator/[carId]`

**Why separate?** Different UX needs, performance isolation, no code conflicts.

---

## Tech Stack Evaluation

### State Management: **Zustand** ✅
- 3KB (vs Redux 8KB)
- Zero boilerplate
- React 19 compatible
- pmndrs ecosystem native

**Rejected**: Jotai (complex API), Context (performance), Redux (overkill)

### 3D Loading: **Extend Existing ModelLoader** ✅
- Already has DRACO (50-80% size reduction)
- Proven with jewelry store
- Config-driven (JSON)

### Materials: **Object3D.traverse + Clearcoat** ✅
- Real-time color/metallic/roughness updates
- Clearcoat for car paint realism
- Works with any GLB structure

### Camera: **Dual System** ✅
- Showroom: POV camera (keep existing)
- Configurator: OrbitControls (new page only)
- No conflicts (separate pages)

---

## Performance Targets

| Metric | Desktop | Mobile |
|--------|---------|--------|
| FPS | 60 | 30+ |
| Part Swap | <200ms | <500ms |
| Initial Load | <3s | <5s |
| GLB Size | <1.5MB base | <300KB parts |

### Optimization Strategy

**Do**:
- DRACO compression (all models)
- Preload all parts on mount
- Adaptive DPR (0.5-2.0)
- `useMemo` for cloned scenes
- Disable N8AO on mobile

**Don't**:
- Instance merging (not needed)
- LOD system (close-up view)
- KTX2 textures (small textures)
- Texture atlasing (<10 materials)

---

## Implementation Sequence

### Phase 0: Showroom Extension (1-2d)
- Add cars to `stores.json`
- Create `cars.json` database
- Extend `ProductInteraction` for clicks
- Setup `/car-configurator/[carId]` route

**Reusability**: 95% existing code

### Phase 1: State & Config (1-2d)
- Install Zustand
- Create `carConfigStore.ts`
- Create `car-parts.json` (wheels, spoilers, body-kits)
- Setup base structure

### Phase 2: Part Swapping (2-3d)
- `DynamicPart` component
- Preloading strategy
- Material override system

**Critical**: Preload all variants (<3s initial)

### Phase 3: Materials (2d)
- Color picker
- Metallic/roughness sliders
- Presets (matte, glossy, chrome)

### Phase 4: UI/UX (2d)
- Part selector grid
- Category tabs
- Price calculator
- Mobile responsive

### Phase 5: Configurator Camera (1-2d)
- OrbitControls setup
- Camera presets (front, rear, side, wheel)
- GSAP transitions
- Auto-rotate toggle

### Phase 6: Performance (1-2d, continuous)
- Preloading verification
- Mobile optimizations
- Memory leak checks
- Loading states

**Total**: 8-12 days core | 10-15 days with advanced features

---

## Key Patterns

### Config-Driven Parts
```json
{
  "wheels": [
    { "id": "sport-rims", "url": "/car-models/wheels/sport.glb", "price": 500 }
  ],
  "paint": {
    "presets": [
      { "id": "ferrari-red", "color": "#DC0000", "metallic": 0.9, "roughness": 0.1 }
    ]
  }
}
```

### Material Override Pattern
```typescript
object.traverse((child) => {
  if (child instanceof Mesh && child.material.name === 'CarPaint') {
    mat.color.set(config.color)
    mat.metalness = config.metallic
    mat.roughness = config.roughness
    mat.clearcoat = 1.0
    mat.clearcoatRoughness = 0.1
  }
})
```

### Zustand Store Pattern
```typescript
export const useCarConfig = create<CarConfigState>()(
  devtools((set, get) => ({
    selectedParts: {},
    paintColor: '#ff0000',
    selectPart: (category, part) => set((s) => ({
      selectedParts: { ...s.selectedParts, [category]: part }
    })),
    getTotalPrice: () => Object.values(get().selectedParts).reduce(...)
  }))
)
```

---

## Critical Resources

### Open-Source References
1. **pmndrs/racing-game** - R3F + Rapier vehicle physics
2. **Three.js car example** - Clearcoat materials
3. **Drei Storybook** - `<Environment>`, `<ContactShadows>`, `<useDetectGPU>`
4. **Bruno Simon portfolio** - Creative camera work

### Free Assets
- **Models**: Sketchfab (free car GLBs)
- **HDRIs**: Polyhaven (`studio_small_09`, `photo_studio_loft_hall`)
- **Optimization**: gltf-pipeline (DRACO), glTF Transform

### Dev Tools
- **Leva** - GUI for material tweaking
- **R3F Perf** - FPS/memory monitoring
- **gltfjsx** - GLB to React component
- **Zustand DevTools** - State debugging

---

## File Structure

```
├── app/
│   ├── showroom/page.tsx              # ✅ Keep existing (POV camera)
│   └── car-configurator/[carId]/page.tsx  # 🆕 New (OrbitControls)
│
├── components/
│   ├── store/                         # ✅ Keep existing
│   │   ├── Scene.tsx                  # Showroom
│   │   ├── ModelLoader.tsx            # Reuse for parts
│   │   └── CarInteraction.tsx         # 🆕 Extend ProductInteraction
│   │
│   └── car/                           # 🆕 All new
│       ├── CarConfiguratorScene.tsx   # Canvas + OrbitControls
│       ├── CarModel.tsx               # Base + DynamicParts
│       ├── DynamicPart.tsx            # Part loader
│       ├── ConfigPanel.tsx            # Main UI
│       └── MaterialControls.tsx       # Paint customization
│
├── stores/
│   └── carConfigStore.ts              # 🆕 Zustand (configurator only)
│
├── public/
│   ├── config/
│   │   ├── stores.json                # ✅ Add showroom cars
│   │   ├── cars.json                  # 🆕 Car database
│   │   └── car-parts.json             # 🆕 Parts catalog
│   │
│   ├── models/showroom/               # 🆕 Full cars (1-1.5MB each)
│   └── car-models/                    # 🆕 Parts (200-300KB each)
│       ├── base/
│       ├── wheels/
│       ├── spoilers/
│       └── body-kits/
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model size too large | Slow load, mobile fail | DRACO mandatory, <1MB target, 3G test |
| Mobile performance | <30fps, crash | Adaptive DPR, disable N8AO, bloom reduction |
| Memory leaks | Browser crash | Dispose on unmount, profiler checks |
| Material export issues | Materials broken | Name clearly, test early, simple setup |

---

## Success Criteria

- Desktop: 60fps sustained
- Mobile: 30fps+ (iPhone 12+, mid-range Android)
- Part swap: <200ms desktop, <500ms mobile
- Initial load: <3s desktop, <5s mobile
- Memory: <500MB desktop, <300MB mobile
- Lighthouse: >80 performance

---

## Recommended Approach

### Week 1
1. **Day 1-2**: Phase 0 (showroom + routing)
2. **Day 3-4**: Phase 1 (state + config)
3. **Day 5-7**: Phase 2 (part swapping)

**Milestone**: Parts swap via UI, showroom working

### Week 2
1. **Day 8-9**: Phase 3 (materials)
2. **Day 10-11**: Phase 4 (UI polish) + Phase 3 parallel
3. **Day 12**: Phase 5 (camera presets)
4. **Day 13-14**: Phase 6 (performance) continuous

**Milestone**: Production-ready core experience

### Optional (Week 3)
- Phase 7: Screenshot export, URL sharing, save/load configs

---

## Why This Approach Wins

### Technical
- **95% code reuse** for showroom (jewelry store proven)
- **Zero conflicts** (separate pages, cameras, states)
- **pmndrs ecosystem** (R3F, Drei, Zustand same team)
- **DRACO already working** (50-80% size reduction)

### UX
- **Clear contexts**: Exploration vs customization
- **Appropriate controls**: Joystick for movement, drag for rotation
- **Performance**: Only load configurator when needed
- **Scalability**: Easy to add cars, parts

### Business
- **Fast implementation**: 8-12 days core
- **Low risk**: Proven patterns, existing code
- **Incremental**: Phases can ship independently
- **Maintainable**: Clean separation, standard tools

---

## Next Immediate Action

1. Download 2-3 car GLBs from Sketchfab
2. Place in `/public/models/showroom/`
3. Add to `stores.json` (copy jewelry pattern)
4. Create `cars.json` database
5. Test click → route to `/car-configurator/[carId]`

**Success**: Click car in showroom → see configurator page with car ID

---

**Verdict**: Two-stage architecture with Zustand + DRACO + OrbitControls is the optimal approach. Balances code reuse (95% showroom), clear UX separation, and proven performance patterns. Implementation timeline: 8-12 days.
