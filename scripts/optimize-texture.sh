#!/usr/bin/env bash
#
# Turn a fabric image into a swatch the phone can afford.
#
#   scripts/optimize-texture.sh public/textures/covers velvet-emerald_basecolor.png
#   scripts/optimize-texture.sh --normal public/textures/covers velvet_normal.png
#   scripts/optimize-texture.sh --linear public/textures/covers velvet_rough.png
#   MAX_EDGE=512 scripts/optimize-texture.sh public/textures/covers/phone in.png
#
# The sibling of optimize-glb.sh, for the one texture that is NOT inside a GLB:
# the images a colour swatch swaps into `material.map`. @see lib/three/swatchTextures.ts
#
# Why KTX2 and not a PNG the browser already knows how to read: a 1024x1024 PNG
# is 4 bytes a pixel plus a third for mips — 5.6MB of GPU memory, whatever it
# weighs on disk. The same image as ETC1S is 0.7MB on a desktop and 1.3MB on an
# iPhone, because a block-compressed texture stays compressed *in VRAM*. Six
# swatches is the difference between 8MB and 34MB, and iOS caps a tab's
# canvas memory at 256MB. That is the whole argument.
#
# Three profiles, matching what optimize-glb.sh does to the same three kinds of
# map inside a model:
#
#   (default)   base colour — sRGB, ETC1S. Half the bytes of UASTC, and on
#               colour the difference does not survive being looked at.
#   --normal    normal map — linear, UASTC. ETC1S quantises to a shared palette,
#               which is fine for colour and visibly wrong for a vector packed
#               into RGB: the lighting swims.
#   --linear    roughness / metalness / AO — linear, ETC1S.
#
# Run offline, never as part of `next build`. Check the result with
# `node scripts/glb-budget.mjs <out>/*.ktx2`.
#
# Requires:
#   KTX-Software (provides `ktx`) — https://github.com/KhronosGroup/KTX-Software/releases
#     There is NO Homebrew formula. macOS: the .pkg for your chip. Linux: the
#     .tar.bz2, with bin/ on PATH and lib/ on LD_LIBRARY_PATH.
#   ImageMagick (`magick`), for the resize — `ktx create` does not resize.
#
set -euo pipefail

MAX_EDGE="${MAX_EDGE:-1024}"
ETC1S_QUALITY="${ETC1S_QUALITY:-200}"
UASTC_LEVEL="${UASTC_LEVEL:-2}"
VERSION="${VERSION:-v1}"

MODE="color"
case "${1:-}" in
  --normal) MODE="normal"; shift ;;
  --linear) MODE="linear"; shift ;;
esac

if [ $# -lt 2 ]; then
  echo "usage: [MAX_EDGE=1024] [VERSION=v1] $0 [--normal|--linear] <output-dir> <input.png ...>" >&2
  exit 2
fi

command -v ktx    >/dev/null || { echo "missing: KTX-Software (ktx) — see the header of this script" >&2; exit 2; }
command -v magick >/dev/null || { echo "missing: ImageMagick (magick) — needed for the resize" >&2; exit 2; }

OUT="$1"; shift
mkdir -p "$OUT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for SRC in "$@"; do
  STEM="$(basename "$SRC")"; STEM="${STEM%.*}"
  DEST="$OUT/${STEM}.${VERSION}.ktx2"
  echo "── $STEM  [$MODE]"

  # Never overwrite. /textures is served `max-age=31536000, immutable` (@see
  # next.config.mjs), so a browser that has the old bytes will not ask again for
  # a year: a re-encode needs a NEW FILENAME, not a new file at the old name.
  if [ -e "$DEST" ]; then
    echo "   refusing to overwrite $DEST — bump VERSION (currently $VERSION)" >&2
    exit 1
  fi

  # 1. Cap the edge. PNG or JPEG in, PNG out: the `ktx` encoder refuses WebP
  #    outright, and it does so by skipping the texture with a warning and
  #    handing back a file that looks like it worked — the trap optimize-glb.sh
  #    step 2 already documents.
  #    `^` then `-extent` fills and centre-crops rather than squashing a
  #    non-square source, so the weave keeps its aspect.
  magick "$SRC" -resize "${MAX_EDGE}x${MAX_EDGE}^" -gravity center \
    -extent "${MAX_EDGE}x${MAX_EDGE}" -strip "$WORK/in.png"

  # 2. Encode. `--generate-mipmap` is not optional: a swatch without a mip chain
  #    aliases into noise the moment the piece is turned, and it is the one
  #    defect that makes the texture *cheaper*, so nothing downstream flags it.
  #
  #    `--assign-oetf` is the other one to get right. Its only symptom is a
  #    fabric that reads slightly pale, which is subtle enough to ship — and
  #    lib/three/swatchTextures sets `colorSpace` explicitly rather than trusting
  #    whatever ends up in the container here.
  case "$MODE" in
    color)
      ktx create --format R8G8B8A8_SRGB --assign-oetf srgb --assign-primaries bt709 \
        --generate-mipmap --encode basis-lz --qlevel "$ETC1S_QUALITY" \
        "$WORK/in.png" "$DEST"
      ;;
    normal)
      ktx create --format R8G8B8A8_UNORM --assign-oetf linear \
        --generate-mipmap --encode uastc --uastc-quality "$UASTC_LEVEL" --zstd 18 \
        "$WORK/in.png" "$DEST"
      ;;
    linear)
      ktx create --format R8G8B8A8_UNORM --assign-oetf linear \
        --generate-mipmap --encode basis-lz --qlevel "$ETC1S_QUALITY" \
        "$WORK/in.png" "$DEST"
      ;;
  esac
done

# Orientation is decided here and nowhere else. `ktx create` writes KTXorientation
# `rd` — origin top-left — which is glTF's convention and what GLTFLoader hands
# three with `flipY = false`. three cannot flip block-compressed data at upload,
# so there is no runtime lever: if a fabric comes out mirrored vertically, flip
# the SOURCE (`magick in.png -flip`) and re-encode with a bumped VERSION. Do not
# reach for `texture.flipY` — it is ignored, and the "fix" ends up being inverted
# UVs somewhere far away from the problem.

echo
node "$(dirname "$0")/glb-budget.mjs" "$OUT"/*.ktx2
