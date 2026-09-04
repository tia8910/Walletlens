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

Here a refresh is a KV write. Nothing is built and nothing is committed.

## Deploying

**Deploy with the CLI, not from Git.** Deno Deploy's Git integration clones
from GitHub, so while the account is flagged the dashboard's *Deploy Default
Branch* answers `Failed to trigger build` — the same failure that broke
Cloudflare Pages. `deployctl` uploads from the working directory and never
touches GitHub.

```bash
deno install -gArf jsr:@deno/deployctl

cd data-api
deployctl deploy --project=walletlens-data --entrypoint=main.ts --prod
```

The project name must match `DATA_HOST` in `client/src/apiHosts.js`
(`walletlens-data.deno.dev`). `apiHosts.test.js` fails if they drift, along
with the two CSPs and the service worker, which cannot import the constant.

There are **no secrets to set**. Every byte this stores and serves is public
market data, which is the main reason it was worth splitting out from the push
service.

Then check it can reach the upstreams:

```bash
curl https://walletlens-data.deno.dev/__health
curl https://walletlens-data.deno.dev/market.json | head -c 200
```

## Checking on it

`/__health` reports every dataset's `updated` stamp, row count and whether it
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
is still served, which is deliberate. All rows stale means the cron is not
running.

## Design notes

**`core.js` holds every decision; `main.ts` is Deno glue.** Storage is passed
in as a `store` — `{ read, write }` — so the cadence table, the staleness rule
and the failure branches are unit-tested in Node against a plain object. See
`client/src/dataService.test.js`, 51 tests.

**One cron, not six.** The originals carried six expressions between them.
This sweeps every 15 minutes and asks each dataset whether it is past its own
`maxAge`. Cadence becomes one number per dataset instead of a schedule spread
across four files, and a refresh missed because an upstream was briefly down
retries on the next tick — where the Actions version waited up to six hours
for its slot.

**A failed fetch never overwrites good data.** Fetchers return `null` rather
than an empty envelope, and `refresh()` keeps the stored value. This is the
failure that reaches users: CoinGecko's free tier answers a rate-limited
request with valid JSON and a truncated body, so "it parsed" is not "it is a
market snapshot". `parseMarket` enforces a 50-coin floor for that reason.

**Payloads are chunked.** Deno KV caps a value at 64 KiB and `market.json` is
250 KB, so this is not an optimisation — the largest dataset cannot be stored
whole. Chunks are written before the meta record that points at them, so a
reader sees either the old version whole or the new one whole, never half of
each.

**Parsers take text, not URLs.** The environment this was written in blocks
CoinGecko, Stooq and every RSS host, so the fetching could not be exercised.
Splitting the parsing out means the part where the bugs live is tested against
captured payload shapes. That earned itself immediately: the first run caught
that regex extraction does not entity-decode the way Python's ElementTree did,
which had left HTML tags no stripper could see and thumbnails no scraper could
find.

**The client fetches cross-origin now.** These used to be static files on
walletlens.live. `client/src/apiHosts.js` holds the host, `dataUrl()` builds
the URLs, and both CSPs plus `sw.js` name it — all four pinned by
`apiHosts.test.js`.

## Rolling back

Point `DATA_HOST` back at the origin serving the files and redeploy the site.
The Pages static copies take over again — stale, but present.
