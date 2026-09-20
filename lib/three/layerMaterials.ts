import * as THREE from 'three'
import { prepareCarMaterial, type CarMaterialOptions } from './prepareCarMaterial'
import { captureBaseline, type MaterialBaseline } from './swatchTextures'
import {
  isPresentationZoneName,
  type PresentationPart,
  type PresentationZone,
} from '@/lib/product/presentation'

export interface ZoneTarget {
  material: THREE.MeshPhysicalMaterial
  zone: PresentationZone
  /**
   * The *material's* name, not the mesh's. A swatch may narrow further by it —
   * useful where one group holds both the upholstery and its piping.
   */
  materialName: string
  /** The maps and transforms this material shipped with. @see captureBaseline */
  baseMaps: MaterialBaseline
  /** The authored normal-map intensity, for a swatch that does not set its own
   *  to fall back to. @see lib/three/swatchTextures.ts */
  baseNormalScale: THREE.Vector2
}

/** `preparePresentationObject`'s options: material prep, plus whether this
 *  subtree takes part in the sun's shadow pass. */
export interface PresentationObjectOptions extends CarMaterialOptions {
  /** Enrol every mesh as a caster and receiver. Off unless the product config
   *  turns the sun on — see `sunEnabled`. */
  shadows?: boolean
}

/**
 * Material prep for the presentation page.
 *
 * Deliberately NOT `prepareCarObject` — that force-sets castShadow/receiveShadow
 * on every mesh unconditionally, and this page renders with no shadow maps at
 * all unless a product asks for the sun. Here the flags follow `shadows`, and
 * with it come /store's two naming rules, because they are what makes a window
 * read as a window rather than a hole punched in the light:
 *
 *  - *glass* never casts. The depth pass is alpha-blind, so a pane would black
 *    out the entire sun patch; the frames and mullions around it keep casting
 *    and are what paints the window pattern on the floor.
 *  - *lamp* never casts, so a glowing shade does not throw a hard sun shadow.
 *
 * `shadowSide` is forced double so a thin single-plane wall or window frame
 * casts regardless of which way the GLB happens to wind. That is the depth pass
 * only — `mat.side`, and PresentationRoom's ceiling rule, are untouched.
 */
export function preparePresentationObject(root: THREE.Object3D, options: PresentationObjectOptions = {}) {
  const shadows = options.shadows === true
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const name = child.name.toLowerCase()
    child.castShadow = shadows && !name.includes('glass') && !name.includes('lamp')
    child.receiveShadow = shadows
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((mat: THREE.Material) => {
      if (!mat) return
      prepareCarMaterial(mat, options)
      if (shadows) {
        mat.shadowSide = THREE.DoubleSide
        mat.needsUpdate = true
      }
    })
  })
}

/**
 * Strip every specular reflection from a set of painted materials.
 *
 * The HDR environment was reflecting into the upholstery and shifting the
 * colours away from the hex the user actually picked. With no IBL in the scene
 * `envMapIntensity` has nothing to sample, but it is zeroed anyway so a stray
 * `scene.environment` cannot creep back in; `clearcoat` is the other source —
 * a glossy coat over the base colour, authored per cover variant.
 *
 * `reflectivity` is deliberately left alone. Zeroing it would kill the direct
 * specular from the spot rig too, and that is ordinary shading — it is what
 * gives the fabric its form. The complaint was the environment bouncing into
 * the colour, not the lights.
 */
export function applyMatte(targets: ZoneTarget[]) {
  targets.forEach(({ material }) => {
    material.envMapIntensity = 0
    if (material.clearcoat !== undefined) material.clearcoat = 0
  })
}

/** Blender can beat the name heuristic by tagging a mesh; handles both the flat
 *  and the nested `userdata` shape glTF exporters produce. */
function zoneOverride(mesh: THREE.Mesh): PresentationZone | null {
  const data = mesh.userData as Record<string, any> | undefined
  const value = data?.userdata?.zone ?? data?.zone ?? data?.userdata?.paintZone ?? data?.paintZone
  return isPresentationZoneName(value) ? value : null
}

export interface CollectOptions {
  /** Zone for anything no part rule claims. */
  zone: PresentationZone
  /** Substring tested against mesh.name. Omit to take every mesh in the layer. */
  match?: string
  /**
   * The named groups inside this file, from the manifest.
   *
   * Omitted → every mesh takes `zone`, which is what a single-purpose layer GLB
   * wants. Given → the couch, its cushions and the shawl are told apart by the
   * names their author gave them. @see PresentationPart
   */
  parts?: PresentationPart[]
  /**
   * Clone into a genuine `MeshPhysicalMaterial`, whatever the source is.
   *
   * `mat.clone()` returns an instance of the *source's* own class — a plain
   * `MeshStandardMaterial` clones to `MeshStandardMaterial`, cast to Physical
   * only in the type system, and `sheen`/`clearcoat` on it read back
   * `undefined`, not zero. Every caller already guards `clearcoat` that way,
   * which is fine for `clearcoat` — most exports carry it via the clearcoat
   * extension already. It is not fine for sheen on a fabric that was never
   * authored with that extension, which is what this is for. Opt-in, so
   * `/product`'s FurnitureStack and CoverLayer — which never asked for sheen —
   * keep the cheaper plain clone. @see upgradeToPhysical
   */
  physical?: boolean
}

