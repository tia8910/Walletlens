# Moving the Deno KV data to D1

The Cloudflare workers start with empty databases. Nothing breaks — the client
re-registers a push subscription on next load, and guardian/weekly records
rebuild as people use the features — but until the data is carried across:

- everyone who enabled push notifications is silently unsubscribed until they
  open the app again;
- guardian check-in schedules and weekly-report opt-ins are lost, and those are
  not re-created automatically because nothing prompts for them;
- the signup list is gone.

The push subscriptions are the ones worth the effort. They only survive because
the VAPID key pair is unchanged; a rotated key would make every migrated row
useless, since `subscriptionMatchesKey()` rejects it.

## Why this is not a single command

It runs in two halves that never share a credential:

1. **Export** reads Deno KV with a Deno access token and writes a `.sql` file.
2. **Import** applies that file with `wrangler`, using the Cloudflare login you
   already have in the browser.

Neither half needs the other's credential, and the file in between can be read
before anything touches production. It also means the export can be retried
freely: it writes nothing anywhere.

## Before you start

Check that the Deno organisation is out of suspension. The export is one full
scan of the database — read units, which is the exact quota that ran out. If
the account is still hard-suspended the scan fails partway; the free-tier
allowance resets monthly, so this may simply need to wait.

You need, per service, the **KV database UUID** — Deno Deploy → the project →
KV → the ID at the top — and a personal access token from
`dash.deno.com/account#access-tokens`.

## Export

From the repo root, with Deno installed locally:

```sh
export DENO_KV_ACCESS_TOKEN=...   # not stored anywhere; read from the env only

deno run --allow-net --allow-env --allow-write \
  workers/migrate/export-kv.ts --service=push --db=<push-kv-uuid> --out=push.sql

deno run --allow-net --allow-env --allow-write \
  workers/migrate/export-kv.ts --service=voice --db=<voice-kv-uuid> --out=voice.sql
```

Each run prints how many entries it scanned and how many rows it wrote. If it
scanned zero, `--db` is pointing at the wrong database — the script fails
rather than writing an empty file that would look like a clean migration.

Open the `.sql` files before importing. They are plain `INSERT` statements, and
`push.sql` contains real endpoints and keys, so treat it as sensitive: delete
it once the import is done, and do not commit it. `.gitignore` already covers
`*.sql` in this directory.

## Import

```sh
npx wrangler d1 execute walletlens-push  --remote --file=push.sql
npx wrangler d1 execute walletlens-voice --remote --file=voice.sql
```

`--remote` matters. Without it wrangler writes to a local simulation and
reports success having changed nothing in production.

Then check the counts:

```sh
npx wrangler d1 execute walletlens-push  --remote --command="SELECT COUNT(*) FROM subs"
npx wrangler d1 execute walletlens-voice --remote --command="SELECT COUNT(*) FROM kv"
```

## Rows that already exist are left alone

The generated SQL is `ON CONFLICT … DO NOTHING`. Once a worker is serving, a
row in D1 is one a user re-created after the cutover, and it is newer than
anything Deno still holds — overwriting it would hand them back a stale
subscription. Pass `--overwrite` only for a table you know is empty.

This also makes the import safe to re-run: a second pass changes nothing.

## Encoding

The two tables store different shapes, which is why `--service` exists:

| | Deno KV key | D1 |
|---|---|---|
| push | `["sub", <hash>]` | `subs(key, data, updated_at)`, `key` is the bare hash |
| voice | `["guardian", <id>]`, `["weekly", …]`, `["signups", …]` | `kv(k, v, updated_at)`, `k` is the JSON array text |

`sqlgen.js` imports `encodeKey` from `workers/voice/kv.js` rather than
reimplementing it, so the export cannot drift from what the worker reads.

One value is not JSON: `["signups_count"]` is a `Deno.KvU64`, and
`KvOnD1.atomic()` does its arithmetic with `CAST(v AS INTEGER)`. It is written
as bare decimal text so that keeps working. (Nothing currently reads that
counter — `voice-api` only ever increments it — but it costs one row.)

`updated_at` is set to the import time. Neither worker reads that column for
logic; it exists for the covering index.
