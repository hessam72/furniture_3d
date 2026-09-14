/**
 * Which render tier a device is allowed, and who gets to ask.
 *
 * The pieces were right and the wiring was not. `DEVICE_TIER_CEILING` lived in
 * `lib/product/presentation.ts` and only `/product` consulted it; the app-wide
 * provider had its own, different idea of what a phone is; and the tier the
 * chips write is one key shared by every surface. So the ceiling was reachable
 * three ways round:
 *
 *  - **The picker escaped.** `QualityChips` on `/product/[id]/simple` — a page
 *    with no shadow map, no composer and no second scene render, where every
 *    rung genuinely is affordable — wrote `ultra` into the shared key. `/store`
 *    then read that key, took the stored branch, and *skipped its phone
 *    downgrade entirely*: DPR 2, 4x MSAA on an RGBA16F chain, N8AO, a 2048²
 *    shadow map, 24 point lights, two of them casting cube shadows.
 *  - **Landscape read as a tablet.** The provider tested `innerWidth < 768`,
 *    while everything else in the codebase uses PHONE_QUERY's short-side test
 *    precisely because an iPhone in landscape is ~852 across and ~390 tall.
 *  - **The plain viewer had no ceiling at all** — `simpleViewerQuality` capped
 *    nothing, by design, on the argument that the page is cheap. The page is
 *    cheap; `ultra` on a phone is not.
 *
 * One resolver now, and it **caps on read**. Capping in `setPreset` would look
 * equivalent and would not be: real users already have `ultra` sitting in
 * localStorage from the shipped build, and a write-side cap would let those
 * values go on escaping to the heavy page forever.
 */

import { DEFAULT_QUALITY, QUALITY_PRESETS, type QualityPreset } from '@/lib/config/quality'
import type { GpuClass } from '@/lib/three/gpuClass'

/**
 * Media query for "a phone", as opposed to a tablet or a small window.
 *
 * Two conditions, and both are load-bearing. `pointer: coarse` separates touch
 * hardware from a desktop browser someone has dragged narrow — the desktop
 * keeps the desktop tier at any window size. The **short side** under 768px
 * then separates a phone from a tablet, in either orientation: an iPad is 768
 * across even in portrait, while a phone in landscape is ~430 tall. Testing
 * width alone gets that one backwards.
 */
export const PHONE_QUERY = '(pointer: coarse) and ((max-width: 767px) or (max-height: 767px))'

/**
 * Touch hardware of any size, phone or tablet.
 *
 * Deliberately wider than PHONE_QUERY. That one picks which *tier* a product is
 * authored for, and a tablet can honestly take the desktop one. This picks
 * whether the composer may allocate a 4x-multisampled RGBA16F buffer, and no
 * mobile GPU can — an iPad at the `high` tier's DPR is ~3MP, which is ~97MB for
 * that one target. @see PresentationPostProcessing
 */
export const TOUCH_QUERY = '(pointer: coarse)'

/** What class of hardware is drawing this page. @see readDeviceClass */
export type DeviceClass = 'desktop' | 'tablet' | 'phone'

/**
 * Resolve the device class from the two queries above.
 *
 * Safe to call during a server render — it answers `desktop`, which is what the
 * page's first (server) paint is anyway, and the client settles it before the
 * canvas mounts. Inside the Canvas, which is `dynamic(..., { ssr: false })`, it
 * can be read synchronously in a `useState` initialiser.
 */
export function readDeviceClass(): DeviceClass {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  if (window.matchMedia(PHONE_QUERY).matches) return 'phone'
  if (window.matchMedia(TOUCH_QUERY).matches) return 'tablet'
  return 'desktop'
}

/** Cheapest first — the ladder every cap and downgrade below walks. */
const TIER_LADDER: QualityPreset[] = ['low', 'medium', 'high', 'ultra']

/** Clamp a tier to a ceiling, on the ladder above. */
export function capTier(tier: QualityPreset, ceiling: QualityPreset): QualityPreset {
  const at = TIER_LADDER.indexOf(tier)
  const max = TIER_LADDER.indexOf(ceiling)
  return at > max ? ceiling : tier
}

/** Step a tier down the ladder, never below `low`. @see useContextRecovery. */
export function lowerTier(tier: QualityPreset, steps: number): QualityPreset {
  if (steps <= 0) return tier
  return TIER_LADDER[Math.max(0, TIER_LADDER.indexOf(tier) - steps)]
}

/** Every rung at or below a ceiling — what a picker is allowed to offer. */
export function tiersUpTo(ceiling: QualityPreset): QualityPreset[] {
  return TIER_LADDER.slice(0, TIER_LADDER.indexOf(ceiling) + 1)
}

/**
 * Shadow work a device may be asked for, independent of the tier.
 *
 * Separate from the ceilings below because it is the one cost the tier does not
 * describe honestly: drei's PCSS patch bakes `samples` into the global shadow
 * chunk, so every shadow-receiving fragment in the room pays a blocker search
 * *plus* a PCF loop of that many taps. The manifests ask for 16, which is a
 * desktop number — on a phone it is the single most expensive thing on screen.
 */
