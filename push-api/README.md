# WalletLens push-api

Sends Web Push notifications to installed PWAs / TWAs **even when the app is
closed**. Runs on Deno Deploy with Deno KV + Deno Cron.

This is the piece the on-device Notification API cannot do. `new Notification()`
only fires while a page is open, so everything the client knows about a
portfolio reaches only people who were already looking at the app. These crons
run on a server with no browser involved, which is what makes "your holding
moved 8% overnight" and "you have not opened this in a week" possible at all.

## Channels

Each one is independently switchable in Settings → Notifications.

| Channel     | Fires                                              | Cron     |
| ----------- | -------------------------------------------------- | -------- |
| `target`    | a price the user explicitly asked to be told about  | 10 min   |
| `move`      | a holding swings past their threshold (default 5%)  | 15 min   |
| `news`      | a breaking story naming an asset they hold          | 20 min   |
| `digest`    | one morning brief, 09:00 on the user's own clock    | hourly   |
| `retention` | win-back ladder at 3, 7, 14, 30 and 60 days idle    | hourly   |

Two guards apply to everything except `target`, which the user asked for by
name and which therefore outranks both:

- **Quiet hours** — nothing between 22:00 and 08:00 on the user's own clock.
- **A shared daily budget** — six automated pushes per user per day, across all
  channels combined. A volatile day must not turn into forty buzzes; that is
  the fastest way to lose the notification permission for good.

The win-back ladder escalates and then **stops**. Someone who has ignored five
nudges over two months will not be won back by a sixth.

## Delivery, and why the defaults are wrong

Deciding to send is only half of reaching a closed phone. Each channel also
sets its own `Urgency`, `TTL` and `Topic` (`CHANNEL_DELIVERY` in
`notify-logic.js`) — **do not leave these to web-push**, whose defaults are
normal urgency and a **four-week** TTL:

- **Urgency.** On a locked, dozing Android device, Chrome's FCM channel holds
  normal-urgency messages until the next maintenance window — potentially
  hours. Anything about a price (`target`, `move`) goes out `high` so it wakes
  the device; things we initiated (`digest`, `retention`) go `low`.
- **TTL.** A four-week retention means a phone that was off for days comes back
  online and is told about a target crossed last Tuesday, at a price that no
  longer exists. Price channels expire in an hour; a win-back nudge can wait
  twelve, because it is not about a number.
- **Topic.** Makes the push service keep only the newest undelivered message
  per topic, so a phone that has been offline unlocks to one current "BTC −7%"
  rather than five stale ones from the same afternoon.

`Topic` is restricted to the URL-safe base64 alphabet and 32 chars, and
web-push **throws** on anything else — an unscrubbed tag like
`move-crypto:bitcoin` would turn every move alert into an exception instead of
a notification. `pushTopic()` scrubs it, and returns `undefined` rather than a
topic with no alphanumerics left in it (no topic is better than one that
silently coalesces unrelated alerts).

## What's stored

Per subscription, in Deno KV:

- the anonymous push subscription (endpoint URL + crypto keys)
- the user's price-target rules
- the **identifiers** of the assets they track (`{id, symbol, kind}`)
- a last-seen timestamp, UTC offset, language, and per-channel preferences
- bookkeeping: movement baselines, sent-story hashes, ladder progress

**No identity, no amounts, no cost basis, no portfolio value.** The copy says
"BTC moved +6.1% to $94,200", which needs the ticker and nothing else. Holdings
sizes never leave the device.

## Layout

| File              | Contains                                                     |
| ----------------- | ------------------------------------------------------------ |
| `main.ts`         | HTTP endpoints, KV storage, cron wiring, sending              |
| `notify-logic.js` | every decision rule + all notification copy, in 4 languages   |
| `markets.js`      | quote and news fetching (CoinGecko, Yahoo, gold-api)          |

`notify-logic.js` and `markets.js` are plain JS with no Deno APIs on purpose:
`client/src/pushLogic.test.js` imports and unit-tests them under vitest. Nothing
else in the repo can reach a Deno Deploy cron, and these are exactly the rules
that are costly to get wrong — a bad threshold spams every user at once, and a
sign error in the timezone maths wakes them at 3am. Run them with:

```bash
cd client && npm test
```

**Adding a language:** add it to `client/src/LanguageContext.jsx`, then to
`LANGS` and every `COPY` entry in `notify-logic.js`. An unknown code falls back
to English rather than failing, so the omission would otherwise be silent — the
test suite asserts the two lists match.

## 1. Generate VAPID keys (once)

```bash
npx web-push generate-vapid-keys
```

You get a **Public Key** and a **Private Key**.

- The **public** key goes in the web app: `client/.env` → `VITE_VAPID_PUBLIC_KEY=...`
  (and in your Cloudflare Pages / build env as the same variable).
- The **private** key is a secret for this service — never commit it.

## 2. Deploy the service

Create a new app on https://app.deno.com (e.g. `walletlens-push`) and point
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

## 4. The Android app (TWA)

Web Push only reaches the **installed** Play Store app if the TWA is built with
notification delegation. This is already on — `app/build.gradle` carries
`enableNotifications: true`, which generates the `enableNotification` bool that
gates `DelegationService` in the manifest. On Android 13+ the shell requests
`POST_NOTIFICATIONS` at runtime.

If that flag is ever turned off, push keeps working in the mobile **browser**
but stops reaching the home-screen app.

## Endpoints

| Method | Path           | Body                                              |
| ------ | -------------- | ------------------------------------------------- |
| POST   | `/subscribe`   | `{ subscription, alerts?, watch?, prefs?, lang?, tz? }` |
| POST   | `/alerts`      | `{ endpoint, alerts, lang? }`                     |
| POST   | `/watch`       | `{ endpoint, watch, prefs?, lang?, tz? }`         |
| POST   | `/seen`        | `{ endpoint, tz?, lang? }`                        |
| POST   | `/test`        | `{ endpoint, lang? }`                             |
| DELETE | `/unsubscribe` | `{ endpoint }`                                    |
| GET    | `/health`      | —                                                 |

`/seen` is the heartbeat the entire re-engagement ladder rests on: without it
the server cannot tell a daily user from someone who left a month ago, and
would nag both. The client pings it on app open and on return to the
foreground, throttled to once every six hours.

`/watch` is how the server learns which assets to follow. The client derives
that list from the stored transactions rather than from a rendered dashboard,
so enabling notifications from Settings arms the channels immediately.
