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
 * Serialise the currently configured piece to a GLB.
 *
 * The result is handed to `<model-viewer>` as an object URL; with no `ios-src`
 * alongside it, model-viewer generates the USDZ for Quick Look from this same
 * file, so iOS and Android both show the live configuration.
 */
export async function exportConfiguredGLB(
  sources: ExportSources,
  paint: ZonePaintConfig,
  variant: CoverVariant | null,
  options: { softMatch?: string; matte?: boolean } = {}
): Promise<Blob> {
  if (!sources.frame) throw new Error('frame layer is not loaded yet')

  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')

  const root = new THREE.Group()
  root.name = 'configured-furniture'
  const inner = new THREE.Group()
  inner.position.fromArray(sources.centerOffset)
  root.add(inner)

  const specs: LayerSpec[] = [{ source: sources.frame, zone: 'wood' }]
  if (sources.soft) specs.push({ source: sources.soft, zone: 'cushion', match: options.softMatch })
  if (sources.cover) specs.push({ source: sources.cover, zone: 'cover', variant: variant ?? undefined })

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
