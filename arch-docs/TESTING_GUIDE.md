# Testing Guide - Car Configurator Features

Quick and easy guide to test all implemented features.

---

## Prerequisites

```bash
npm run dev
# Navigate to http://localhost:3000/car/sample-car
```

---

## Phase 1 - English Content & Interior Parts

### ✅ English Content Conversion

**Test Steps:**
1. Open the car configurator page
2. Check that all UI text is in English (no Persian)
3. Verify car name displays correctly in top bar

**Expected Results:**
- All labels, buttons, and text in English
- No `undefined` or missing translations
- Clean, professional English copy

---

### ✅ Interior Parts Categories

**Test Steps:**
1. Open Customization Panel (right sidebar on desktop)
2. Look for these new categories in the vertical icon rail:
   - **Seats** (chair icon)
   - **Steering** (steering wheel icon)
   - **Calipers** (gear icon)
   - **Headlights** (lightbulb icon)

3. Click each category and verify:
   - Shows 3 parts per category (Stock, Sport, Racing)
   - Each part has thumbnail, name, and price
   - Clicking a part selects it (gold border)
   - Price updates in footer

**Expected Results:**
- All 4 new categories visible
- Parts load without errors
- Selection works smoothly
- Total price calculates correctly

---

## Phase 2 - Color Palette Presets

### 🎨 Understanding Multi-Zone Paint System

The car has **3 independent paint zones**:

1. **BODY** - Main car panels:
   - Hood, roof, doors, fenders
   - Side panels and rear quarter panels
   - The primary/largest painted surface

2. **TRIM** - Accent elements:
   - Front grille, side skirts
   - Mirror caps, window trim
   - Bumper accents and spoiler edges

3. **INTERIOR** - Cabin surfaces:
   - Dashboard and center console
   - Door panels and seat stitching
   - Steering wheel accents

Each zone can be painted **separately** with different colors, metallics, and finishes.

---

### ✅ Factory Palettes

**Test Steps:**
1. Open Customization Panel
2. Click **Paint** category (first icon)
3. Scroll to top - see "FACTORY PALETTES" section
4. Verify 8 preset cards in 2-column grid:
   - Racing Red
   - Midnight Black
   - Ocean Blue
   - Sunset Orange
   - Forest Green
   - Pearl White
   - Deep Purple
   - Carbon Fiber

5. Click each preset and observe:
   - 3-color preview bar shows colors for **Body / Trim / Interior**
   - Car paint updates immediately
   - All 3 zones change together

**Expected Results:**
- All 8 presets displayed
- Clicking preset applies full 3-zone paint config
- Car updates in real-time
- Smooth color transitions

---

### ✅ Custom Multi-Zone Painting

**Test Steps:**
1. In Paint category, scroll past Factory Palettes
2. Find 3 separate sections:
   - **BODY PAINT**
   - **TRIM PAINT**
   - **INTERIOR PAINT**

3. Test layered customization:
   - **Body:** Select bright red metallic
   - **Trim:** Select carbon fiber (dark gray)
   - **Interior:** Select tan leather

4. Observe the car:
   - Main panels are red
   - Accent pieces (grille, skirts) are carbon
   - Dashboard/seats have tan color

5. Try another combination:
   - **Body:** Pearl white
   - **Trim:** Black gloss
   - **Interior:** Red leather

**Expected Results:**
- Each zone controls different parts of the car
- Zones can have completely different colors
- Changes apply immediately
- Creates custom multi-tone paint schemes

**Pro Tip:** Use factory palettes as starting points, then customize individual zones for unique looks.

---

## Phase 3 - Dynamic Suspension

### ✅ Suspension Height Control

**Test Steps:**
1. Open Customization Panel
2. Click **Suspension** category (spring icon)
3. Test the 3 preset buttons:
   - **Stock** (0 cm)
   - **Lowered** (-3 cm)
   - **Raised** (+5 cm)

4. Use the height slider:
   - Drag from -5cm to +10cm
   - Observe live value display
   - Watch car body move up/down smoothly

**Expected Results:**
- Presets change height with smooth GSAP animation
- Slider updates height in real-time
- Car position changes vertically
- Animation takes ~0.6 seconds

---

## Phase 4 - Lighting Studio

### ✅ Lighting Presets

**Test Steps:**
1. Open Customization Panel
2. Click **Lighting** category (lightbulb outline icon - 3rd icon)
3. Test the 4 lighting presets:
   - **Studio** (default - works immediately)
   - **Sunset** (requires HDRI download - see note below)
   - **Showroom** (requires HDRI download)
   - **Garage** (requires HDRI download)

4. Click "Studio" preset and verify:
   - Button highlights in gold
   - Lighting environment changes
   - Car reflections update

**Expected Results:**
- Studio preset works immediately
- Active preset has gold border/background
- Other presets may show console errors if HDRIs not downloaded (this is expected)

---

### ✅ Manual Light Control

**Test Steps:**
1. In Lighting category, use the 3 light intensity sliders:
   - **Key Light** (0-100)
   - **Fill Light** (0-100)
   - **Rim Light** (0-100)

