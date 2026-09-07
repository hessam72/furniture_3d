import showroomsConfig from '@/public/config/showrooms-page.json'
import {
  hasPresentation,
  resolvePresentation,
  type CoverVariant,
  type PresentationZone,
  type ResolvedPresentation,
  type ZoneSwatch,
} from '@/lib/product/presentation'
import type { QualityPreset } from '@/lib/config/quality'
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

/**
 * The showroom's own 3D block: which files its inline viewer mounts and how it
 * draws them.
 *
 * The section still names a `presentationKey`, because the piece's price, its
 * AR fallback GLB and its copy live in the product manifest — but nothing the
 * *canvas* shows has to come from there any more. Every field here overrides
 * the manifest for this showroom alone, and every one is optional: leave the
 * block out and the section renders exactly as the product does, name a single
 * field and only that changes.
 *
 * The stage is the sibling of this block, `featured.stage` — scenery rather
 * than the piece. @see PlinthSpec
 */
export interface ShowroomViewer {
  /** The bare frame, shown by the structure toggle. */
  frame?: { path: string; label?: string }
  /** The cover variants the toggle offers. Given, they *replace* the
   *  manifest's list rather than extending it, so the showroom can show one
   *  finish of a product that sells four. */
  covers?: CoverVariant[]
  /** Which cover the section opens on. Omitted → the first of `covers`, else
   *  the manifest's default. */
  defaultCover?: string
  /** Swatch sets, per zone. Only the zones named are replaced — `wood` dresses
   *  the frame, `cover` the upholstery. */
  palettes?: Partial<Record<PresentationZone, ZoneSwatch[]>>
  /** Image-based light. `null` renders under the studio fill alone. */
  hdr?: string | null
  envIntensity?: number
  /** Canvas ground. Omitted → `STAGE_BG`, the colour the CSS plate is cut in. */
  background?: string
  /** Vertical field of view. Long reads flatter, which suits furniture. */
  fov?: number
  /** Breathing room around the fitted piece. The stage adds its own on top. */
  padding?: number
  minZoom?: number
  maxZoom?: number
  /** The studio fill over the HDR. Nothing here casts a shadow. */
  lighting?: { ambient?: number; key?: number; fill?: number }
  /** Opening render tier, per device. */
  quality?: { preset?: QualityPreset; mobile?: QualityPreset }
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
    /** Which part of the photograph survives the crop, as an `object-position`
     *  value — `left center` unless the render wants otherwise. */
    imageFocus?: string
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
    /** Wording where the device cannot enter AR — the same file, spun on
     *  screen instead of placed in the room. */
    arPreviewLabel?: string
    rotateHint?: { value: string; label: string }
    cta?: ShowroomLink
    specsLabel?: string
    specs?: { label: string; value: string }[]
    /** The plinth under the piece. `path` points at your own stage GLB; with
     *  none, a procedural one is drawn. Omit the block for no stage at all. */
    stage?: PlinthSpec
    /** The showroom's own files and viewer settings, overriding the product
     *  manifest field by field. @see ShowroomViewer */
    viewer?: ShowroomViewer
  }
  virtual: {
    eyebrow?: string
    title: string
    description?: string
    cta?: ShowroomCta
    image?: string | null
    imageAlt?: string
    /** Which part of the photograph survives the crop, as an `object-position`
     *  value — `left center` unless the render wants otherwise. */
    imageFocus?: string
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

/** Copy across only the keys the showroom actually named, so `undefined` in the
 *  JSON never overwrites a manifest value with nothing. `null` is a value —
 *  `hdr: null` is a deliberate "no environment" and must survive. */
function defined<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined)) as Partial<T>
}

/**
 * The manifest this showroom's viewer actually reads: the product's, with the
 * showroom's own `featured.viewer` laid over it.
 *
 * Done here rather than in the section so there is one merged config and no
 * component has to decide which of two sources a given field came from —
 * `findCoverVariant`, `defaultPaint` and the AR export all keep working on a
 * plain `PresentationConfig`. @see ShowroomViewer
 */
function withShowroomViewer(
  presentation: ResolvedPresentation | null,
  viewer: ShowroomViewer | undefined
): ResolvedPresentation | null {
  if (!presentation || !viewer) return presentation

  const { config } = presentation
  const covers = viewer.covers?.length ? viewer.covers : config.layers.cover.variants

  return {
    ...presentation,
    config: {
      ...config,
      layers: {
        ...config.layers,
        frame: { ...config.layers.frame, ...(viewer.frame ? defined(viewer.frame) : {}) },
        cover: {
          ...config.layers.cover,
          variants: covers,
          // A replaced list cannot keep the manifest's default id — it may name
          // a variant this showroom does not carry.
          default: viewer.defaultCover ?? (viewer.covers?.length ? covers[0].id : config.layers.cover.default),
        },
      },
      palettes: { ...config.palettes, ...(viewer.palettes ? defined(viewer.palettes) : {}) },
      // The `simple` block is what SimpleViewer draws from, and the showroom
      // embeds that same viewer. @see SimpleViewerMeta
      simple: {
        ...config.simple,
        // `background` is deliberately not merged here: the section's canvas
        // ground is the plate it is cut into, not the product's, so it is
        // applied by ShowroomStage over its own STAGE_BG default.
        ...defined({
          hdr: viewer.hdr,
          envIntensity: viewer.envIntensity,
          fov: viewer.fov,
          padding: viewer.padding,
          minZoom: viewer.minZoom,
          maxZoom: viewer.maxZoom,
          lighting: viewer.lighting,
          quality: viewer.quality,
        }),
      },
    },
  }
}

export function resolveShowroom(slug: string): ResolvedShowroom | null {
  const config = SHOWROOMS.find((showroom) => showroom.slug === slug)
  if (!config) return null

  const key = config.featured.presentationKey
  const presentation = hasPresentation(key) ? resolvePresentation(key) : null
  return { config, presentation: withShowroomViewer(presentation, config.featured.viewer) }
}
