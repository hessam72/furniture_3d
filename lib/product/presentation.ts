import presentationConfig from '@/public/config/furniture-presentation.json'
import productsConfig from '@/public/config/products.json'
import type { ProductData } from '@/components/store/ProductInteraction'
import type { PartialSun } from '@/components/store/hooks/useStoreConfig'
import type { ZonePaint, ZonePaintConfig } from '@/stores/presentationStore'
import type { SwatchMaps, SwatchSpec, SwatchUv } from '@/lib/three/swatchTextures'
import { type QualityPreset } from '@/lib/config/quality'
import { SURFACE_POLICY, resolveTier, type DeviceClass } from '@/lib/config/deviceTier'
import type { Locale } from '@/i18n/routing'
import { localizeProduct, localizePresentationConfig } from '@/lib/i18n/localize'

/**
 * The independently colourable parts of a piece.
 *
 * On the layered `/product` page the zone is implied by which layer GLB a mesh
 * came from. On `/simple` and `/showroom` there is one file for the whole piece,
 * so the split has to come from inside it — a sofa GLB holds its couch, its
 * cushions and a shawl as separately named groups, and dressing all three in the
 * same cloth is not a configurator. That is what `parts` in the manifest is for.
 * @see PresentationPart
 */
export type PresentationZone = 'wood' | 'cover' | 'cushion' | 'shawl'

/**
 * Every zone, in the order the AR paint tuple encodes them.
 *
 * **Append only.** `encodePaint` writes this array positionally and the result
 * is the cache key for every AR URL ever issued; reordering it would silently
 * repaint old links, and `shawl` is last for exactly that reason.
 * @see lib/ar/arSource.ts
 */
export const PRESENTATION_ZONES: PresentationZone[] = ['wood', 'cover', 'cushion', 'shawl']

export function isPresentationZoneName(value: unknown): value is PresentationZone {
  return PRESENTATION_ZONES.includes(value as PresentationZone)
}

/**
 * One named group inside a single GLB — the couch, its cushions, the shawl.
 *
 * A furniture GLB is not one object. It is a scene graph where the seat, the
 * scatter cushions and a throw each sit under their own node, and a configurator
 * that cannot tell them apart dresses the throw in the same cloth as the frame.
 * This is how the manifest tells them apart, and it is deliberately authored by
 * *name* rather than by material: material names survive `gltf-transform dedup`
 * only by luck, and two parts commonly share one material.
 *
 * Read the names out of your own file rather than guessing them — the loaded
 * tree is printed to the console on any page opened with `?debug`.
 */
export interface PresentationPart {
  /** Stable id, used for the paint slot and the UI row. */
  id: string
  /** Row label in the sheet. */
  label: string
  en?: { label: string }
  /**
   * Which paint zone this part wears. Two parts may share a zone, in which case
   * they change together — that is a choice the manifest makes, not an accident.
   */
  zone: PresentationZone
  /**
   * Node, group or mesh names, case-insensitive substrings.
   *
   * **A match claims the whole subtree.** Naming the group is enough; every mesh
   * under it belongs to the part without being listed, which is what makes this
   * authorable against a real export rather than against a flattened list.
   * A nested part wins over its ancestor, so `cushion` inside `couch` still
   * reads as a cushion.
   */
  objects?: string[]
  /**
   * Material names, as a second, independent rule.
   *
   * Claims a material **wherever it appears**, and wins over `objects` — so it
   * is the sharper tool of the two: use it to pull the piping out of a group
   * that is otherwise all upholstery, or to split an export whose groups were
   * never named usefully in the first place. `objects` is still the one to
   * reach for first, because it survives re-authoring; material names do not
   * always survive `gltf-transform dedup`.
   */
  materials?: string[]
}

export interface ZoneSwatch {
  id: string
  name: string
  /** English override — falls back to `name` (fa) when absent. @see lib/i18n/localize */
  en?: { name: string }
  /**
   * The swatch's colour.
   *
   * Still required, and still what the UI chip is cut in — but for a swatch that
   * carries `maps` it is *not* what lands in `material.color`. `map` is
   * multiplied by `color`, so a textured swatch tinted by its own average colour
   * would be darkened twice; those drive the colour to white and let the image
   * speak. @see swatchPaint
   */
  hex: string
  /** Wood tones carry their own roughness; fabric swatches inherit it from the cover variant */
  roughness?: number
  /**
   * Present → this swatch replaces map slots rather than tinting them, and the
   * piece changes cloth rather than colour. Absent → exactly the behaviour this
   * file has always had. @see lib/three/swatchTextures.ts
   */
  maps?: SwatchMaps
  /**
   * Material-name substrings this swatch dresses, case-insensitive. Mesh names
   * in these exports carry nothing (`rene_sofa-004`), so the upholstery has to
   * be named by its material (`Fabric_1`). Omitted → every material in the zone
   * that has a base map.
   */
  materials?: string[]
  /**
   * UV transform for the swapped maps. Omitted → each slot inherits the
   * transform of the texture it replaces, which keeps a new colour registered
   * with the relief underneath it. `[1, 1]` is how literal 1×1 is asked for.
   */
  repeat?: [number, number]
  offset?: [number, number]
  rotation?: number
  /** Chip image, for a cloth a flat hex misrepresents. Keep it small — a WebP
   *  under ~20KB; it renders at about 32px. */
  thumbnail?: string
}

