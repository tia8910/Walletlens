/**
 * The data worker: fetches the app's public datasets on a schedule and serves
 * them, replacing four GitHub Actions cron jobs.
 *
 * WHAT IT REPLACES, AND WHY THE SHAPE CHANGED
 * The Actions versions fetched, wrote a file into client/public/, committed
 * and pushed. The site then had to be rebuilt and redeployed for the new data
 * to reach anyone. That made a price refresh a deploy, coupled the data to
 * git, and stopped dead the moment Actions did.
 *
 * Here the fetch writes to KV and the same worker serves it. Nothing is built,
 * nothing is committed, and the data keeps flowing with GitHub unavailable.
 *
 * ONE CRON, NOT SIX
 * The originals carried six cron expressions between them. Rather than
 * reproduce those, this runs on a single frequent trigger and asks each
 * dataset whether it is stale. Two reasons: the per-dataset interval becomes
 * one number in DATASETS instead of a schedule split across files, and a
 * refresh missed because the upstream was briefly down is retried on the next
 * tick instead of waiting for its slot to come round again — which is exactly
 * how the Actions version could go six hours on a failed fetch.
 *
 * THE ROUTE TAKES PRECEDENCE OVER PAGES
 * walletlens.live is served by Cloudflare Pages, and these paths exist there
 * as static files from the last build. A Worker route on a matching path wins,
 * so the client's existing fetch('/market.json') calls reach this without any
 * change to the app, its CSP (same origin) or the Pages project.
 *
 * WHICH MEANS A COLD KV WOULD BE WORSE THAN NO WORKER AT ALL: once the route
 * is live, the Pages copy is unreachable, so an empty KV would serve nothing
 * where a stale file used to be. serve() therefore fetches upstream on a miss
 * rather than returning an error — the first request after deploy populates
 * the cache itself, and no deploy ordering is required.
 */

import {
  FEED_GROUPS, fetchCalendar, fetchFeedGroup, fetchMarket, fetchStockPrices,
} from './feeds.js'

const MIN = 60 * 1000

/**
 * Every dataset this worker owns.
 *
 * `maxAge` reproduces the cadence of the workflow it replaces, so nothing gets
 * noticeably fresher or staler on the day this ships. They are deliberately
 * one edit away from being tightened later — the old six-hour market refresh
 * is loose for a portfolio app and was chosen around CoinGecko's free-tier
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

const key = (name) => `data:${name}`

/**
 * Whether a stored payload has aged out.
 *
 * Read off the payload's own `updated` stamp rather than KV metadata, so the
 * answer survives a namespace migration and can be reasoned about by looking
 * at the served JSON.
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
 * with an empty envelope is the one failure mode that reaches users.
 */
export async function refresh(env, name, { now = Date.now(), force = false } = {}) {
  const spec = DATASETS[name]
  if (!spec) return { name, skipped: 'unknown' }

  const stored = await readKv(env, name)
  if (!force && !isStale(stored, spec.maxAge, now)) return { name, skipped: 'fresh' }

  let next = null
  try {
    next = await spec.fetch(now)
  } catch (e) {
    console.warn(`${name} fetch threw: ${e}`)
  }
  if (!next) return { name, skipped: 'upstream', kept: !!stored }

  await env.DATA.put(key(name), JSON.stringify(next))
  return { name, updated: next.updated, count: next.count }
}

async function readKv(env, name) {
  try {
    return await env.DATA.get(key(name), 'json')
  } catch (e) {
    console.warn(`kv read failed for ${name}: ${e}`)
    return null
  }
}

/**
 * Serve one dataset.
 *
 * On a miss this fetches inline rather than 404ing — see the header. The cost
 * is one slow request after a deploy; the alternative is a hole in the site
 * exactly when the route goes live.
 */
export async function serve(env, name, now = Date.now()) {
  let stored = await readKv(env, name)

  if (!stored) {
    await refresh(env, name, { now, force: true })
    stored = await readKv(env, name)
  }
  if (!stored) {
    // Upstream is down AND nothing is cached. 503 rather than an empty
    // envelope: the client's own error path shows the last good data it has,
    // which beats being handed an authoritative-looking empty list.
    return json({ error: 'no data yet', name }, 503, 'no-store')
  }

  // Short cache with a long stale window. The client already cache-busts with
  // ?t=, so this mainly governs Cloudflare's edge: a minute of caching soaks
  // up bursts, and stale-while-revalidate means a slow upstream never becomes
  // a slow page.
  return json(stored, 200, 'public, max-age=60, stale-while-revalidate=600')
}

function json(body, status, cache) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      // Same-origin in production, but the worker is also reachable on its
      // workers.dev hostname, where the app's dev server would be cross-origin.
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export default {
  /**
   * Refresh whatever is due. Every dataset is attempted on every tick; the
   * staleness check inside refresh() is what makes that cheap, and it means
   * one failing feed never blocks the others.
   */
  async scheduled(event, env, ctx) {
    const now = Date.now()
    ctx.waitUntil((async () => {
      const results = await Promise.all(
        Object.keys(DATASETS).map(name =>
          refresh(env, name, { now }).catch(e => ({ name, error: String(e) }))),
      )
      const did = results.filter(r => r.updated)
      if (did.length) console.log('refreshed:', did.map(r => `${r.name}(${r.count})`).join(' '))
    })())
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    // Trailing path only, so the same worker answers on the custom domain and
    // on workers.dev without separate route handling.
    const name = url.pathname.replace(/^\//, '')

    if (name === '__health') {
      const now = Date.now()
      const rows = await Promise.all(Object.entries(DATASETS).map(async ([n, spec]) => {
        const s = await readKv(env, n)
        return [n, {
          updated: s?.updated ?? null,
          count: s?.count ?? null,
          stale: isStale(s, spec.maxAge, now),
        }]
      }))
      return json({ now: new Date(now).toISOString(), datasets: Object.fromEntries(rows) }, 200, 'no-store')
    }

    if (!DATASETS[name]) return new Response('Not found', { status: 404 })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    return serve(env, name, Date.now())
  },
}
