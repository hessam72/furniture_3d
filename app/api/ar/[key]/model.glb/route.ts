import { buildConfiguredGlb, createLru } from '@/lib/ar/configuredModel'

/**
 * The configured piece, as a real file at a real URL.
 *
 * `GET /api/ar/<key>/model.glb?layer=<frame|variantId>&zone=<fallback zone>&paint=<base64url>&tex=<per-zone swatch ids>`
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
 * The building of it now lives in `lib/ar/configuredModel`, shared with the
 * USDZ route — iOS needs the same configuration in a format Quick Look reads,
 * and two routes deriving "what the customer chose" separately is how the page
 * and the room start disagreeing. @see app/api/ar/[key]/model.usdz/route.ts
 *
 * What the patch *cannot* carry, it names: `X-AR-Compat` lists the extensions
 * this file declares that Scene Viewer or Quick Look drop in silence. @see
 * arHazards — the point is that a difference between the page and the room is
 * never again something you have to notice by eye.
 */

// fs, and a response measured in megabytes: not the edge.
export const runtime = 'nodejs'

const cache = createLru<{ body: ArrayBuffer; hazards: string[] }>(6)

function glbResponse(body: ArrayBuffer, hazards: string[] = []) {
  return new Response(body, {
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Content-Length': String(body.byteLength),
      // The query fully determines the bytes, so this URL can never go stale.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Scene Viewer and Quick Look are launched by the OS, from outside the page.
      'Access-Control-Allow-Origin': '*',
      // What AR will lose from this file, for the page's `?debug` readout.
      // Exposed, or a cross-origin HEAD cannot read it.
      'X-AR-Compat': hazards.join(',') || 'ok',
      'Access-Control-Expose-Headers': 'X-AR-Compat, Content-Length',
    },
  })
}

export async function GET(request: Request, { params }: { params: { key: string } }) {
  const url = new URL(request.url)
  const cacheKey = `${params.key}?${url.searchParams.toString()}`
  const cached = cache.get(cacheKey)
  if (cached) return glbResponse(cached.body, cached.hazards)

  try {
    const built = await buildConfiguredGlb(params.key, url.searchParams)
    if (!built.ok) return new Response(built.message, { status: built.status })
    cache.set(cacheKey, { body: built.bytes, hazards: built.hazards })
    return glbResponse(built.bytes, built.hazards)
  } catch (error) {
    console.error('[ar] patch failed', params.key, error)
    return new Response('could not build model', { status: 500 })
  }
}
