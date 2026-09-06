# Static product preview guide

This is a simple guide for preparing the furniture presentation files and previewing the product page locally.

## 1. Required files

For each product, prepare the following assets and config entries:

- product key in `public/config/products.json`
- matching entry in `public/config/furniture-layers.json`
- layer GLB files in `public/models/furniture/<product-key>/`
- cover thumbnails in `public/images/covers/`
- optional presentation room model in `public/store-models/present/`

Example structure:

```text
public/
  config/
    products.json
    furniture-layers.json
  models/
    furniture/
      test/
        frame.glb
        soft.glb
        cover-leather.glb
  images/
    covers/
      leather.jpg
  store-models/
    present/
      booth.glb
```

## 2. File preparation checklist

### A. Product key

Each product should have a stable product key, such as `test`, `dining-chair`, or another item id used in the route.

The presentation route is:

```text
/product/<product-key>
```

### B. Layer manifest

Create a record in `public/config/furniture-layers.json` using the same key as `products.json`.

Example:

```json
{
  "test": {
    "layers": {
      "frame": { "url": "/models/furniture/test/frame.glb" },
      "soft": { "url": "/models/furniture/test/soft.glb" }
    },
    "covers": [
      {
        "id": "leather",
        "name": "چرم طبیعی",
        "url": "/models/furniture/test/cover-leather.glb",
        "thumbnail": "/images/covers/leather.jpg"
      }
    ],
    "woodTones": [
      { "id": "oak", "name": "بلوط طبیعی", "hex": "#C19A6B" }
    ],
    "view": {
      "position": [0, 1.15, 3.4],
      "target": [0, 0.55, 0],
      "fov": 40
    },
    "room": "/store-models/present/booth.glb"
  }
}
```

Important rules:

- `frame.glb` is the main structure
- `soft.glb` is the cushion/fabric base
- `cover-<material>.glb` is the outer material variant
- all layers must use the same scene origin and scale
- cushion meshes should be named clearly, such as `cushion_*`

### C. Model naming and authoring

Before exporting GLB files:

- keep the same world origin across all layer files
- do not recenter each model differently
- use clean material names
- keep colorable surfaces without baked color textures
- make sure the room model is front-facing and suitable for the static view

### D. Cover and color data

Each cover entry should include:

- `id`
- `name`
- `url`
- `thumbnail`
- `priceDelta` if needed
- material properties and palette values for color swatches

The wood, cover, and cushion zones should be defined separately so the product can change colors independently.

## 3. Local preview steps

From the project root:

```bash
npm install
npm run dev
```

Then open the browser:

```text
http://localhost:3000/product/<product-key>
```

For example:

```text
http://localhost:3000/product/test
```

## 4. Preview tips

- Use a product key that matches both `products.json` and `furniture-layers.json`.
- If a model is missing, the page may show a partial or fallback result instead of crashing.
- Add `?debug=1` to the URL to inspect debug output during testing.

Example:

```text
http://localhost:3000/product/test?debug=1
```

## 5. Summary

Prepare the product files in the same key, match the model paths to the manifest, ensure all layers share the same alignment, and run the Next.js app locally to preview the presentation page.

This preview is meant to validate:

- model placement
- layer stacking
- color zones
- cover switching
- camera framing
- static presentation quality
