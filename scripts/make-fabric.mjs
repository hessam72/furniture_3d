#!/usr/bin/env node
/**
 * Seamless upholstery basecolours, drawn from the construction up.
 *
 *   node scripts/make-fabric.mjs out/                 # all eight, 1024²
 *   SIZE=512 node scripts/make-fabric.mjs out/ velvet-emerald
 *
 * These are **generated, not photographed**, and the distinction matters enough
 * to say at the top of the file: a real photographed swatch book is the better
 * asset and should replace these the moment someone can license one. What they
 * are is honest about the *construction* — a twill actually steps its float one
 * end per pick, a herringbone actually reverses direction, corduroy actually has
 * wales with a pile crown between them — because that is what tells two greys
 * apart at swatch size, and a blurred photograph of the wrong weave would not.
 *
 * Everything here is periodic in `SIZE`, so the output tiles. That is not a nice
 * extra: `SwatchGrid`'s stack layout repeats the thumbnail across the band, and
 * the piece itself repeats the map across the upholstery. A texture with a seam
 * shows it in both places, once per repeat.
 *
 * Written with node's zlib and nothing else — same as scripts/ktx2-thumb.mjs,
 * and for the same reason: there is no ImageMagick and no sharp on the machines
 * this has to run on, and a PNG writer is forty lines.
 *
 * Feed the output to the encoder, never ship it as PNG:
 *   node scripts/ktx2-encode.mjs public/textures/covers out/*.png
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import path from 'node:path'

const SIZE = Number(process.env.SIZE) || 1024

/* ---------------------------------------------------------------- noise --- */

/** Deterministic hash of a lattice point. Integer in, [0,1) out. */
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

/**
 * Value noise that wraps.
 *
 * `cells` lattice points across the image, and the lattice index is taken mod
 * `cells` — which is the whole trick, and why `cells` must divide into the
 * image evenly. Get this wrong and every fabric has a visible seam down one
 * edge that only shows up once it is tiled.
 */
function noise(x, y, cells, seed) {
  const s = SIZE / cells
  const fx = x / s
  const fy = y / s
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = smooth(fx - x0)
  const ty = smooth(fy - y0)
  const wrap = (v) => ((v % cells) + cells) % cells
  const a = hash(wrap(x0), wrap(y0), seed)
  const b = hash(wrap(x0 + 1), wrap(y0), seed)
  const c = hash(wrap(x0), wrap(y0 + 1), seed)
  const d = hash(wrap(x0 + 1), wrap(y0 + 1), seed)
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
}

/** Octaves of the above. Each octave doubles `cells`, so each still wraps. */
function fbm(x, y, cells, octaves, seed) {
  let sum = 0
  let amp = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x, y, cells << o, seed + o * 101)
    norm += amp
    amp *= 0.5
  }
  return sum / norm
}

/* ------------------------------------------------------------- colouring --- */

const hex = (s) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
]
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Multiply a base colour by a light value around 1, keeping it in gamut. */
function shade(base, light, tintR = 1, tintG = 1, tintB = 1) {
  return [
    clamp(Math.round(base[0] * light * tintR)),
    clamp(Math.round(base[1] * light * tintG)),
    clamp(Math.round(base[2] * light * tintB)),
  ]
}

/* ------------------------------------------------------------ structures --- */

/**
 * A woven cloth, from its interlacing.
 *
 * `over(col, row)` decides whether the warp (vertical yarn) or the weft
 * (horizontal one) is on top at that crossing, which is what a weave *is*:
 * plain cloth alternates every end, a twill steps the float along by one per
 * pick and so runs diagonally, a herringbone reverses that step every few ends.
 *
 * Whichever yarn is on top catches the light, and the one underneath sits in
 * its shadow — that alone reads as cloth. The rest is yarn: a bit of round
 * shading across each thread so it is cylindrical rather than square, and slubs
 * (slow thickness variation along the yarn) so it is spun rather than extruded.
 */
function weave({ pitch, over, yarn = 0.55, slub = 0.1, seed = 1 }) {
  // The thread pitch has to divide the image or the last thread is a sliver and
  // the tile has a seam down two of its edges. Cheap to assert, invisible to
  // debug: it shows up only once the texture is repeated, as a hard line.
  if (SIZE % pitch !== 0) throw new Error(`weave pitch ${pitch} does not divide SIZE ${SIZE}`)
  return (x, y, base) => {
    const col = Math.floor(x / pitch)
    const row = Math.floor(y / pitch)
    const warpUp = over(col, row)

    // Position across the thread that is on top, -1..1 — round shading.
    const across = (((warpUp ? x : y) % pitch) / pitch) * 2 - 1
    const round = 1 - 0.42 * across * across

    // Slubs run *along* the yarn, so they vary with the other axis.
    const along = warpUp ? y : x
    const thick = 1 + slub * (fbm(warpUp ? col * pitch : along, warpUp ? along : row * pitch, 32, 2, seed) - 0.5) * 2

    const shadow = warpUp ? 1 : 1 - yarn * 0.22
    const fibre = 1 + 0.05 * (fbm(x, y, 256, 2, seed + 7) - 0.5) * 2

    return shade(base, round * thick * shadow * fibre)
  }
}

