#!/usr/bin/env bash
# Builds the 5-minute film in English and/or Egyptian Arabic (1920x1080, 24 fps, AAC).
#   ./make.sh                 both languages; English narrator am_michael
#   ./make.sh en [voice]      English only (voice: am_michael | af_heart | ...)
#   ./make.sh ar [vo_dir]     Arabic only; vo_dir = folder of recorded lines 01.wav … (see vo_script_ar.md),
#                             otherwise captions, music and sound effects only
# Software WebGL renders ~1.6 s per frame, so one language takes about 3 hours.
set -euo pipefail
cd "$(dirname "$0")"
python3 build_page.py video.html
build() {  # lang hash voice
  rm -rf "frames_$1"
  PAGE=video.html OUT="frames_$1" HASH="$2" node render.js 0 999999 24
  python3 soundtrack.py "$3" "frames_$1-events.json" "$1"
  ffmpeg -y -loglevel error -framerate 24 -i "frames_$1/%05d.jpg" -i "soundtrack_$1.wav" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
    -c:a aac -b:a 192k -shortest "walletlens-risk-playbook-$1.mp4"
  echo "walletlens-risk-playbook-$1.mp4 ready"
}
case "${1:-all}" in
  en) build en '#render' "${2:-am_michael}" ;;
  ar) build ar '#render-ar' "${2:-none}" ;;
  *)  build en '#render' am_michael; build ar '#render-ar' none ;;
esac
