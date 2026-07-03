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
4. **Daily market recap** — writes one dated, data-grounded all-markets recap
   (crypto + stocks + metals) for the blog. `POST { mode: "recap", snapshotText,
   date, year }` → `{ ok, title, summary, readTime, content }`. The prompt is
   built server-side, so this stays a constrained recap generator. Called by the
   `Daily Market Recap` GitHub workflow — no Anthropic secret in GitHub needed.

> ⚠️ If you already deployed this, **redeploy** (or push) to pick up the
> `analyze`, `assistant` and `recap` modes — older deployments only handle the
> earlier modes and those features gracefully show "unavailable" until then.
> Voice keeps working regardless.

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

### Optional env vars (email)
These power the newsletter welcome mail, campaign sender and **Portfolio
Guardian**. All are optional — features that need a missing key degrade
gracefully.
   - `RESEND_API_KEY` — [Resend](https://resend.com) API key. Required to send
     any email. The `walletlens.live` domain must be verified in Resend; once the
     domain is verified, mail can go from both `contact@walletlens.live` (welcome
     / campaigns) and `noreply@walletlens.live` (Portfolio Guardian heir alerts).
   - `SIGNUP_EXPORT_TOKEN` — shared secret protecting the signup export, campaign
     send and the manual Guardian cron trigger.

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
