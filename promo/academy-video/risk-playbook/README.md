# The Risk Playbook: Academy film (5 minutes)

A 16:9 comedy in a 3D toy-brick style, about 5 min 2 s long, in English. It's set at night in the channel's look: dark navy, warm practical light, and understated captions.

**Story.** 3:07 a.m. **Story.** One person: a serious investor, who eats lunch alone. No friends, just a turtle.

3:07 a.m. at the White House. Trump (a brick caricature) brags that nobody sleeps less than him, then posts "Tariffs. A hundred percent. On everything. Believe me!". Across town the serious investor wakes to −50% ("NOOO! I have a SYSTEM!"). Freeze frame, then a rewind to three days earlier, when he breaks every one of his own rules:

- An influencer goes live: "YO YO YO… cat coin to the MOON… smash that like". He says "I'm a serious investor, I don't chase hype". He lasts eleven seconds.
- He sells his console and puts his emergency fund in.
- His notebook says 5% max, while the coin is 80% of his money ("Rules are more like… guidelines").
- He watches a seven-second TikTok instead of doing forty pages of research.
- He holds thirty coins and can't explain any of them ("…vibes").
- He sets an exit, then deletes it ("exits are for quitters").
- His rent money goes into the coin too.

CZ (bricks, black hoodie with a yellow "4", yellow studio) posts "4." and the investor reads it as "buy more". An AI says "great question, you're so smart, probably fine". The bedroom floods into a red chart sea, the Liquidation Shark circles, and Trump's post lands: chomp, liquidated, "this is fine". CZ: "Funds are SAFU." His were not. Reporters shout "Mr. President!" and Trump says "just kidding… you're welcome". The investor sold the exact bottom ("I'm a serious investor… right?"). Alone, he writes a real Risk Playbook: six rule bricks lock into a shield. Then comes WalletLens. A week later Trump posts "200%… even the moon!". The investor sleeps, the shark bonks the shield, and Trump says "where's the panic? …hello?". It ends with the WalletLens logo and "All Assets Tracker & Investment Manager".

The only real people are Trump and CZ, shown as caricatures who riff on their own public posts ("tariffs", "4", "funds are SAFU"). The film uses no company logos.

racters speak with their own Kokoro voices: a narrator (am_michael), the investor, Trump (heavy, slow podium delivery), CZ (calm), the influencer (pitched-up and hyper, through a phone speaker), the AI, the reporters and a news anchor. Trump's and CZ's are parody character voices, not clones of the real ones.
- The mouths are lip-synced to the audio through `lips.js`.
- Under the dialogue there's a score that never drops out, plus an ambience bed for each place: press-room crowd and camera shutters, canteen murmur and keyboards, night city, water, dawn birds.
- Political sounds play on top of that: a breaking-news sting, a "U-S-A" rally chant, the opening bell and the reporters.

The main characters have no names. The only real person is Trump, and his jokes riff on his actual public tariff posts.

| File | What it is |
|---|---|
| `page.html` | The browsable animatic: Three.js scenes, sets (office canteen, bedroom, press room, CZ's studio), the shark, the turtle, the rule bricks, captions, the WalletLens logo and ending. `#ar` shows the Egyptian Arabic version. |
| `build_page.py` | Turns `page.html` into `video.html`, the render version: local libraries and fonts, a 1920×1080 screen, and a virtual clock driven by `window.__step()`. |
| `render.js` | Captures frames in headless Chromium, skipping frames already on disk so a killed run resumes. `make.sh` runs three chunks in parallel. |
| `voices.py` | Voices every line with its character's voice, fitted to its slot, and writes `vo_<lang>/` plus `lips.js` (mouth levels from the real audio). |
| `events_only.js` | Steps the film without drawing to get the cue log quickly, which is useful for working on sound. |
| `soundtrack.py` | Builds the score, ambience beds, political sounds, sound effects and the cast's voices (or recorded lines) from the cue log. |
| `vo.py` | A small wrapper around `kokoro-onnx` for this model export. |
| `setup.sh` / `make.sh` | One-time setup, then the full build. |

```bash
./setup.sh
./make.sh            # → walletlens-risk-playbook-en.mp4
```

Each scene in `page.html` holds its own lines, setup, acting and camera, so editing the story is one place. The voice model is Kokoro-82M (Apache-2.0). All music and sound effects are synthesised. Don't use the LEGO name or logo in titles, tags or thumbnails.
