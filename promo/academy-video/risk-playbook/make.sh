#!/usr/bin/env bash
# Builds risk-playbook.mp4 (1920x1080, 30 fps, AAC) from page.html.
#   ./make.sh [voice]     voice defaults to af_heart (try am_michael)
# Set CHROME to a Chromium binary if it is not at the Playwright default below.
set -euo pipefail
cd "$(dirname "$0")"
python3 build_page.py
rm -rf frames events.json
node render.js 0 99999            # ~1-1.5 s per frame with software WebGL
python3 soundtrack.py "${1:-af_heart}"
ffmpeg -y -loglevel error -framerate 30 -i frames/%05d.jpg -i soundtrack.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest risk-playbook.mp4
echo "risk-playbook.mp4 ready"
