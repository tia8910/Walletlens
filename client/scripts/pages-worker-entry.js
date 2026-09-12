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
import * as push from '../../functions/api/push/[[path]].js'

// Exact paths, mirroring the filenames Pages would route from.
const EXACT = {
  '/api/analyze': analyze,
  '/api/voice-parse': voiceParse,
  '/api/translate': translate,
  '/api/stocks': stocks,
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isPush = url.pathname === '/api/push' || url.pathname.startsWith('/api/push/')
    const mod = EXACT[url.pathname] || (isPush ? push : null)

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
      params: isPush ? pushParams(url.pathname) : {},
      waitUntil: (p) => ctx.waitUntil(p),
      // A function that calls next() wants the static asset behind it.
      next: () => env.ASSETS.fetch(request),
      data: {},
    })
  },
}
