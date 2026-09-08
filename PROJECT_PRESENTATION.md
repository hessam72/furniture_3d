# راهنمای ارائه پروژه - مصاحبه React/Next.js

## 🎯 پروژه چیست؟

**شهر امید** - یک showroom مجازی مبلمان با قابلیت:
- مشاهده 3D محصولات با تغییر رنگ real-time
- پیاده‌روی در فروشگاه مجازی (first-person)
- پیش‌نمایش AR در موبایل
- Configurator ماشین (bonus feature)

**Tech Stack:**
Next.js 14 • React 18 • TypeScript • Three.js • Zustand • Tailwind 4

---

## 📁 معماری کلی پروژه

### ساختار اصلی
```
app/              → Pages (Next.js App Router)
components/       → React Components
lib/              → Business Logic & Utils
stores/           → Zustand Stores
hooks/            → Custom Hooks
contexts/         → React Contexts
public/           → Static Assets (models, configs)
```

### تصمیم معماری: جداسازی مسئولیت‌ها

**چرا این ساختار؟**
- `components/` فقط UI rendering
- `lib/` تمام business logic و calculations
- `stores/` state management مرکزی
- `hooks/` reusable logic برای components

**مزیت:**
- Testability بالا (logic جدا از UI)
- Reusability (hooks قابل استفاده در چند component)
- Maintainability (تغییر logic بدون دست زدن به UI)

---

## 🗺️ Routing Strategy

### App Router (Next.js 14)

```
/                          Landing page
/product/[id]              Dynamic route محصول
/product/[id]/simple       Nested route (fallback)
/showroom/[slug]           SSG brand pages
/store                     Static route
/ar                        Static route
```

### تصمیمات Routing:

#### 1. Dynamic Routes با `[id]`
**چرا؟** محصولات از JSON config می‌خوانند، نه database
```tsx
// app/product/[id]/page.tsx
export default function Page({ params }: { params: { id: string } })
```

**مزیت:**
- یک component برای همه محصولات
- URL-based state (share link)
- SEO-friendly

#### 2. Static Generation برای Showrooms
```tsx
export async function generateStaticParams() {
  return showrooms.map(s => ({ slug: s.slug }))
}
```

**چرا SSG؟**
- تعداد محدود برندها (10-20)
- محتوا static است
- Performance بهتر از SSR

#### 3. Client-Side Navigation
از `next/link` و `useRouter` برای SPA experience

**چرا؟** بدون page reload، smooth transitions

---

## 🔄 State Management: Zustand vs Context

### تصمیم: کی از کدام استفاده کنیم؟

#### ✅ Zustand - Application State
```typescript
// stores/presentationStore.ts
- رنگ محصول
- لایه فعال (frame/cover/soft)
- وضعیت explode
- paint config
```

**چرا Zustand؟**
- State بین چندین component share می‌شود
- نیاز به update از event handlers (button click)
- DevTools برای debugging
- سبک‌تر از Redux (1KB)

**مثال استفاده:**
- کاربر در `PresentationSheet` رنگ انتخاب می‌کند
- `ProductCover` component باید re-render شود
- بدون prop drilling

#### ✅ Context API - Infrastructure State
```tsx
// contexts/QualityContext.tsx
- Quality tier (desktop/tablet/phone)
- Canvas settings
- WebGL capabilities
```

**چرا Context؟**
- کل app نیاز به این settings دارد
- یک‌بار set می‌شود، کمتر update
- Provider در root layout

**مثال:**
```tsx
// app/layout.tsx
<QualityProvider>
  {children}
</QualityProvider>
```

#### ❌ useState - Local State
```tsx
// فقط در همان component نیاز است
const [isHovered, setIsHovered] = useState(false)
```

### جدول تصمیم‌گیری:

| Scenario | انتخاب | دلیل |
|----------|--------|------|
| رنگ محصول بین 5 component | Zustand | Shared state |
| Quality settings در root | Context | Infrastructure |
| Hover state یک button | useState | Local |
| Animation progress | useRef | High-frequency (60fps) |

---

## 🎣 Custom Hooks - چرا و کجا؟

### Pattern: استخراج Logic از Components

#### 1. `useClipWipe` - Clipping Plane Animation
**مشکل:** Component باید هر frame clipping plane update کند
**راه‌حل:** Hook با `useFrame` از R3F

**چرا Hook؟**
- Logic پیچیده (matrix math)
- قابل استفاده در چند layer
- Test کردن راحت‌تر

#### 2. `useZonePaint` - Color Interpolation
**مشکل:** تغییر رنگ فوری ugly است
**راه‌حل:** Lerp با damping

**چرا Hook؟**
- هر zone (wood/cover/cushion) نیاز دارد
- `useRef` برای 60fps بدون re-render
- Reusable logic

#### 3. `useAssetProbe` - Asset Pre-check
**مشکل:** 404 در GLTF = white screen
**راه‌حل:** Pre-flight check قبل از Canvas

**چرا Hook؟**
- Async logic (fetch)
- Loading/error states
- Component stays clean

### مقایسه: با Hook vs بدون Hook

**بدون Hook (❌ Bad):**
```tsx
function ProductCover() {
  // 50 خط lerp logic
  // 30 خط clipping plane math
  // 20 خط asset loading
  // + UI rendering
  // = 150 خط غیرقابل test
}
```

**با Hook (✅ Good):**
```tsx
function ProductCover() {
  useClipWipe(meshRef, wipeProgress)
  useZonePaint(meshRef, 'cover', targetColor)

  return <mesh ref={meshRef} />
  // = 5 خط، clean، testable
}
```

---

## ⚛️ React Patterns استفاده شده

### 1. Server Components vs Client Components

#### Server Components (پیش‌فرض)
```tsx
// app/product/[id]/page.tsx
export default function Page() {
  const config = loadConfig() // روی سرور
  return <ProductViewer config={config} />
}
```

**مزیت:**
- Bundle size کوچک‌تر
- Data fetching روی server
- SEO بهتر

#### Client Components (با `'use client'`)
```tsx
'use client'
// components/product/PresentationCanvas.tsx
```

**چه موقع Client Component؟**
- نیاز به browser APIs (`window`, `canvas`)
- Event handlers (onClick, onHover)
- React hooks (useState, useEffect)
- Three.js (حتماً client)

### 2. Dynamic Imports با SSR Disable

**مشکل:** Three.js در SSR crash می‌کند (نیاز به `window`)

**راه‌حل:**
```tsx
const Canvas = dynamic(
  () => import('./Canvas'),
  { ssr: false }
)
```

**مزیت:**
- Bundle splitting
- فقط client load می‌شود
- Initial page load سریع‌تر

### 3. Error Boundaries

**منطق:** یک layer خراب = کل scene خراب نشود

```tsx
<PartErrorBoundary layer="frame">
  <ProductFrame />
</PartErrorBoundary>

<PartErrorBoundary layer="cover">
  <ProductCover />
</PartErrorBoundary>
```

**سناریو:**
- `cover.glb` خراب است → error UI نشان بده
- `frame.glb` و `soft.glb` همچنان render شوند

### 4. Memo برای Performance

**کجا از memo استفاده شد؟**
```tsx
export const PresentationRoom = memo(({ config }) => {
  // Scene setup که تغییر نمی‌کند
})
```

**چرا؟**
- Parent component (Canvas) هر frame re-render می‌شود
- Room setup static است
- بدون memo = هر frame rebuild scene

### 5. useRef برای High-Frequency State

**مشکل:** `useState` → re-render → 60 re-render/sec

**راه‌حل:**
```tsx
const colorRef = useRef(new Color())

useFrame(() => {
  colorRef.current.lerp(target, 0.1)
  mesh.material.color.copy(colorRef.current)
  // بدون re-render component
})
```

