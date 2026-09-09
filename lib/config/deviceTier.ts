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
 * `presentation` ignores the stored choice on purpose. Its tier comes from the
 * product's manifest — a booth under a fixed camera has a cost that is known up
 * front and the same on every device — and a picker on another page has no
 * business moving it.
 */
export const SURFACE_POLICY: Record<RenderSurface, SurfacePolicy> = {
  presentation: {
    // Not a taste setting: the page's memory budget, and the fix for /product
    // killing iPhones while /store — a far bigger scene — did not. At `high` a
    // phone took DPR 1.75 (3x the pixels, and every full-screen pass with
    // them), a 2048² shadow map (~32MB on its own) and an RGBA16F composer
    // chain sized to those pixels, all at once. Past what iOS Safari lets a
    // WebGL page hold, so the context went and the tab reloaded — repeatedly,
    // since the retry came back at the same tier.
    ceiling: { phone: 'low', tablet: 'medium', desktop: 'ultra' },
    fallback: { phone: 'medium', tablet: 'medium', desktop: 'medium' },
    honoursStored: false,
  },
  viewer: {
    ceiling: { phone: 'medium', tablet: 'high', desktop: 'ultra' },
    fallback: { phone: 'medium', tablet: 'high', desktop: 'high' },
    honoursStored: true,
  },
  walkthrough: {
    ceiling: { phone: 'low', tablet: 'medium', desktop: 'ultra' },
    fallback: { phone: 'low', tablet: DEFAULT_QUALITY, desktop: DEFAULT_QUALITY },
    honoursStored: true,
  },
}

/** One key, shared by every surface that honours it. Kept under its original
 *  name: renaming it would silently reset everyone for no gain now that reads
 *  are capped. */
const STORAGE_KEY = 'car-quality-preset'

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
}

export interface TierRequest {
  surface: RenderSurface
  device: DeviceClass
  /** What the product's manifest asked for, if this surface has one. */
  manifest?: QualityPreset | null
  /** The remembered picker choice. Ignored where `honoursStored` is false. */
  stored?: QualityPreset | null
  /** Rungs surrendered to a lost context. Applied last, below the ceiling. */
  downgrades?: number
}

/**
 * The effective tier: what was asked for, clamped to what the device can hold.
 *
 * `stored ?? manifest ?? fallback`, capped, then lowered by `downgrades`. The
 * order is the policy: a person's explicit choice outranks the manifest, the
 * manifest outranks the default, and the device outranks all three.
 */
export function resolveTier({ surface, device, manifest, stored, downgrades = 0 }: TierRequest): QualityPreset {
  const policy = SURFACE_POLICY[surface]
  const asked = (policy.honoursStored ? stored : null) ?? manifest ?? policy.fallback[device]
  return lowerTier(capTier(asked, policy.ceiling[device]), downgrades)
}