/**
 * Positive modulo.
 *
 * Not a nicety. `herringbone` reverses its step, so its float index goes
 * negative in every other band, and JavaScript's `%` keeps the sign: `-5 % 4`
 * is `-1`, which passes a `< 2` test that `3` fails. The pattern therefore
 * flipped wherever the expression crossed zero — which moved with the row, so
 * the weave did not repeat vertically and the tile had a seam along one edge.
 * Caught by comparing `f(x, SIZE)` against `f(x, 0)` directly; it is invisible
 * in the image until the texture is repeated.
 */
const mod = (v, n) => ((v % n) + n) % n

const PLAIN = (c, r) => mod(c + r, 2) === 0
const TWILL = (c, r) => mod(c + r, 4) < 2
const herringbone = (run) => (c, r) => {
  const band = Math.floor(c / run)
  const dir = band % 2 === 0 ? 1 : -1
  return mod(dir * c + r + band * run, 4) < 2
}

/* -------------------------------------------------------------- fabrics --- */

/**
 * The eight, and what each one actually is.
 *
 * Ids are `construction-colour`, which is how an upholstery book is indexed and
 * how a customer asks for one — "the charcoal tweed", never "fabric 4".
 */
export const FABRICS = [
  {
    id: 'velvet-emerald',
    name: 'مخمل زمردی',
    hex: '#1f5f4a',
    roughness: 0.42,
    /**
     * Cut pile: no interlacing visible at all, just fibre ends catching light.
     *
     * The trap here is making the nap too loud. Velvet's sheen does vary, but
     * over a bolt, not over a swatch — give the variation a low frequency and a
     * big amplitude and you get camouflage, which is what the first attempt
     * looked like. So the nap is a gentle vertical drift of a few percent and
     * almost all the character comes from the pile itself: very fine, very
     * dense, slightly darker where fibres lean away.
     */
    pixel(x, y, base) {
      const pile = fbm(x, y, 512, 3, 11)
      const fine = noise(x, y, 1024, 13)
      // Long, soft, nearly-vertical streaks — the lie of the nap, not blobs.
      const nap = Math.sin((x / SIZE) * Math.PI * 2 * 3 + (fbm(x, y, 4, 1, 3) - 0.5) * 0.9)
      const sheen = 0.95 + 0.05 * nap + 0.14 * (pile - 0.5) + 0.05 * (fine - 0.5)
      return shade(base, sheen, 1, 1.02, 1.01)
    },
  },
  {
    id: 'chenille-sand',
    name: 'شنیل شنی',
    hex: '#c4b49b',
    roughness: 0.88,
    /** Fat, fuzzy, low-twist yarn in a plain weave — the halo around each pick
     *  is the point, so the yarn shading is soft and the slubs are heavy. */
    pixel: weave({ pitch: 16, over: PLAIN, yarn: 0.4, slub: 0.2, seed: 21 }),
  },
  {
    id: 'corduroy-rust',
    name: 'مخمل کبریتی زنگاری',
    hex: '#9c5230',
    roughness: 0.72,
    /** Wales: a cut-pile ridge every `wale` pixels, crowned in the middle and
     *  dark in the channel between. The one fabric here whose relief is its
     *  identity, so the crown is strong. */
    pixel(x, y, base) {
      const wale = SIZE / 32
      const t = ((x % wale) / wale) * 2 - 1
      const crown = 1.14 - 0.52 * t * t * t * t - 0.16 * t * t
      const pile = 0.94 + 0.12 * fbm(x, y, 384, 3, 31)
      const drift = 1 + 0.03 * (fbm(x, y, 16, 2, 33) - 0.5)
      return shade(base, crown * pile * drift)
    },
  },
  {
    id: 'tweed-charcoal',
    name: 'توید ذغالی',
    hex: '#3c3f44',
    roughness: 0.95,
    /** Twill ground, then the flecks that make it tweed: short slubs of
     *  undyed wool and warm brown spun into the yarn. */
    pixel(x, y, base) {
      const ground = weave({ pitch: 8, over: TWILL, yarn: 0.6, slub: 0.14, seed: 41 })(x, y, base)
      const fleck = fbm(x, y, 192, 2, 43)
      if (fleck > 0.78) {
        const warm = fbm(x, y, 96, 1, 47) > 0.5
        const k = (fleck - 0.78) / 0.22
        const target = warm ? [150, 122, 96] : [206, 205, 200]
        return [
          clamp(Math.round(lerp(ground[0], target[0], k))),
          clamp(Math.round(lerp(ground[1], target[1], k))),
          clamp(Math.round(lerp(ground[2], target[2], k))),
        ]
      }
      return ground
    },
  },
  {
    id: 'herringbone-slate',
    name: 'جناغی دودی',
    hex: '#6b727a',
    roughness: 0.9,
    /** Twill that reverses direction every eight ends — the chevron is the
     *  whole fabric, so the two yarn colours are held a little apart. */
    pixel(x, y, base) {
      const pitch = 8
      const col = Math.floor(x / pitch)
      const row = Math.floor(y / pitch)
      const warpUp = herringbone(8)(col, row)
      const woven = weave({ pitch, over: herringbone(8), yarn: 0.5, slub: 0.1, seed: 53 })(x, y, base)
      // Two-tone: the warp is the lighter yarn, which is what makes the
      // chevron legible at a distance rather than only in relief.
      return warpUp ? shade(woven, 1.12) : shade(woven, 0.9)
    },
  },
  {
    id: 'jacquard-ivory',
    name: 'ژاکارد عاجی',
    hex: '#d8cdb8',
    roughness: 0.85,
    /**
     * Tonal damask: the motif is woven in, not printed, so it reads as a change
     * in which yarn faces out — same dye, opposite float direction, and so
     * opposite sheen.
     *
     * "Tonal" is not the same as "invisible", which is what a 0.15 threshold on
     * a soft sine gave: a legible motif is the entire reason to weave a jacquard
     * rather than a twill. The ogee below is the shape damask actually uses, and
     * the two faces are held far enough apart in sheen to read at swatch size.
     */
    pixel(x, y, base) {
      const u = (x / SIZE) * Math.PI * 2 * 3
      const v = (y / SIZE) * Math.PI * 2 * 3
      /**
       * The ogee as a *ribbon*, not a filled blob.
       *
       * Thresholding a smooth field gives round islands — polka dots, which is
       * what the previous attempt produced and is the one pattern damask never
       * is. Damask is a lattice: a narrow band tracing the pointed arch, with a
       * small motif set inside each opening. So take the band around the level
       * set rather than everything above it.
       */
      const lattice = Math.cos(u) + Math.cos(v) + 0.8 * Math.cos(u + v)
      const ribbon = Math.abs(lattice - 0.15) < 0.5
      const leaf = Math.abs(Math.sin(u * 1.5) * Math.sin(v * 1.5)) > 0.86
      const faced = ribbon || leaf
      const ground = weave({
        pitch: 8,
        over: faced ? TWILL : (c, r) => TWILL(r, c),
        yarn: 0.45,
        slub: 0.08,
        seed: 61,
      })(x, y, base)
      return shade(ground, faced ? 1.1 : 0.9)
    },
  },
  {
    id: 'twill-navy',
    name: 'سرژه سرمه‌ای',
    hex: '#2b3a52',
    roughness: 0.88,
    /** The plainest of the eight on purpose: a dense 2/2 twill, the workhorse
     *  upholstery cloth, with nothing going on but its diagonal. */
    pixel: weave({ pitch: 8, over: TWILL, yarn: 0.62, slub: 0.09, seed: 71 }),
  },
  {
    id: 'leather-cognac',
    name: 'چرم عسلی',
    hex: '#8d5a33',
    roughness: 0.55,
    /** Not woven at all — pebbled grain. Cells of a jittered lattice, each
     *  domed, with the creases between them darker and the crowns polished. */
    pixel(x, y, base) {
      const cells = 40
      const s = SIZE / cells
      const cx = Math.floor(x / s)
      const cy = Math.floor(y / s)
      let best = 1e9
      let second = 1e9
      const wrap = (v) => ((v % cells) + cells) % cells
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i
          const gy = cy + j
          const jx = (gx + hash(wrap(gx), wrap(gy), 81)) * s
          const jy = (gy + hash(wrap(gx), wrap(gy), 83)) * s
          const d = Math.hypot(x - jx, y - jy)
          if (d < best) {
            second = best
            best = d
          } else if (d < second) second = d
        }
      }
      // Distance to the nearest cell *edge*, which is where the crease is.
      const edge = Math.min(1, (second - best) / (s * 0.55))
      const dome = 0.74 + 0.36 * Math.sqrt(edge)
      const pores = 1 - 0.07 * fbm(x, y, 512, 2, 87)
      return shade(base, dome * pores, 1.02, 1, 0.98)
    },
  },
]

/* ------------------------------------------------------------------ png --- */

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(rgb, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ----------------------------------------------------------------- main --- */

// Only when run as a command. `FABRICS` is exported so the seam check can call
// the pixel functions directly, which is the only way to tell a tiling bug from
// a texture that simply has a lot of contrast at its edges.
const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invoked) {
const [, , outDir, ...only] = process.argv
if (!outDir) {
  console.error('usage: [SIZE=1024] node scripts/make-fabric.mjs <output-dir> [id ...]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

for (const fabric of FABRICS) {
  if (only.length && !only.includes(fabric.id)) continue
  const base = hex(fabric.hex)
  const rgb = Buffer.alloc(SIZE * SIZE * 3)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = fabric.pixel(x, y, base)
      const o = (y * SIZE + x) * 3
      rgb[o] = r
      rgb[o + 1] = g
      rgb[o + 2] = b
    }
  }
  const out = path.join(outDir, `${fabric.id}.png`)
  const buf = png(rgb, SIZE, SIZE)
  writeFileSync(out, buf)
  console.log(`${fabric.id.padEnd(20)} ${SIZE}×${SIZE}  ${(buf.length / 1024).toFixed(0)}KB`)
}
}