export interface CoverVariant {
  id: string
  name: string
  en?: { name: string }
  path: string
  /** A lighter stand-in for AR only. @see arModelPath */
  arPath?: string
  thumbnail?: string
  priceDelta?: number
  material?: { roughness?: number; metalness?: number; clearcoat?: number }
  /**
   * Swatches shown only while this variant is the mounted one, replacing
   * `palettes.cover`.
   *
   * Harmless to omit while a swatch is a tint — one hex list dresses any cloth.
   * It stops being harmless once a swatch *is* a cloth: a velvet basecolour
   * dropped onto the leather GLB is not a leather colourway, it is the wrong
   * fabric. @see coverPalette
   */
  palette?: ZoneSwatch[]
}

export interface LayerMeta {
  path: string
  /** A lighter stand-in for AR only. @see arModelPath */
  arPath?: string
  label: string
  desc?: string
  en?: { label?: string; desc?: string }
  /** Substring tested against mesh.name to pick the colourable subset of this layer */
  zoneMatch?: string
}

/**
 * A plinth for the piece to stand on.
 *
 * Not a layer in the sense the other three are — it is scenery, so it is
 * excluded from both of the things a layer takes part in:
 *
 *  - **No colour.** `collectZoneTargets` is never run over it, so no mesh of
 *    its can become a paint target however it is named or tagged. The swatches
 *    dress the piece, and a plinth that changed with them would read as part
 *    of the product.
 *  - **No AR.** AR hands model-viewer the selected cover's own GLB (@see
 *    arModelPath), and the stage is a separate file. What the customer places
 *    in their room is the furniture, not the showroom it was photographed in.
 *
 * It does spin with the piece — see `stageYawRef` in FurnitureStack.
 */
export interface StageMeta {
  path: string
  /**
   * Raise the piece to stand on top of the stage, instead of both sitting on
   * the floor and intersecting. The lift is the stage's own measured height, so
   * a re-exported plinth of a different thickness needs no re-tuning, and the
   * camera framing follows it.
   */
  liftPiece?: boolean
  /** Uniform scale, for a stage exported in the wrong unit. */
  scale?: number
  /** Moved after it is centred under the piece and seated on the floor. */
  offset?: [number, number, number]
  /** envMapIntensity for the stage's materials. Never matted: `matte` protects
   *  the colours the customer picks, and the stage has none. */
  envIntensity?: number
}

export interface CoverLayerMeta {
  label: string
  desc?: string
  en?: { label?: string; desc?: string }
  default: string
  variants: CoverVariant[]
}

/** What stands behind the piece: a photograph, or a modelled room. */
export type RoomMode = 'image' | 'model' | 'none'

export interface PresentationRoom {
  /**
   * Which backdrop to render. Both `image` and `path` can be filled in at once
   * and this is the switch between them — flipping a product from a photograph
   * to a modelled room is a one-word edit. Omit it and whichever of the two is
   * present wins, image first.
   */
  mode?: 'image' | 'model'
  /** Backdrop GLB, used when `mode` is "model". */
  path?: string
  /** Backdrop photograph, used when `mode` is "image" — see PresentationBackdrop. */
  image?: string
  /** How far behind the piece the backdrop plane sits, in metres. Together with
   *  `imageOffsetY` this is how the photographed floor is lined up with the
   *  piece; there is no way to solve that in code. */
  imageDistance?: number
  /** Slides the backdrop photograph up/down, in metres. Raising it brings the
   *  photographed floor line up to meet the piece without moving the piece. */
  imageOffsetY?: number
  /**
   * Seat the room GLB's floor at `floorY`, instead of trusting its authored
   * origin. On by default, and the single most important knob here.
   *
   * `/store` does exactly this to every model it loads — ModelLoader sets
   * `clone.position.y = -box.min.y` — and so does the furniture on this page
   * (FurnitureStack's `centerOffset`). The room was the one thing rendered at
   * whatever origin Blender happened to export, so a GLB whose origin sits at
   * its geometric centre, or at a corner, lands metres away from where the
   * camera is looking. That camera is solved from the *piece's* bounds and
   * cannot walk out of trouble the way /store's player can, so it ends up
   * inside a wall or above the roof and the screen goes black.
   */
  alignFloor?: boolean
  /**
   * Moves the room GLB after `alignFloor`, in metres. For the horizontal
   * placement floor-alignment cannot solve — a room modelled off to one side.
   *
   * Also **where the piece stands in the room**, which is why there is no
   * horizontal offset on the piece itself. The camera aims at the piece's
   * measured centre, which the framing puts at the origin, and the spin turns
   * about the piece's own axes through that same point; slide the piece off it
   * and it sits off the optical axis, where perspective swings its near and far
   * ends across the frame as it turns — rotation in place reads as an orbit.
   * A positive Z here slides the room towards the camera instead, leaving the
   * piece deeper inside it and the geometry that governs the spin untouched.
   */
  offset?: [number, number, number]
  /** Uniform scale on the room GLB, for a model exported in the wrong unit. */
  scale?: number
  /**
   * Render every room mesh from both sides.
   *
   * The escape hatch for a room authored to be seen from outside: with the
   * camera indoors, single-sided walls facing away are culled and the room is
   * invisible or half-there. `/store` applies a narrower version of this to
   * ceiling meshes, which is kept unconditionally.
   */
  doubleSide?: boolean
  hdr?: string
  envIntensity?: number
  /**
   * The world height the model is seated at. Note this will **not** visually
   * move the piece: the camera frames on the piece's measured centre, so it
   * follows `floorY` and the piece stays put on screen. Use `pieceOffsetY`.
   */
  floorY?: number
  /**
   * Stands the piece this far above the floor, in metres — its height *in the
   * room*, and the camera follows it there.
   *
   * The opposite of `pieceOffsetY` in the one way that matters. That one is a
   * screen-space nudge the framing is deliberately blind to, for landing a
   * piece on a photographed floor; this is where the piece actually is, so
   * everything that seats or measures it reads the raised height — a piece
   * lifted in the room has moved, and a camera that ignored it would frame the
   * empty space underneath.
   *
   * Adds to a stage's `liftPiece`, if there is one.
   */
  pieceLift?: number
  /**
   * Moves the piece up (positive) or down on screen, in metres.
   *
   * Deliberately excluded from the camera's framing, which is the whole point —
   * this is the dial for landing the piece on the photographed floor. Push it
   * down too far and it goes behind the bottom sheet; raising `imageOffsetY`
   * instead brings the floor line up to the piece and keeps that clearance.
   */
  pieceOffsetY?: number
  /** Strip every reflection: no IBL, `envMapIntensity` 0, `clearcoat` 0.
   *  On by default — the HDR was tinting the colours the user picks. */
  matte?: boolean
  /**
   * Which lighting model the room is rendered under.
   *
   * `"store"` reproduces /store's setup exactly — ACES Filmic at exposure 0.3,
   * a plain HDR environment at 0.8, and its single overhead point light — and
   * drops the studio rig. Use it for any GLB that was authored and checked in
   * the store scene, which is lit entirely by that environment: under the
   * studio rig such a room has nothing to reflect and renders black.
   *
   * `"studio"` (the default) is this page's own booth rig, tuned for a piece of
   * furniture against a photograph rather than a room.
   */
  lightingMode?: RoomLighting
}

