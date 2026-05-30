# WalletLens Voice-Parse + Analysis API

A tiny serverless endpoint that powers three Claude-backed features for the
WalletLens static site:

1. **Voice/typed trade import** — turns a sentence ("I bought 1 Bitcoin and 1
   Ethereum") into structured trades. `POST { transcript, hintLang, alternatives }`
2. **Magic Indicator AI Verdict** — synthesises the pre-computed technical /
   on-chain / volume / whale / fundamental pillars into a natural-language
   direction. `POST { mode: "analyze", asset, magic, pillars, stats }`
3. **In-app assistant** — a feature-finder chat (Claude Haiku) that points users
   to the right page/tab. `POST { mode: "assistant", lang, messages: [{role,content}] }`
   → `{ ok, reply }`. The reply may contain `[[nav:/route|Label]]` markers the
   client turns into one-tap buttons.

> ⚠️ If you already deployed this for voice, **redeploy** (or push) to pick up
> the `analyze` and `assistant` modes — older deployments only handle voice and
> those features gracefully show "unavailable" until then. Voice keeps working
> regardless.

The site itself is static (GitHub Pages) and **cannot** hold a secret key, so
this one function lives separately. Your Anthropic key stays here as an env
secret and is **never** exposed to the browser.

---

## Deploy to Deno Deploy (free, ~3 minutes)

1. Go to **https://dash.deno.com** and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repository**.
3. Pick this repo (`tia8910/Walletlens`).
4. Set:
   - **Entrypoint:** `voice-api/main.ts`
   - **Project name:** `walletlens-voice-parse`
     *(the app defaults to `https://walletlens-voice-parse.deno.dev` — use this
     exact name and no further config is needed)*
5. Click **Create & Deploy**.
6. Open the project's **Settings → Environment Variables** and add:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic key (`sk-ant-...`)
   - Save, then **redeploy** (Deno redeploys automatically on the next push, or
     hit "Redeploy" in the dashboard).

### Verify
```bash
curl -X POST https://walletlens-voice-parse.deno.dev/ \
  -H "Content-Type: application/json" \
  -d '{"transcript":"I bought 1 Bitcoin and 1 Ethereum","hintLang":"en"}'
```
Expected:
```json
{"ok":true,"trades":[{"type":"buy","symbol":"BTC","name":"Bitcoin","amount":1,"price":null},{"type":"buy","symbol":"ETH","name":"Ethereum","amount":1,"price":null}]}
```

---

## Using a different URL / host

If you name the Deno project something else (or use Vercel), point the app at
your URL without rebuilding — run this once in the browser console on
walletlens.live:
```js
localStorage.setItem('wl_voice_api', 'https://YOUR-ENDPOINT-URL/')
```

## Notes
- CORS is locked to `walletlens.live` (+ localhost for dev) in `main.ts`.
- The endpoint is public; rotate the key at console.anthropic.com if it leaks.
- If the endpoint is down or unset, the app silently falls back to its built-in
  on-device parser, so voice/typed import keeps working (just less smart on
  very garbled speech).
