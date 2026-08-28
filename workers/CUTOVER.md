# Pointing the app at the Cloudflare workers

The client still calls the Deno services. Everything below is one edit plus
whatever the tests then tell you.

## 1. Deploy the workers and note their URLs

Each worker gets a `*.workers.dev` URL when it first deploys, or a custom route
if you attach one. Both are fine — what matters is that the hostname you settle
on is the one that goes in step 2.

| worker | D1 database | table | secrets |
|---|---|---|---|
| `walletlens-voice` | `walletlens-voice` | `kv` | `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SIGNUP_EXPORT_TOKEN` |
| `walletlens-push` | `walletlens-push` | `subs` | the existing VAPID pair |

The push worker's `wrangler.toml` still has `REPLACE_WITH_D1_DATABASE_ID`; fill
it in once that database exists.

**The VAPID pair must be the one the Deno service used.** `subscriptionMatchesKey()`
rejects a subscription signed with a different key, so a rotated pair silently
invalidates every existing subscriber and each of them has to re-enable
notifications by hand.

## 2. Change the hostnames

In `client/src/apiHosts.js`:

```js
export const VOICE_HOST = 'walletlens-voice.<subdomain>.workers.dev'
export const PUSH_HOST  = 'walletlens-push.<subdomain>.workers.dev'
```

That is the whole client change. Every call site imports from there.

## 3. Run the tests and do what they say

```sh
cd client && npx vitest run src/apiHosts.test.js
```

Three files name a host and cannot import a JS constant, so the tests fail
until you edit them too:

- **`client/index.html`** — the `connect-src` in the meta CSP, and the
  `preconnect` hints.
- **`client/public/_headers`** — the same `connect-src`. This is the header
  Pages actually serves; the meta tag is the secondary one. Updating only one
  of the two is the easy mistake.
- **`client/public/sw.js`** — the proxy host in the runtime-cache list.

Both CSPs currently admit the Deno hosts through `https://*.deno.net`. For
workers.dev, add `https://*.workers.dev` to `connect-src` in both files.

A stale CSP is the failure worth planning around: it blocks every request to
the new host, and the browser reports a policy violation rather than a bad URL,
so the console points away from the change that caused it.

`workers/voice/index.js` also has its own `SELF_ORIGIN`, used to build the
guardian-reset links that get mailed out. The same test covers it. Left behind,
those links point at the dead service and the breakage shows up days later in
someone's inbox.

## 4. Carry the data across

See `workers/migrate/README.md`. Do it after the workers are up — the import is
`ON CONFLICT DO NOTHING`, so it is safe to run against a table that is already
serving, and safe to re-run.

## 5. Check it end to end

- Settings → Push notifications should enable without "Failed to fetch".
- A price refresh should succeed (the proxy is on the voice worker).
- Any coin logo that falls back to the proxy should still render.

## Not deployed

`workers/airdrop/` is in the repo but excluded from deployment on purpose.
Nothing in the client calls it.
