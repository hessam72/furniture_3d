import * as THREE from 'three'
import { applyMatte, collectZoneTargets, disposeTargets, type ZoneTarget } from './layerMaterials'
import { applyFirstCoat } from '@/hooks/useZonePaint'
import type { ZonePaintConfig } from '@/stores/presentationStore'
import type { CoverVariant, PresentationZone } from '@/lib/product/presentation'

/**
 * The raw, unmodified `gltf.scene` of each layer as drei cached it, plus the
 * offset that seats the piece on the room floor.
 *
 * Deliberately the *sources*, not the mounted clones: the live stack carries
 * spin, tilt, explode offsets, a `visible={layerStep >= 1}` cushion slot, a
 * cover that is not even mounted below step 2, clipping planes mid-wipe, and
 * material values that are mid-lerp for ~400ms after any colour change. An
 * export built from the sources has none of that to undo.
 */
export interface ExportSources {
  frame: THREE.Object3D | null
  soft: THREE.Object3D | null
  /** The active cover variant's scene — registered even when it is not shown. */
  cover: THREE.Object3D | null
  centerOffset: [number, number, number]
}

export function emptyExportSources(): ExportSources {
  return { frame: null, soft: null, cover: null, centerOffset: [0, 0, 0] }
}

/** Everything the export depends on. Same string → same file, so re-opening AR
 *  without touching the configurator reuses the blob instead of rebuilding. */
export function exportSignature(paint: ZonePaintConfig, coverId: string | null): string {
  return JSON.stringify({ coverId, paint })
}

interface LayerSpec {
  source: THREE.Object3D
  zone: PresentationZone
  match?: string
  variant?: CoverVariant
}

/** Clone one layer, recolour it, and strip the render-only state a file cannot
 *  carry. Returns the cloned materials so the caller can dispose them. */
function buildLayer(
  spec: LayerSpec,
  paint: ZonePaintConfig,
  matte: boolean
): { object: THREE.Object3D; targets: ZoneTarget[] } {
  const object = spec.source.clone(true)

  // NOT preparePresentationObject: it writes `anisotropy` onto drei's *shared*
  // cached textures. Exporting must not touch the live scene. `envMapIntensity`
  // has no glTF equivalent anyway, so nothing is lost.
  const targets = collectZoneTargets(object, { zone: spec.zone, match: spec.match })
  applyFirstCoat(targets, paint)

  // Per-variant surface character, mirroring CoverLayer.
  const surface = spec.variant?.material
  if (surface) {
    targets.forEach(({ material }) => {
      if (surface.roughness !== undefined) material.roughness = surface.roughness
      if (surface.metalness !== undefined) material.metalness = surface.metalness
      if (surface.clearcoat !== undefined && material.clearcoat !== undefined) {
        material.clearcoat = surface.clearcoat
      }
    })
  }

  // Matte last, so it overrides the variant's own clearcoat — AR must match
  // what the page shows, not the value authored in the manifest.
  if (matte) applyMatte(targets)

  // Material.copy() carries clippingPlanes across a clone, so a cover cloned
  // mid-wipe would export sliced in half. Clipping is renderer-only state.
  targets.forEach(({ material }) => {
    material.clippingPlanes = null
    material.clipShadows = false
  })

  // GLTFExporter defaults to onlyVisible:true, and the cushion slot is hidden
  // at layer step 0 — an AR model is always the finished piece.
  object.traverse((child) => {
    child.visible = true
  })

  return { object, targets }
}

/**
 * Load a GLB the canvas is not currently mounting, for the export alone.
 *
 * The single-piece viewers show one file at a time, and AR must ship the
 * finished piece whichever one that is — so when the customer is looking at the
 * bare frame, the cover has to come from somewhere. Parsed once per path per
 * session; the bytes themselves come from the HTTP cache, since the page has
 * usually already loaded (or preloaded) the same file through drei.
 *
 * DRACO is configured exactly as every other loader in the app configures it.
 * @see ModelLoader.preloadModel
 */
const exportScenes = new Map<string, Promise<THREE.Object3D>>()

