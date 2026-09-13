import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { arModelPath, findSwatch, isTextureSwatch, resolvePresentation } from '@/lib/product/presentation'
import { decodePaint, isPresentationZone } from '@/lib/ar/arSource'
import {
  materialIndicesByName,
  patchGlbMaterials,
  readGlbJson,
  zoneEditsFromJson,
  zonesByMaterial,
  type InjectableSlot,
  type TextureInjection,
} from '@/lib/ar/glbPatch'

/**
 * The configured piece, as a real file at a real URL.
 *
 * `GET /api/ar/<key>/model.glb?layer=<frame|variantId>&zone=<wood|cover|cushion>&paint=<base64url>&tex=<swatchId>`
 *
 * This is the whole Android fix. Scene Viewer fetches the model itself and will
 * not touch a `blob:`, so every Android phone without WebXR used to fall back to
 * the static, uncustomised file — the customer picked a colour and then saw the
 * default one in their room. An https URL removes that split entirely.
 *
 * The work is a JSON-chunk rewrite (@see lib/ar/glbPatch.ts): the BIN chunk is
 * copied byte for byte, so the response is the source file's size and the Draco
 * compression it was authored with survives. That is the difference between this
 * and the `GLTFExporter` round-trip it replaces, which decompressed everything
 * and came back 8x larger.
 *
 * `tex` is the one thing that adds bytes. A colour is a number and fits in the
 * JSON; a fabric is an image, and showing the customer the cloth they chose
 * means putting it in the file — appended to the end of BIN, with the material's
 * texture reference repointed at it. Still nothing decompressed and nothing
 * re-encoded: the response is the input plus the one fabric, on the order of a
 * megabyte against `AR_GLB_WARN_BYTES`' fifteen.
 */

// fs, and a response measured in megabytes: not the edge.
export const runtime = 'nodejs'

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
async function readPublicFile(publicPath: string): Promise<Buffer | null> {
  const file = path.resolve(PUBLIC_DIR, `.${publicPath}`)
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return null
  try {
    return await readFile(file)
  } catch {
    return null
  }
}

/** Small enough to be free, large enough to cover a customer trying swatches.
 *  The browser's own cache does the real work — every response is immutable. */
const CACHE_LIMIT = 6
const cache = new Map<string, ArrayBuffer>()

function remember(key: string, value: ArrayBuffer) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
}

function glbResponse(body: ArrayBuffer) {
  return new Response(body, {
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Content-Length': String(body.byteLength),
      // The query fully determines the bytes, so this URL can never go stale.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Scene Viewer and Quick Look are launched by the OS, from outside the page.
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export async function GET(request: Request, { params }: { params: { key: string } }) {
  const url = new URL(request.url)
  const layer = url.searchParams.get('layer') ?? ''
  const zone = url.searchParams.get('zone')
  const paint = decodePaint(url.searchParams.get('paint'))

  if (!isPresentationZone(zone) || !paint) {
    return new Response('bad zone or paint', { status: 400 })
  }

  const presentation = resolvePresentation(params.key)
  if (!presentation) return new Response('unknown product', { status: 404 })

  const cacheKey = `${params.key}?${url.searchParams.toString()}`
  const cached = cache.get(cacheKey)
  if (cached) return glbResponse(cached)

  // Resolved from the manifest, never from the request: `layer` selects a file,
  // it does not name one, so no query can reach a path the manifest has not
  // published. The containment check below is the second lock on the same door.
  const modelPath = arModelPath(presentation.config, layer)
  // Null only for a product with no cover variants at all: there is no finished
  // piece to place in a room, and the page falls back to the published GLB.
  if (!modelPath) return new Response('no AR model for product', { status: 404 })

  // `public/models` is gitignored, so a deploy missing its assets is a real
  // case. The page falls back to the static product GLB on this.
  const source = await readPublicFile(modelPath)
  if (!source) return new Response('model not found', { status: 404 })

  // `readFile` hands back a Buffer over a pooled, oversized ArrayBuffer, so the
  // slice is both the copy and the trim. Cast: Node types it as ArrayBufferLike.
  const bytes = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength
  ) as ArrayBuffer

  /**
   * The fabric, resolved from the manifest exactly the way `layer` is.
   *
   * A swatch id the palette does not publish is a 400, matching how
   * `decodePaint` refuses a malformed tuple rather than guessing. A swatch that
   * publishes files which are not on disk is *not* — that falls through to the
   * colour-only patch, so a half-deployed texture set shows the authored cloth
   * instead of breaking AR.
   */
  const texId = url.searchParams.get('tex')
  const swatch = texId ? findSwatch(presentation.config, zone, texId, layer) : null
  if (texId && !swatch) return new Response('unknown swatch', { status: 400 })

  try {
    const json = readGlbJson(bytes)

    let injection: TextureInjection | undefined
    if (swatch && isTextureSwatch(swatch)) {
      const slots: [InjectableSlot, string | undefined][] = [
        ['baseColorTexture', swatch.maps?.map],
        ['normalTexture', swatch.maps?.normalMap],
      ]
      const maps: TextureInjection['maps'] = {}
      for (const [slot, publicPath] of slots) {
        if (!publicPath) continue
        const ktx2 = await readPublicFile(publicPath)
        if (ktx2) maps[slot] = new Uint8Array(ktx2)
      }
      if (Object.keys(maps).length) {
        /**
         * Which materials wear this fabric.
         *
         * The zone comes first, resolved through the same part rules the page
         * walks — so a shawl swatch reaches the shawl group and nothing else,
         * and the couch keeps its own cloth. A swatch may narrow further by
         * material name, for a group holding both upholstery and piping.
         */
        const byZone = zonesByMaterial(json, zone, presentation.config.parts)
        const inZone = new Set(
          [...byZone.entries()].filter(([, materialZone]) => materialZone === zone).map(([index]) => index)
        )
        const narrowed = swatch.materials?.length
          ? new Set([...inZone].filter((index) => materialIndicesByName(json, swatch.materials).has(index)))
          : inZone
        injection = { materials: narrowed, maps }
      }
    }

    const patched = patchGlbMaterials(
      bytes,
      zoneEditsFromJson(json, zone, paint, presentation.config.parts),
      injection
    )
    remember(cacheKey, patched)
    return glbResponse(patched)
  } catch (error) {
    console.error('[ar] patch failed', modelPath, error)
    // A file we cannot parse is still a file the viewer loaded happily, so serve
    // it as authored rather than failing: the piece appears in its own colours,
    // which beats no AR at all.
    return glbResponse(bytes)
  }
}