/** @see PresentationRoom.lightingMode */
export type RoomLighting = 'studio' | 'store'

/** /store's renderer settings, reproduced verbatim from Scene.tsx's Canvas. */
export const STORE_RENDER = {
  exposure: 0.3,
  envIntensity: 0.8,
  /** The vitrine point light: `[0,10,-1.5]`, intensity 5, distance 20, decay .7 */
  point: { position: [0, 10, -1.5] as [number, number, number], intensity: 5, distance: 20, decay: 0.7 },
} as const

/** Whether this product draws the sun and, with it, the page's only shadow map. */
export function sunEnabled(config: PresentationConfig): boolean {
  return config.sun?.enabled === true
}

/**
 * This page's own fallback, deliberately not `DEFAULT_QUALITY` — that one is
 * shared with /car and /store, whose costs scale with what the player walks
 * into. A manifest that names a tier still wins outright, up to the device
 * ceiling below.
 */
export const PRESENTATION_DEFAULT_QUALITY: QualityPreset = 'medium'

/**
 * Device classes, tier ceilings and the shadow budget now live in
 * `lib/config/deviceTier` — one resolver, shared by every surface, instead of
 * this file's copy plus the provider's differing one. Re-exported here so the
 * ~10 modules that import them from this path keep working.
 *
 * @see resolveTier, SURFACE_POLICY
 */
export {
  PHONE_QUERY,
  TOUCH_QUERY,
  SHADOW_BUDGET,
  readDeviceClass,
  lowerTier,
  type DeviceClass,
} from '@/lib/config/deviceTier'

/**
 * The tier this product renders at.
 *
 * The app-wide provider drops to `low` under 768px and otherwise restores
 * whatever /car's quality selector last stored — right for a scene you walk
 * around, wrong here. A presentation is one piece in a booth under a camera
 * that only dollies: the frame cost is known up front, so the manifest names
 * the tier and the device only decides which of the two it gets.
 *
 * What it does *not* get to do is name a tier the device cannot hold — the
 * manifest is authored on a desktop and cannot know. @see DEVICE_TIER_CEILING
 */
export function presentationQuality(config: PresentationConfig, device: DeviceClass): QualityPreset {
  const q = config.quality
  const base = q?.preset ?? PRESENTATION_DEFAULT_QUALITY
  const asked = device === 'phone' ? q?.mobile ?? base : base
  return resolveTier({ surface: 'presentation', device, manifest: asked })
}

/**
 * The tier the plain viewer at /product/[id]/simple opens on.
 *
 * Deliberately not `presentationQuality`. That one is a memory budget for a
 * page carrying a room GLB, a 2048² shadow map and an RGBA16F composer chain —
 * none of which exist here. The tier on the simple viewer buys DPR and
 * anisotropy and nothing else, so a phone can honestly hold more than `low`,
 * and a desktop should not inherit a `preset` that was dialled down to keep
 * phones alive on the heavy page.
 *
 * What changed: it used to be uncapped, on that same argument. The argument is
 * right about the page and wrong about the picker — every rung here is
 * affordable except the one that puts a handset on DPR 2. The `viewer` ceiling
 * is that line. @see SURFACE_POLICY
 */
export const SIMPLE_VIEWER_QUALITY = SURFACE_POLICY.viewer.fallback

/**
 * The one GLB a plain viewer shows, when the manifest does not name one.
 *
 * The cover variant *is* the finished piece — the layer ladder on the full page
 * hides the frame at step 1 and shows the cover alone — so a viewer that wants
 * "the product" wants this file. A product that ships no cover variants falls
 * back to the frame, which is then all there is of it.
 */
export function finishedPiecePath(config: PresentationConfig): string {
  return findCoverVariant(config, config.layers.cover.default)?.path ?? config.layers.frame.path
}

