# walletlens-data

Fetches the app's public datasets on a schedule and serves them. Replaces four
GitHub Actions cron jobs.

## What it replaces

| Was | Now |
| --- | --- |
| `update-market.yml` | `market.json`, every 6h |
| `update-news.yml` | `news.json`, `stocks.json`, `economy.json`, every 2h |
| `update-economy-calendar.yml` | `economic-calendar.json`, hourly |
| `update-stock-prices.yml` | `stock-prices.json`, every 4h |

Each of those fetched a public feed, wrote a JSON file into `client/public/`,
committed it and pushed. The data only reached users after a site rebuild and
redeploy — so a price refresh was a deploy, the data lived in git, and the whole
chain stopped the moment Actions did.

On 2026-09-02 that happened: the GitHub account was flagged, Actions was
disabled, and all four froze with no error and no notification. The app went on
serving two-day-old prices, because the staleness was baked into files that had
already shipped.

Here a refresh is a KV write. Nothing is built, nothing is committed, and the
data keeps flowing with GitHub unavailable indefinitely.

## Deploying

The KV namespace holds only public market data — nothing here is secret, and
the worker needs no secrets at all. That is the main reason this was worth
splitting out from `workers/push`, which needs several.

```bash
cd workers/data

# 1. Create the cache, once. Paste the printed id into wrangler.toml.
npx wrangler kv namespace create DATA

# 2. Deploy with the `routes` block in wrangler.toml commented out.
npx wrangler deploy

# 3. Confirm it can reach the upstreams and fill KV.
curl https://walletlens-data.<your-subdomain>.workers.dev/__health
curl https://walletlens-data.<your-subdomain>.workers.dev/market.json | head -c 200

# 4. Only once that works, uncomment `routes` and deploy again.
npx wrangler deploy
```

**Do step 4 last, and not before step 3 passes.** A Worker route wins over
Cloudflare Pages on a matching path, so the moment the routes are live the
static copies the Pages build ships become unreachable. The worker can answer
immediately — `serve()` fetches inline on a cold KV rather than 404ing — but
there is no reason to find out under live traffic that an upstream is blocked.

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

`"stale": true` on one row means its upstream is failing — the previous value is
still being served, which is deliberate. All rows stale means the cron is not
running; check Triggers in the Cloudflare dashboard.

## Design notes

**One cron, not six.** The originals carried six expressions between them. This
runs one sweep every 15 minutes and asks each dataset whether it is past its own
`maxAge` (in `DATASETS`, `index.js`). The cadence becomes one number per dataset
rather than a schedule spread across four files, and a refresh missed because an
upstream was briefly down is retried on the next tick — where the Actions
version would wait a full six hours for its slot to come round again.

**A failed fetch never overwrites good data.** Every fetcher returns `null`
rather than an empty envelope when the upstream gives something unusable, and
`refresh()` keeps the stored value in that case. This is the failure that
reaches users: CoinGecko's free tier answers a rate-limited request with valid
JSON and a truncated body, so "it parsed" is not "it is a market snapshot".
`parseMarket` enforces a 50-coin floor for exactly that reason.

**Parsers take text, not URLs.** The egress proxy in the environment this was
written in blocks CoinGecko, Stooq and every RSS host, so the fetching could not
be exercised. Splitting the parsing out means the part where the bugs actually
live is tested against captured payload shapes — see
`client/src/dataWorker.test.js`, 47 tests. That split immediately earned itself:
the first run caught that regex extraction does not entity-decode the way
Python's ElementTree did, which had left HTML tags no stripper could see and
thumbnails no scraper could find.

**The client needs no change.** These are the same paths on the same origin, so
`fetch('/market.json')` keeps working, the CSP is untouched, and the Pages
project is untouched.

## Rolling back

Delete the `routes` block and redeploy. The Pages static copies take over again
immediately — stale, but present. Nothing else in the app is coupled to this.
