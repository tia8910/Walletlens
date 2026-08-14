# WalletLens Voice-Parse + Analysis API

A single serverless endpoint that powers every feature the static site cannot
run itself — anything needing an API key, an email sender, or storage.

Live at **`https://walletlens-voice-parse.tia8910.deno.net/`**
(`SELF_ORIGIN` in `main.ts` — keep the two in step if the project is renamed).

Everything is a `POST` to `/` with a `mode` field. Voice import is the one
exception: it has no mode and is matched by the presence of `transcript`.

## What it does

**Claude-backed**
- **Voice / typed trade import** — `POST { transcript, hintLang, alternatives }`
  turns "I bought 1 Bitcoin and 1 Ethereum" into structured trades.
- **`analyze`** — Magic Indicator AI Verdict; synthesises the pre-computed
  pillars into a natural-language direction.
- **`assistant`** — in-app feature-finder chat. The reply may contain
  `[[nav:/route|Label]]` markers the client turns into one-tap buttons.
- **`vision`, `vision_advice`** — screenshot import and its advice pass.
- **`target_analysis`** — sell-target reality check.
- **`recap`** — one dated, data-grounded all-markets recap for the blog. The
  prompt is built server-side, so this stays a constrained generator. Called by
  the `Daily Market Recap` workflow, so no Anthropic secret is needed in GitHub.

**Email (Resend)**
- **`email`, `backup_email`** — welcome mail and the WLZ backup send.
- **`weekly_subscribe`, `weekly_unsubscribe`, `weekly_refresh`,
  `weekly_cron_trigger`** — the weekly portfolio report.
- **`guardian_setup`, `guardian_test`, `guardian_checkin`, `guardian_cancel`,
  `guardian_reset`, `guardian_cron_trigger`** — Portfolio Guardian.

**Admin** — all gated by `SIGNUP_EXPORT_TOKEN`
- **`email_export`** — the newsletter list (KV prefix `["signups"]`).
- **`guardian_export`** — Guardian subscribers (KV prefix `["guardian"]`).
  Returns a deliberately narrow projection; see the comment above the handler
  for what is withheld and why.
- **`send_campaign`** — sends to `["signups"]` only.

Deno KV holds three prefixes: `["signups"]`, `["weekly", deviceId]` and
`["guardian", deviceId]`. Nothing lists `["weekly"]` yet.

> ⚠️ **New modes need a redeploy.** An older deployment simply falls through to
> the voice handler and answers `{"error":"no_transcript"}` for a mode it does
> not know, so the feature looks broken rather than missing. If the project is
> linked to GitHub it redeploys on push; otherwise hit **Redeploy**. See
> *Verify a mode is live* below.

The site is static and **cannot** hold a secret, so this one function lives
separately. The Anthropic key stays here as an env secret and is never exposed
to the browser.

---

## Deploy to Deno Deploy

The project already exists — this section is for recreating it from scratch.

1. Go to **https://app.deno.com** and sign in with GitHub.
2. **New App** → **Deploy from GitHub repository**.
3. Pick this repo (`tia8910/Walletlens`).
4. Set:
   - **Entrypoint:** `voice-api/main.ts`
   - **App name:** `walletlens-voice-parse`
     *(the deployed URL becomes `https://<app>.<org>.deno.net`; the app defaults
     to `https://walletlens-voice-parse.tia8910.deno.net/`, so with this name
     and the `tia8910` org no further config is needed)*
5. **Create & Deploy**.
6. **Settings → Environment Variables**, then redeploy:

| Key | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Every Claude mode | `sk-ant-…` |
| `RESEND_API_KEY` | Every email mode | The `walletlens.live` domain must be verified in Resend, so mail can come from both `contact@` (welcome / campaigns) and `noreply@` (Guardian heir alerts) |
| `SIGNUP_EXPORT_TOKEN` | The three admin modes and the manual cron triggers | Shared secret; also what `/admin/mail` asks for |

All three are optional in the sense that features needing a missing key degrade
gracefully rather than crashing the service.

### Verify

```bash
curl -X POST https://walletlens-voice-parse.tia8910.deno.net/ \
  -H "Content-Type: application/json" \
  -d '{"transcript":"I bought 1 Bitcoin and 1 Ethereum","hintLang":"en"}'
```

```json
{"ok":true,"trades":[{"type":"buy","symbol":"BTC","name":"Bitcoin","amount":1,"price":null},{"type":"buy","symbol":"ETH","name":"Ethereum","amount":1,"price":null}]}
```

### Verify a mode is live

Send a deliberately wrong token — no real secret needed. The token check only
runs *inside* the handler, so the error tells you whether the mode exists:

```bash
curl -s -X POST https://walletlens-voice-parse.tia8910.deno.net/ \
  -H "Content-Type: application/json" \
  -d '{"mode":"guardian_export","token":"wrong"}'
```

- `{"error":"unauthorized"}` → the mode is deployed.
- `{"error":"no_transcript"}` → it is not; the request fell through to the
  voice handler. Redeploy.

---

## Using a different URL / host

If the app is renamed (or moved to Vercel), point the site at the new URL
without rebuilding — run this once in the browser console on walletlens.live:

```js
localStorage.setItem('wl_voice_api', 'https://YOUR-ENDPOINT-URL/')
```

Read by `client/src/visionAdviceAi.js` and `client/src/assistantAi.js`.

## Notes

- CORS is locked to `walletlens.live` (+ localhost for dev) in `main.ts`.
- The endpoint is public; rotate the key at console.anthropic.com if it leaks.
- If the endpoint is down or unset, the app falls back to its built-in
  on-device parser, so voice/typed import keeps working — just less forgiving
  of garbled speech.