/**
 * The file AR should place in the room, for the layer the viewer is showing.
 *
 * Falls through to the displayed model wherever no `arPath`/`arModel` is
 * authored, so declaring nothing changes nothing. What it buys where it *is*
 * authored is the one thing no amount of code can do at runtime: fewer
 * triangles. iOS Quick Look is reached through three's USDZ exporter, which
 * writes geometry as decimal text into a zip it does not compress — so a
 * high-poly piece is tens of megabytes of ASCII whatever its textures weigh,
 * and the only cure is a decimated file.
 *
 * `layer` is the same string the page and the API route both key on: `frame`
 * for the bare frame, a cover variant id, or anything else — `null` included —
 * for the finished piece.
 *
 * Deliberately a *static path* rather than a model built in the browser: the
 * runtime export crashed real phones mid-"preparing", and Scene Viewer refuses
 * blob URLs outright. `/simple` layers colour on top of this file server-side
 * (@see app/api/ar/[key]/model.glb); the other surfaces serve it as authored.
 */
export function arModelPath(config: PresentationConfig, layer: string | null): string | null {
  // `""` counts as unset, not as a path. The fields sit in the manifest empty,
  // waiting for a file that may never be authored, and `??` alone would hand an
  // empty string to the route as a real answer.
  const authored = (path: string | undefined) => (path && path.trim() ? path : null)

  if (layer === 'frame') return authored(config.layers.frame.arPath) ?? config.layers.frame.path
  const variant = findCoverVariant(config, layer)
  if (variant) return authored(variant.arPath) ?? variant.path

  const finished = authored(config.simple?.arModel) ?? finishedPiecePath(config)
  // A product with no cover variants falls back to the frame, which is not a
  // product to place in a room — the caller's published GLB stands in instead.
  return finished === config.layers.frame.path ? null : finished
}

/**
 * The `simple` block: everything /product/[id]/simple draws, as a manifest.
 *
 * Every field is optional and every default is the value the page shipped with,
 * so a product with no `simple` block renders exactly as before. What the block
 * buys is a product presented on its own terms — a piece photographed against
 * warm grey rather than white, a longer lens for a wardrobe, its own HDR — with
 * none of it touching the full presentation page, which reads a different part
 * of the same manifest.
 */
export interface SimpleViewerMeta {
  /** The GLB to show. Omitted → the finished piece. @see finishedPiecePath */
  model?: string
  /** A lighter stand-in for AR only, used when no cover variant is showing.
   *  @see arModelPath */
  arModel?: string
  /** Image-based light. Omitted → `room.hdr`; `null` to render with the studio
   *  fill alone, for a product whose materials are meant to be read flat. */
  hdr?: string | null
  /** Strength of the environment. Omitted → `room.envIntensity`, then the tier's. */
  envIntensity?: number
  /** Backdrop, and the canvas clear colour with it. Meant for a studio ground —
   *  white, off-white, a warm grey; the page's own chrome is light-themed and
   *  would not read over a dark one. */
  background?: string
  /**
   * A vertical gradient sweep behind the piece, instead of the flat void
   * `background` alone draws. Omitted → `background` at both stops with no
   * vignette, which is pixel-for-pixel what an unauthored product rendered
   * before this existed. @see ViewerBackdrop
   */
  backdrop?: { top?: string; bottom?: string; vignette?: number }
  /**
   * The frozen contact shadow under the piece. Omitted → the defaults below,
   * chosen to look right on a white or near-white ground — which is what
   * every product renders on until `backdrop` says otherwise.
   */
  ground?: { blur?: number; opacity?: number; far?: number }
  /**
   * Vertical field of view.
   *
   * Long by default. A wide lens bows straight edges, which is the first thing
   * a buyer notices on a piece of furniture and the last thing you want on a
   * product shot — so this goes *up* only for a piece that has to be shot from
   * close in.
   */
  fov?: number
  /**
   * Breathing room around the fitted piece, as a multiple of the just-fits
   * distance.
   *
   * Small by default, because the fit is solved against the piece's bounding
   * *sphere* — the only measure that cannot clip at some angle of a free orbit —
   * and a sphere is a generous bound for anything that is not round, so most
   * pieces already carry margin this number never sees. Raise it for a piece
   * that reads cramped, which usually means a genuinely round one.
   */
  padding?: number
  /** Dolly clamps, as multiples of the framed distance. */
  minZoom?: number
  maxZoom?: number
  /**
   * The studio fill over the top of the HDR. Not a sun: nothing here casts, so
   * there is still no shadow pass and no shadow map.
   *
   * `key` gives the piece its form where an interior HDR alone would leave it
   * flat, `fill` opens the shaded side, and `ambient` keeps that side off pure
   * black against a white ground. Zero any of them for a piece that should be
   * read by the environment alone.
   *
   * Same six keys as `PresentationConfig.lighting`, not by coincidence — this
   * is the same rig, stripped. `rim`, `bounce` and `hemi` default to 0, so a
   * product that has not authored them renders exactly as before these
   * existed: no cool edge light, no floor bounce, no hemisphere fill.
   */
  lighting?: { ambient?: number; key?: number; fill?: number; rim?: number; bounce?: number; hemi?: number }
  /** Opening tier, per device. The on-screen picker overrides it either way.
   *  @see SIMPLE_VIEWER_QUALITY */
  quality?: { preset?: QualityPreset; mobile?: QualityPreset }
}

export interface ResolvedSimpleViewer {
  model: string
  hdr: string | null
  envIntensity?: number
  background: string
  fov: number
  padding: number
  minZoom: number
  maxZoom: number
  lighting: { ambient: number; key: number; fill: number; rim: number; bounce: number; hemi: number }
  backdrop: { top: string; bottom: string; vignette: number }
  ground: { blur: number; opacity: number; far: number }
}

/** The `simple` block with every default filled in, in the shape of
 *  `floorReflection` and `galleryLighting`. */