export function loadExportScene(path: string): Promise<THREE.Object3D> {
  const cached = exportScenes.get(path)
  if (cached) return cached

  const pending = (async () => {
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
    ])
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    loader.setDRACOLoader(draco)
    const gltf = await loader.loadAsync(path)
    return gltf.scene as THREE.Object3D
  })()

  // A failed load must not be remembered as the answer for the rest of the
  // session — the next AR tap gets to try again.
  pending.catch(() => exportScenes.delete(path))
  exportScenes.set(path, pending)
  return pending
}

/**
 * Serialise the currently configured piece to a GLB.
 *
 * The result is handed to `<model-viewer>` as an object URL; with no `ios-src`
 * alongside it, model-viewer generates the USDZ for Quick Look from this same
 * file, so iOS and Android both show the live configuration.
 *
 * **What it ships is exactly what layer step 1 shows: the cover, alone.** The
 * frame and the cushion layer are the structure *under* the upholstery, and the
 * ladder hides both the moment the cover is on (`frameVisible`/`softVisible` in
 * FurnitureStack are `layerStep === 0`). Merging them in put a second sofa
 * inside the one the customer places in their room — doubled geometry, doubled
 * file size, and z-fighting wherever two surfaces meet.
 *
 * The one exception is a product that ships no cover at all, where the frame
 * and its cushions *are* the finished piece — and that is not a merge.
 */
export async function exportConfiguredGLB(
  sources: ExportSources,
  paint: ZonePaintConfig,
  variant: CoverVariant | null,
  options: { softMatch?: string; matte?: boolean } = {}
): Promise<Blob> {
  if (!sources.cover && !sources.frame) throw new Error('no layer is loaded yet')

  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')

  const root = new THREE.Group()
  root.name = 'configured-furniture'
  const inner = new THREE.Group()
  inner.position.fromArray(sources.centerOffset)
  root.add(inner)

  // The cover is the finished piece; the layers it covers ship only when there
  // is no cover at all. @see the note above.
  const specs: LayerSpec[] = sources.cover
    ? [{ source: sources.cover, zone: 'cover', variant: variant ?? undefined }]
    : [
        ...(sources.frame ? [{ source: sources.frame, zone: 'wood' as const }] : []),
        ...(sources.soft
          ? [{ source: sources.soft, zone: 'cushion' as const, match: options.softMatch }]
          : []),
      ]

  const built = specs.map((spec) => buildLayer(spec, paint, options.matte !== false))
  built.forEach(({ object }) => inner.add(object))

  try {
    const result = await new GLTFExporter().parseAsync(root, { binary: true })
    const buffer = result as ArrayBuffer
    return new Blob([buffer], { type: 'model/gltf-binary' })
  } finally {
    // Geometry and textures still belong to drei's cache — only the material
    // clones this function made are ours to release.
    built.forEach(({ targets }) => disposeTargets(targets))
  }
}

/**
 * Serialise a single finished-piece GLB — the file /product/[id]/simple and the
 * showroom's inline viewer draw — with the live colours baked in.
 *
 * The layered export above needs a soft layer and a cover because the
 * presentation page mounts several files. A plain viewer mounts one, and paints
 * all of it as the `cover` zone (`collectZoneTargets(clone, { zone: 'cover' })`),
 * so the export has to do the same or AR would show a piece in a colour the
 * page never displayed.
 *
 * `source` is the finished piece, never the bare frame: both callers resolve it
 * before calling — with `loadExportScene` when the frame is what is on screen —
 * so AR carries the upholstered piece from every surface in the app.
 */
export async function exportSinglePieceGLB(
  source: THREE.Object3D,
  paint: ZonePaintConfig,
  variant: CoverVariant | null,
  options: { matte?: boolean; zone?: PresentationZone } = {}
): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')

  const root = new THREE.Group()
  root.name = 'configured-furniture'
  // Matte defaults *off* here, unlike the layered export: the plain viewer is
  // deliberately not matted — the environment reading off the material is the
  // point of that page — so AR matches what it shows.
  const built = buildLayer(
    // Painted the way the viewer paints what it mounts: one file, one zone.
    { source, zone: options.zone ?? 'cover', variant: variant ?? undefined },
    paint,
    options.matte === true
  )
  root.add(built.object)

  try {
    const result = await new GLTFExporter().parseAsync(root, { binary: true })
    return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
  } finally {
    disposeTargets(built.targets)
  }
}
