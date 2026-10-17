# The Risk Playbook: Academy film (5 minutes)

A 16:9 comedy in a 3D toy-brick style, about 4 min 52 s long, in English and Egyptian Arabic. It's set at night in the channel's look: dark navy, warm practical light, and understated captions.

**Story.** At 3:07 a.m., Trump (a brick caricature in his own press room) posts "100% TARIFFS ON EVERYTHING". Across town, a boy's cat coin drops 50%. Freeze frame, then a rewind to three days earlier:

- An influencer goes live: "to the moon, not financial advice".
- The boy sells his game console and goes all in.
- He calls his friend a boomer (the friend is fifteen).
- His research is one seven-second video.
- He holds thirty coins he can't explain ("…vibes").
- He calls exits "for quitters".
- His lunch money is in the coin too.

Then an AI chatbot tells him 10x leverage is "probably fine". The bedroom floods into a red chart sea, the Liquidation Shark circles, and the post lands: chomp, liquidated, "this is fine". His friend sleeps through it while his exit and cash do the work, and the turtle snores. The next morning Trump posts "just kidding, deal coming". The friend teaches him the Risk Playbook, and six rule bricks lock into a shield. A week later the post says "200% TARIFFS". The boy sleeps, the shark bonks the shield, and Trump asks "…hello?". It ends with the WalletLens logo and "All Assets Tracker & Investment Manager".

The main characters have no names. The only real person is Trump, and his jokes follow his actual public posts.

| File | What it is |
|---|---|
| `page.html` | The browsable animatic: Three.js scenes, sets (cafeteria, bedroom, press room), the shark, the turtle, the rule bricks, captions, the WalletLens logo and ending. `#ar` shows the Egyptian Arabic version. |
| `build_page.py` | Turns `page.html` into `video.html`, the render version: local libraries and fonts, a 1920×1080 screen, and a virtual clock driven by `window.__step()`. |
| `render.js` | Captures frames in headless Chromium and logs every cue (scenes, narration lines, sound effects) to `frames_<lang>-events.json`. |
| `events_only.js` | Steps the film without drawing to get the cue log quickly, which is useful for working on sound. |
| `soundtrack.py` | Builds the score, sound effects and narration from the cue log. The narration is Kokoro TTS for English, or recorded lines. |
| `vo.py` | A small wrapper around `kokoro-onnx` for this model export. |
| `vo_script_ar.md` | The Egyptian Arabic voice-over script with timings, generated from the scenes. |
| `setup.sh` / `make.sh` | One-time setup, then the full build. |

```bash
./setup.sh
./make.sh            # → walletlens-risk-playbook-en.mp4 and -ar.mp4
./make.sh ar recordings/
```

Each scene in `page.html` holds its own lines, setup, acting and camera, so editing the story is one place. The voice model is Kokoro-82M (Apache-2.0). All music and sound effects are synthesised. Don't use the LEGO name or logo in titles, tags or thumbnails.
