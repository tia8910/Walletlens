# Cloudflare Workers

| Worker | Replaces | Storage | Crons |
|---|---|---|---|
| `push/` | Deno `walletlens-push` | D1 | every minute, \*/5, hourly |
| `voice/` | Deno `walletlens-voice-parse` | D1 | 6-hourly, weekly |
| `airdrop/` | Deno `walletlens` (unconfirmed) | D1 | none |
| `security-headers/` | — | — | — |
| `stock-price/` | — | — | — |

## Why these moved

The Deno org was suspended with `USAGE_EXCEEDED` on **KV Reads**, taking all
three services down at once. The push crons were the cause — a full table scan
per job, five jobs, two of them every minute — but the blast radius was the
whole org, which is the actual argument for moving: one service's appetite
should not be able to take the AI features and the airdrop endpoint offline
with it.

## How they were ported

Not rewritten. For `voice/` and `airdrop/` the body is `main.ts` put through
the TypeScript compiler — types removed by the tool that understands them —
with a local object named `Deno` supplying `env`, `openKv`, `cron` and `serve`.
Every one of those calls in the original keeps working unchanged, so nothing in
the request handling, the Claude prompts, the email templates or the Guardian
logic had to be edited to change host.

`push/` needed more, because `web-push` is Node-only: its VAPID signing and
payload encryption were reimplemented on WebCrypto. That is the only genuinely
new code in the migration, and the only place an error is silent.

## Deploying one

```sh
cd workers/<name>
wrangler d1 create walletlens-<name>        # put the id in wrangler.toml
wrangler d1 execute walletlens-<name> --remote --file=./schema.sql
wrangler secret put <EACH_SECRET>           # listed in wrangler.toml
wrangler deploy
```

Then repoint the client. The URLs live in `client/src/push.js` (`PUSH_API`) and
`client/src/api.js`; `voice/index.js` also carries `SELF_ORIGIN`, which still
names the old Deno host.

## Before trusting any of it

None of this has run against real infrastructure — no `wrangler`, no real D1,
no real push service. Everything parses, every import resolves, and the parts
that could be tested off-platform are tested. That is not the same as running.

Deploy order that fails cheapest first:

1. **`airdrop/`** — smallest, no crons, and nothing calls it today.
2. **`voice/`** — check one Claude-backed mode and one email.
3. **`push/`** — send a test push from Settings. The encryption fails
   *silently* when wrong: the push service accepts the body and the browser
   quietly declines to decrypt it.
