/**
 * The URL of the configured piece, as a string both the page and the API route
 * agree on.
 *
 * Why a URL and not a blob: Android's Scene Viewer fetches the model itself and
 * refuses `blob:`, which is what `supportsBlobAR()` in lib/device-utils.ts was
 * working around — by quietly falling back to the *static, uncustomised* file on
 * every Android phone without WebXR. A real URL removes the workaround and the
 * fallback with it. iOS gains from it too: Safari is not holding the whole model
 * in the page's heap while Quick Look runs.
 *
 * No `three` import — this is read by app/api/ar/[key]/model.glb/route.ts.
 */

import {
  PRESENTATION_ZONES,
  isPresentationZoneName,
  type PresentationSource,
  type PresentationZone,
} from '@/lib/product/presentation'
import type { ZonePaint, ZonePaintConfig } from '@/stores/presentationStore'

/** A chosen fabric per zone, by swatch id. Zones wearing a plain colour, or
 *  nothing at all, are simply absent. */
export type SwatchSelection = Partial<Record<PresentationZone, string>>

/** The wire order. Append-only — @see PRESENTATION_ZONES. */
const ZONES = PRESENTATION_ZONES

/** Long enough for every zone's paint, short enough that a hand-edited URL
 *  cannot make the route parse megabytes. */
export const MAX_PAINT_PARAM_LENGTH = 512

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/**
 * The paint, in a fixed key order.
 *
 * The order is the point: the URL is the cache key, both in the browser's HTTP
 * cache and in the route's own, so the same configuration has to produce the
 * same string every time.
 */
export function encodePaint(paint: ZonePaintConfig): string {
  const ordered = ZONES.map((zone) => {
    const p = paint[zone]
    return p ? [p.color, p.metalness, p.roughness, p.clearcoat] : null
  })
  return toBase64Url(JSON.stringify(ordered))
}

const HEX = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/** Strictly the inverse of `encodePaint`. Anything else is `null` — the route
 *  answers 400 rather than guessing at a half-valid configuration. */
export function decodePaint(raw: string | null): ZonePaintConfig | null {
  if (!raw || raw.length > MAX_PAINT_PARAM_LENGTH) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(raw))
  } catch {
    return null
  }
  // A shorter tuple is a URL issued before a zone was appended, not a malformed
  // one. `shawl` went on the end precisely so indices 0-2 keep their meaning and
  // links already in a customer's history — or a browser cache, for a year —
  // still resolve to the piece they described. Longer than we know about is
  // still a reject: that is a newer build's URL, and guessing at it is worse
  // than a 400.
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > ZONES.length) return null

  const out = {} as ZonePaintConfig
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i]
    if (entry === null) continue
    if (!Array.isArray(entry) || entry.length !== 4) return null
    const [color, metalness, roughness, clearcoat] = entry
    if (typeof color !== 'string' || !HEX.test(color)) return null
    if (!unit(metalness) || !unit(roughness) || !unit(clearcoat)) return null
    out[ZONES[i]] = { color, metalness, roughness, clearcoat } satisfies ZonePaint
  }
  return out
}

export function isPresentationZone(value: string | null): value is PresentationZone {
  return isPresentationZoneName(value)
}

/** A swatch id, as a URL token. The route still resolves it against the
 *  palette — this only keeps a hand-edited URL from reaching the lookup. */
const SWATCH_ID = /^[A-Za-z0-9_.-]{1,64}$/

/** Long enough for every zone's swatch id, short enough to bound the parse. */
export const MAX_TEX_PARAM_LENGTH = 320

/**
 * The chosen fabrics, one slot per zone, in `PRESENTATION_ZONES` order.
 *
 * Positional and comma-separated for the same reason `encodePaint` is a fixed
 * key order: this string is the cache key in the browser's HTTP cache *and* in
 * the route's, so one configuration has to produce one string. Empty slots stay
 * empty rather than being dropped, which is also what disambiguates this from
 * the single-id form below — the list always carries `PRESENTATION_ZONES.length
 * - 1` commas, and a token with no comma in it can only be the old spelling.
 */
export function encodeSwatches(selection: SwatchSelection): string {
  const ids = PRESENTATION_ZONES.map((zone) => selection[zone] ?? '')
  return ids.some(Boolean) ? ids.join(',') : ''
}

