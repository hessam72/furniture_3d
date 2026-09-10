/**
 * The channel between the in-canvas probe and the DOM overlay.
 *
 * They cannot be one component: inside a `<Canvas>` React is reconciling into
 * three's scene graph, where a `<div>` is not a thing that exists. And they
 * cannot be one *module* either — the overlay is mounted at page level, and a
 * module that reaches `three` would pull the whole library into the bundle of
 * any page that renders it. /showroom is mostly marketing copy; it grew by
 * 246KB of first-load JS before this was split out.
 *
 * So: this file holds the store and the formatting, imports nothing, and the
 * two halves live either side of it.
 */

export interface RendererSample {
  label: string
  fps: number
  dpr: number
  vram: number
  textures: number
  geometries: number
  programs: number
  calls: number
  triangles: number
  /** The three biggest maps, already formatted — the actionable part. */
  worst: string[]
}

const samples = new Map<string, RendererSample>()
const listeners = new Set<() => void>()
let snapshot: RendererSample[] = []

function publish() {
  snapshot = [...samples.values()]
  listeners.forEach((listener) => listener())
}

export function reportSample(id: string, sample: RendererSample) {
  samples.set(id, sample)
  publish()
}

export function dropSample(id: string) {
  samples.delete(id)
  publish()
}

export function subscribeSamples(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const readSamples = () => snapshot

export function isDebug(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
}

/**
 * `isDebug()` read the way a *rendered* component has to read it.
 *
 * Calling it directly in a component body is a hydration mismatch waiting for
 * someone to open `?debug`: the server has no query string, so it renders
 * nothing, while the client renders the overlay — and React discards the whole
 * tree. `getServerSnapshot` returns false so both agree, and the real answer
 * arrives on the re-render straight after hydration.
 *
 * Fine to keep calling `isDebug()` from effects, event handlers and inside a
 * Canvas (which never server-renders); only render bodies need this.
 */
const noSubscribe = () => () => {}
export const debugSnapshot = () => isDebug()
export const debugServerSnapshot = () => false
export const subscribeDebug = noSubscribe

export function formatBytes(bytes: number): string {
  if (bytes < 1048576) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)}MB`
}

/** Where a single scene's texture set stops being affordable on a phone. */
export const TEXTURE_VRAM_WARN_BYTES = 96 * 1048576
/** Past this a phone is being asked for more than iOS will give the whole tab. */
export const TEXTURE_VRAM_MAX_BYTES = 256 * 1048576
