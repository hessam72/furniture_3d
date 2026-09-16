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
 * **Why every decoder has to be set here, not some of them:** R3F keeps exactly
 * one `GLTFLoader` instance per class, in a `WeakMap` it never evicts, and each
 * caller re-applies its own extensions to that shared instance before loading.
 * So a decoder `extendGltfLoader` does not set is not absent — it is whatever
 * the *previous* caller happened to leave on the loader. drei's `useGLTF` sets
 * a Meshopt decoder of its own, `useLoader(GLTFLoader, …)` sets none, and the
 * result was a `/store` that decoded meshopt fine after a visit to a product
 * page and not at all on a cold load. @see extendGltfLoader
 *
 * @see scripts/optimize-glb.sh, which produces the KTX2 these read.
 */

import type { CompressedTexture, WebGLRenderer } from 'three'
import { DRACOLoader, KTX2Loader, MeshoptDecoder, type GLTFLoader } from 'three-stdlib'

/** Both decoders are served from /public and cached immutably. @see next.config.mjs */
const DRACO_PATH = '/draco/'
const BASIS_PATH = '/basis/'

let draco: DRACOLoader | null = null
let ktx2: KTX2Loader | null = null
let meshopt: ReturnType<typeof MeshoptDecoder> | null = null
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
 * three-stdlib exports the decoder as a *factory*, not the singleton three's
 * own examples ship, so drei's `useMeshopt` branch builds a fresh wasm instance
 * on every call. One is enough — the decode is a pure call against a wasm heap
 * and nothing about it is per-file — so the paths that come through here share
 * this one, like DRACO and the transcoder above.
 */
function meshoptDecoder(): ReturnType<typeof MeshoptDecoder> {
  if (!meshopt) meshopt = MeshoptDecoder()
  return meshopt
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
 * One standalone .ktx2, transcoded by the loader every GLB already shares.
 *
 * Deliberately a function rather than `export ktx2Loader()`. This module's whole
 * contract is that nobody can hold a loader that has not been primed and nobody
 * can make a second one; handing the instance out exports both footguns at once.
 * A `.load()` before `detectSupport()` throws "Missing initialization with
 * detectSupport()", and a stray `.dispose()` would terminate the worker pool
 * every GLB in the app is sharing, silently, for the rest of the session.
 *
 * Gated on `ready` for the same reason `preloadGltf` is, and with a sharper
 * edge: a swatch prefetch fires from the bottom sheet, which is DOM, and can
 * easily run before any Canvas has reached `onCreated`.
 *
 * Note the caller still owns the texture — nothing here caches or disposes.
 * That is `lib/three/swatchTextures.ts`'s job, the way `useGltfCacheEviction`
 * rather than `preloadGltf` owns the GLB cache.
 */
export function loadKtx2(url: string): Promise<CompressedTexture> {
  return ready.then(() => ktx2Loader().loadAsync(url) as Promise<CompressedTexture>)
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
  // Geometry the optimiser leaves as `EXT_meshopt_compression`. Set here rather
  // than left to drei, because the store loads through `useLoader` and never
  // reaches drei's branch. @see the note on the shared instance above.
  loader.setMeshoptDecoder(meshoptDecoder())
}

/**
 * Warm the cache for files this page is about to want, once it is safe to.
 *
 * Preloads are a courtesy — the page renders correctly without them — so they
 * wait rather than race the transcoder's initialisation. Returns a cancel
 * function, because a page that unmounts mid-wait should not go on to parse
 * GLBs nobody is going to look at.
 *
 * **`useDraco` is `false`, and it has to match the components exactly.** drei
 * keys its cache on the loader configuration, so `true` here preloads into an
 * entry no `useGLTF(path, false, …)` ever reads — the warm is thrown away and
 * the file is parsed a second time on mount. Worse, `true` is the branch where
 * drei installs *its own* DRACOLoader over ours after `extendLoader` has run,
 * which sends the decoder fetch to `gstatic.com` instead of `/draco/`: a
 * network round trip for a file already sitting in `public/`, and a hard
 * failure anywhere that CDN is not reachable.
 */
export function preloadGltf(
  paths: string[],
  preload: (path: string, useDraco: boolean, useMeshopt: boolean, extend: typeof extendGltfLoader) => unknown
): () => void {
  let cancelled = false
  void ready.then(() => {
    if (cancelled) return
    paths.forEach((path) => preload(path, false, true, extendGltfLoader))
  })
  return () => {
    cancelled = true
  }
}
