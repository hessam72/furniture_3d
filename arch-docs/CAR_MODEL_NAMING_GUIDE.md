# Car Model Naming Guide

Complete reference for naming meshes and nodes in your car GLB file to ensure compatibility with the configurator system.

---

## 📋 Quick Checklist

Use this checklist when preparing your GLB file:

- [ ] All wheel attachment nodes named correctly (4 nodes)
- [ ] All stock wheel meshes named correctly (4 meshes)
- [ ] All door/hood/trunk meshes named correctly (6 meshes)
- [ ] All other part attachment nodes present
- [ ] All replaceable body part nodes named correctly
- [ ] Paint zone userData assigned to materials
- [ ] All mesh names use underscores (not spaces or dashes)

---

## 🎨 Paint Zones (Material UserData)

The configurator uses **3 independent paint zones**. Assign the correct `paintZone` to each material's userData in Blender/3D software.

### How to Set Paint Zones

In **Blender**:
1. Select mesh
2. Go to Material Properties
3. Custom Properties → Add Custom Property
4. Name: `paintZone`
5. Type: String
6. Value: `body`, `trim`, or `interior`

### Zone Definitions

| Zone | Value | Parts Include |
|------|-------|---------------|
| **Body** | `body` | Hood, roof, doors, fenders, quarter panels, trunk, bumpers |
| **Trim** | `trim` | Grille, mirror caps, window trim, door handles, side skirts, spoiler edges |
| **Interior** | `interior` | Dashboard, door panels, center console, seat leather, steering wheel rim |

**Default behavior**: If no `paintZone` is set, the material defaults to `body`.

---

## 🚗 Required Nodes & Meshes

### 1. Wheels System

**Attachment Nodes** (Empty objects for positioning):
```
Wheel_FL    → Front Left wheel position
Wheel_FR    → Front Right wheel position
Wheel_RL    → Rear Left wheel position
Wheel_RR    → Rear Right wheel position
```

**Stock Wheel Meshes** (visible by default, hidden when custom wheels selected):
```
Stock_Wheel_FL    → Front Left stock wheel mesh
Stock_Wheel_FR    → Front Right stock wheel mesh
Stock_Wheel_RL    → Rear Left stock wheel mesh
Stock_Wheel_RR    → Rear Right stock wheel mesh
```

**Important Notes**:
- Attachment nodes must be positioned exactly where the wheel center should be
- Stock wheel meshes are the actual 3D models visible by default
- When user selects custom wheels, stock meshes are hidden and replaced

---

### 2. Animated Doors/Hood/Trunk

These meshes must be **separate objects** (not joined to body) for animation to work:

```
car_door_left        → Driver side front door
car_door_right       → Passenger side front door
car_door_back_left   → Driver side rear door (optional)
car_door_back_right  → Passenger side rear door (optional)
car_caput            → Hood (bonnet)
car_trunk            → Trunk (boot)
```

**Pivot Point Requirements**:
- Each door must have its pivot point at the hinge location
- Hood pivot at front edge (opens forward/upward)
- Trunk pivot at rear edge (opens upward)

---

### 3. Seats

**Attachment Nodes**:
```
Seat_FL    → Front Left seat position
Seat_FR    → Front Right seat position
Seat_RL    → Rear Left seat position
Seat_RR    → Rear Right seat position
```

These are empty objects positioned where seat models will be attached.

---

### 4. Brake Calipers

**Attachment Nodes**:
```
Caliper_FL    → Front Left caliper position
Caliper_FR    → Front Right caliper position
Caliper_RL    → Rear Left caliper position
Caliper_RR    → Rear Right caliper position
```

Position these at the brake caliper mounting points behind each wheel.

---

### 5. Mirrors

**Attachment Nodes**:
```
Mirror_L    → Left side mirror position
Mirror_R    → Right side mirror position
```

Position at the base of each side mirror.

---

### 6. Headlights

**Attachment Nodes**:
```
Headlight_L    → Left headlight position
Headlight_R    → Right headlight position
```

Position at the center of each headlight housing.

---

### 7. Replaceable Body Parts

These are single-instance parts that get replaced when user selects custom versions:

```
Hood            → Hood mesh (can be replaced with custom hoods)
Front_Bumper    → Front bumper mesh
Exhaust         → Exhaust system mesh
Steering_Wheel  → Steering wheel mesh
```

**Requirements**:
- Must be separate mesh objects (not joined to body)
- Positioned correctly in the car hierarchy
- Can have `paintZone` userData assigned

---

### 8. Spoiler

**Attachment Node**:
```
Spoiler_Mount    → Spoiler mounting position (usually on trunk)
```

**Stock Spoiler Mesh** (optional):
```
Stock_Spoiler    → Default spoiler mesh (hidden when "None" selected)
```

---

## 📐 Naming Conventions

### General Rules

1. **Use Underscores**: `Wheel_FL` ✓ not `Wheel-FL` ✗ or `Wheel FL` ✗
2. **Case Sensitive**: Exact capitalization matters
3. **No Spaces**: Replace spaces with underscores
4. **Descriptive**: Names should clearly indicate purpose

### Suffix Patterns

