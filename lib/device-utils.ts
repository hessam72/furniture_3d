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
