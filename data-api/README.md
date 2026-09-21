# walletlens-data

Fetches the app's six public datasets on a schedule and serves them. Replaces
four GitHub Actions cron jobs.

| Was | Now | Cadence |
| --- | --- | --- |
| `update-market.yml` | `market.json` | 6h |
| `update-news.yml` | `news.json`, `stocks.json`, `economy.json` | 2h |
| `update-economy-calendar.yml` | `economic-calendar.json` | 1h |
| `update-stock-prices.yml` | `stock-prices.json` | 4h |

Each of those fetched a public feed, wrote JSON into `client/public/`,
committed it and pushed. The data only reached users after a site rebuild — so
a price refresh was a deploy, the data lived in git, and the whole chain
stopped the moment Actions did. On 2026-09-02 that happened: the account was
flagged, Actions was disabled, and all four froze with no error and no
notification while the app served two-day-old prices.

Here a refresh is a KV write.

## Layout

| File | What it is |
| --- | --- |
| `feeds.js` | Parsers. Take text, never URLs, so they are testable. |
| `core.js` | The decisions: cadence, staleness, refresh, serve. Storage is a `{ read, write }` argument. |
| `worker.js` | Cloudflare Workers binding — **the deployed one**. |
| `main.ts` | Deno Deploy binding, kept as an alternative. |

Splitting storage out of `core.js` is what lets the rules be unit-tested in
Node against a plain object — see `client/src/dataService.test.js`, 53 tests —
and it is why supporting a second runtime costs one small file rather than a
fork.

## Deploying (Cloudflare)

```bash
cd data-api

# 1. Create the cache, once. Paste the printed id into wrangler.toml.
npx wrangler@4 kv namespace create DATA

# 2. Deploy.
npx wrangler@4 deploy

# 3. Check it can reach the upstreams and fill KV.
curl https://walletlens-data.tarek-abdelhameed.workers.dev/__health
```

**There are no secrets to set.** Every byte is public market data served
unauthenticated, which is the main reason this was worth splitting out from
`workers/push`.

`name` in `wrangler.toml` must match `DATA_HOST` in `client/src/apiHosts.js`.
`apiHosts.test.js` fails if they drift, and it checks the three places that
cannot import the constant: both CSPs and `sw.js`.

### If the deploy is refused on the cron trigger

The Workers Free plan allows **five cron triggers per account**, and
`walletlens-push` already uses three. If the deploy fails on that limit, delete
the `[triggers]` block and deploy again.

The service still works without it. `serve()` refreshes any dataset it finds
past its `maxAge` on the way to answering a request, so the cron only moves
that cost off the first visitor after each interval rather than being the only
thing that can refresh anything.

## Checking on it

`/__health` reports every dataset's `updated` stamp, row count, and whether it
is past its `maxAge`:

```json
{
  "now": "2026-09-04T12:00:00.000Z",
  "datasets": {
    "market.json": { "updated": "2026-09-04T11:45:02Z", "count": 250, "stale": false }
  }
}
```

`"stale": true` on one row means its upstream is failing — the previous value
is still served, which is deliberate.

## Design notes

**One cron, not six.** The originals carried six expressions between them.
This sweeps every 15 minutes and asks each dataset whether it is past its own
`maxAge`. Cadence becomes one number per dataset instead of a schedule spread
across four files, and a refresh missed because an upstream was briefly down
retries on the next tick — where the Actions version waited up to six hours.

**A failed fetch never overwrites good data.** Fetchers return `null` rather
than an empty envelope, and `refresh()` keeps the stored value. This is the
failure that reaches users: CoinGecko's free tier answers a rate-limited
request with valid JSON and a truncated body, so "it parsed" is not "it is a
market snapshot". `parseMarket` enforces a 50-coin floor for that reason.

**Chunking is a Deno-only concern.** Deno KV caps a value at 64 KiB and
`market.json` is 250 KB, so `main.ts` splits payloads across numbered keys.
Workers KV allows 25 MB, so `worker.js` stores them whole and its store is two
lines.

**Parsers take text, not URLs.** The environment this was written in blocks
CoinGecko, Stooq and every RSS host, so the fetching could not be exercised.
Splitting the parsing out means the part where the bugs live is tested against
captured payload shapes. That earned itself on the first run: it caught that
regex extraction does not entity-decode the way Python's ElementTree did,
which had left HTML tags no stripper could see and thumbnails no scraper could
find.

**The client fetches cross-origin.** These used to be static files on
walletlens.live. The CSP already admitted `*.workers.dev` for the voice and
push services, so moving here needed no policy change — only `DATA_HOST`,
`dataUrl()` and `sw.js`.

## Rolling back

Point `DATA_HOST` back at an origin serving the files and redeploy the site.
The Pages static copies take over again — stale, but present.