| Suffix | Meaning | Example |
|--------|---------|---------|
| `_FL` | Front Left | `Wheel_FL` |
| `_FR` | Front Right | `Wheel_FR` |
| `_RL` | Rear Left | `Wheel_RL` |
| `_RR` | Rear Right | `Wheel_RR` |
| `_L` | Left | `Mirror_L` |
| `_R` | Right | `Mirror_R` |

---

## 🔍 How The System Works

### Attachment Strategy

The configurator uses 3 strategies for part swapping:

1. **attachNodes** (Multiple instances):
   - Used for: Wheels, seats, calipers, mirrors, headlights
   - Custom part models are cloned to each attachment point
   - Example: 4 wheel models attached to 4 `Wheel_*` nodes

2. **replaceNode** (Single instance):
   - Used for: Hood, bumpers, exhaust, steering wheel
   - Custom part replaces the original mesh
   - Example: `Hood` mesh replaced with custom hood model

3. **hideNodes** (No replacement):
   - Used for: "None" options (remove spoiler, etc.)
   - Simply hides specified meshes
   - Example: `Stock_Spoiler` hidden when user selects "None"

---

## ✅ Validation Checklist

Before exporting your GLB file:

### Structure Check
- [ ] All attachment nodes are **Empty objects** (not meshes)
- [ ] All attachment nodes have correct position/rotation
- [ ] Doors/hood/trunk are **separate meshes** (not joined to body)
- [ ] Door pivot points are at hinge locations
- [ ] No duplicate node names

### Naming Check
- [ ] All node names use exact capitalization from this guide
- [ ] No spaces in node names (use underscores)
- [ ] All 4 wheel attachment nodes present
- [ ] All 6 door/hood/trunk meshes present
- [ ] All other category attachment nodes present

### Material Check
- [ ] Body panels have `paintZone: "body"` userData
- [ ] Trim pieces have `paintZone: "trim"` userData
- [ ] Interior parts have `paintZone: "interior"` userData
- [ ] Materials are named descriptively
- [ ] No duplicate material names

### Export Settings (Blender)
- [ ] Format: glTF 2.0 (.glb)
- [ ] Include: Selected Objects or Entire Scene
- [ ] Transform: +Y Up (default)
- [ ] Geometry: Apply Modifiers
- [ ] Materials: Export
- [ ] Compression: Draco (optional, for smaller file size)

---

## 🛠️ Testing Your Model

### In-Browser Testing

1. Place your GLB in `/public/models/car/supercars/`
2. Update model path in car config
3. Run `npm run dev`
4. Navigate to configurator page
5. Open browser console (F12)
6. Look for these messages:
   - `[DoorController] Mesh lookup results` - Shows which door nodes were found
   - `[DynamicPart] attachNode not found` - Indicates missing attachment nodes
   - `[DynamicPart] replaceNode not found` - Indicates missing replaceable parts

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Wheels don't swap | Missing `Wheel_*` nodes | Add 4 wheel attachment empty objects |
| Doors don't open | Wrong mesh names | Rename to exact names: `car_door_left`, etc. |
| Paint doesn't apply | Missing paintZone userData | Add custom property to materials |
| Parts floating | Wrong attachment position | Reposition empty objects in 3D software |
| Suspension moves wheels | Wheels not tracked | Check console for wheel mount messages |

---

## 📝 Example Hierarchy

```
Car_Model.glb
├── Body (mesh with paintZone: "body")
├── car_door_left (mesh with paintZone: "body")
├── car_door_right (mesh with paintZone: "body")
├── car_door_back_left (mesh with paintZone: "body")
├── car_door_back_right (mesh with paintZone: "body")
├── car_caput (mesh with paintZone: "body")
├── car_trunk (mesh with paintZone: "body")
├── Stock_Wheel_FL (mesh)
├── Stock_Wheel_FR (mesh)
├── Stock_Wheel_RL (mesh)
├── Stock_Wheel_RR (mesh)
├── Stock_Spoiler (mesh with paintZone: "body")
├── Front_Bumper (mesh with paintZone: "body")
├── Hood (mesh with paintZone: "body")
├── Exhaust (mesh)
├── Steering_Wheel (mesh with paintZone: "interior")
├── Dashboard (mesh with paintZone: "interior")
├── Grille (mesh with paintZone: "trim")
├── Wheel_FL (empty object)
├── Wheel_FR (empty object)
├── Wheel_RL (empty object)
├── Wheel_RR (empty object)
├── Seat_FL (empty object)
├── Seat_FR (empty object)
├── Seat_RL (empty object)
├── Seat_RR (empty object)
├── Caliper_FL (empty object)
├── Caliper_FR (empty object)
├── Caliper_RL (empty object)
├── Caliper_RR (empty object)
├── Mirror_L (empty object)
├── Mirror_R (empty object)
├── Headlight_L (empty object)
├── Headlight_R (empty object)
└── Spoiler_Mount (empty object)
```

---

## 🎓 Need Help?

- **Console Errors**: Open DevTools (F12) → Console tab for detailed error messages
- **Missing Nodes**: Check `[DoorController]` and `[DynamicPart]` console logs
- **Paint Issues**: Verify material userData contains correct `paintZone` values
- **Position Issues**: Re-check empty object positions in your 3D software

---

**Last Updated**: Phase 5 (Suspension Fix)
