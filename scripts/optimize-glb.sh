#!/usr/bin/env bash
#
# Make a GLB affordable on a phone.
#
#   scripts/optimize-glb.sh out/ public/models/presentation/test/*.glb
#   MAX_EDGE=512 scripts/optimize-glb.sh out/ hero.glb     # a mobile variant
#
# Measured on public/test-models/final-scene.glb:
#
#   before   20.5MB on disk   740MB of texture VRAM   (3x 4096, 1x 4000)
#   after    12.3MB on disk    25MB of texture VRAM
#
# 26x less GPU memory, and smaller to download as well. Takes about 25 seconds.
#
# Two things are doing the work, and only the second is unusual:
#
#  - **resize** caps every map at 1024. A 4000x4000 texture on a 390pt-wide
#    phone screen is detail the panel cannot resolve, paid for in full.
#  - **KTX2/Basis** is the one that matters. PNG, JPEG and WebP all have to be
#    fully decompressed into GPU memory, so their file size tells you nothing
#    about what they cost there. A KTX2 texture stays in a block format the GPU
#    reads directly — ASTC on iOS, BC7 on desktop, ETC2 on Android, chosen at
#    load time by the transcoder. That is a 4-8x saving no amount of PNG tuning
#    can reach.
#
# Run offline, never as part of `next build`: public/models is gitignored and
# copied to the server out of band, so the build has nothing to operate on.
# Check the result with `node scripts/glb-budget.mjs out/*.glb`.
#
# Requires:
#   npm i -g @gltf-transform/cli
#   KTX-Software (provides `ktx`) — there is NO Homebrew formula for it.
#     Download from https://github.com/KhronosGroup/KTX-Software/releases
#     macOS: the .pkg for your chip — Darwin-arm64 (Apple Silicon) or
#            Darwin-x86_64 (Intel). Installs `ktx` on the PATH.
#     Linux: the .tar.bz2; put its bin/ on PATH and lib/ on LD_LIBRARY_PATH.
#
set -euo pipefail

MAX_EDGE="${MAX_EDGE:-1024}"
ETC1S_QUALITY="${ETC1S_QUALITY:-200}"
UASTC_LEVEL="${UASTC_LEVEL:-2}"

if [ $# -lt 2 ]; then
  echo "usage: MAX_EDGE=1024 $0 <output-dir> <input.glb ...>" >&2
  exit 2
fi

command -v gltf-transform >/dev/null || { echo "missing: npm i -g @gltf-transform/cli" >&2; exit 2; }
command -v ktx            >/dev/null || { echo "missing: KTX-Software (ktx) — see the header of this script" >&2; exit 2; }

OUT="$1"; shift
mkdir -p "$OUT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for SRC in "$@"; do
  NAME="$(basename "$SRC")"
  echo "── $NAME"

  # 1. Cap the resolution. This is the single biggest number and it comes first,
  #    so every later step has less to chew on. Decodes Draco on the way in;
  #    step 5 puts it back.
  gltf-transform resize "$SRC" "$WORK/1.glb" --width "$MAX_EDGE" --height "$MAX_EDGE"

  # 2. WebP out, PNG in. The `ktx` encoder refuses WebP outright — it skips
  #    those textures with a warning and hands back a file that looks like it
  #    worked. `--formats "*"` is load-bearing: the default only re-encodes
  #    textures that were already PNG, which on these models is none of them.
  gltf-transform png "$WORK/1.glb" "$WORK/2.glb" --formats "*"

  # 3. Normal maps get UASTC. ETC1S quantises to a shared palette, which is fine
  #    for colour and visibly wrong for a vector packed into RGB — normals come
  #    back blotchy and the lighting swims. UASTC is the higher-quality mode and
  #    lands on ASTC/BC7.
  gltf-transform uastc "$WORK/2.glb" "$WORK/3.glb" \
    --slots "normalTexture" --level "$UASTC_LEVEL"

  # 4. Everything else gets ETC1S: half the bytes of UASTC, and for basecolour,
  #    roughness and occlusion the difference does not survive being looked at.
  #    (`--rdo`/`--zstd` on UASTC buy a smaller *download* for a large amount of
  #    encoder time — 9 minutes against 7 seconds on the room — and change the
  #    resident size not at all. Not worth it here.)
  gltf-transform etc1s "$WORK/3.glb" "$WORK/4.glb" --quality "$ETC1S_QUALITY"

  # 5. Drop whatever the round-trip orphaned, and only THEN put the geometry
  #    back under Draco. Order matters: prune and dedup rewrite the document,
  #    which decodes Draco and does not put it back — running them after the
  #    draco step silently ships an uncompressed mesh, which is how the room
  #    came out larger than the file it started from.
  gltf-transform prune "$WORK/4.glb" "$WORK/5.glb"
  gltf-transform dedup "$WORK/5.glb" "$WORK/6.glb"
  gltf-transform draco "$WORK/6.glb" "$OUT/$NAME"
done

echo
node "$(dirname "$0")/glb-budget.mjs" "$OUT"/*.glb
