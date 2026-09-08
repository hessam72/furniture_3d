import { createReadStream } from 'fs'
import { Readable } from 'stream'

/**
 * Stream one stored file back.
 *
 * Shared by the model and environment routes because both answer the same
 * question: uploads cannot live under `public/` (Next indexes that directory at
 * boot, so a file written later 404s until the process restarts), so every
 * upload is read from `data/uploads` per request instead — which is also what
 * makes a delete take effect immediately.
 *
 * Streamed rather than buffered: a 100MB file read into memory to answer one
 * request is the kind of spike this app trims everywhere else. The id is unique
 * per upload and its bytes never change, so the response is immutable for a
 * year; deleting the model removes the URL, not its cache.
 */
export function fileResponse(
  path: string,
  { type, size, filename }: { type: string; size: number; filename: string }
): Response {
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream

  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Named for the human downloading it, not for the id it is stored under.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}

/** Content type from the stored extension. Neither loader sniffs it, but a
 *  browser opening the URL directly should not be handed octet-stream. */
export function contentTypeFor(file: string): string {
  if (file.endsWith('.gltf')) return 'model/gltf+json'
  if (file.endsWith('.glb')) return 'model/gltf-binary'
  if (file.endsWith('.hdr')) return 'image/vnd.radiance'
  if (file.endsWith('.exr')) return 'image/x-exr'
  return 'application/octet-stream'
}
