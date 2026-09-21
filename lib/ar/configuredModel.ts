/**
 * The customer's configuration, as a GLB — the step both AR routes share.
 *
 * This was the body of `app/api/ar/[key]/model.glb/route.ts` and moved here
 * whole when the USDZ route arrived. There is exactly one way to turn a query
 * into a dressed model, and two routes deriving it separately is how the page
 * and the room start disagreeing about what the customer chose.
 *
 * @see app/api/ar/[key]/model.glb/route.ts — serves this to Scene Viewer
 * @see app/api/ar/[key]/model.usdz/route.ts — converts it for Quick Look
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { arModelPath, findSwatch, isTextureSwatch, resolvePresentation } from '@/lib/product/presentation'
import { decodePaint, decodeSwatches, isPresentationZone } from '@/lib/ar/arSource'
import {
  AR_HAZARDS,
  arHazards,
  editsFromZones,
  materialIndicesByName,
  patchGlbMaterials,
  readGlbJson,
  splitZonesByMaterial,
  type InjectableSlot,
  type TextureInjection,
} from '@/lib/ar/glbPatch'

const PUBLIC_DIR = path.join(process.cwd(), 'public')

/**
 * Read a file the manifest published, and only such a file.
 *
 * The containment check is the second lock on the same door `layer` and `tex`
 * already close: they select from the manifest rather than naming a path, and
 * this makes certain that whatever the manifest named still resolves inside
 * `public/`. Returns null rather than throwing — a missing asset is a real case
 * here, since `public/models` is gitignored and deploys carry it out of band.
 */
export async function readPublicFile(publicPath: string): Promise<Buffer | null> {
  const file = path.resolve(PUBLIC_DIR, `.${publicPath}`)
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return null
  try {
    return await readFile(file)
  } catch {
    return null
  }
}

/** Warned about once per file rather than once per configuration — the hazards
 *  belong to the asset, and a customer trying swatches must not fill the log. */
const warned = new Set<string>()

function reportHazards(modelPath: string, json: unknown): string[] {
  const hazards = arHazards(json)
  if (hazards.length && !warned.has(modelPath)) {
    warned.add(modelPath)
    console.warn(
      `[ar] ${modelPath} will not reach AR exactly as the page renders it:\n` +
        hazards.map((name) => `       ${name} — ${AR_HAZARDS[name]}`).join('\n')
    )
  }
  return hazards
}

export type ConfiguredModel =
  | {
      ok: true
      bytes: ArrayBuffer
      hazards: string[]
      modelPath: string
      cacheKey: string
      /** False when the source could not be parsed and is being served as
       *  authored — the colours and fabrics did not make it. */
      patched: boolean
    }
  | { ok: false; status: number; message: string }

/**
 * Resolve the query to a dressed GLB.
 *
 * Every path here is resolved from the manifest, never from the request:
 * `layer` and `tex` *select* files, they never name one, so no query can reach
 * an asset the manifest has not published.
 */