**چرا useRef؟**
- Animation smooth (هر frame update)
- بدون re-render overhead
- Performance بهتر

---

## 🚀 Next.js Features استفاده شده

### 1. App Router (نه Pages Router)

**چرا App Router؟**
- Server Components
- Layout nesting
- Route handlers
- Streaming با Suspense

### 2. Metadata Generation

```tsx
export async function generateMetadata({ params }) {
  const product = getProduct(params.id)
  return {
    title: product.name,
    description: product.description,
    openGraph: { images: [product.image] }
  }
}
```

**مزیت:** SEO dynamic بدون third-party library

### 3. Static Asset Optimization

```tsx
// public/models/ با Cache-Control: max-age=31536000
```

**منطق:**
- GLB files immutable هستند
- Browser cache برای 1 سال
- Re-deploy = نام فایل تغییر می‌کند

### 4. TypeScript Integration

**همه جا type-safe:**
- Props با interface
- Config files با type
- Store state با type
- API responses با type

---

## 🎨 CSS/Styling Strategy

### Tailwind CSS 4

**چرا Tailwind؟**
- Utility-first = سریع‌تر
- Tree-shaking = bundle کوچک
- RTL support (Persian)

**مثال RTL:**
```tsx
<div className="pr-4 text-right" dir="rtl">
  {persianText}
</div>
```

### Component Co-location

```
components/product/
├── ProductFrame.tsx
├── ProductFrame.module.css  // اگر نیاز به custom CSS
```

**منطق:** Style در کنار component = maintainability

---

## 🏗️ Data Flow Architecture

### Config-Driven Design

```
JSON Config (public/)
    ↓
TypeScript Resolver (lib/)
    ↓
Zustand Store (stores/)
    ↓
React Component (components/)
```

**مثال:**
```
furniture-presentation.json
    ↓
furniture-presentation.ts (resolver)
    ↓
presentationStore.ts (state)
    ↓
PresentationSheet.tsx (UI)
```

**مزیت:**
- تغییر config بدون code change
- Validation در resolver
- Type safety با TypeScript

---

## 💡 تصمیمات کلیدی معماری

### 1. چرا Layered Assets؟

**قبل:** یک `product.glb` = 50MB
**بعد:** `frame.glb` + `soft.glb` + `cover-red.glb` = 15MB

**مزیت:**
- تغییر cover بدون reload frame
- Memory usage پایین
- Parallel loading

### 2. چرا Demand Rendering؟

**قبل:** 60fps همیشه = battery drain
**بعد:** 0fps idle, 60fps فقط حین animation

```tsx
<Canvas frameloop="demand">
```

**کی invalidate می‌کنیم?**
- User interaction (drag, click)
- Color animation در حال اجرا
- Layer transition

### 3. چرا Quality Tiers؟

**Desktop:** N8AO + Bloom + MSAA
**Tablet:** SSAO + SMAA
**Phone:** فقط SMAA

**منطق:**
- iPhone 15 ≠ iPhone 8
- Automatic downgrade بعد از crash
- User experience > visual fidelity

### 4. چرا Pre-built AR Assets؟

**قبل:** Runtime export از Three.js scene → crash
**بعد:** Pre-built GLB/USDZ files → stable

**دلیل:**
- Mobile memory محدود
- Serialization expensive
- Production stability

---

## 📊 Performance Optimizations

### 1. Code Splitting
- Dynamic import برای Three.js
- Route-based splitting automatic
- Lazy load postprocessing effects

### 2. Asset Optimization
- Draco compression (50-80% کاهش)
- Progressive loading (frame → cover → soft)
- Texture compression

### 3. Rendering Optimization
- Frustum culling (Three.js)
- Demand rendering
- Adaptive DPR
- Memo برای static subtrees