/**
 * Build a genuine `MeshPhysicalMaterial` from a material that may not be one.
 *
 * `MeshPhysicalMaterial.prototype.copy` unconditionally copies its own fields
 * from `source` — `this.sheenColor.copy(source.sheenColor)` among them — which
 * throws the moment `source` is a plain `MeshStandardMaterial` that has no
 * `sheenColor` to copy. So construction goes the other way: a fresh Physical
 * instance already has valid defaults for every field `MeshStandardMaterial`
 * does not know about, and only `MeshStandardMaterial`'s own `copy` — called
 * against that instance, not `source`'s actual class — pulls the shared fields
 * (maps, colour, roughness, metalness, …) across. If `source` already carries
 * its own authored Physical fields (a GLB exported with the clearcoat
 * extension), this path is skipped entirely and the ordinary `.clone()` keeps
 * them — @see the call site.
 */
function upgradeToPhysical(source: THREE.Material): THREE.MeshPhysicalMaterial {
  const physical = new THREE.MeshPhysicalMaterial()
  THREE.MeshStandardMaterial.prototype.copy.call(physical, source)
  return physical
}

const lower = (value: string | undefined | null) => (value ?? '').toLowerCase()

/** Does this object's name claim it for a part? */
function partForObject(object: THREE.Object3D, parts: PresentationPart[]): PresentationPart | null {
  const name = lower(object.name)
  if (!name) return null
  return parts.find((part) => part.objects?.some((needle) => name.includes(lower(needle)))) ?? null
}

/** A part's `materials` rule, applied within an already-matched subtree. */
function partForMaterial(materialName: string, parts: PresentationPart[]): PresentationPart | null {
  const name = lower(materialName)
  if (!name) return null
  return parts.find((part) => part.materials?.some((needle) => name.includes(lower(needle)))) ?? null
}

/**
 * Clone the materials this layer owns and tag them with their zone.
 *
 * Cloning is mandatory — drei caches the GLTF, so mutating a material in place
 * would leak colour and clipping planes into every other user of that asset.
 * Meshes outside the match rule are left untouched and un-cloned.
 *
 * A recursive walk rather than `Object3D.traverse`, and that is the whole point
 * of the rewrite: the zone has to be *inherited*. A sofa GLB names the group,
 * not each of the forty meshes under it, so matching `couch` has to claim
 * everything below it — while a `cushion` group nested inside still wins for its
 * own subtree, because the nearest match down the path is the one that applies.
 *
 * Precedence, most specific first:
 *   1. `userData.zone` on the mesh — the Blender tag, always the last word
 *   2. a part's `materials` rule
 *   3. the nearest ancestor (or the mesh itself) matched by a part's `objects`
 *   4. `options.zone`
 */
export function collectZoneTargets(root: THREE.Object3D, options: CollectOptions): ZoneTarget[] {
  const { zone, match, parts, physical } = options
  const needle = match?.toLowerCase()
  const targets: ZoneTarget[] = []
  const rules = parts ?? []

  const walk = (object: THREE.Object3D, inherited: PresentationZone) => {
    // Re-evaluated at every level, so the deepest naming wins over the shallowest.
    const claimed = rules.length ? partForObject(object, rules) : null
    const here = claimed?.zone ?? inherited

    const mesh = object as THREE.Mesh
    if (mesh.isMesh && mesh.material) {
      const override = zoneOverride(mesh)
      const matched = !needle || lower(mesh.name).includes(needle)
      if (override || matched) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const cloned = materials.map((mat) => {
          const copy =
            physical && !(mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial
              ? upgradeToPhysical(mat)
              : (mat.clone() as THREE.MeshPhysicalMaterial)
          const byMaterial = rules.length ? partForMaterial(mat.name, rules) : null
          targets.push({
            material: copy,
            zone: override ?? byMaterial?.zone ?? here,
            materialName: mat.name ?? '',
            // Read off the clone, which still holds the authored textures and their
            // transforms — this is the only moment that state is guaranteed present,
            // and both restoring and the inherit rule need it. @see captureBaseline
            baseMaps: captureBaseline(copy),
            baseNormalScale: copy.normalScale.clone(),
          })
          return copy
        })
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
      }
    }

    object.children.forEach((child) => walk(child, here))
  }

  walk(root, zone)
  return targets
}

/**
 * The loaded file's shape, for the console.
 *
 * `parts` is authored against names only their exporter knows, and guessing them
 * is how this feature silently dresses nothing. Printed under `?debug` so the
 * names can be read off the real file rather than inferred from a screenshot.
 * The same idea as `describeSceneNames` in lib/store/sceneObject.ts.
 */
export function describeObjectTree(root: THREE.Object3D, parts?: PresentationPart[]): string {
  const rules = parts ?? []
  const lines: string[] = []

  const walk = (object: THREE.Object3D, depth: number, inherited: PresentationZone | null) => {
    const claimed = rules.length ? partForObject(object, rules) : null
    const here = claimed?.zone ?? inherited
    const mesh = object as THREE.Mesh
    const materials = mesh.isMesh
      ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m?.name || '(unnamed)')
      : []

    lines.push(
      `${'  '.repeat(depth)}${object.name || '(unnamed)'}` +
        (materials.length ? `  [${materials.join(', ')}]` : '') +
        (claimed ? `  ← part "${claimed.id}" → ${claimed.zone}` : here ? `  · ${here}` : '')
    )
    object.children.forEach((child) => walk(child, depth + 1, here))
  }

  walk(root, 0, null)
  return lines.join('\n')
}

/** Dispose only the cloned materials — geometry belongs to drei's cache. */
export function disposeTargets(targets: ZoneTarget[]) {
  targets.forEach(({ material }) => material.dispose())
}
