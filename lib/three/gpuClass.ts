'use client'

/**
 * What the GPU can actually do, as opposed to how wide the window is.
 *
 * Everything about choosing a tier came from two media queries — `pointer:
 * coarse` and a short-side test (@see lib/config/deviceTier). That separates a
 * phone from a tablet from a desktop, which is what it was written for, and it
 * cannot separate a 2012 iPad from an M4 iPad Pro. Both are 768 across, both
 * are `tablet`, both were handed the same ceiling, and one of them has a
 * fraction of the other's memory. `arch-docs/mobile-3d-op-roadmap.md` has had
 * "a GPU tier probe is a better ceiling input than a media query" as an open
 * recommendation since the tier work landed; this is it.
 *
 * **The probe is a throwaway 1x1 context.** It has to be, because the answer is
 * needed *before* the real Canvas sizes its buffers, and the real renderer's
 * capabilities arrive in `onCreated` — one allocation too late. A 1x1 context
 * costs a few hundred microseconds and four bytes, and it is handed straight
 * back with `WEBGL_lose_context` rather than left for the collector: on iOS a
 * context released only by GC is exactly the failure this whole subsystem
 * exists to avoid. @see lib/three/releaseRenderer
 *
 * Cached in module scope *and* `sessionStorage`, so the second 3D page in a
 * visit pays nothing at all and a tab iOS reloads under memory pressure does
 * not re-probe on the way back.
 */

export type GpuClass = 'none' | 'weak' | 'normal'

const STORAGE_KEY = 'furniture:gpu-class'

let cached: GpuClass | null = null

/** Below this a GPU is old enough that the tier table's assumptions do not
 *  hold. Every WebGL2 implementation is required to reach 2048; 4096 is the
 *  line between the PowerVR/Adreno 3xx era and everything since. */
const WEAK_MAX_TEXTURE = 4096
/** A WebGL2 context must offer 4. More than that means a GPU with real
 *  framebuffer headroom. */
const WEAK_MAX_SAMPLES = 4

/** Renderer families that are weak whatever the limits say. A *hint only*:
 *  Safari 17+ masks the unmasked renderer and many browsers drop the
 *  extension entirely, so this may raise the verdict and is never required to
 *  reach it. */
const WEAK_RENDERER = /\b(SGX|PowerVR|Mali-4|Mali-T6|Adreno \(TM\) [123]|Apple A[789]\b|Videocore|llvmpipe|SwiftShader)/i

function probe(): GpuClass {
  if (typeof document === 'undefined') return 'normal'

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1

  let gl: WebGL2RenderingContext | null = null
  try {
    // `failIfMajorPerformanceCaveat` is deliberately NOT set: a software
    // rasteriser should be detected and downgraded, not refused a context and
    // reported as "no WebGL2 at all".
    gl = canvas.getContext('webgl2', { depth: false, stencil: false, alpha: false, antialias: false })
  } catch {
    gl = null
  }

  // three 0.180 dropped the WebGL1 path in r163, so no webgl2 is not "slow", it
  // is "this device cannot render any of our scenes". The pages show a still
  // image for it rather than the lost-context notice, which would be a lie and
  // would offer a retry that can never succeed.
  if (!gl) return 'none'

  try {
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    const maxSamples = gl.getParameter(gl.MAX_SAMPLES) as number
    const maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number

    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : ''

    const cores = navigator.hardwareConcurrency ?? 0
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0

    const weak =
      maxTexture <= WEAK_MAX_TEXTURE ||
      maxSamples <= WEAK_MAX_SAMPLES ||
      maxRenderbuffer <= WEAK_MAX_TEXTURE ||
      // `?? 0` above means "not reported", which must not read as weak.
      (cores > 0 && cores <= 2) ||
      (memory > 0 && memory <= 2) ||
      (renderer !== '' && WEAK_RENDERER.test(renderer))

    return weak ? 'weak' : 'normal'
  } catch {
    // A context we could create but cannot question is not evidence of
    // anything. Assume normal and let the pixel budget and the lost-context
    // ladder do their jobs.
    return 'normal'
  } finally {
    // Hand it back now, explicitly. @see the note at the top of this file.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * The hardware class, measured once per tab.
 *
 * Safe to call during a server render — it answers `normal`, which is what the
 * `desktop` device class the server also assumes implies, so the two agree and
 * nothing tier-dependent differs between the server's HTML and the client's
 * first render. @see readDeviceClass
 */
export function readGpuClass(): GpuClass {
  if (cached) return cached
  if (typeof window === 'undefined') return 'normal'

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (stored === 'none' || stored === 'weak' || stored === 'normal') {
      cached = stored
      return cached
    }
  } catch {
    /* private mode: probe every page instead of once per tab */
  }

  cached = probe()
  try {
    window.sessionStorage.setItem(STORAGE_KEY, cached)
  } catch {
    /* as above */
  }
  return cached
}

/** True where three cannot create a renderer at all — the pages draw a still
 *  image instead of a canvas. @see readGpuClass */
export function webglUnavailable(): boolean {
  return readGpuClass() === 'none'
}

/**
 * What the pages say when there is no WebGL2 at all.
 *
 * Deliberately not the lost-context copy. «حافظه گرافیکی دستگاه پر شد» says the
 * device ran out of room, which invites a retry and a lower tier — and on a
 * browser with no WebGL2 there is no tier low enough and the retry can only
 * fail. Saying so plainly is the honest answer, and it is the only one that
 * lets the visitor stop trying.
 */
export const WEBGL_UNAVAILABLE_FA = 'مرورگر این دستگاه از نمایش سه‌بعدی پشتیبانی نمی‌کند'

/**
 * `useSyncExternalStore` plumbing, so a provider can read the class without a
 * hydration mismatch.
 *
 * The hardware never changes under a running tab, so there is nothing to
 * subscribe to — but the server cannot probe and the client can, and a tier
 * that differs between the server's HTML and the client's first render is the
 * bug that broke the quality picker once already. `useSyncExternalStore` uses
 * the server snapshot for the hydration render and `readGpuClass` immediately
 * afterwards, which is the same shape `getStoredTier` uses and for the same
 * reason. No effect, so the canvases — all `dynamic(ssr: false)`, mounting
 * later — still never see a stale value.
 */
export function subscribeGpuClass(): () => void {
  return () => {}
}

/** Always `normal`: the server has no GPU to ask. @see subscribeGpuClass */
export function getGpuClassOnServer(): GpuClass {
  return 'normal'
}