### 4. State Optimization
- useRef برای animations
- Zustand با selective subscriptions
- Debounce برای expensive operations

---

## 🎤 چگونه ارائه کنیم؟

### 1. شروع با Problem Statement (2 دقیقه)
"فروشگاه‌های مبلمان مشکل دارند: مشتری باید حضوری بیاید. ما یک showroom مجازی ساختیم با 3D و AR."

### 2. Tech Stack Justification (3 دقیقه)
- **Next.js App Router** - چرا؟ SSG + Server Components
- **Zustand نه Redux** - چرا؟ سبک‌تر، همین کافی بود
- **Three.js** - چرا؟ وب‌سایت، نه native app
- **TypeScript** - چرا؟ Production code needs safety

### 3. Architecture Deep Dive (5 دقیقه)
- Folder structure چرا این طوری؟
- State management strategy (Zustand vs Context vs useState)
- Routing strategy (SSG vs dynamic)
- Component patterns (Server vs Client)

### 4. یک Challenge + Solution (3 دقیقه)
**انتخاب یکی:**

**Option A: Mobile AR Crashes**
- مشکل: Runtime export → OOM
- راه‌حل: Pre-built assets
- نتیجه: Zero crashes

**Option B: Battery Drain**
- مشکل: 60fps always
- راه‌حل: Demand rendering
- نتیجه: 60x reduction

**Option C: Visual Jank**
- مشکل: Color jumps
- راه‌حل: Lerp با useRef
- نتیجه: Smooth 60fps

### 5. Demo (2 دقیقه)
- نشان بده live product viewer
- تغییر رنگ
- Layer transition
- AR preview (اگر موبایل داری)

### 6. Q&A
آماده باش برای:
- "چرا Zustand نه Context API؟"
- "SSR یا CSR؟"
- "Performance در mobile؟"
- "Scalability?"

---

## 📝 سوالات متداول + پاسخ‌های آماده

### Q: چرا Zustand به جای Redux؟
**A:** Redux برای complex async flows عالی است. این پروژه state ساده دارد (رنگ، layer، explode). Zustand 1KB است، Redux 8KB. کمتر boilerplate، همان قابلیت DevTools.

### Q: SSG یا SSR یا CSR؟
**A:**
- **SSG** برای showroom pages (static content)
- **CSR** برای 3D Canvas (نیاز به browser APIs)
- **Hybrid** در `/product/[id]` (SSR برای metadata, CSR برای Canvas)

### Q: Performance در mobile چطور است؟
**A:** Quality tier system. iPhone 8 با settings پایین render می‌کند، iPhone 15 با full quality. Context loss detection برای crash recovery. Demand rendering برای battery.

### Q: چطور scale می‌کند؟
**A:**
- محصولات از JSON config (add کردن راحت)
- Components reusable (car configurator همان pattern)
- Folder structure modular (add feature = add folder)

### Q: Security considerations?
**A:**
- Type safety با TypeScript
- Input validation در resolvers
- CSP headers برای XSS
- CORS برای asset loading

### Q: Testing strategy?
**A:** (اگر نداری، بگو future improvement)
- Unit tests برای `lib/` utils
- Integration tests برای stores
- E2E با Playwright برای user flows

---

## 🎯 Key Takeaways برای مصاحبه‌گر

این پروژه نشان می‌دهد:

✅ **Modern React/Next.js Mastery**
- App Router, Server Components, Dynamic Imports

✅ **Thoughtful Architecture**
- State management strategy واضح
- Separation of concerns
- Config-driven design

✅ **Performance-First Mindset**
- Demand rendering, Code splitting, Quality tiers

✅ **Production Ready**
- Error handling, Type safety, Mobile optimization

✅ **Problem Solving**
- Real-world challenges (memory, battery, crashes)
- Practical solutions با measurable results

---

**موفق باشی! این پروژه رو با اعتماد به نفس ارائه بده 🚀**
