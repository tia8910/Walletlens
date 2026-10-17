# The Risk Playbook: Academy long video

A 60-second, 16:9 animated story in a blocky 3D style. Rex puts his whole savings into one coin and loses half. Ollie follows the Risk Playbook. The film covers four of the six rules on screen, and the teacher's board completes all six.

| File | What it is |
|---|---|
| `page.html` | The browsable animatic: Three.js scene, captions, rule tracker, WalletLens logo and ending, thumbnails and script. Open it in a browser to preview. |
| `build_page.py` | Turns `page.html` into `video.html`, the render version: local libraries and fonts, a 1920×1080 screen, and a virtual clock driven by `window.__step()`. |
| `render.js` | Drives `video.html` frame by frame in headless Chromium and saves `frames/00000.jpg …`. It also logs every UI sound cue to `events.json`. |
| `soundtrack.py` | Builds `soundtrack.wav`: Kokoro narration fitted to each scene, a synthesised music bed that ducks under the voice, story sound effects, and the logged UI cues. |
| `vo.py` | A small wrapper around `kokoro-onnx` for this model export. |
| `setup.sh` / `make.sh` | One-time setup, then the full build to `risk-playbook.mp4`. |

```bash
./setup.sh          # npm + pip deps, three.js, fonts, Kokoro voice
./make.sh           # → risk-playbook.mp4 (narrator af_heart)
./make.sh am_michael
```

To change the story, edit `SCENES`, `SETUP` and `UPDATE` in `page.html` and the narration `LINES` in `soundtrack.py`, keeping the scene durations in step between the two. Then run `make.sh` again.

The voice model is Kokoro-82M (Apache-2.0). All music and sound effects are synthesised in `soundtrack.py`, so nothing needs a licence.
