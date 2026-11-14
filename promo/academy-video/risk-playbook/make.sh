#!/usr/bin/env bash
# Builds the 5-minute film in English and/or Egyptian Arabic (1920x1080, 24 fps, AAC).
#   ./make.sh                 English (default)
#   ./make.sh en              English only
#   ./make.sh ar [vo_dir]     Arabic captions; vo_dir = folder of recorded lines 01.wav … (see vo_script_ar.md),
#                             otherwise the English cast is kept under the Arabic captions
# Voices: voices.py gives every character their own Kokoro voice and writes lips.js, so the mouths
# on screen follow the audio. Software WebGL renders ~1.8 s per frame; three chunks run in parallel.
set -euo pipefail
cd "$(dirname "$0")"
echo "window.LIPS={};" > lips.js
python3 build_page.py video.html
PAGE=video.html OUT=cues_en node events_only.js
python3 voices.py cues_en-events.json en      # vo_en/, vo_en.json, lips.js
render() {  # out hash
  for c in "0 2420" "2420 4840" "4840 999999"; do PAGE=video.html OUT="$1" HASH="$2" node render.js $c 24 "$1" & done; wait
}
encode() {  # lang
  ffmpeg -y -loglevel error -framerate 24 -i "frames_$1/%05d.jpg" -i "soundtrack_$1.wav" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
    -c:a aac -b:a 192k -shortest "walletlens-risk-playbook-$1.mp4"
  echo "walletlens-risk-playbook-$1.mp4 ready"
}
en() { render frames_en '#render'; python3 soundtrack.py cast cues_en-events.json en; encode en; }
ar() { PAGE=video.html OUT=cues_ar HASH='#render-ar' node events_only.js; render frames_ar '#render-ar'
       python3 soundtrack.py "${1:-cast}" cues_ar-events.json ar; encode ar; }
case "${1:-all}" in
  en) en ;;
  ar) ar "${2:-cast}" ;;
  *)  en ;;
esac
