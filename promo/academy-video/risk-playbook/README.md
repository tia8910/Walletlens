# The Risk Playbook: Academy long video

A 64-second, 16:9 cinematic story in a 3D toy-brick style (minifigure-style characters on a studded baseplate), rendered with bloom, film grading, letterbox moments, a freeze-frame and VHS rewind, and a slow-motion dolly zoom. Rex puts his whole savings into one coin and loses half. Ollie follows the Risk Playbook. The film covers four of the six rules on screen, and the teacher's board completes all six.

| File | What it is |
|---|---|
| `page.html` | The browsable animatic: Three.js scene, captions, rule tracker, WalletLens logo and ending, thumbnails and script. Open it in a browser to preview. |
| `build_page.py` | Turns `page.html` into `video.html`, the render version: local libraries and fonts, a 1920×1080 screen, and a virtual clock driven by `window.__step()` (time warps for slow motion, freeze and rewind run on it). |
| `render.js` | Drives `video.html` frame by frame in headless Chromium and saves `frames/00000.jpg …`. It also logs every UI sound cue to `events.json`. |
| `soundtrack.py` | Builds `soundtrack.wav`: Kokoro narration fitted to each scene, a synthesised music bed that ducks under the voice, story sound effects, and the logged UI cues. |
| `vo.py` | A small wrapper around `kokoro-onnx` for this model export. |
| `setup.sh` / `make.sh` | One-time setup, then the full build: `walletlens-risk-playbook-en.mp4` (narrator am_michael) and `walletlens-risk-playbook-ar.mp4` (Egyptian Arabic captions and on-screen text). |
| `vo_script_ar.md` | The Egyptian Arabic voice-over script with timings, for recording. `./make.sh ar <folder>` mixes the recordings in. |

```bash
./setup.sh          # npm + pip deps, three.js, fonts, Kokoro voice
./make.sh            # → walletlens-risk-playbook-en.mp4 and -ar.mp4
./make.sh en af_heart
./make.sh ar recordings/
```

To change the story, edit `SCENES`, `SETUP` and `UPDATE` in `page.html` and the narration `LINES` in `soundtrack.py`, keeping the scene durations in step between the two. Then run `make.sh` again.

The page language follows the URL hash: `page.html#ar` shows the Egyptian Arabic version. The voice model is Kokoro-82M (Apache-2.0), which has no Arabic voice, so the Arabic narration needs a recording. Don't use the LEGO name or logo in titles, tags or thumbnails. All music and sound effects are synthesised in `soundtrack.py`, so nothing needs a licence.
