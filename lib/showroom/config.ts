import showroomsConfig from '@/public/config/showrooms-page.json'
import { hasPresentation, resolvePresentation, type ResolvedPresentation } from '@/lib/product/presentation'
import type { PlinthSpec } from '@/components/product/ViewerPlinth'

/**
 * A brand's own homepage, served from JSON.
 *
 * One entry per showroom in `public/config/showrooms-page.json`; `slug` is the
 * URL (`/showroom/<slug>`) and everything else on the page — copy, images,
 * links, which product the inline viewer dresses — is a field of that entry.
 * Adding a brand is a JSON entry and nothing else: the route is static-generated
 * from `showroomSlugs()`.
 */

export type IconName =
  | 'pin' | 'phone' | 'clock' | 'mail' | 'vr' | 'sofa' | 'tag' | 'truck'
  | 'cube' | 'headset' | 'rotate' | 'ar' | 'layers' | 'palette'

export interface ShowroomLink {
  label: string
  href: string
}

export interface ShowroomCta extends ShowroomLink {
  /** `solid` is the navy pill, `outline` the hairline one. */
  variant?: 'solid' | 'outline'
  icon?: IconName
}

export interface IconLine {
  icon: IconName
  text: string
}

export interface ShowroomConfig {
  slug: string
  brand: {
    monogram: string
    name: string
    nameFa: string
    latinTagline?: string
    /** Replaces the monogram + wordmark lockup when set. */
    logo?: string | null
  }
  seo?: { title?: string; description?: string }
  nav: {
    links: ShowroomLink[]
    search?: boolean
    cta?: ShowroomLink
  }
  hero: {
    eyebrow?: string
    title: string
    subtitle?: string
    description?: string
    image?: string | null
    imageAlt?: string
    contact?: IconLine[]
    ctas?: ShowroomCta[]
    video?: { label: string; note?: string; href?: string }
    /** The vertical latin column down the outer edge of the hero. */
    sideText?: string[]
    scrollLabel?: string
  }
  stats: { icon: IconName; value: string; label?: string; note?: string }[]
  featured: {
    index?: string
    total?: string
    /** `\n` splits the stacked latin label. */
    eyebrow?: string
    category?: string
    title: string
    description?: string
    /**
     * Key into `furniture-presentation.json` — the same manifest
     * /product/[id] and /product/[id]/simple read. The inline viewer draws its
     * cover variants, its palette and its AR export from it, so a product with
     * no entry there cannot be featured.
     */
    presentationKey: string
    chips?: { icon: IconName; label: string }[]
    colorLabel?: string
    coverLabel?: string
    frameLabel?: string
    arLabel?: string
    rotateHint?: { value: string; label: string }
    cta?: ShowroomLink
    specsLabel?: string
    specs?: { label: string; value: string }[]
    /** The plinth under the piece. `path` points at your own stage GLB; with
     *  none, a procedural one is drawn. Omit the block for no stage at all. */
    stage?: PlinthSpec
  }
  virtual: {
    eyebrow?: string
    title: string
    description?: string
    cta?: ShowroomCta
    image?: string | null
    imageAlt?: string
    imageCaption?: string
    imageNote?: string
    imageBadge?: string[]
    /** The isometric floor-plan aside. No image → a drawn placeholder. */
    map?: { image?: string | null; label?: string }
  }
  collection: {
    eyebrow?: string
    title: string
    description?: string
    addLabel?: string
    items: {
      id: string
      category?: string
      name: string
      image?: string | null
      href?: string
      badge?: string | null
      colors?: string[]
    }[]
  }
  closing?: {
    platform?: { name: string; tagline?: string; logo?: string | null }
    eyebrow?: string
    title: string
    description?: string
    cta?: ShowroomLink
    image?: string | null
    sideText?: string[]
  }
  footer?: {
    about?: string
    columns?: { title: string; links: ShowroomLink[] }[]
    contact?: { title: string; items: IconLine[] }
    social?: ShowroomLink[]
    copyright?: string
  }
}

const SHOWROOMS = (showroomsConfig as unknown as { showrooms: ShowroomConfig[] }).showrooms

/** Every slug with an entry — the SSG param source. */
export function showroomSlugs(): string[] {
  return SHOWROOMS.map((showroom) => showroom.slug)
}

export interface ResolvedShowroom {
  config: ShowroomConfig
  /** The featured piece's manifest, or null when the key names no product.
   *  The section then falls back to its still frame rather than 404ing the page. */
  presentation: ResolvedPresentation | null
}

export function resolveShowroom(slug: string): ResolvedShowroom | null {
  const config = SHOWROOMS.find((showroom) => showroom.slug === slug)
  if (!config) return null

  const key = config.featured.presentationKey
  return {
    config,
    presentation: hasPresentation(key) ? resolvePresentation(key) : null,
  }
}