export function simpleViewer(config: PresentationConfig): ResolvedSimpleViewer {
  const s = config.simple ?? {}
  const background = s.background ?? '#ffffff'
  return {
    model: s.model ?? finishedPiecePath(config),
    // `null` is a deliberate "no environment", so only `undefined` falls through.
    hdr: s.hdr === null ? null : s.hdr ?? config.room.hdr ?? null,
    // Left undefined so the viewer can fall back to the quality tier's value,
    // which the manifest has no business knowing.
    envIntensity: s.envIntensity ?? config.room.envIntensity,
    background,
    fov: s.fov ?? 35,
    padding: s.padding ?? 1.1,
    minZoom: s.minZoom ?? 0.35,
    maxZoom: s.maxZoom ?? 2.6,
    lighting: {
      ambient: s.lighting?.ambient ?? 0.35,
      key: s.lighting?.key ?? 1.1,
      fill: s.lighting?.fill ?? 0.35,
      rim: s.lighting?.rim ?? 0,
      bounce: s.lighting?.bounce ?? 0,
      hemi: s.lighting?.hemi ?? 0,
    },
    backdrop: {
      top: s.backdrop?.top ?? background,
      bottom: s.backdrop?.bottom ?? background,
      vignette: s.backdrop?.vignette ?? 0,
    },
    ground: {
      blur: s.ground?.blur ?? 2.6,
      opacity: s.ground?.opacity ?? 0.45,
      far: s.ground?.far ?? 2.2,
    },
  }
}

/**
 * The tier the plain viewer opens on: the manifest's, else the device default.
 *
 * Uncapped, unlike `presentationQuality`. There is no ceiling to enforce
 * because there is nothing here to overrun one — no shadow map, no composer,
 * no second scene render — so the tier moves DPR and anisotropy and stops.
 */
export function simpleViewerQuality(config: PresentationConfig, device: DeviceClass): QualityPreset {
  const q = config.simple?.quality
  const base = q?.preset ?? SIMPLE_VIEWER_QUALITY[device]
  const asked = device === 'phone' ? q?.mobile ?? base : base
  return resolveTier({ surface: 'viewer', device, manifest: asked })
}

/**
 * Seeds every zone from the first swatch of its palette, so the piece opens in
 * a real, sellable finish rather than whatever the GLB happened to ship with.
 *
 * Shared by the full presentation and the plain viewer: both put the same piece
 * on screen in the same opening colours, and a swatch picked on one page means
 * the same thing on the other.
 */
export function defaultPaint(config: PresentationConfig): ZonePaintConfig {
  const cover = findCoverVariant(config, config.layers.cover.default)
  // Same helper selectCover uses, so the opening finish and every later swap
  // are described the same way.
  const surface = coverSurface(config, cover)
  const first = (zone: PresentationZone) =>
    zone === 'cover' ? coverPalette(config, cover)[0] : config.palettes[zone]?.[0]

  // `swatchPaint` rather than a bare hex, so the page opens with a swatch
  // *identity* the UI can highlight and the texture path can act on. A palette
  // that carries no entry for a zone falls back to the hard-coded hex, which is
  // the shape this had before swatches had ids at all.
  const seed = (zone: PresentationZone, fallback: ZonePaint): ZonePaint => {
    const swatch = first(zone)
    return swatch ? { ...fallback, ...swatchPaint(swatch, fallback.roughness) } : fallback
  }

  return {
    wood: seed('wood', { color: '#c8a06a', roughness: 0.55, metalness: 0, clearcoat: 0 }),
    cover: seed('cover', { color: '#36454f', ...surface }),
    cushion: seed('cushion', { color: '#e8e0d2', roughness: 0.8, metalness: 0, clearcoat: 0 }),
    // A throw is a loose woven thing, so it opens rougher than the upholstery.
    // Only ever seen on a piece whose `parts` claim a shawl group; everything
    // else leaves this zone with nothing assigned to it.
    shawl: seed('shawl', { color: '#b4b0a8', roughness: 0.95, metalness: 0, clearcoat: 0 }),
  }
}

export function lightingMode(config: PresentationConfig): RoomLighting {
  return config.room.lightingMode ?? 'studio'
}

/**
 * Room-scale accent lighting, for when the backdrop is a modelled room.
 *
 * The studio rig is authored in absolute metres around a piece at the origin —
 * fixtures at 5–8m with `decay: 2`, in cones under 35° wide. That lights a sofa
 * in a void perfectly and leaves a room almost entirely unlit: anything outside
 * those cones sees only ambient, and inverse-square drops what does reach the
 * walls to nothing. So every value here is a *multiplier* on a rig solved from
 * the room's measured bounds, never a distance — a 3m room and a 9m one both
 * come out lit without re-tuning by hand.
 */
export interface GalleryLighting {
  /** Defaults to on whenever the backdrop is a modelled room. */
  enabled?: boolean
  /** Ceiling track fixtures. Each one is a real light in every material's
   *  shader loop, so this is capped at 6 and 3 is usually plenty. */
  spots?: number
  /** Multiplier on the solved track intensity. 0 turns the track off. */
  track?: number
  /** Multiplier on the back-wall wash. 0 turns it off. */
  wash?: number
  /** Cone half-angle of a track fixture, radians. Wider = flatter, softer. */
  angle?: number
  /** Fixture colour. Gallery track is warm white by convention. */
  color?: string
}

export interface ResolvedGallery {
  enabled: boolean
  spots: number
  track: number
  wash: number
  angle: number
  color: string
}

