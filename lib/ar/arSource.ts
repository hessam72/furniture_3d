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

import type { PresentationZone } from '@/lib/product/presentation'
import type { ZonePaint, ZonePaintConfig } from '@/stores/presentationStore'

const ZONES: PresentationZone[] = ['wood', 'cover', 'cushion']

/** Long enough for three zones of paint, short enough that a hand-edited URL
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
  if (!Array.isArray(parsed) || parsed.length !== ZONES.length) return null

  const out = {} as ZonePaintConfig
  for (let i = 0; i < ZONES.length; i++) {
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
  return value === 'wood' || value === 'cover' || value === 'cushion'
}

/**
 * `layer` is `frame` for the bare frame, a cover variant id otherwise. The route
 * resolves it against the manifest — a path is never sent, so no request can
 * name a file the manifest does not.
 */
export function arModelUrl(
  key: string,
  layer: string,
  zone: PresentationZone,
  paint: ZonePaintConfig
): string {
  const query = new URLSearchParams({ layer, zone, paint: encodePaint(paint) })
  return `/api/ar/${encodeURIComponent(key)}/model.glb?${query.toString()}`
}
