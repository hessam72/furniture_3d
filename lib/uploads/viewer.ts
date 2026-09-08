import type { PresentationConfig } from '@/lib/product/presentation'

/**
 * Where an uploaded model is served from: a route, not a static path.
 *
 * Lives here rather than beside the store because client components need it,
 * and the store imports `fs` — one runtime import of it from a component would
 * drag the filesystem into the browser bundle.
 */
export function assetUrl(id: string): string {
  return `/api/uploads/${id}/file`
}

/**
 * A one-file manifest for an uploaded model.
 *
 * `SimpleViewer` draws from a `PresentationConfig`'s `simple` block, so the
 * cheapest way to give an upload the same viewer /product/[id]/simple uses is
 * to hand it a manifest with one layer in it. Nothing here is authored per
 * product — an upload has no cover variants, no palettes and no room — so the
 * values are the plain studio defaults, and the model is framed from its own
 * measured bounds like every other piece.
 */
export const UPLOAD_VIEWER_HDR = '/hdr/200_hdrmaps_com_free_1kk.exr'
export const UPLOAD_VIEWER_BG = '#ececef'

export function uploadViewerConfig(modelUrl: string): PresentationConfig {
  return {
    room: {},
    // The frame is the required layer, and for an upload it is the whole model.
    layers: {
      frame: { path: modelUrl, label: 'مدل' },
      cover: { label: 'رویه', default: '', variants: [] },
    },
    palettes: { wood: [], cover: [], cushion: [] },
    camera: { azimuthDeg: 0, elevationDeg: 8, fov: 35 },
    simple: {
      model: modelUrl,
      hdr: UPLOAD_VIEWER_HDR,
      envIntensity: 1,
      background: UPLOAD_VIEWER_BG,
      fov: 35,
      padding: 1.15,
      minZoom: 0.1,
      maxZoom: 2.6,
      lighting: { ambient: 0.35, key: 1.1, fill: 0.35 },
      quality: { preset: 'high', mobile: 'medium' },
    },
  }
}