/** Gallery rig settings with every default filled in. */
export function galleryLighting(config: PresentationConfig): ResolvedGallery {
  const g = config.lighting?.gallery ?? {}
  return {
    enabled: g.enabled ?? roomMode(config) === 'model',
    spots: Math.max(0, Math.min(Math.round(g.spots ?? 3), 6)),
    track: g.track ?? 1,
    wash: g.wash ?? 1,
    angle: g.angle ?? 0.6,
    color: g.color ?? '#fff2df',
  }
}


export interface PresentationConfig {
  room: PresentationRoom
  /** `soft` is optional: a product can ship as frame + cover alone.
   *  `startStep` is the layer the page opens on — 1, the finished piece, unless
   *  set to 0 to open on the bare frame. */
  layers: {
    frame: LayerMeta
    soft?: LayerMeta
    cover: CoverLayerMeta
    /** Scenery under the piece: spins with it, takes no colour, never ships to
     *  AR. Omit for a piece that stands on the room floor. @see StageMeta */
    stage?: StageMeta
    startStep?: 0 | 1
  }
  palettes: Partial<Record<PresentationZone, ZoneSwatch[]>>
  /**
   * The named groups inside the piece's GLB, and which zone each one wears.
   *
   * Omitted → the old behaviour exactly: the whole file is one zone, dressed as
   * a single cloth. Present → the sheet shows one swatch row per part and each
   * changes on its own. @see PresentationPart
   */
  parts?: PresentationPart[]
  /**
   * Framing is expressed as angles and ratios, never absolute metres. The rig
   * derives the actual distance from the piece's measured bounds and the live
   * canvas aspect — a fixed distance frames a portrait phone and a desktop
   * window completely differently, because `fov` is vertical.
   */
  camera: {
    /** Orbit angle around Y, degrees. 0 looks straight at the front. */
    azimuthDeg: number
    /** Height angle above the piece's centre, degrees. */
    elevationDeg: number
    /** Vertical field of view. */
    fov: number
    near?: number
    far?: number
    /** Multiplier on the just-fits distance; >1 leaves breathing room. */
    padding?: number
    /** Dolly clamps, as multiples of the framed distance. */
    minZoom?: number
    maxZoom?: number
    /**
     * Where the dolly opens, as a fraction of how far back it can go — 0.9 to
     * start at 90% of the way out. Omit to open at the framed distance.
     *
     * A fraction of the *achievable* limit, not of `maxZoom`: a modelled room's
     * wall can cut the range short, and 90% of a distance the room never allows
     * would be a different shot on every product.
     */
    startZoom?: number
    /** How far a vertical drag can tip the piece, ±degrees. 36 is a tenth of a
     *  full turn — enough to show the seat and the underside, short of tumbling. */
    tiltLimitDeg?: number
    /**
     * Clearance kept between the camera and the room's bounding box, metres.
     * Raise it for a room whose box reaches past its usable floor.
     */
    wallMargin?: number
    /**
     * Hard cap on how far back the camera may travel, metres.
     *
     * The room clamp measures against the GLB's *bounding box*, and for a booth
     * authored front-facing only — no geometry behind the static camera, which
     * is where its download savings come from — the box reaches well past the
     * built walls and ceiling. Inside the box and outside the room looks
     * exactly like flying out through the back of it. The box cannot know
     * where the modelled part ends; this is how you tell it.
     *
     * Zoom-out past this point is not lost, it is spent on `maxFov` instead.
     */
    maxDistance?: number
    /**
     * Ceiling on the field of view the rig may open up to when the room is too
     * shallow to frame the piece from — a portrait phone needs roughly twice
     * the pull-back a desktop window does, and a booth rarely has it.
     *
     * Set equal to `fov` to refuse the widening and take the crop instead.
     * @see PresentationGestures
     */
    maxFov?: number
    /**
     * Where on the piece the dolly converges, as a fraction of its height —
     * 0 its base, 0.5 its centre, 1 its top.
     *
     * The camera rides a ray at a fixed elevation, so its height above the aim
     * point is `sin(elevation) × distance`: zoom in and that shrinks to nothing,
     * leaving the camera at the aim point's own height. Aimed at the geometric
     * centre, a close dolly therefore ends up at seat level, looking at a sofa
     * from below its top edge. Aiming higher up the piece is what keeps the
     * shot above it all the way in.
     *
     * The piece stays put on screen as this moves: the lens shift re-solves
     * per distance to keep the piece's *centre* in the middle of the band the
     * sheet leaves, whatever the camera is aimed at. @see PresentationGestures
     */
    aimHeight?: number
    /** Pushes the piece up-screen by this fraction of the *viewport height*,
     *  clearing the bottom sheet. Expressed against the viewport rather than
     *  the model so the same value frames a tall wardrobe and a low table
     *  alike. Implemented by aiming below the piece's centre. */
    screenLift?: number
  }
  lighting?: {
    key: number
    fill: number
    rim: number
    bounce: number
    ambient: number
    hemi?: number
    gallery?: GalleryLighting
  }
  /**
   * Window sunlight and its PCSS soft shadow — /store's `sun` block, verbatim,
   * so a `?sundebug=1` printout pastes straight in.
   *
   * Absent, or `enabled: false`, and the page renders with no shadow maps at
   * all, which is what it did before this existed and still the right default:
   * a shadow pass re-renders the scene from the *light's* frustum and so
   * ignores the camera culling the trimmed, front-facing-only room is built
   * around. Turn it on for a room that actually has a window worth the cost.
   *
   * Only `shadow` differs from /store in how it is read: leave the four
   * bounds out and the frustum is fitted to the measured room every time it
   * loads, instead of being hand-tuned per product. @see PresentationSun.
   */
  sun?: PartialSun
  /** Render tier, pinned per product rather than per device. @see presentationQuality */
  quality?: {
    preset?: QualityPreset
    mobile?: QualityPreset
    /**
     * Force screen-space ambient occlusion on or off, over the tier's
     * `enableN8AO`. Off on every tier but ultra, because N8AO haloes off a
     * large silhouette and the halo reads as a shadow floating behind the
     * piece; the sun's own contact shadow grounds it instead.
     */
    ao?: boolean
  }
  /** Everything /product/[id]/simple draws. Read by that page alone — the full
   *  presentation ignores it entirely. @see SimpleViewerMeta */
  simple?: SimpleViewerMeta
  explode?: { gap: number; durationMs: number }
  wipe?: { durationMs: number }
}