export async function buildConfiguredGlb(key: string, params: URLSearchParams): Promise<ConfiguredModel> {
  const layer = params.get('layer') ?? ''
  const zone = params.get('zone')
  const paint = decodePaint(params.get('paint'))

  if (!isPresentationZone(zone) || !paint) return { ok: false, status: 400, message: 'bad zone or paint' }

  const presentation = resolvePresentation(key)
  if (!presentation) return { ok: false, status: 404, message: 'unknown product' }

  const modelPath = arModelPath(presentation.config, layer)
  // Null only for a product with no cover variants at all: there is no finished
  // piece to place in a room, and the page falls back to the published GLB.
  if (!modelPath) return { ok: false, status: 404, message: 'no AR model for product' }

  const source = await readPublicFile(modelPath)
  if (!source) return { ok: false, status: 404, message: 'model not found' }

  // `readFile` hands back a Buffer over a pooled, oversized ArrayBuffer, so the
  // slice is both the copy and the trim. Cast: Node types it as ArrayBufferLike.
  const bytes = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength
  ) as ArrayBuffer

  /**
   * The fabrics, one per zone, resolved from the manifest exactly the way
   * `layer` is.
   *
   * A malformed `tex`, or a swatch id the palette does not publish, is a 400 —
   * matching how `decodePaint` refuses a malformed tuple rather than guessing. A
   * swatch that publishes files which are not on disk is *not*: that zone falls
   * through to the colour-only patch, so a half-deployed texture set shows the
   * authored cloth on that part instead of breaking AR for the whole piece.
   */
  const texParam = params.get('tex')
  const selection = decodeSwatches(texParam, zone)
  if (texParam && !selection) return { ok: false, status: 400, message: 'bad swatch selection' }

  /**
   * A file we cannot patch is still a file the viewer loaded happily.
   *
   * So a parse failure serves the source as authored rather than 500-ing: the
   * piece reaches the room in its own colours, which is a smaller lie than no
   * AR at all. Deliberately scoped to the patching — a bad *query* is still a
   * 400 above, because that one is a bug in the caller and hiding it helps
   * nobody.
   */
  let json: any
  try {
    json = readGlbJson(bytes)
  } catch (error) {
    console.error('[ar] unparseable GLB, serving as authored', modelPath, error)
    return { ok: true, bytes, hazards: [], modelPath, cacheKey: `${key}?${params.toString()}`, patched: false }
  }

  const hazards = reportHazards(modelPath, json)
  /**
   * Splits `json` where one material is worn by two zones, so the cushions can
   * be dressed without the couch — @see splitZonesByMaterial. Every index below,
   * and every index in the edits, belongs to the document this returns.
   */
  const byZone = splitZonesByMaterial(json, zone, presentation.config.parts)

  /** One read per file, so a cloth two zones share — or the normal map the
   *  whole palette shares — is fetched once and appended once. */
  const files = new Map<string, Uint8Array | null>()
  const loadKtx2 = async (publicPath: string) => {
    if (!files.has(publicPath)) {
      const read = await readPublicFile(publicPath)
      files.set(publicPath, read ? new Uint8Array(read) : null)
    }
    return files.get(publicPath) ?? null
  }

  const injections: TextureInjection[] = []
  for (const [swatchZone, swatchId] of Object.entries(selection ?? {})) {
    if (!isPresentationZone(swatchZone)) continue
    const swatch = findSwatch(presentation.config, swatchZone, swatchId, layer)
    if (!swatch) return { ok: false, status: 400, message: 'unknown swatch' }
    if (!isTextureSwatch(swatch)) continue

    const slots: [InjectableSlot, string | undefined][] = [
      ['baseColorTexture', swatch.maps?.map],
      ['normalTexture', swatch.maps?.normalMap],
    ]
    const maps: TextureInjection['maps'] = {}
    for (const [slot, publicPath] of slots) {
      if (!publicPath) continue
      const ktx2 = await loadKtx2(publicPath)
      if (ktx2) maps[slot] = { source: publicPath, bytes: ktx2 }
    }
    if (!Object.keys(maps).length) continue

    /**
     * Which materials wear this fabric.
     *
     * The zone comes first, resolved through the same part rules the page
     * walks — so a shawl swatch reaches the shawl group and nothing else, and
     * the couch keeps its own cloth. A swatch may narrow further by material
     * name, for a group holding both upholstery and piping; the intersection
     * is what the page does too, and it is why a cover swatch listing every
     * fabric material still only dresses the couch.
     */
    const inZone = new Set(
      [...byZone.entries()].filter(([, materialZone]) => materialZone === swatchZone).map(([index]) => index)
    )
    const narrowed = swatch.materials?.length
      ? new Set([...inZone].filter((index) => materialIndicesByName(json, swatch.materials).has(index)))
      : inZone
    if (!narrowed.size) {
      // Silence here is what hid the split bug: a zone whose cloth reached no
      // material simply did not travel, and the page looked right.
      console.warn(`[ar] ${modelPath} — no ${swatchZone} material for swatch "${swatchId}", cloth not applied`)
      continue
    }
    injections.push({ materials: narrowed, maps })
  }

  try {
    const patched = patchGlbMaterials(bytes, editsFromZones(byZone, paint), injections, json)
    return { ok: true, bytes: patched, hazards, modelPath, cacheKey: `${key}?${params.toString()}`, patched: true }
  } catch (error) {
    console.error('[ar] patch failed, serving as authored', modelPath, error)
    return { ok: true, bytes, hazards, modelPath, cacheKey: `${key}?${params.toString()}`, patched: false }
  }
}

/**
 * A tiny LRU, shared in shape by both routes.
 *
 * Small enough to be free, large enough to cover a customer trying swatches.
 * The browser's own cache does the real work — every response is immutable,
 * because the query fully determines the bytes.
 */
export function createLru<T>(limit: number) {
  const map = new Map<string, T>()
  return {
    get: (key: string) => map.get(key),
    set: (key: string, value: T) => {
      map.delete(key)
      map.set(key, value)
      while (map.size > limit) map.delete(map.keys().next().value as string)
    },
  }
}
