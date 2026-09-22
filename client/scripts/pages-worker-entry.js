/**
 * The Pages advanced-mode worker: every /api/* function, in one bundle.
 *
 * WHY THIS IS BUILT INSTEAD OF SHIPPED AS functions/
 *
 * Cloudflare compiles a functions/ directory only when the deploy runs through
 * `wrangler pages deploy` from the project root. A direct upload of the built
 * directory — a zip — carries static assets and nothing else, so every
 * function in functions/ is simply absent from that deployment. That is what
 * /api/push/subscribe answering 405 meant: Pages had no handler for the path
 * and served it as a static asset, which refuses a POST.
 *
 * _worker.js is the one server-side mechanism a direct upload does honour. So
 * the same functions are bundled into it at build time, and the zip becomes
 * self-contained. Nothing about the functions themselves changes; this file
 * only dispatches to them the way Pages would.
 *
 * dist/_routes.json narrows invocation to /api/*, so every other request is
 * served by the normal asset pipeline and _headers and _redirects keep
 * applying exactly as they do today — the SPA fallback and the CSP included.
 */

import * as analyze from '../../functions/api/analyze.js'
import * as voiceParse from '../../functions/api/voice-parse.js'
import * as translate from '../../functions/api/translate.js'
import * as stocks from '../../functions/api/stocks.js'
import * as icon from '../../functions/api/icon.js'
import * as push from '../../functions/api/push/[[path]].js'
import * as drive from '../../functions/api/drive/[[path]].js'
import * as gdrive from '../../functions/api/gdrive/[[path]].js'
import * as voice from '../../functions/api/voice/[[path]].js'
import { DATA_HOST } from '../src/apiHosts.js'

// The scheduled datasets, by the filename they had when the build shipped
// them as static files.
//
// It still does, and that is the bug this closes: dataUrl() now asks
// walletlens.live for them, Pages found a real file at /news.json and served
// it, and that file has been frozen since the GitHub Action that refreshed it
// was disabled. The news modal filled up with articles nine days old, which
// looks far more like working software than an empty strip did.
//
// So the dataset paths come here first and are answered from the data worker.
// The shipped file stays as the fallback: for news there is no other source in
// the app, and stale is worth more than empty.
const DATA_ORIGIN = `https://${DATA_HOST}`
const DATASETS = new Set([
  '/news.json', '/market.json', '/stocks.json',
  '/economy.json', '/economic-calendar.json', '/stock-prices.json',
  '/coins.json', '/smartmoney.json',
])

