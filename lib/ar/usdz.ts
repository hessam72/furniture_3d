/**
 * A configured GLB to a USDZ Quick Look will open.
 *
 * This exists because model-viewer cannot do it. Its bundled `USDZExporter`
 * throws `setTextureUtils() must be called to process compressed textures` the
 * moment it meets a Basis texture, `openIOSARQuickLook` has no `catch` around
 * the call, and the rejected promise leaves the anchor pointing at the current
 * page — so Safari opens Quick Look on the HTML document and the customer gets
 * a black screen. @see ARProductViewer's note on `usdzPath`.
 *
 * Doing it on the server fixes the cause rather than the symptom, and buys the
 * thing the `ios-src` fallback gave up: the fabric the customer actually chose
 * travels into the room, because this converts the same patched GLB the route
 * already builds for Scene Viewer.
 *
 * ## Why not three's exporter here either
 *
 * It is a good exporter and it cannot run in this process. `imageToCanvas`
 * needs `document.createElement('canvas')` and `canvas.toBlob`, `GLTFLoader`
 * needs workers for Draco and a live `WebGLRenderer` for KTX2 — every one of
 * those is a browser. Reading the glTF directly (@see ./glbGeometry) and
 * writing the USDA text is less code than shimming a DOM would be, and it is
 * the half of the problem that is genuinely simple: no animation, no skinning,
 * no instancing, one UV set.
 */

import { readScene, sanitise, type GltfScene, type Primitive } from './glbGeometry'
import { crc32, encodeJpeg, encodePng, ktx2ToRgba, type Rgba } from './nodeCodecs'

/**
 * The cap on any texture edge in the USDZ.
 *
 * Quick Look holds the whole file in memory and these are uncompressed images
 * inside an uncompressed zip: a dozen 1024² textures is a ~25MB download that
 * an older iPhone declines to open. Served from the `.ktx2`'s own mip chain, so
 * asking for less decodes less. @see ktx2ToRgba
 */
export const USDZ_MAX_TEXTURE_SIZE = 1024

/** JPEG quality for colour maps. High enough that a weave does not turn to
 *  mush at arm's length, low enough to keep the file openable. */
const JPEG_QUALITY = 82

/**
 * Normal maps get half the edge of a colour map.
 *
 * They have to be PNG — a packed vector does not survive JPEG, which is the
 * same reason the texture pipeline gives them UASTC and not ETC1S — and PNG on
 * a 1024² normal map is 2MB against a colour map's 0.2MB. At the distance a
 * phone holds a sofa, the relief is carrying silhouette and sheen, not detail,
 * and 512 carries both. This one constant was a third of the archive.
 */
const NORMAL_MAX_TEXTURE_SIZE = 512

/* ------------------------------------------------------------------ usda --- */

/** What a mesh needs from its material that the primitive itself does not
 *  carry: glTF puts `doubleSided` on the material, USD puts it on the mesh. */
type PrimitiveWithSide = Primitive & { doubleSided: boolean }

/**
 * Numbers, at the precision the format can justify.
 *
 * USDA is ASCII, so every digit is a byte in the archive — and on a real piece
 * the geometry text outweighs every texture in it put together. Positions are
 * metres, so four decimals is a tenth of a millimetre; normals are unit vectors
 * and UVs are 0..1, where four decimals is finer than any screen. Going to six,
 * which is where this started, bought nothing and cost about a third of the
 * file.
 */
const f = (n: number) => {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 1e4) / 1e4
  // `-0` is valid in USDA but noise in a diff and a byte on the wire.
  return (Object.is(rounded, -0) ? 0 : rounded).toString()
}

function points(array: Float32Array): string {
  const parts: string[] = []
  for (let i = 0; i < array.length; i += 3) parts.push(`(${f(array[i])}, ${f(array[i + 1])}, ${f(array[i + 2])})`)
  return parts.join(', ')
}

function uvs(array: Float32Array): string {
  const parts: string[] = []
  for (let i = 0; i < array.length; i += 2) parts.push(`(${f(array[i])}, ${f(array[i + 1])})`)
  return parts.join(', ')
}

function meshPrim(prim: PrimitiveWithSide, index: number, materialName: string | null): string {
  const counts = new Array(prim.indices.length / 3).fill(3).join(', ')
  const lines = [
    `    def Mesh "mesh_${index}"`,
    '    {',
    `        uniform bool doubleSided = ${prim.doubleSided ? 'true' : 'false'}`,
    `        int[] faceVertexCounts = [${counts}]`,
    `        int[] faceVertexIndices = [${Array.from(prim.indices).join(', ')}]`,
    `        point3f[] points = [${points(prim.positions)}]`,
  ]
  if (prim.normals) {
    lines.push(
      `        normal3f[] primvars:normals = [${points(prim.normals)}] (`,
      '            interpolation = "vertex"',
      '        )'
    )
  }
  if (prim.uvs) {
    lines.push(
      `        texCoord2f[] primvars:st = [${uvs(prim.uvs)}] (`,
      '            interpolation = "vertex"',
      '        )'
    )
  }
  if (materialName) lines.push(`        rel material:binding = </Root/Materials/${materialName}>`)
  lines.push('        uniform token subdivisionScheme = "none"', '    }')
  return lines.join('\n')
}