export const SHADOW_BUDGET: Record<DeviceClass, { resolution: number; samples: number }> = {
  phone: { resolution: 512, samples: 8 },
  tablet: { resolution: 1024, samples: 12 },
  desktop: { resolution: Infinity, samples: Infinity },
}

/**
 * Which of the app's render budgets a page is spending.
 *
 *  - `presentation` — /product/[id]. A room GLB, a PCSS shadow pass and an
 *    RGBA16F composer chain. The most expensive thing the app draws.
 *  - `viewer` — /product/[id]/simple, /showroom/[slug], /view/[id]. One GLB on
 *    a flat ground: no shadow map, no composer, no second scene render, so the
 *    tier only moves DPR and anisotropy.
 *  - `walkthrough` — /store. A walkable room with physics, lamps and a sun,
 *    whose cost scales with what the visitor walks into.
 */
export type RenderSurface = 'presentation' | 'viewer' | 'walkthrough'

interface SurfacePolicy {
  /** The highest tier this surface may hand this device, whatever is asked. */
  ceiling: Record<DeviceClass, QualityPreset>
  /** What it opens on when neither a manifest nor a stored choice says. */
  fallback: Record<DeviceClass, QualityPreset>
  /** Whether the remembered picker choice applies here at all. */
  honoursStored: boolean
}

/**
 * The ceilings, per surface.
 *
 * The three differ because the pages differ, and flattening them would be the
 * wrong fix: `/product`'s phone ceiling is `low` because that page allocates a
 * shadow map and a composer, and the plain viewer's is `medium` because it
 * allocates neither. What none of them may be is `ultra` on a handset.
 *
 * **Every surface honours the stored choice**, and the ceiling is what keeps
 * that safe. `presentation` briefly did not, on the reasoning that its tier is
 * the manifest's and a picker elsewhere has no business moving it — which
 * overlooked that `/product/[id]` has a picker of its own, in its top bar
 * (`QualitySelector` in `PresentationTopBar`). The result was a control that
 * wrote the tier and a resolver that discarded it: the buttons moved and
 * nothing happened. The manifest is the *default* here, not the authority.
 *
 * What that reasoning was actually protecting against — a tier chosen on the
 * cheap viewer following the visitor onto the heavy page — is already handled,
 * and handled better, by capping on read. A desktop visitor who asked for
 * `ultra` gets it because a desktop holds it; a phone gets `low` whatever they
 * asked for.
 */
export const SURFACE_POLICY: Record<RenderSurface, SurfacePolicy> = {
  presentation: {
    /**
     * Every rung, on every device — and the reason is that the tier is no
     * longer what holds this page inside its budget.
     *
     * It used to be. At `high` a phone took DPR 1.75 (3x the pixels, and every
     * full-screen pass with them), a 2048² shadow map and an RGBA16F composer
     * chain sized to those pixels, all at once, which is past what iOS lets a
     * WebGL page hold. Capping the tier was the only lever there was.
     *
     * There are now three better ones, and each bounds its own cost per device
     * rather than bundling them into one word:
     *
     *  - the drawing buffer, and the composer chain sized to it, by an absolute
     *    pixel budget — @see clampDprToBudget, COMPOSER_PIXEL_WEIGHT
     *  - the shadow map, by @see SHADOW_BUDGET, which the tier cannot raise
     *  - MSAA and AO, switched off outright on touch — @see
     *    PresentationPostProcessing
     *
     * With those in place `ultra` on a phone buys anisotropy 16 and a DPR the
     * budget has already approved. That is a taste setting, which is what a
     * picker should be offering; the memory is held somewhere the customer
     * cannot overspend it.
     */
    ceiling: { phone: 'ultra', tablet: 'ultra', desktop: 'ultra' },
    fallback: { phone: 'medium', tablet: 'high', desktop: 'high' },
    honoursStored: true,
  },
  viewer: {
    // The cheapest surface in the app — one GLB on a ground, no shadow map, no
    // composer, no second scene render — so if `presentation` can offer every
    // rung then this certainly can. Capping it lower than the heavy page would
    // be incoherent. Here the tier moves DPR (budget-capped) and anisotropy.
    ceiling: { phone: 'ultra', tablet: 'ultra', desktop: 'ultra' },
    fallback: { phone: 'medium', tablet: 'high', desktop: 'high' },
    honoursStored: true,
  },
  walkthrough: {
    /**
     * Still capped, and deliberately the odd one out.
     *
     * /store is the one surface whose `ultra` costs something no per-device
     * budget catches: `lampMaxLights: 24` real point lights with
     * `lampShadowCasters: 2` casting cube shadows, and a 1024² MeshReflector
     * that re-renders the whole scene every drawn frame. None of that scales
     * with DPR, so the pixel budget never sees it — and a walkable room's cost
     * is a function of what the visitor walks into, which is not known up front.
     * Until those have ceilings of their own, this one stays.
     */
    ceiling: { phone: 'medium', tablet: 'medium', desktop: 'ultra' },
    fallback: { phone: 'medium', tablet: DEFAULT_QUALITY, desktop: DEFAULT_QUALITY },
    honoursStored: true,
  },
}

