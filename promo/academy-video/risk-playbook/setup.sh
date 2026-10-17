#!/usr/bin/env bash
# One-time setup: Node/Python dependencies, three.js, fonts and the Kokoro voice.
# Every download comes from npm, PyPI or Google Fonts.
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-save --silent playwright-core@1.56.0 three@0.128.0
cp node_modules/three/build/three.min.js .
mkdir -p pp/shaders pp/postprocessing
cp node_modules/three/examples/js/shaders/{CopyShader,LuminosityHighPassShader}.js pp/shaders/
cp node_modules/three/examples/js/postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass}.js pp/postprocessing/
pip install --quiet kokoro-onnx==0.4.9 scipy numpy

# Fonts used by the captions and the logo (Latin subset only)
mkdir -p fonts
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" -o fonts/g.css
python3 - <<'PY'
import re, subprocess, os
css = open('fonts/g.css').read(); out = []
for sub, block in re.findall(r'/\* (\S+) \*/\s*(@font-face\s*{[^}]*})', css):
    if sub != 'latin': continue
    url = re.search(r'url\((https://[^)]+)\)', block).group(1); name = url.split('/')[-1]
    if not os.path.exists('fonts/' + name): subprocess.run(['curl', '-sS', '-o', 'fonts/' + name, url], check=True)
    out.append(block.replace(url, name))
open('fonts/fonts.css', 'w').write('\n'.join(out))
PY

# Kokoro-82M voice: q8 weights (npm mirror, checked against its published sha256) + voice styles from kokoro-js
mkdir -p tts && cd tts
if [ ! -f model_q8.onnx ]; then
  npm pack --silent kokoro-q8-shards@1.0.0 >/dev/null && mkdir -p shards && tar -xzf kokoro-q8-shards-1.0.0.tgz -C shards
  cat shards/package/kokoro-q8.part{0,1,2,3,4,5}.bin > model_q8.onnx && rm -rf shards kokoro-q8-shards-1.0.0.tgz
  echo "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478  model_q8.onnx" | sha256sum -c -
fi
if [ ! -f voices.npz ]; then
  npm pack --silent kokoro-js@1.2.1 >/dev/null && tar -xzf kokoro-js-1.2.1.tgz package/voices && rm kokoro-js-1.2.1.tgz
  python3 -c "
import numpy as np, glob, os
np.savez('voices.npz', **{os.path.basename(f)[:-4]: np.fromfile(f, dtype=np.float32).reshape(-1, 1, 256) for f in glob.glob('package/voices/*.bin')})"
  rm -rf package
fi
echo "setup done"
