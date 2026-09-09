import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { arModelPath, resolvePresentation } from '@/lib/product/presentation'
import { decodePaint, isPresentationZone } from '@/lib/ar/arSource'
import { patchGlbMaterials, readGlbJson, zoneEditsFromJson } from '@/lib/ar/glbPatch'

/**
 * The configured piece, as a real file at a real URL.
 *
 * `GET /api/ar/<key>/model.glb?layer=<frame|variantId>&zone=<wood|cover|cushion>&paint=<base64url>`
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
 */

// fs, and a response measured in megabytes: not the edge.
export const runtime = 'nodejs'

const PUBLIC_DIR = path.join(process.cwd(), 'public')

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
  const file = path.resolve(PUBLIC_DIR, `.${modelPath}`)
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    return new Response('bad model path', { status: 400 })
  }

  let source: Buffer
  try {
    source = await readFile(file)
  } catch {
    // `public/models` is gitignored, so a deploy missing its assets is a real
    // case. The page falls back to the static product GLB on this.
    return new Response('model not found', { status: 404 })
  }

  // `readFile` hands back a Buffer over a pooled, oversized ArrayBuffer, so the
  // slice is both the copy and the trim. Cast: Node types it as ArrayBufferLike.
  const bytes = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength
  ) as ArrayBuffer

  try {
    const json = readGlbJson(bytes)
    const patched = patchGlbMaterials(bytes, zoneEditsFromJson(json, zone, paint))
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