const CONFIGS = presentationConfig as unknown as Record<string, PresentationConfig>
const PRODUCTS = productsConfig as unknown as Record<string, ProductData>

/** Every product key that has a presentation entry — the SSG param source. */
export function presentationKeys(): string[] {
  return Object.keys(CONFIGS).filter((key) => key in PRODUCTS)
}

export function hasPresentation(key: string | null | undefined): boolean {
  return !!key && key in CONFIGS && key in PRODUCTS
}

export interface ResolvedPresentation {
  key: string
  product: ProductData
  config: PresentationConfig
}

/**
 * Joins showroom catalogue metadata with the 3D presentation config, and
 * resolves every translatable field (product facts, layer labels, cover
 * variants, swatch names, part labels) to `locale` — `fa` by default, so the
 * many callers that never pass one keep the exact behaviour they always had.
 */
export function resolvePresentation(key: string, locale: Locale = 'fa'): ResolvedPresentation | null {
  const config = CONFIGS[key]
  const product = PRODUCTS[key]
  if (!config || !product) return null
  return {
    key,
    product: localizeProduct(product, locale),
    config: localizePresentationConfig(config, locale),
  }
}

export function findCoverVariant(config: PresentationConfig, id: string | null): CoverVariant | null {
  if (!id) return null
  return config.layers.cover.variants.find((v) => v.id === id) ?? null
}

/** Base price plus the active cover's delta. */
export function totalPrice(product: ProductData, variant: CoverVariant | null): number {
  return (product.price ?? 0) + (variant?.priceDelta ?? 0)
}

/**
 * The surface character a cover variant imposes on the `cover` zone.
 *
 * One source of truth: the paint store, CoverLayer and the AR export all have
 * to agree, and they did not — the store kept the *default* variant's
 * roughness after a swap, so useZonePaint damped velvet straight back to
 * leather's 0.45 and the wool read as leather.
 */
export function coverSurface(
  config: PresentationConfig,
  variant: CoverVariant | null
): { roughness: number; metalness: number; clearcoat: number } {
  return {
    roughness: variant?.material?.roughness ?? 0.6,
    metalness: variant?.material?.metalness ?? 0,
    clearcoat: isMatte(config) ? 0 : variant?.material?.clearcoat ?? 0,
  }
}

/**
 * Everything the `cover` zone should become when a variant is selected.
 *
 * The variant's surface character, plus — where the variant brings its own
 * palette — its opening swatch. Without that second half, picking leather while
 * a velvet swatch was active would leave the velvet *texture* on a piece whose
 * palette no longer offers it, and no chip would light up.
 */
export function coverSelection(config: PresentationConfig, id: string | null): Partial<ZonePaint> {
  const variant = findCoverVariant(config, id)
  const surface = coverSurface(config, variant)
  // Only a variant that carries its own list reseeds; a shared palette means the
  // swatch the customer picked is still on offer and should survive the swap.
  const opening = variant?.palette?.[0]
  return opening ? { ...surface, ...swatchPaint(opening) } : surface
}

/**
 * A swatch by id, from the palette that zone actually shows.
 *
 * The AR route's only way to turn a query parameter into a file: `tex` names a
 * swatch, the manifest names the texture. Same lock `layer` has — no request can
 * reach a path the manifest has not published.
 */
export function findSwatch(
  config: PresentationConfig,
  zone: PresentationZone,
  id: string | null | undefined,
  coverId?: string | null
): ZoneSwatch | null {
  if (!id) return null
  const palette =
    zone === 'cover' ? coverPalette(config, findCoverVariant(config, coverId ?? null)) : config.palettes[zone] ?? []
  // A variant's own palette replaces the shared one, so a swatch may be reachable
  // under one cover and not another. Fall back to the shared list rather than
  // 400-ing a swatch the manifest genuinely publishes.
  return palette.find((swatch) => swatch.id === id) ?? config.palettes[zone]?.find((s) => s.id === id) ?? null
}

/** Whether a swatch dresses the piece in a different cloth or just tints it. */
export function isTextureSwatch(swatch: ZoneSwatch | null | undefined): boolean {
  return !!swatch?.maps && Object.values(swatch.maps).some(Boolean)
}

/** A swatch's UV override, or null to inherit the replaced slot's transform. */
export function swatchUv(swatch: ZoneSwatch): SwatchUv | null {
  if (!swatch.repeat && !swatch.offset && swatch.rotation === undefined) return null
  return { repeat: swatch.repeat, offset: swatch.offset, rotation: swatch.rotation }
}

/** The render layer's view of a swatch, resolved from the manifest. */
export function swatchSpec(swatch: ZoneSwatch): SwatchSpec | null {
  if (!isTextureSwatch(swatch)) return null
  return { id: swatch.id, maps: swatch.maps!, materials: swatch.materials, uv: swatchUv(swatch) }
}

