'use client'

/**
 * The one import that registers `<model-viewer>`, configured for this deploy.
 *
 * Every AR call site goes through this rather than reaching for the dist
 * directly: the settings below have to be applied once, before any element is
 * constructed, and a second entry point is a second chance to miss them.
 *
 * @see ./modelViewerEnv for the decoder paths, which have to be written before
 *      this module's own import of the bundle is evaluated.
 */

import './modelViewerEnv'
import '@google/model-viewer/dist/model-viewer.min.js'

/**
 * Do not retain parsed models once the overlay closes.
 *
 * model-viewer's GLTF cache keeps the five most recently used files alive
 * indefinitely — `CacheEvictionPolicy`'s default threshold — keyed by URL. Every
 * configuration this app builds *is* its own URL: a different cloth, a different
 * colour, a different layer, a different file. So a customer trying fabrics in
 * AR accumulates up to five fully decoded copies of a 10-30MB piece — geometry,
 * transcoded textures and all — in a tab iOS will kill for considerably less,
 * and it kills it by reloading the page out from under them.
 *
 * Nothing is lost by turning it off. Each response is `immutable` for a year, so
 * re-opening the same configuration is served from the disk cache; the cache was
 * only ever saving a re-parse, and it was charging resident megabytes per
 * configuration to do it.
 */
const element = customElements.get('model-viewer') as
  | (CustomElementConstructor & { modelCacheSize?: number })
  | undefined

if (element) element.modelCacheSize = 0