async function serveDataset(url, request, env) {
  let upstream = null
  let upstreamBody = null
  try {
    const res = await fetch(`${DATA_ORIGIN}${url.pathname}${url.search}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Short, because the worker refreshes on its own schedule and a long
          // edge cache would hold a dataset past its own maxAge.
          'Cache-Control': 'public, max-age=300',
        },
      })
    }
    upstream = res.status

    // THE UPSTREAM'S OWN EXPLANATION IS THE DIAGNOSIS, SO DO NOT DISCARD IT.
    //
    // serve() answers a cold store with 503 {"error":"no data yet"}, and
    // replacing that with the site's HTML 404 made "never deployed" and
    // "deployed but the upstream failed" arrive identically.
    //
    // It was kept by returning the upstream's error INSTEAD of the shipped
    // copy, which bought that diagnosis at the cost of the datasets the build
    // does ship. A cold data worker therefore answered /news.json with a 503,
    // the client fell through to its live-RSS path, and on a network that
    // blocks the public CORS proxies the news strip rendered nothing — while
    // 95 fresh articles sat in the same deployment, one asset fetch away.
    //
    // The explanation does not need the body. It rides on a header, and the
    // shipped copy is served, so a stale strip beats an empty one and
    // diagnosis still works.
    upstreamBody = await res.text().catch(() => '')
  } catch { /* unreachable — the shipped copy is the right answer */ }

  // Stale beats empty: news has no other source in the app, and the build
  // still ships a copy of the older datasets.
  //
  // `shipped.ok` alone is not enough to know there IS a copy. Pages rewrites
  // an unknown path to the SPA shell with a 200, so a dataset that ships no
  // file (coins.json, smartmoney.json) comes back as a page of HTML that
  // parses as neither an error nor data. Checking that the body actually
  // opens as JSON is what separates a real copy from the fallback shell.
  const shipped = await env.ASSETS.fetch(request)
  if (shipped.ok) {
    const body = await shipped.text()
    if (/^\s*[[{]/.test(body)) {
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          // Which is it: live data, or the copy frozen at build time? Nothing
          // in the payload says, and the answer changes what to go and fix.
          'X-WL-Dataset': 'shipped',
          'X-WL-Upstream': String(upstream ?? 'unreachable'),
        },
      })
    }
  }

  // No copy shipped and the upstream would not serve it. Say which, rather
  // than handing back a page of HTML that says neither.
  return new Response(JSON.stringify({
    error: 'dataset_unavailable',
    name: url.pathname.replace(/^\//, ''),
    upstream,
    // The upstream's own words, where it had any — this is the line that
    // distinguishes a cold store from a worker that was never deployed.
    detail: upstreamBody ? upstreamBody.slice(0, 200) : undefined,
  }), { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

// Exact paths, mirroring the filenames Pages would route from.
const EXACT = {
  '/api/analyze': analyze,
  '/api/voice-parse': voiceParse,
  '/api/translate': translate,
  '/api/stocks': stocks,
  '/api/icon': icon,
}

/**
 * Pages' own resolution order: the method-specific export wins, then the
 * catch-all. onRequestGet beats onRequest for a GET; a module with neither
 * cannot serve that method at all.
 */
function handlerFor(mod, method) {
  const suffix = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()
  return mod[`onRequest${suffix}`] || mod.onRequest || null
}

/** The catch-all's [[path]] param: the segments after /api/push. */
function pushParams(pathname) {
  const rest = pathname.replace(/^\/api\/push\/?/, '')
  return { path: rest ? rest.split('/') : [] }
}

/** Same, for /api/drive/<exchange|refresh>. */
function driveParams(pathname) {
  const rest = pathname.replace(/^\/api\/drive\/?/, '')
  return { path: rest ? rest.split('/') : [] }
}

/** Same again, for the Drive API relay. */
function gdriveParams(pathname) {
  const rest = pathname.replace(/^\/api\/gdrive\/?/, '')
  return { path: rest ? rest.split('/') : [] }
}

/** And for the voice worker, whose root path is a route in its own right. */
function voiceParams(pathname) {
  const rest = pathname.replace(/^\/api\/voice\/?/, '')
  return { path: rest ? rest.split('/') : [] }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (DATASETS.has(url.pathname)) return serveDataset(url, request, env)

    const isPush = url.pathname === '/api/push' || url.pathname.startsWith('/api/push/')
    const isDrive = url.pathname === '/api/drive' || url.pathname.startsWith('/api/drive/')
    const isGDrive = url.pathname === '/api/gdrive' || url.pathname.startsWith('/api/gdrive/')
    const isVoice = url.pathname === '/api/voice' || url.pathname.startsWith('/api/voice/')
    const mod = EXACT[url.pathname]
      || (isPush ? push : isDrive ? drive : isGDrive ? gdrive : isVoice ? voice : null)

    // Not an API path. Hand it back to the asset server, which applies
    // _headers and _redirects — so this stays correct even if _routes.json is
    // ever ignored and every request arrives here.
    if (!mod) return env.ASSETS.fetch(request)

    const handler = handlerFor(mod, request.method)
    if (!handler) {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return handler({
      request,
      env,
      params: isPush ? pushParams(url.pathname)
        : isDrive ? driveParams(url.pathname)
        : isGDrive ? gdriveParams(url.pathname)
        : isVoice ? voiceParams(url.pathname)
        : {},
      waitUntil: (p) => ctx.waitUntil(p),
      // A function that calls next() wants the static asset behind it.
      next: () => env.ASSETS.fetch(request),
      data: {},
    })
  },
}