interface ShaderTexture {
  /** Path inside the archive, e.g. `textures/couch_diffuse.jpg`. */
  file: string
}

function materialPrim(
  name: string,
  opts: {
    baseColor: [number, number, number, number]
    metallic: number
    roughness: number
    diffuse: ShaderTexture | null
    normal: ShaderTexture | null
  }
): string {
  const path = `/Root/Materials/${name}`
  const lines = [
    `    def Material "${name}"`,
    '    {',
    `        token outputs:surface.connect = <${path}/surface.outputs:surface>`,
    '',
    '        def Shader "surface"',
    '        {',
    '            uniform token info:id = "UsdPreviewSurface"',
  ]

  if (opts.diffuse) {
    lines.push(`            color3f inputs:diffuseColor.connect = <${path}/diffuse.outputs:rgb>`)
  } else {
    const [r, g, b] = opts.baseColor
    lines.push(`            color3f inputs:diffuseColor = (${f(r)}, ${f(g)}, ${f(b)})`)
  }
  if (opts.normal) {
    lines.push(`            normal3f inputs:normal.connect = <${path}/normal.outputs:rgb>`)
  }
  lines.push(
    `            float inputs:metallic = ${f(opts.metallic)}`,
    `            float inputs:roughness = ${f(opts.roughness)}`,
    '            int inputs:useSpecularWorkflow = 0',
    '            token outputs:surface',
    '        }',
    ''
  )

  if (opts.diffuse || opts.normal) {
    lines.push(
      '        def Shader "uvReader"',
      '        {',
      '            uniform token info:id = "UsdPrimvarReader_float2"',
      '            token inputs:varname = "st"',
      '            float2 inputs:fallback = (0, 0)',
      '            float2 outputs:result',
      '        }',
      ''
    )
  }
  for (const [slot, texture] of [
    ['diffuse', opts.diffuse],
    ['normal', opts.normal],
  ] as const) {
    if (!texture) continue
    lines.push(
      `        def Shader "${slot}"`,
      '        {',
      '            uniform token info:id = "UsdUVTexture"',
      `            asset inputs:file = @${texture.file}@`,
      `            float2 inputs:st.connect = <${path}/uvReader.outputs:result>`,
      '            token inputs:wrapS = "repeat"',
      '            token inputs:wrapT = "repeat"',
      // A normal map is a vector and must not be colour-managed on the way in.
      ...(slot === 'normal' ? ['            token inputs:sourceColorSpace = "raw"'] : []),
      '            float3 outputs:rgb',
      '        }',
      ''
    )
  }
  lines.push('    }')
  return lines.join('\n')
}

/* ------------------------------------------------------------------- zip --- */

/**
 * USDZ is a zip with two rules that are not optional.
 *
 * Every entry is **stored**, never deflated, and every file's payload begins on
 * a **64-byte boundary** — the format is designed to be memory-mapped and read
 * in place, so a compressed or misaligned entry is not a slower USDZ, it is one
 * the reader rejects. The alignment is bought with padding in each local
 * header's extra field, which is the only part of the header a reader is
 * required to skip over.
 *
 * The `.usdc`/`.usda` must also come first, which is why the caller passes the
 * model as entry zero.
 */
function zip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const ALIGN = 64
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const push = (buf: Uint8Array) => {
    chunks.push(buf)
    offset += buf.length
  }

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)

    // 30-byte local header + name, then pad the extra field so the data lands
    // on the boundary.
    let extra = (ALIGN - ((offset + 30 + name.length) % ALIGN)) % ALIGN
    // An extra field carries a 4-byte id/size header of its own, so anything
    // shorter than that cannot be expressed — take another whole block.
    if (extra > 0 && extra < 4) extra += ALIGN
    const localOffset = offset

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(10, 4) // version needed
    header.writeUInt16LE(0, 6) // flags
    header.writeUInt16LE(0, 8) // method: store
    header.writeUInt32LE(0, 10) // time/date
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(entry.data.length, 18)
    header.writeUInt32LE(entry.data.length, 22)
    header.writeUInt16LE(name.length, 26)
    header.writeUInt16LE(extra, 28)
    push(header)
    push(name)
    if (extra) {
      const pad = Buffer.alloc(extra)
      // 0xFACE is what Pixar's own writer uses for the alignment field.
      pad.writeUInt16LE(0xface, 0)
      pad.writeUInt16LE(extra - 4, 2)
      push(pad)
    }
    push(entry.data)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(10, 4) // version made by
    dir.writeUInt16LE(10, 6) // version needed
    dir.writeUInt32LE(0, 10)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(entry.data.length, 20)
    dir.writeUInt32LE(entry.data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(localOffset, 42)
    central.push(dir, name)
  }

  const centralSize = central.reduce((sum, b) => sum + b.length, 0)
  const centralOffset = offset
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(centralOffset, 16)

  return new Uint8Array(Buffer.concat([...chunks, ...central, end]))
}

