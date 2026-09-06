# Furniture Showroom - 3D Setup Guide

## Overview
This guide explains how to prepare and name 3D models for the furniture showroom system.

---

## 1. 3D Model Naming Requirements

### Root Object Name
- **Must match the product key** in `products.json`
- Example: If product key is `"modern-sofa"`, name the root object `modern-sofa`
- Case-insensitive matching supported

### Colorable Mesh Names
Meshes that should change color **must include one of these keywords** in their name:

- `fabric`
- `cushion`
- `upholstery`
- `seat`

**Examples:**
```
✅ sofa_fabric_001
✅ cushion_left
✅ seat_upholstery
✅ fabric-material
❌ sofa_frame (won't be colorable)
❌ wood_legs (won't be colorable)
```

### Hierarchy
- Colorable meshes can be **at any depth** in the hierarchy
- System traverses entire object tree automatically
- Parent/child relationships don't matter, only mesh names

**Example Structure:**
```
modern-sofa (root)
├── frame
│   ├── wood_legs
│   └── metal_support
└── seating
    ├── cushion_left (colorable ✅)
    ├── cushion_right (colorable ✅)
    └── fabric_base (colorable ✅)
```

---

## 2. Products Configuration

### File: `public/config/products.json`

```json
{
  "modern-sofa": {
    "id": "modern-sofa-01",
    "category": "seating",
    "type": "sofa",
    "name": "Modern Sectional Sofa",
    "glbPath": "/models/furniture/sofa-modern.glb",
    "usdzPath": "/models/furniture/sofa-modern.usdz",
    "dimensions": "240cm × 95cm × 80cm",
    "material": "Fabric & Solid Wood",
    "weight": "85 kg",
    "colors": [
      { "name": "Charcoal Gray", "hex": "#36454F" },
      { "name": "Beige", "hex": "#D4C5B9" },
      { "name": "Navy Blue", "hex": "#1B2F5C" }
    ],
    "billboardPosition": [2, 2.5, 0]
  }
}
```

**Key Requirements:**
- Product **key** (e.g., `"modern-sofa"`) = 3D object root name
- `glbPath`: Model for web/Android AR
- `usdzPath`: Model for iOS AR Quick Look
- `colors`: Array of 3+ color options with name and hex
- `billboardPosition`: [x, y, z] for info popup location

---

## 3. Store Configuration

### File: `public/config/stores.json`

```json
{
  "stores": [
    {
      "id": "mall",
      "files": [
        {
          "priority": 0,
          "quality": "low",
          "url": "/store-models/mall-collision.glb"
        },
        {
          "priority": 1,
          "quality": "high",
          "url": "/store-models/mall-furniture.glb"
        }
      ]
    }
  ]
}
```

---

## 4. Model Export Settings

### Blender Export (Recommended)
1. **Format**: glTF 2.0 (.glb)
2. **Include**: Selected Objects
3. **Transform**: +Y Up
4. **Geometry**:
   - Apply Modifiers: ✅
   - UVs: ✅
   - Normals: ✅
   - Materials: Export
5. **Compression**: Draco (optional, for smaller files)

### Material Setup
- Use **MeshStandardMaterial** or **MeshPhysicalMaterial**
- Set base color for colorable meshes (will be captured as "Original")
- Avoid baked textures on colorable parts

---

## 5. Testing Checklist

Before adding furniture to the scene:

- [ ] Root object named to match product key
- [ ] Colorable meshes contain keywords: fabric/cushion/upholstery/seat
- [ ] Products.json entry created with matching key
- [ ] GLB and USDZ files exported and placed in correct paths
- [ ] Colors array has at least 3 color options
- [ ] Billboard position tested in scene

---

## 6. How It Works

### On Click:
1. User clicks furniture
2. System finds object by name matching product key
3. Traverses hierarchy to find meshes with colorable keywords
4. Captures original color from first mesh
5. Shows color picker with "Original" + defined colors

### Color Change:
1. User clicks color circle
2. System applies smooth color transition (400ms)
3. Only affects meshes with fabric/cushion/upholstery/seat in name
4. Other parts (frame, legs, etc.) unchanged

### AR View:
1. User clicks "VIEW IN AR" button
2. Opens ARProductViewer with GLB (Android/web) or USDZ (iOS)
3. Native AR experience: Quick Look or Scene Viewer

---

## 7. Common Issues

**Color not changing:**
- Check mesh names contain keywords: fabric/cushion/upholstery/seat
- Verify object root name matches product key exactly
- Check console logs for "Found X meshes, Y colorable"

**Multiple furniture changing color:**
- Each furniture must have unique root object name
- Root name must match product key in products.json

