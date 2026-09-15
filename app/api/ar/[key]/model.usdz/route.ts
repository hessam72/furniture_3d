import { buildConfiguredGlb, createLru } from '@/lib/ar/configuredModel'
import { resolvePresentation } from '@/lib/product/presentation'
import { glbToUsdz } from '@/lib/ar/usdz'

/**
 * The same configured piece, as a USDZ — the iOS half of AR.
 *
 * `GET /api/ar/<key>/model.usdz?layer=…&zone=…&paint=…&tex=…`
 *
 * Identical query to `model.glb`, and deliberately so: both are built from
 * `buildConfiguredGlb`, so the couch, the cushions and the shawl wear the same
 * cloth in Quick Look as they do in Scene Viewer and on the page.
 *
 * ## Why this exists at all
 *
 * model-viewer will generate a USDZ in the browser when no `ios-src` is given,
 * and on these models it cannot. Its exporter throws
 * `setTextureUtils() must be called to process compressed textures` on the
 * first Basis texture, `openIOSARQuickLook` has no `catch` around the call, and
 * the rejected promise leaves the AR anchor pointing at the current page — so
 * Safari opens Quick Look on the HTML document and the customer sees a black
 * screen with no camera and no error. @see lib/ar/usdz.ts
 *
 * Pointing `ios-src` here fixes that at the cause, and recovers what the static
 * fallback gave up: the chosen fabric reaches the room.
 *
 * ## Cost, and why the cache is not optional
 *
 * A conversion is ~1.5–3s of CPU and ~10MB out: Draco decode, a Basis
 * transcode per texture, JPEG/PNG encode, then the zip. That is fine once per
 * configuration and unacceptable per request, so results are held in memory and
 * the response is immutable — the query fully determines the bytes, so the
 * browser and Quick Look never need to ask twice.
 */

// fs, wasm decoders, and a response measured in megabytes: not the edge.
export const runtime = 'nodejs'
// A cold conversion on a large piece is seconds, not milliseconds.
export const maxDuration = 60

const cache = createLru<{ body: Uint8Array; stats: Record<string, number> }>(4)

function usdzResponse(body: Uint8Array, stats: Record<string, number>) {
  return new Response(body as unknown as BodyInit, {
    headers: {
      // The type Quick Look dispatches on. Safari will not open the file
      // without it, however the URL is spelled.
      'Content-Type': 'model/vnd.usdz+zip',
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Quick Look is launched by the OS, from outside the page.
      'Access-Control-Allow-Origin': '*',
      // What went in, for the `?debug` readout and for a look at the log when a
      // device refuses a file: size is the usual reason.
      'X-AR-Usdz': `meshes=${stats.meshes},tris=${stats.triangles},textures=${stats.textures}`,
      'Access-Control-Expose-Headers': 'X-AR-Usdz, Content-Length',
    },
  })
}

export async function GET(request: Request, { params }: { params: { key: string } }) {
  const url = new URL(request.url)
  const cacheKey = `${params.key}?${url.searchParams.toString()}`
  const cached = cache.get(cacheKey)
  if (cached) return usdzResponse(cached.body, cached.stats)

  const built = await buildConfiguredGlb(params.key, url.searchParams)
  if (!built.ok) return new Response(built.message, { status: built.status })

  try {
    const started = Date.now()
    const { bytes, stats } = await glbToUsdz(built.bytes, { name: params.key })
    console.log(
      `[ar] usdz ${built.modelPath} — ${stats.meshes} meshes, ${stats.triangles} tris, ` +
        `${stats.textures} textures, ${(stats.bytes / 1e6).toFixed(1)}MB in ${Date.now() - started}ms`
    )
    cache.set(cacheKey, { body: bytes, stats })
    return usdzResponse(bytes, stats)
  } catch (error) {
    /**
     * Fall back to the product's authored USDZ, by redirect.
     *
     * Not to the source GLB, the way the sibling route does: a GLB that will
     * not patch is still a GLB Scene Viewer can open, but Quick Look given
     * anything that is not a USDZ is exactly the black screen this route exists
     * to remove. The redirect is what keeps that promise — `ios-src` always
     * resolves to a real USDZ, so the worst case is the piece in its authored
     * finish rather than the chosen one, and never a dead viewer.
     *
     * `302`, not `301`: the next deploy may well convert this same
     * configuration successfully, and a permanent redirect would be cached past
     * the fix.
     */
    console.error('[ar] usdz conversion failed', built.modelPath, error)
    const authored = resolvePresentation(params.key)?.product?.usdzPath
    if (authored) return Response.redirect(new URL(authored, url.origin), 302)
    return new Response('could not build usdz', { status: 500 })
  }
}
