# WalletLens push-api

Sends Web Push notifications (price-target alerts) to installed PWAs / TWAs
**even when the app is closed**. Runs on Deno Deploy with Deno KV + Deno Cron.

## 1. Generate VAPID keys (once)

```bash
npx web-push generate-vapid-keys
```

You get a **Public Key** and a **Private Key**.

- The **public** key goes in the web app: `client/.env` → `VITE_VAPID_PUBLIC_KEY=...`
  (and in your Cloudflare Pages / build env as the same variable).
- The **private** key is a secret for this service — never commit it.

## 2. Deploy the service

Create a new project on https://dash.deno.com (e.g. `walletlens-push`) and point
it at this folder's `main.ts`, **or** with the CLI:

```bash
cd push-api
deno install -gArf jsr:@deno/deployctl
deployctl deploy --project=walletlens-push --prod main.ts
```

The deployed URL must be `https://walletlens-push.tia8910.deno.net`
(matches `PUSH_API` in `client/src/push.js`). If you use a different name,
update that constant. The `*.deno.net` origin is already allowed by the site CSP.

## 3. Set env secrets (Deno Deploy → Project → Settings → Environment Variables)

| Variable            | Value                                    |
| ------------------- | ---------------------------------------- |
| `VAPID_PUBLIC_KEY`  | the public key from step 1               |
| `VAPID_PRIVATE_KEY` | the private key from step 1 (secret)     |
| `VAPID_SUBJECT`     | `mailto:contact@walletlens.live` (opt.)  |

Deno KV and Deno Cron are enabled automatically on Deno Deploy — no flags needed
in production. (Local dev uses the flags in `deno.json`'s `start` task.)

## 4. Rebuild the Android app (TWA) — required for push in the installed app

Web Push only reaches the **installed** Play Store app if the TWA is built with
**notification delegation**. In Bubblewrap (`twa-manifest.json`):

```json
{
  "enableNotifications": true
}
```

Then `bubblewrap build` and upload the new **AAB** to Play Console. On Android 13+
the app will ask for the `POST_NOTIFICATIONS` permission at runtime (handled by
the TWA shell automatically once delegation is on).

Without this rebuild, push works in the mobile **browser** but not the home-screen app.

## Endpoints

| Method | Path           | Body                          |
| ------ | -------------- | ----------------------------- |
| POST   | `/subscribe`   | `{ subscription, alerts? }`   |
| POST   | `/alerts`      | `{ endpoint, alerts }`        |
| POST   | `/test`        | `{ endpoint }`                |
| DELETE | `/unsubscribe` | `{ endpoint }`                |
| GET    | `/health`      | —                             |

## What's stored

Per subscription, in Deno KV: the anonymous push subscription (endpoint + keys)
and the user's alert rules (`coin_id`, `coin_symbol`, `condition`, `targetPrice`).
**No identity, no portfolio, no holdings.** The cron polls CoinGecko every 10 min,
fires once when a target is crossed, and re-arms when price moves back.
