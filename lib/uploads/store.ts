import { randomUUID } from 'crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises'
import path from 'path'

/**
 * The upload library: a folder of models plus a JSON index, no database and no
 * auth, by request.
 *
 * It lives in `data/uploads`, **not** under `public/`, and that is not a
 * preference — Next snapshots the public directory when the server boots, so a
 * file written into it afterwards is served as a 404 until the process
 * restarts. Verified: upload, then GET the file, then 404. Uploads are
 * therefore streamed back by a route handler that reads this directory per
 * request. @see app/api/uploads/[id]/file
 *
 * The index is rewritten whole on every change. With a handful of models that
 * is cheaper and far easier to reason about than an append log, and a torn
 * write is recovered by `readIndex` rather than crashing the page.
 */
export interface UploadedAsset {
  /** URL segment and file stem — generated here, never taken from the upload. */
  id: string
  /** The original filename, shown in the manager. Display only. */
  name: string
  /** Name on disk: `<id><ext>`. Never a client-supplied path. */
  file: string
  size: number
  uploadedAt: string
}

const ROOT = path.join(process.cwd(), 'data', 'uploads')
const INDEX = path.join(ROOT, 'index.json')

/** What the loader can actually open. */
export const ALLOWED_EXTENSIONS = ['.glb', '.gltf']
/** Refused above this. A GLB past it will not survive a phone's AR path either. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

async function readIndex(): Promise<UploadedAsset[]> {
  try {
    const raw = await readFile(INDEX, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as UploadedAsset[]) : []
  } catch {
    // Missing on a fresh install, and unreadable only if a write was cut short.
    // Either way an empty library is the honest answer, not a 500.
    return []
  }
}

async function writeIndex(assets: UploadedAsset[]): Promise<void> {
  await mkdir(ROOT, { recursive: true })
  await writeFile(INDEX, JSON.stringify(assets, null, 2), 'utf8')
}

/** Newest first — the manager lists what was just added at the top. */
export async function listAssets(): Promise<UploadedAsset[]> {
  const assets = await readIndex()
  return assets.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

export async function getAsset(id: string): Promise<UploadedAsset | null> {
  return (await readIndex()).find((asset) => asset.id === id) ?? null
}

/** Absolute path of a stored model. `path.basename` is belt-and-braces: the
 *  name in the index was generated here, and this guarantees it stays a leaf. */
export function assetPath(asset: UploadedAsset): string {
  return path.join(ROOT, path.basename(asset.file))
}

/** The extension of an uploaded filename, lowercased, or '' if it has none. */
export function extensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : ''
}

/**
 * Store one uploaded model and index it.
 *
 * The filename the browser sent is never used as a path — only its extension
 * survives, and the file is written as `<uuid><ext>`. That is what makes the
 * endpoint safe to leave unauthenticated: there is no traversal to attempt, no
 * name to collide with, and nothing executable can be written.
 */
export async function addAsset(name: string, ext: string, data: Buffer): Promise<UploadedAsset> {
  const id = randomUUID()
  await mkdir(ROOT, { recursive: true })
  await writeFile(path.join(ROOT, `${id}${ext}`), data)

  const asset: UploadedAsset = {
    id,
    name,
    file: `${id}${ext}`,
    size: data.byteLength,
    uploadedAt: new Date().toISOString(),
  }
  await writeIndex([asset, ...(await readIndex())])
  return asset
}

/** Drop the index entry, then the file. Missing either way is a success. */
export async function removeAsset(id: string): Promise<boolean> {
  const assets = await readIndex()
  const asset = assets.find((entry) => entry.id === id)
  if (!asset) return false

  await writeIndex(assets.filter((entry) => entry.id !== id))
  try {
    await unlink(assetPath(asset))
  } catch {
    // Already gone — the library is what the index says, and it no longer
    // mentions this file.
  }
  return true
}

/** Files on disk with no index entry. Diagnostics only; nothing calls it in a
 *  request path. */
export async function orphanFiles(): Promise<string[]> {
  try {
    const [files, assets] = await Promise.all([readdir(ROOT), readIndex()])
    const known = new Set(assets.map((asset) => asset.file))
    return files.filter((file) => file !== 'index.json' && !known.has(file))
  } catch {
    return []
  }
}