**AR not working:**
- Verify both glbPath and usdzPath are correct
- Test on actual device (AR doesn't work in desktop browser)
- Check file sizes (recommend <10MB for AR models)

---

## 8. File Structure

```
/models/furniture/
├── sofa-modern.glb          (Web/Android)
├── sofa-modern.usdz         (iOS AR)
├── chair-nordic.glb
├── chair-nordic.usdz
└── ...

/store-models/
├── mall-collision.glb       (Invisible collision mesh)
└── mall-furniture.glb       (Visual scene with furniture)

/public/config/
├── products.json            (Furniture catalog)
└── stores.json              (Scene configuration)
```

---

## Need Help?

Check browser console for detailed logs:
- `[FurnitureColorApplier]` - Object finding and mesh traversal
- `[ProductInteraction]` - Click detection and product matching
- `[Scene]` - Furniture selection flow

All systems include extensive debug logging to help troubleshoot issues.

---

# Layered presentation assets (`/product/[id]`)

The showroom loads one GLB per product. The presentation route loads the same
piece as **separate layers** so it can be stepped through, exploded, and
re-covered in a different material without re-exporting anything.

## The three kinds of layer

| File | Contents | Colour zone |
|---|---|---|
| `frame.glb` | The wood structure — legs, apron, backrest frame | `wood` |
| `soft.glb` | Fibre base **and** cushions | cushions only → `cushion` |
| `cover-<id>.glb` | The final upholstery, one file per material | `cover` |

**The layer file is the zone.** Everything in `frame.glb` is wood; everything in
a `cover-*.glb` is cover. Only `soft.glb` needs a name rule, because the fixed
fibre base and the colourable cushions live together: meshes whose name contains
the manifest's `zoneMatch` (default `cushion`) are colourable, the rest are not.
A `userData.zone` of `wood` / `cover` / `cushion` on a mesh overrides both.

This is deliberately simpler than the showroom's whole-model keyword matching in
`components/store/FurnitureColorApplier.tsx`, which has to guess from mesh names
across a single combined GLB.

## Export rules

1. **One Blender scene, one world origin.** Export each layer from the same
   scene without recentering. The page centres the stack **once**, using the
   frame's bounding box, and applies that offset to a shared parent — so any
   per-file recentering pulls the layers apart.
2. **Seated, not floating.** The frame's lowest point becomes floor level. Model
   the piece standing on Z=0.
3. **Real-world scale, metres.** A dev-only console warning fires if the frame
   is taller than 3 m or shorter than 0.2 m — that is almost always a unit-scale
   mistake.
4. **Cushions named `cushion_*`** inside `soft.glb`.
5. `MeshStandardMaterial` or `MeshPhysicalMaterial`. **No baked colour textures
   on colourable surfaces** — the page drives `color` directly. Normal,
   roughness and AO maps are fine and encouraged.
6. Every cover variant should occupy the same volume, so switching material
   doesn't change the silhouette.
7. **No shadow-only geometry and no lights.** The page renders with no shadow
   maps at all; a shadow-catcher plane would show up as a grey slab.

## The room

`room.path` is a **trimmed presentation booth**, authored front-facing only —
no ceiling, no fourth wall, no geometry behind the static camera. Three.js
already frustum-culls what is off-screen, so trimming does not save draw calls;
what it saves is download, parse and VRAM, and that only the asset can do.

Keep the floor generous (the camera pulls back when the piece is exploded) and
check that spinning the piece 180° never reveals the open back — if it does,
trim the room further or lower `camera.maxZoom`.

## Manifest — `public/config/furniture-presentation.json`

Keyed by the same **`products.json` object key** the showroom uses (`test`,
`dining-chair`, …), and merged with that record at runtime: name, price,
dimensions and the AR `glbPath`/`usdzPath` still come from `products.json`.
A product with no entry here simply has no "نمای ویژه محصول" button in the
showroom drawer — nothing else changes.

```jsonc
{
  "<products.json key>": {
    "room":   { "path", "hdr", "envIntensity", "floorY" },
    "layers": {
      "frame": { "path", "label", "desc" },
      "soft":  { "path", "label", "desc", "zoneMatch": "cushion" },
      "cover": { "label", "desc", "default": "<variant id>", "variants": [
        { "id", "name", "path", "thumbnail", "priceDelta",
          "material": { "roughness", "metalness", "clearcoat" } }
      ]}
    },
    "palettes": {
      "wood":    [ { "id", "name", "hex", "roughness" } ],   // wood carries its own roughness
      "cover":   [ { "id", "name", "hex" } ],                // inherits the variant's material
      "cushion": [ { "id", "name", "hex" } ]
    },
    "camera":   { "azimuthDeg", "elevationDeg", "fov", "near", "far",
                  "padding", "minZoom", "maxZoom", "screenLift" },
    "lighting": { "key", "fill", "rim", "bounce", "ambient" },
    "explode":  { "gap", "durationMs" },
    "wipe":     { "durationMs" }
  }
}
```

### Framing knobs

The camera distance is **never** written down — it is derived every time from
the measured bounds of `frame ∪ soft` and the live canvas aspect. `fov` is
vertical, so a distance tuned on a desktop window puts the camera inside the
sofa on a portrait phone; solving both axes and taking the larger is the only
thing that works on both.

- `padding` — multiplier on the just-fits distance. `1.0` crops; ~`1.5` reads well.
- `minZoom` / `maxZoom` — pinch and wheel clamps, as multiples of that distance.
- `azimuthDeg` / `elevationDeg` — where the fixed camera sits. It never orbits;
  dragging spins the *model*.
- `screenLift` — small extra upward bias. The sheet's own coverage is already
  measured at runtime and compensated for, so this is usually `0`.

## Assets checklist

```
public/models/presentation/<key>/
  frame.glb
  soft.glb
  cover-<id>.glb        (one per variant)
  room.glb
public/images/covers/<id>.jpg   (optional — a missing thumbnail is an empty tile)
```

`public/models` is gitignored. When the files are absent the page shows a
Persian "not on the server yet" panel naming each missing path, with retry and
a link back to the showroom — never a spinner that never ends.

## Debugging

Open `/product/<key>?debug=1`. Every 2 s the console prints:

- `fps` — **must read 0 when nothing is animating.** The scene runs
  `frameloop="demand"`; a non-zero idle figure means some `useFrame` is missing
  its settle check and is pinning the loop at 60 fps.
- `geometries` / `textures` / `programs` — swap covers a few times; these must
  come back to the same numbers. A rising count is a missing material dispose.
- `camera` and `bounds` — the fastest way to spot a unit-scale or origin
  mistake in a layer GLB.
