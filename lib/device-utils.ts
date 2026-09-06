/**
 * Device detection utilities for AR support
 */

export function getUserAgent(): string {
  if (typeof window === 'undefined') return ''
  return navigator.userAgent || ''
}

export function isMobile(): boolean {
  const ua = getUserAgent()
  return /Mobi|Android|iPhone|iPad|iPod/.test(ua)
}

export function isIOS(): boolean {
  const ua = getUserAgent()
  if (/iPhone|iPad|iPod/.test(ua)) return true
  // iPadOS 13+ reports a desktop Safari UA. Without this an iPad — which runs
  // Quick Look perfectly well — is read as a Mac and told AR is unavailable.
  return /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1
}

export function isAndroid(): boolean {
  const ua = getUserAgent()
  return /Android/.test(ua)
}

export function isARCapable(): boolean {
  return isIOS() || isAndroid()
}

/**
 * Whether this device can enter AR from a `blob:` model URL.
 *
 * iOS Quick Look reads the USDZ model-viewer generates in-page, and WebXR
 * renders from the loaded scene — both are fine with a blob. Android's Scene
 * Viewer is not: it fetches the URL itself and rejects blobs. So on Android
 * without WebXR, a runtime-generated model has to fall back to a static file.
 */
export async function supportsBlobAR(): Promise<boolean> {
  if (!isAndroid()) return true
  const xr = (navigator as unknown as { xr?: { isSessionSupported?: (mode: string) => Promise<boolean> } }).xr
  if (!xr?.isSessionSupported) return false
  try {
    return await xr.isSessionSupported('immersive-ar')
  } catch {
    return false
  }
}

export function getPlatformName(): string {
  if (isIOS()) return 'iOS'
  if (isAndroid()) return 'Android'
  return 'Desktop'
}

export function getARModeName(): string {
  if (isIOS()) return 'Quick Look'
  if (isAndroid()) return 'Scene Viewer'
  return 'Not Available'
}
