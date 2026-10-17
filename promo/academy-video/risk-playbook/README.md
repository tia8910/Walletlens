# The Risk Playbook: Academy film (5 minutes)

A 16:9 comedy in a 3D toy-brick style, about 4 min 52 s long, in English and Egyptian Arabic. It's set at night in the channel's look: dark navy, warm practical light, and understated captions.

**Story.** 3:07 a.m. at the White House. Trump (a brick caricature) can't sleep, brags about it, and posts "100% TARIFFS ON EVERYTHING". A breaking-news sting hits, phones explode, and a rally crowd chants. Across town, a young office worker's cat coin is down 50% ("NOOO! I have work at nine!"). Freeze frame, then a rewind to three days earlier:

- At the office party, an influencer goes live: "to the moon, not financial advice". He goes all in.
- He sells his gaming console ("Sorry, buddy. It's for the moon").
- "Five percent. Max." "Okay, boomer." "I'm twenty-six." The office turtle is offended.
- His friend has forty pages of notes. He watched a seven-second TikTok.
- He has thirty coins he can't explain ("…vibes"), calls exits "for quitters", and his rent money is in the coin ("Rent is… a social construct").

An AI chatbot calls 10x leverage "great question, probably fine". The bedroom floods into a red chart sea and the Liquidation Shark circles. The post lands: chomp, liquidated, "this is fine". His friend sleeps through it while his exit and cash do the work. The next morning reporters shout "Mr. President!" and Trump says "just kidding, deal coming… you're welcome". The friend teaches him the Risk Playbook, and six rule bricks lock into a shield. A week later Trump posts "200%… even the moon!". Everyone sleeps, the shark bonks the shield, the score cuts to crickets, and Trump asks "where's the panic? …hello?". It ends with the WalletLens logo and "All Assets Tracker & Investment Manager".

**Sound.**

- The characters speak with their own Kokoro voices: a narrator (am_michael), him, his friend, Trump, the influencer, the AI, the reporters and a news anchor. Trump's is a parody character voice, not a clone of the real one.
- The mouths are lip-synced to the audio through `lips.js`.
- Under the dialogue there's a score that never drops out, plus an ambience bed for each place: press-room crowd and camera shutters, office murmur and keyboards, night city, water, dawn birds.
- Political sounds play on top of that: a breaking-news sting, a "U-S-A" rally chant, the opening bell and the reporters.

The main characters have no names. The only real person is Trump, and his jokes riff on his actual public tariff posts.

| File | What it is |
|---|---|
| `page.html` | The browsable animatic: Three.js scenes, sets (office canteen, bedroom, press room), the shark, the turtle, the rule bricks, captions, the WalletLens logo and ending. `#ar` shows the Egyptian Arabic version. |
| `build_page.py` | Turns `page.html` into `video.html`, the render version: local libraries and fonts, a 1920×1080 screen, and a virtual clock driven by `window.__step()`. |
| `render.js` | Captures frames in headless Chromium, skipping frames already on disk so a killed run resumes. `make.sh` runs three chunks in parallel. |
| `voices.py` | Voices every line with its character's voice, fitted to its slot, and writes `vo_<lang>/` plus `lips.js` (mouth levels from the real audio). |
| `events_only.js` | Steps the film without drawing to get the cue log quickly, which is useful for working on sound. |
| `soundtrack.py` | Builds the score, ambience beds, political sounds, sound effects and the cast's voices (or recorded lines) from the cue log. |
| `vo.py` | A small wrapper around `kokoro-onnx` for this model export. |
| `vo_script_ar.md` | The Egyptian Arabic recording script: every line with its timing and who says it, ready to cast. |
| `setup.sh` / `make.sh` | One-time setup, then the full build. |

```bash
./setup.sh
./make.sh            # → walletlens-risk-playbook-en.mp4 and -ar.mp4
./make.sh ar recordings/
```

Each scene in `page.html` holds its own lines, setup, acting and camera, so editing the story is one place. The voice model is Kokoro-82M (Apache-2.0). All music and sound effects are synthesised. Don't use the LEGO name or logo in titles, tags or thumbnails.