/** One key, shared by every surface that honours it. Kept under its original
 *  name: renaming it would silently reset everyone for no gain now that reads
 *  are capped. */
const STORAGE_KEY = 'car-quality-preset'

/**
 * The remembered choice, as an external store rather than a plain read.
 *
 * It has to be a store because of hydration. `/product/[id]` is statically
 * prerendered, and the page chrome inside its provider — `QualitySelector`'s
 * `aria-checked` and its selected-tier classes — is server-rendered from the
 * tier. Read `localStorage` straight into a `useState` initialiser and the
 * server's HTML (no storage, so the manifest tier) disagrees with the client's
 * first render (the stored tier), React throws away the whole tree with
 * "Hydration failed because the initial UI does not match", and the picker
 * stops responding because the handlers went with it.
 *
 * `useSyncExternalStore` is the shape that fixes it: `getServerSnapshot`
 * answers `null` during hydration so both renders agree, and React re-reads
 * immediately afterwards and re-renders with the real value. The canvases are
 * all `dynamic(ssr: false)` and mount after that, so they still size their
 * buffers from the right tier on their first frame.
 */
let cached: QualityPreset | null | undefined
const tierListeners = new Set<() => void>()

function notifyTier() {
  cached = undefined
  tierListeners.forEach((listener) => listener())
}

export function subscribeStoredTier(listener: () => void): () => void {
  tierListeners.add(listener)
  // Another tab, sharing the same key. Cheap to honour, and confusing not to.
  if (typeof window !== 'undefined') window.addEventListener('storage', notifyTier)
  return () => {
    tierListeners.delete(listener)
    if (typeof window !== 'undefined' && tierListeners.size === 0) {
      window.removeEventListener('storage', notifyTier)
    }
  }
}

/**
 * Cached, because `useSyncExternalStore` compares snapshots with `Object.is`
 * and calls this more than once per render.
 */
export function getStoredTier(): QualityPreset | null {
  if (cached !== undefined) return cached
  cached = readStoredTier()
  return cached
}

/** Always `null` — @see the note above on why this may not read storage. */
export function getStoredTierOnServer(): QualityPreset | null {
  return null
}

export function readStoredTier(): QualityPreset | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored && stored in QUALITY_PRESETS ? (stored as QualityPreset) : null
  } catch {
    // Private mode, or storage disabled. Not knowing is the same as no choice.
    return null
  }
}

export function writeStoredTier(tier: QualityPreset): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, tier)
  } catch {
    /* the choice simply does not survive the session */
  }
  cached = tier
  tierListeners.forEach((listener) => listener())
}

/**
 * The ceiling a measured GPU imposes, over and above the device class.
 *
 * The device class says how big the screen is and whether it is touched. It
 * cannot say how old the hardware is, and a 2012 iPad and an M4 iPad Pro are
 * both `tablet`. `low` is what the oldest thing that can still run WebGL2
 * holds. @see lib/three/gpuClass
 */
const WEAK_GPU_CEILING: QualityPreset = 'low'

export interface TierRequest {
  surface: RenderSurface
  device: DeviceClass
  /** What the product's manifest asked for, if this surface has one. */
  manifest?: QualityPreset | null
  /** The remembered picker choice. Ignored where `honoursStored` is false. */
  stored?: QualityPreset | null
  /** Rungs surrendered to a lost context. Applied last, below the ceiling. */
  downgrades?: number
  /** What the hardware itself measured, when a probe has run. `weak` caps to
   *  `low` whatever the surface would otherwise allow. @see readGpuClass */
  gpu?: GpuClass
}

/**
 * The effective tier: what was asked for, clamped to what the device can hold.
 *
 * `stored ?? manifest ?? fallback`, capped, then lowered by `downgrades`. The
 * order is the policy: a person's explicit choice outranks the manifest, the
 * manifest outranks the default, and the device outranks all three — with the
 * measured GPU outranking even the device, because the device class is a guess
 * about hardware made from the size of a window and this is not a guess.
 */
export function resolveTier({
  surface,
  device,
  manifest,
  stored,
  downgrades = 0,
  gpu,
}: TierRequest): QualityPreset {
  const policy = SURFACE_POLICY[surface]
  const asked = (policy.honoursStored ? stored : null) ?? manifest ?? policy.fallback[device]
  const capped = capTier(asked, policy.ceiling[device])
  const held = gpu === 'weak' ? capTier(capped, WEAK_GPU_CEILING) : capped
  return lowerTier(held, downgrades)
}