/**
 * Strictly the inverse, with one concession to history.
 *
 * `tex` used to name a single swatch, for `zone` alone — which is exactly the
 * bug this replaces: the couch's fabric travelled and the cushions' and the
 * shawl's did not. Those URLs are `immutable` for a year and sit in caches and
 * in customers' histories, so a token with no comma is still read the old way
 * rather than 400-ed.
 *
 * `null` means malformed — the route answers 400 rather than guessing, the same
 * as `decodePaint`.
 */
export function decodeSwatches(raw: string | null, zone: PresentationZone): SwatchSelection | null {
  if (!raw) return {}
  if (raw.length > MAX_TEX_PARAM_LENGTH) return null

  if (!raw.includes(',')) return SWATCH_ID.test(raw) ? { [zone]: raw } : null

  const parts = raw.split(',')
  // Longer than we know about is a newer build's URL; guessing is worse than 400.
  if (parts.length > PRESENTATION_ZONES.length) return null

  const out: SwatchSelection = {}
  for (let i = 0; i < parts.length; i++) {
    const id = parts[i]
    if (!id) continue
    if (!SWATCH_ID.test(id)) return null
    out[PRESENTATION_ZONES[i]] = id
  }
  return out
}

/** Which zones are wearing a cloth rather than a tint, read off the paint the
 *  page is actually rendering. The one place the two sides agree on what "the
 *  customer's configuration" means. */
export function swatchIdsFromPaint(paint: ZonePaintConfig): SwatchSelection {
  const out: SwatchSelection = {}
  PRESENTATION_ZONES.forEach((zone) => {
    const zonePaint = paint[zone]
    if (zonePaint?.maps && zonePaint.swatchId) out[zone] = zonePaint.swatchId
  })
  return out
}

/**
 * `layer` is `frame` for the bare frame, a cover variant id otherwise. The route
 * resolves it against the manifest — a path is never sent, so no request can
 * name a file the manifest does not.
 *
 * `swatches` is the same kind of token for the fabric: ids the route looks up in
 * each zone's palette, never texture URLs. They ride in a parameter of their own
 * rather than as a fifth element of each zone's paint tuple, because
 * `decodePaint` requires every entry to be exactly four long and that string is
 * the cache key for both the browser and the route — widening the entries would
 * make every URL issued before this change answer 400. (Adding a whole *zone* is
 * safe, and is why `PRESENTATION_ZONES` is append-only: a short outer array
 * still decodes.)
 *
 * `zone` remains the *fallback* zone for anything the part rules do not claim,
 * not a restriction on what may be dressed: every zone's cloth travels.
 */
/**
 * The same configuration, as a USDZ for iOS.
 *
 * Deliberately the same query as `arModelUrl` and built from it, so the two can
 * never describe different pieces: Quick Look and Scene Viewer are two readers
 * of one configuration, and the day they diverge is the day a customer sees one
 * fabric on the page and another in the room.
 *
 * iOS needs this because model-viewer cannot build a USDZ from these models in
 * the browser — its exporter throws on the first Basis texture and the failure
 * has nowhere to go. @see app/api/ar/[key]/model.usdz/route.ts
 */
export function arUsdzUrl(
  key: string,
  layer: string,
  zone: PresentationZone,
  paint: ZonePaintConfig,
  swatches?: SwatchSelection | null,
  source?: PresentationSource
): string {
  return arModelUrl(key, layer, zone, paint, swatches, source).replace('/model.glb?', '/model.usdz?')
}

/**
 * Bumped when a fix changes the bytes a given configuration produces.
 *
 * The responses are `immutable` for a year, so without this a phone that has
 * already opened AR keeps the file it cached and never sees the fix — which is
 * exactly what would have happened with the per-zone material split: same
 * query, different (correct) bytes. The route ignores the parameter; all it has
 * to do is be part of the cache key.
 */
const AR_MODEL_REVISION = '2'

export function arModelUrl(
  key: string,
  layer: string,
  zone: PresentationZone,
  paint: ZonePaintConfig,
  swatches?: SwatchSelection | null,
  source?: PresentationSource
): string {
  const query = new URLSearchParams({ layer, zone, paint: encodePaint(paint), v: AR_MODEL_REVISION })
  const tex = swatches ? encodeSwatches(swatches) : ''
  if (tex) query.set('tex', tex)
  // Omitted for 'v1', the default the route already assumes — every URL ever
  // issued before /simple-new existed still resolves to the same bytes.
  if (source === 'v2') query.set('src', source)
  return `/api/ar/${encodeURIComponent(key)}/model.glb?${query.toString()}`
}
