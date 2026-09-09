'use client'

/**
 * The one place a GLTFLoader is taught how to read our files.
 *
 * There were three. `ProductPageClient` and `SimpleViewer` each called
 * `useGLTF.setDecoderPath('/draco/')` at module scope — with the same comment
 * about drei otherwise reaching for its CDN decoder — and `ModelLoader` kept its
 * own shared `DRACOLoader` singleton for the `useLoader(GLTFLoader)` path. Three
 * copies was survivable while DRACO was the only thing to configure. KTX2 is the
 * second, and it needs a step the others do not, so the third copy of this would
 * have been the one that silently lacked it.
 *
 * **The step:** `KTX2Loader` cannot parse anything until `detectSupport()` has
 * been handed a live renderer — it has to know whether this GPU wants ASTC, BC7
 * or ETC2 before it can transcode. So the loader exists from module load but is
 * inert until a Canvas primes it (@see primeGltfLoaders), and anything that
 * loads early has to wait (@see whenLoadersReady). A preload that fires first
 * would otherwise throw "Missing initialization with detectSupport()" — into a
 * Suspense boundary, where it reads as a model that never arrives.
 *
 * @see scripts/optimize-glb.sh, which produces the KTX2 these read.
 */

import type { WebGLRenderer } from 'three'
import { DRACOLoader, KTX2Loader, type GLTFLoader } from 'three-stdlib'

/** Both decoders are served from /public and cached immutably. @see next.config.mjs */
const DRACO_PATH = '/draco/'
const BASIS_PATH = '/basis/'

let draco: DRACOLoader | null = null
let ktx2: KTX2Loader | null = null
let primed = false

let resolveReady: () => void
const ready = new Promise<void>((resolve) => {
  resolveReady = resolve
})

function dracoLoader(): DRACOLoader {
  // One instance, deliberately: each one spins up its own wasm worker pool, and
  // a pool per model was pure waste — the note ModelLoader already carried.
  if (!draco) draco = new DRACOLoader().setDecoderPath(DRACO_PATH)
  return draco
}

function ktx2Loader(): KTX2Loader {
  if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath(BASIS_PATH)
  return ktx2
}

/**
 * Give the KTX2 transcoder a renderer to inspect. Call from `onCreated`.
 *
 * Idempotent, and safe to call from every Canvas: the answer is a property of
 * the GPU, not of the renderer asking. Deliberately does **not** create a
 * renderer of its own to detect with — a throwaway context is exactly the thing
 * iOS Safari does not forgive.
 */
export function primeGltfLoaders(gl: WebGLRenderer): void {
  if (primed) return
  primed = true
  ktx2Loader().detectSupport(gl)
  resolveReady()
}

/** Resolves once a Canvas has primed the loaders. @see primeGltfLoaders */
export function whenLoadersReady(): Promise<void> {
  return ready
}

/**
 * Hand to `useGLTF`'s `extendLoader` and to `useLoader(GLTFLoader, …)`.
 *
 * Must be a stable reference: drei keys its cache on the loader configuration,
 * so an arrow function written inline would miss the cache on every render and
 * re-parse the GLB each time.
 */
export function extendGltfLoader(loader: GLTFLoader): void {
  loader.setDRACOLoader(dracoLoader())
  loader.setKTX2Loader(ktx2Loader())
}

/**
 * Warm the cache for files this page is about to want, once it is safe to.
 *
 * Preloads are a courtesy — the page renders correctly without them — so they
 * wait rather than race the transcoder's initialisation. Returns a cancel
 * function, because a page that unmounts mid-wait should not go on to parse
 * GLBs nobody is going to look at.
 */
export function preloadGltf(
  paths: string[],
  preload: (path: string, useDraco: boolean, useMeshopt: boolean, extend: typeof extendGltfLoader) => unknown
): () => void {
  let cancelled = false
  void ready.then(() => {
    if (cancelled) return
    paths.forEach((path) => preload(path, true, true, extendGltfLoader))
  })
  return () => {
    cancelled = true
  }
}
