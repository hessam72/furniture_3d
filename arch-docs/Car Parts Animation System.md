# Documentation Index

## Architecture Documentation

### [Car Parts Animation System](./CAR_PARTS_ANIMATION_ARCHITECTURE.md)
Interactive door/hood/trunk opening system with pivot-based rotation and GSAP animations.

**Key Topics:**
- System architecture and component responsibilities
- Data flow and state management
- Animation engine internals
- Model requirements and mesh naming
- Extension points and customization
- Performance characteristics
- Debugging and deployment considerations

---

## Quick Links

### Implementation Files
- **Controller:** `lib/DoorController.ts`
- **State:** `stores/carConfigStore.ts`
- **Integration:** `components/car/ConfigurableCar.tsx`
- **UI Panel:** `components/car/PartsTogglePanel.tsx`
- **Click Detection:** `components/car/PartClickDetector.tsx`

### Key Concepts
- Pivot-based rotation for realistic hinge motion
- Zustand for centralized state management
- Raycasting for 3D click detection
- GSAP for smooth animations
- React hooks for lifecycle integration

### Dependencies
- Three.js 0.161.0
- GSAP 3.12.5+
- @react-three/fiber 8.17.10
- @react-three/drei 9.114.3
- Zustand 5.0.14

---

*Last updated: 2026-07-09*