/**
 * A swatch, as the paint store holds it.
 *
 * The one place a swatch becomes state, because two of the three fields are easy
 * to get wrong in isolation:
 *
 *  - **`color` is white for a textured swatch.** `map` is multiplied by `color`,
 *    so passing the swatch's own hex through would darken every fabric by its
 *    own average colour.
 *  - **`maps` must be set to null, not omitted.** `setPaint` merges, so a plain
 *    colour swatch picked after a textured one has to actively clear the maps or
 *    the old cloth stays on the piece.
 *
 * `roughnessFallback` exists because the two callers disagreed before this
 * helper did: `ProductSheet` left roughness alone when a swatch carried none,
 * `ShowroomFeatured` forced 0.6. Passing it preserves the showroom's look
 * exactly rather than quietly restyling it.
 */
export function swatchPaint(swatch: ZoneSwatch, roughnessFallback?: number): Partial<ZonePaint> {
  const textured = isTextureSwatch(swatch)
  const roughness = swatch.roughness ?? roughnessFallback
  return {
    swatchId: swatch.id,
    color: textured ? '#ffffff' : swatch.hex,
    maps: textured ? swatch.maps! : null,
    materials: textured ? swatch.materials ?? null : null,
    uv: textured ? swatchUv(swatch) : null,
    ...(roughness !== undefined ? { roughness } : {}),
  }
}

/** Every swatch across every zone, the mounted variant's palette included. */
function allSwatches(config: PresentationConfig): ZoneSwatch[] {
  const variants = config.layers.cover.variants.flatMap((variant) => variant.palette ?? [])
  const zones = PRESENTATION_ZONES
  return [...zones.flatMap((zone) => config.palettes[zone] ?? []), ...variants]
}

/** The maps the page opens with — what `defaultPaint` seeds each zone from. */
export function openingSwatchMaps(config: PresentationConfig): SwatchMaps[] {
  const cover = findCoverVariant(config, config.layers.cover.default)
  const zones = PRESENTATION_ZONES
  return zones
    .map((zone) => (zone === 'cover' ? coverPalette(config, cover)[0] : config.palettes[zone]?.[0]))
    .filter((swatch): swatch is ZoneSwatch => isTextureSwatch(swatch))
    .map((swatch) => swatch.maps!)
}

/** Everything else, for the desktop-only idle warm. Deduped by `map`, since a
 *  family shares its normal and the cache would collapse them anyway. */
export function restSwatchMaps(config: PresentationConfig): SwatchMaps[] {
  const opening = new Set(openingSwatchMaps(config).map((maps) => maps.map))
  const seen = new Set<string>()
  return allSwatches(config)
    .filter(isTextureSwatch)
    .map((swatch) => swatch.maps!)
    .filter((maps) => {
      const key = maps.map ?? ''
      if (opening.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/**
 * The cover swatches to show for the mounted variant.
 *
 * A variant's own `palette` replaces the shared list rather than extending it —
 * the same rule the showroom's `covers` override already follows, and for the
 * same reason: a list that mixed both would offer finishes this cloth does not
 * come in.
 */
export function coverPalette(config: PresentationConfig, variant: CoverVariant | null): ZoneSwatch[] {
  return variant?.palette ?? config.palettes.cover ?? []
}

/**
 * Whether reflections are stripped for this product. Defaults to on.
 *
 * Except under store lighting, where the environment is the only real light in
 * the scene: zeroing `envMapIntensity` there does not make the upholstery matte,
 * it makes it unlit. Store mode therefore requires matte to be asked for.
 */
export function isMatte(config: PresentationConfig): boolean {
  if (lightingMode(config) === 'store') return config.room.matte === true
  return config.room.matte !== false
}

/**
 * Whether the scene needs an HDR environment loaded.
 *
 * Matte does not mean "no environment": it means the furniture takes none, and
 * that is enforced per-material. A modelled room is authored to be lit by an
 * environment, so it needs one whether or not the furniture is matte.
 */
export function needsEnvironment(config: PresentationConfig): boolean {
  if (!config.room.hdr) return false
  // Store mode *is* the environment — it has no other fill light worth the name.
  if (lightingMode(config) === 'store') return true
  return !isMatte(config) || roomMode(config) === 'model'
}

/**
 * The backdrop actually in play.
 *
 * An explicit `mode` wins, but only if that mode's asset is configured — a
 * `mode: "model"` with no `path` falls back rather than rendering nothing, so a
 * half-finished manifest still shows the piece.
 */
export function roomMode(config: PresentationConfig): RoomMode {
  const { mode, image, path } = config.room
  if (mode === 'image' && image) return 'image'
  if (mode === 'model' && path) return 'model'
  if (image) return 'image'
  if (path) return 'model'
  return 'none'
}

/** Every asset the page needs before it can render anything meaningful. The
 *  backdrop is whichever of image/GLB this product actually uses. */
export function requiredAssets(config: PresentationConfig): string[] {
  const cover = findCoverVariant(config, config.layers.cover.default)
  const mode = roomMode(config)
  // Probe only the backdrop in use — an unused `path` left in the manifest for
  // easy switching must not block the page.
  const backdrop = mode === 'image' ? config.room.image : mode === 'model' ? config.room.path : undefined
  return [
    config.layers.frame.path,
    config.layers.soft?.path,
    config.layers.stage?.path,
    cover?.path,
    backdrop,
    // The Environment has no error boundary of its own, so a missing HDR would
    // hang behind a Suspense fallback rather than say what is wrong.
    needsEnvironment(config) ? config.room.hdr : undefined,
  ].filter((p): p is string => !!p)
}
