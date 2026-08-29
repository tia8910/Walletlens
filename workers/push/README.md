# walletlens-push (Cloudflare Workers)

Replaces the Deno Deploy service of the same name.

## Why it moved

The Deno org was suspended with `USAGE_EXCEEDED` on the **KV Reads** metric of
the Free plan. That took down every app in the org — the push service, the main
API and voice-parse — and no code change lifts it, only billing.

The cause was the crons: `allSubs()` is a full table scan and it ran once per
job, five jobs, two of them every minute. ~3,480 scans a day before a single
notification was sent. That was cut to ~288 before the move, but the underlying
allowance stayed small.

D1 measures the same work in rows read, with a far larger free allowance. The
scan cache came along anyway — a bigger allowance is not a licence to re-read
the same rows.

## What did not change

- **`notify-logic.js` and `markets.js` are imported from `push-api/`,
  unchanged.** Every decision about *when* to notify — thresholds, cooldowns,
  the win-back ladder, news matching, zakat reminders — is the same code, still
  unit-tested from `client/src/pushLogic.test.js`.
- **The cron cadences.** They are set by what the outbound quote call costs
  (one batched CoinGecko request for crypto; one request per symbol for
  stocks), not by storage.
- **The storage shape and the endpoint-hash key**, so the port's risk stays in
  the storage layer.
- **The five job bodies**, extracted mechanically rather than retyped — see the
  note at the top of `jobs.js`.

## What is new

| File | |
|---|---|
| `webpush.js` | VAPID + payload encryption on WebCrypto. `web-push` is Node-only and does not run on Workers. **The only genuinely new logic.** |
| `store.js` | D1 instead of Deno KV |
| `jobs.js` | the five jobs, runtime-agnostic behind a store/sender adapter |
| `index.js` | fetch + scheduled handlers |

## Deploying

```sh
cd workers/push
wrangler d1 create walletlens-push          # put the id in wrangler.toml
wrangler d1 execute walletlens-push --remote --file=./schema.sql

# The SAME pair the Deno service used — see the warning below.
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY

wrangler deploy
```

Then point the client at it: `PUSH_API` in `client/src/push.js`.

### The VAPID keys must be the same pair

Every existing subscription is bound to the old public key, and the client's
`subscriptionMatchesKey()` check rejects a rotated one. Change the keys and
every user has to re-enable notifications by hand.

### No data migration is needed

The subscription table starts empty and refills itself. `ensureRegistered()`
asks `/status` on app open and re-posts the subscription when the server does
not recognise it, so devices re-register as people open the app.

What is lost is per-device bookkeeping: `fired` flags, win-back ladder steps,
the last-visit price snapshot, the digest day. The visible effect is that a
already-triggered price alert may fire once more, and an idle user's win-back
ladder restarts. Nothing a user owns is lost.

This matters because the Deno KV data is currently unreadable anyway — the app
holding it is suspended.

## Verified, and not

Tested here: the crypto (round-tripped through a receiver-side decrypt, plus
VAPID signature verification), the D1 store against a fake, cron dispatch, and
a price target firing end to end through the real job code.

**Not tested: anything touching real infrastructure.** No `wrangler` run, no
real D1, no real push service. First deploy should send a test push from
Settings before trusting any of it — and the encryption in particular fails
*silently* when wrong: the push service accepts the body and the browser
quietly fails to decrypt.