/* ------------------------------------------------------------------ main --- */

export interface UsdzResult {
  bytes: Uint8Array
  /** For the log and the `X-AR-*` headers: what actually went in. */
  stats: { meshes: number; triangles: number; textures: number; bytes: number }
}

/**
 * Build the archive.
 *
 * `maxTextureSize` is a real cap rather than a hint — @see USDZ_MAX_TEXTURE_SIZE.
 */
export async function glbToUsdz(
  glb: ArrayBuffer,
  options: { maxTextureSize?: number; name?: string } = {}
): Promise<UsdzResult> {
  const maxEdge = options.maxTextureSize ?? USDZ_MAX_TEXTURE_SIZE
  const scene: GltfScene = await readScene(glb, maxEdge)

  /**
   * Images are converted once and shared.
   *
   * A palette's normal map is named by every swatch in it, and two zones often
   * wear the same cloth — decoding that file per material would be the bulk of
   * the work for none of the benefit, and would put the same megabyte into the
   * archive several times over.
   */
  const files: { name: string; data: Uint8Array }[] = []
  const converted = new Map<number, ShaderTexture | null>()

  const convert = async (imageIndex: number | null, isNormal: boolean): Promise<ShaderTexture | null> => {
    if (imageIndex == null) return null
    if (converted.has(imageIndex)) return converted.get(imageIndex)!

    const image = scene.images[imageIndex]
    let result: ShaderTexture | null = null
    if (image) {
      let rgba: Rgba | null = null
      if (image.mimeType === 'image/ktx2' || isKtx2(image.bytes)) {
        rgba = await ktx2ToRgba(image.bytes, isNormal ? Math.min(maxEdge, NORMAL_MAX_TEXTURE_SIZE) : maxEdge)
      } else if (image.mimeType === 'image/png' || image.mimeType === 'image/jpeg') {
        // Already a format Quick Look reads — pass it through untouched rather
        // than decode and re-encode, which would only lose quality.
        const ext = image.mimeType === 'image/png' ? 'png' : 'jpg'
        const name = `textures/image_${imageIndex}.${ext}`
        files.push({ name, data: image.bytes })
        result = { file: name }
      }
      // WebP lands here and stays unconverted: there is no decoder in this
      // process and USDZ could not carry it anyway. @see AR_HAZARDS.
      if (rgba) {
        const name = `textures/image_${imageIndex}.${isNormal ? 'png' : 'jpg'}`
        files.push({ name, data: isNormal ? encodePng(rgba) : encodeJpeg(rgba, JPEG_QUALITY) })
        result = { file: name }
      }
    }
    converted.set(imageIndex, result)
    return result
  }

  const materialBlocks: string[] = []
  const materialNames: (string | null)[] = []
  const used = new Set<string>()

  for (const material of scene.materials) {
    let name = sanitise(material.name)
    while (used.has(name)) name = `${name}_`
    used.add(name)
    materialNames.push(name)
    materialBlocks.push(
      materialPrim(name, {
        baseColor: material.baseColor,
        metallic: material.metallic,
        roughness: material.roughness,
        diffuse: await convert(material.baseColorImage, false),
        normal: await convert(material.normalImage, true),
      })
    )
  }

  const meshes = scene.primitives.map((prim, index) => {
    const withSide: PrimitiveWithSide = {
      ...prim,
      doubleSided: prim.material != null ? scene.materials[prim.material]?.doubleSided === true : false,
    }
    return meshPrim(withSide, index, prim.material != null ? materialNames[prim.material] ?? null : null)
  })

  const usda = [
    '#usda 1.0',
    '(',
    '    customLayerData = {',
    '        string creator = "furniture_3d AR route"',
    '    }',
    '    defaultPrim = "Root"',
    '    metersPerUnit = 1',
    '    upAxis = "Y"',
    ')',
    '',
    'def Xform "Root"',
    '{',
    // Quick Look reads this to decide whether the placement UI may resize the
    // piece. Furniture has a real size, and `ar-scale="fixed"` on the page says
    // the same thing — they must not disagree.
    '    token preliminary:anchoring:type = "plane"',
    '    token preliminary:planeAnchoring:alignment = "horizontal"',
    '',
    ...meshes,
    '',
    '    def Scope "Materials"',
    '    {',
    ...materialBlocks,
    '    }',
    '}',
    '',
  ].join('\n')

  const triangles = scene.primitives.reduce((sum, p) => sum + p.indices.length / 3, 0)
  // The model must be the first entry in the archive.
  const bytes = zip([{ name: `${sanitise(options.name ?? 'model')}.usda`, data: Buffer.from(usda, 'utf8') }, ...files])

  return {
    bytes,
    stats: { meshes: scene.primitives.length, triangles, textures: files.length, bytes: bytes.length },
  }
}

/** KTX2's 12-byte identifier, for files whose glTF `mimeType` lies or is absent. */
function isKtx2(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[0] === 0xab &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x58 &&
    bytes[4] === 0x20 &&
    bytes[5] === 0x32 &&
    bytes[6] === 0x30
  )
}
