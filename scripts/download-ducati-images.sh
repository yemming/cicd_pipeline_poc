#!/usr/bin/env bash
# Download Ducati menu thumbnails + hero banners from ducatitaiwan.com.tw
# into public/bikes/ so the app can serve them locally (fast) rather than
# hotlinking. Safe to re-run: skips files that already exist.

set -e
cd "$(dirname "$0")/.."

BASE="https://ducatitaiwan.com.tw/archive/images"
THUMB_DIR="public/bikes/thumbs"
HERO_DIR="public/bikes/hero"

mkdir -p "$THUMB_DIR" "$HERO_DIR"

# model-id → menu thumbnail filename (from material/images.json)
declare -a THUMBS=(
  "panigale-v4-s:1768457189.png"
  "panigale-v2-s:1768457178.png"
  "streetfighter-v4-sp2:Model-Menu-MY23-Streetfighter-V4S-SP2.png"
  "streetfighter-v4-s:1768456137.png"
  "streetfighter-v2:1768456421.png"
  "streetfighter-v2-s:1768456046.png"
  "multistrada-v4-s:Model-Menu-MY22-Multistrada-V4-S-Gr-v05.png"
  "multistrada-v2-s:1768456672.png"
  "monster:1698925482.png"
  "monster-sp:1697102999.png"
  "hypermotard-950:1768455813.png"
  "hypermotard-950-sp:1768455505.png"
  "hypermotard-698-mono:1768456517.png"
  "supersport-950-s:Thumb-menu-SS-950-S-R-MY21-v02.png"
  "desertx:1768455322.png"
)

# hero: homepage banner files
declare -a HEROES=(
  "hero-1:tw_index/1768457501.jpg"
  "hero-2:tw_index/1768458779.jpg"
  "hero-3:tw_index/1702023363.jpg"
  "hero-4:tw_index/1768457646.jpg"
  "hero-monster:tw_bike/Monster-04-hero-1600x1000-v02.jpg"
  "lifestyle-1:tw_style/1768454821.jpg"
  "lifestyle-2:tw_style/1768448903.jpg"
  "lifestyle-3:tw_style/1665968808.jpg"
)

download() {
  local dest="$1" url="$2"
  if [ -s "$dest" ]; then
    return
  fi
  echo "  ↓ $dest"
  curl -fsSL -A "Mozilla/5.0" --max-time 30 "$url" -o "$dest" || {
    echo "    ✗ failed: $url" >&2
    rm -f "$dest"
    return 1
  }
}

echo "==> Menu thumbnails"
for entry in "${THUMBS[@]}"; do
  id="${entry%%:*}"
  file="${entry#*:}"
  ext="${file##*.}"
  download "$THUMB_DIR/${id}.${ext}" "$BASE/tw_bike/$file"
done

echo "==> Hero / lifestyle"
for entry in "${HEROES[@]}"; do
  id="${entry%%:*}"
  path="${entry#*:}"
  ext="${path##*.}"
  download "$HERO_DIR/${id}.${ext}" "$BASE/$path"
done

echo "Done."
ls -lh "$THUMB_DIR" | tail -n +2
ls -lh "$HERO_DIR" | tail -n +2
