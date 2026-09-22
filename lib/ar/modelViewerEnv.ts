/**
 * model-viewer's own settings, in place before the first element is built.
 *
 * `self.ModelViewerElement` is a plain config object — not the class — that
 * model-viewer reads inside the element constructor. One field on it decides
 * whether AR works on this deploy at all:
 *
 * **The decoders.** Left unset, model-viewer fetches the DRACO decoder and the
 * Basis transcoder from `www.gstatic.com`. Every file `/api/ar/[key]/model.glb`
 * serves is Draco-compressed and carries `KHR_texture_basisu` — the BIN chunk is
 * copied byte for byte precisely so that compression survives — so on a network
 * that cannot reach that CDN the overlay holds a 10-30MB GLB in the heap and
 * waits forever for a wasm file that never lands. The same two decoders are
 * already served out of `/public` for the page's own canvas, immutably cached,
 * and `lib/three/gltfLoaders` makes exactly this point about drei's own CDN
 * fallback. This is that fix, for the second three.js on the page.
 *
 * Imported first, and for its side effect only, by `lib/ar/modelViewer` — a
 * module of its own because an `import` is hoisted above every statement in the
 * file that writes it.
 */

export {}

declare global {
  interface Window {
    /** model-viewer's config object. @see the note above — not the class. */
    ModelViewerElement?: Record<string, unknown>
  }
}

if (typeof window !== 'undefined') {
  window.ModelViewerElement = {
    ...(window.ModelViewerElement ?? {}),
    dracoDecoderLocation: '/draco/',
    ktx2TranscoderLocation: '/basis/',
  }
}
