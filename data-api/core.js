// The parts of the data service that do not depend on a runtime.
//
// Storage is passed in as a `store` — `{ read(name), write(name, payload) }` —
// so the cadence table, the staleness rule and the two failure branches that
// actually reach users can be exercised in Node, against a plain object,
// without a Deno KV or a Cloudflare binding anywhere near them.
//
// main.ts supplies the real store, which chunks payloads across KV entries
// because Deno KV caps a value at 64 KiB and market.json is 250 KB.

import {
  FEED_GROUPS, fetchCalendar, fetchFeedGroup, fetchMarket, fetchStockPrices,
} from './feeds.js'

const MIN = 60 * 1000

/**
 * Every dataset this service owns.
 *
 * `maxAge` reproduces the cadence of the workflow it replaces, so nothing gets
 * noticeably fresher or staler on the day this ships. They are deliberately
 * one edit away from being tightened later — the old six-hour market refresh
 * is loose for a portfolio app, and was chosen around CoinGecko's free-tier
 * limits rather than around what the app wants.
 */
export const DATASETS = {
  'market.json':            { maxAge: 6 * 60 * MIN, fetch: fetchMarket },
  'news.json':              { maxAge: 2 * 60 * MIN, fetch: (n) => fetchFeedGroup(FEED_GROUPS.news, n) },
  'stocks.json':            { maxAge: 2 * 60 * MIN, fetch: (n) => fetchFeedGroup(FEED_GROUPS.stocks, n) },
  'economy.json':           { maxAge: 2 * 60 * MIN, fetch: (n) => fetchFeedGroup(FEED_GROUPS.economy, n) },
  'economic-calendar.json': { maxAge: 60 * MIN,     fetch: fetchCalendar },
  'stock-prices.json':      { maxAge: 4 * 60 * MIN, fetch: fetchStockPrices },
}

/**
 * Whether a stored payload has aged out.
 *
 * Read off the payload's own `updated` stamp rather than store metadata, so
 * the answer survives a store migration and can be reasoned about by looking
 * at the served JSON. An unreadable stamp counts as stale: erring the other
 * way would freeze a dataset permanently on one bad write.
 */
export function isStale(stored, maxAge, now) {
  if (!stored) return true
  const t = Date.parse(stored.updated || '')
  if (!Number.isFinite(t)) return true
  return now - t >= maxAge
}

/**
 * Refresh one dataset if it is due.
 *
 * A fetch returning null means the upstream said something unusable — a rate
 * limit, an empty calendar. The previous value is KEPT in that case, matching
 * the Python's "keeping existing market.json" branch. Overwriting good data
 * with an empty envelope is the one failure mode that reaches users:
 * CoinGecko's free tier answers a rate-limited request with valid JSON and a
 * truncated body, so "it parsed" is not "it is a market snapshot".
 */
export async function refresh(store, name, { now = Date.now(), force = false } = {}) {
  const spec = DATASETS[name]
  if (!spec) return { name, skipped: 'unknown' }

  const stored = await store.read(name)
  if (!force && !isStale(stored, spec.maxAge, now)) return { name, skipped: 'fresh' }

  let next = null
  try {
    next = await spec.fetch(now)
  } catch (e) {
    console.warn(`${name} fetch threw: ${e}`)
  }
  if (!next) return { name, skipped: 'upstream', kept: !!stored }

  await store.write(name, next)
  return { name, updated: next.updated, count: next.count }
}

/** Refresh everything that is due. One failing feed never blocks the others. */
export async function sweep(store, now = Date.now()) {
  return Promise.all(
    Object.keys(DATASETS).map((name) =>
      refresh(store, name, { now }).catch((e) => ({ name, error: String(e) }))),
  )
}

function json(body, status, cache) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      // The app is served from walletlens.live and this from deno.dev, so
      // every one of these requests is cross-origin. The data is public and
      // unauthenticated and no cookie is ever read, so a wildcard is right.
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/**
 * Serve one dataset.
 *
 * On a miss this fetches inline rather than erroring. The app asks for these
 * on first paint, so a cold store would otherwise show empty news and an
 * empty market page to whoever arrived first after a deploy — and the cost of
 * avoiding that is one slow request, once.
 */
export async function serve(store, name, now = Date.now()) {
  let stored = await store.read(name)

  if (!stored) {
    await refresh(store, name, { now, force: true })
    stored = await store.read(name)
  }
  if (!stored) {
    // Upstream is down AND nothing is cached. 503 rather than an empty
    // envelope: the client's own error path shows the last good data it has,
    // which beats being handed an authoritative-looking empty list.
    return json({ error: 'no data yet', name }, 503, 'no-store')
  }

  // Short cache with a long stale window. The client already cache-busts with
  // ?t=, so this mainly governs the edge: a minute of caching soaks up bursts,
  // and stale-while-revalidate means a slow upstream never becomes a slow page.
  return json(stored, 200, 'public, max-age=60, stale-while-revalidate=600')
}

/** Health, for eyeballing whether the schedule is actually running. */
export async function health(store, now = Date.now()) {
  const rows = await Promise.all(Object.entries(DATASETS).map(async ([name, spec]) => {
    const s = await store.read(name)
    return [name, { updated: s?.updated ?? null, count: s?.count ?? null, stale: isStale(s, spec.maxAge, now) }]
  }))
  return json({ now: new Date(now).toISOString(), datasets: Object.fromEntries(rows) }, 200, 'no-store')
}

// ── Chunking ─────────────────────────────────────────────────────────────
//
// Deno KV caps a value at 64 KiB. market.json is 250 KB, and news.json is
// already 61 KB and grows with the feeds, so splitting is not an optimisation
// — the largest dataset simply cannot be stored whole.

export const CHUNK_BYTES = 48 * 1024

export function splitChunks(body, size = CHUNK_BYTES) {
  const out = []
  for (let i = 0; i < body.length; i += size) out.push(body.slice(i, i + size))
  // An empty body still needs one chunk, or the meta record claims zero and
  // the reader can never tell "stored empty" from "not stored".
  return out.length ? out : ['']
}

export function joinChunks(parts) {
  return parts.join('')
}