2. Drag each slider and observe:
   - Car lighting changes in real-time
   - Value displays next to label
   - Active preset deselects (you're in manual mode)

3. Test environment controls:
   - **Rotation** slider (0-360°)
   - Drag and watch reflections rotate on car
   - **Intensity** slider (0-2)
   - Adjust HDRI brightness

**Expected Results:**
- All sliders responsive
- Lighting updates immediately
- Rotation affects reflections/highlights
- Intensity makes environment brighter/darker

---

### 📦 HDRI Asset Download (Optional)

**Note:** To test Sunset/Showroom/Garage presets, you need to download HDRIs:

1. Visit [Poly Haven](https://polyhaven.com/hdris)
2. Download these (2K EXR format):
   - Kloppenheim 06 → rename to `sunset.exr`
   - Studio Small 09 → rename to `showroom.exr`
   - Industrial Sunset 02 → rename to `garage.exr`
3. Place in `/public/hdr/` folder
4. Restart dev server

Detailed instructions: See [REMAINING_PHASES.md](REMAINING_PHASES.md#6-download-hdri-assets)

---

## Phase 5 - Before/After Comparison Slider

### ✅ Comparison Mode

**Test Steps:**
1. Customize your car:
   - Change paint color
   - Add sport wheels
   - Lower suspension
   - Adjust lighting

2. Click **Compare** button in panel footer (next to Reset)

3. Verify comparison view:
   - Fullscreen overlay appears
   - Left side: "Before" (frozen snapshot)
   - Right side: "After" (current config)
   - Labels visible in top corners

4. Drag the vertical white divider:
   - Click and hold the white handle (double bars)
   - Drag left/right
   - See before/after reveal smoothly

5. Continue customizing while in compare mode:
   - Click "Exit Comparison" button (top center)
   - Panel reappears
   - Change paint color to red
   - Click "Compare" again
   - Right side shows new red color
   - Left side shows previous snapshot

**Expected Results:**
- Compare button creates snapshot
- Dual canvas renders smoothly
- Divider drags without lag
- Left canvas stays frozen
- Right canvas updates live
- Exit button returns to normal view

---

### ✅ Touch/Mobile Support (if testing on mobile)

**Test Steps:**
1. Enable compare mode
2. Touch and drag the divider handle
3. Swipe left/right

**Expected Results:**
- Touch drag works smoothly
- No scrolling interference
- Divider follows finger

---

## Common Issues & Solutions

### Issue: 3D model won't load
**Solution:** Check console for DRACO decoder errors. Ensure `/public/draco/` folder exists.

### Issue: Lighting presets show errors
**Solution:** Expected if HDRIs not downloaded. Studio preset should work (uses `main_hdr.exr`).

### Issue: Parts don't swap
**Solution:** Check console for model path errors. Verify part GLBs exist in `/public/models/parts/`.

### Issue: Comparison slider shows black screen
**Solution:** Both canvases loading same model - give it a few seconds to load.

### Issue: Paint doesn't apply
**Solution:** Click a palette preset first to initialize paint system.

---

## Performance Testing

### Desktop (Recommended)
- **60 FPS** in normal mode
- **30-45 FPS** in comparison mode (dual canvas)
- Smooth light/paint transitions

### Mobile
- **30 FPS** minimum
- May see frame drops in comparison mode
- Disable shadows in Quality settings if slow

---

## Testing Checklist

### Phase 1 - English Content & Interior Parts
- [ ] All text in English
- [ ] 4 new interior categories visible
- [ ] Parts load and select correctly

### Phase 2 - Color Palettes
- [ ] 8 factory palettes displayed
- [ ] Clicking preset applies full paint
- [ ] Preview bars show correct colors
- [ ] 3 paint zones (Body/Trim/Interior) work independently
- [ ] Custom multi-zone combinations apply correctly

### Phase 3 - Dynamic Suspension
- [ ] 3 presets work (Stock/Lowered/Raised)
- [ ] Slider adjusts height smoothly
- [ ] Car animates vertically

### Phase 4 - Lighting Studio
- [ ] Lighting category exists
- [ ] 4 presets (Studio works)
- [ ] 3 light intensity sliders responsive
- [ ] Environment rotation works
- [ ] Intensity slider adjusts brightness

### Phase 5 - Comparison Slider
- [ ] Compare button creates snapshot
- [ ] Dual canvas renders
- [ ] Divider drags smoothly
- [ ] Left side frozen, right side live
- [ ] Exit button works

---

## Quick Workflow Test

**Full feature integration test (5 minutes):**

1. Start with stock car
2. Apply "Racing Red" palette
3. Select "Sport Wheels"
4. Set suspension to "Lowered"
5. Apply "Sunset" lighting preset (if HDRI downloaded)
6. Adjust Key Light to 100
7. Click **Compare**
8. Drag divider to see before/after
9. Exit comparison
10. Change paint to "Ocean Blue"
11. Click **Compare** again
12. Verify left shows red, right shows blue
13. Exit and click **Reset**
14. Confirm everything returns to stock

**Pass Criteria:**
- All steps complete without errors
- Smooth transitions throughout
- Comparison accurately shows before/after
- Reset clears all customizations

---

## Need Help?

**Console Errors:** Open browser DevTools (F12) → Console tab
**Performance Issues:** Lower quality settings or disable shadows
**Missing Assets:** Check `/public/models/` and `/public/hdr/` folders
