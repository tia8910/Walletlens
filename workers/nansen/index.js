// WalletLens Nansen proxy, on Cloudflare Workers.
//
// Nansen's on-chain intelligence (smart money, token god mode, profiler,
// token screener) is useful to WalletLens users, but the API key must never
// ship in the app bundle. This worker is the only caller of the key: the
// client posts to the same-origin path it gets from apiHosts and this worker
// forwards to api.nansen.ai with the `apikey` header attached server-side.
//
// All real Nansen endpoints are POST with a JSON body. Query parameters are
// forwarded too (some screens use them), and the upstream status/body pass
// through untouched so the app can show Nansen's own error messages.

const ALLOWED_ORIGINS = new Set([
  'https://walletlens.live',
  'https://www.walletlens.live',
  'http://localhost:5173',
  'http://localhost:4173',
])
const PAGES_PREVIEW = /^https:\/\/([a-z0-9-]+\.)?walletlenslive1?\.pages\.dev$/

function corsHeaders(origin) {
  const allow = origin && (ALLOWED_ORIGINS.has(origin) || PAGES_PREVIEW.test(origin))
    ? origin
    : 'https://walletlens.live'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
}

const json = (obj, headers, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers })

// ── Endpoint allowlist ─────────────────────────────────────────────────────
// Every path under /api/v1/ that this worker will forward. Anything else is
// rejected before it can consume a single credit. The list is the endpoints
// WalletLens actually uses; extend it deliberately, not casually.
const ALLOWED_PREFIXES = [
  'token-screener',
  'smart-money/',
  'profiler/',
  'tgm/',
  'search/',
  'agent/',
  'hyperliquid/',
  'chain-rank',
  'prediction-market/',
  'perp',
  'points/',
  'smart-alerts/',
]

function allowed(path) {
  return ALLOWED_PREFIXES.some(p => path.startsWith(p))
}

// ── Per-isolate rate limiting ────────────────────────────────────────────
// Not a global limit — each isolate keeps its own window — but enough to stop
// one hot client from emptying the credit balance through a single instance.
const RATE_LIMIT_MS = 60_000
const RATE_LIMIT_MAX = 60
const hits = new Map()

function rateLimited(ip, hits) {
  const now = Date.now()
  const bucket = hits.get(ip)
  if (!bucket || now - bucket.at > RATE_LIMIT_MS) {
    hits.set(ip, { at: now, n: 1 })
    return false
  }
  bucket.n += 1
  return bucket.n > RATE_LIMIT_MAX
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin')
    const headers = corsHeaders(origin)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/' || path === '/health') {
      return json({
        ok: true,
        service: 'walletlens-nansen',
        runtime: 'cloudflare-workers',
        keyConfigured: !!env.NANSEN_API_KEY,
      }, headers)
    }

    const m = path.match(/^\/api\/v1\/(.+)$/)
    if (!m) return json({ error: 'not_found', path }, headers, 404)
    const endpoint = m[1]

    if (request.method !== 'POST' && request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, headers, 405)
    }
    if (!allowed(endpoint)) {
      return json({ error: 'endpoint_not_allowed', endpoint }, headers, 403)
    }
    if (!env.NANSEN_API_KEY) {
      return json({ error: 'not_configured' }, headers, 503)
    }
    if (rateLimited(request.headers.get('cf-connecting-ip') || 'unknown', hits)) {
      return json({ error: 'rate_limited' }, headers, 429)
    }

    const base = String(env.NANSEN_BASE || 'https://api.nansen.ai').replace(/\/+$/, '')
    const target = new URL(`${base}/api/v1/${endpoint}`)
    url.searchParams.forEach((v, k) => target.searchParams.set(k, v))

    const body = request.method === 'POST' ? await request.text() : undefined
    try {
      const res = await fetch(target, {
        method: request.method,
        headers: {
          'apikey': env.NANSEN_API_KEY,
          ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
        signal: AbortSignal.timeout(30_000),
      })
      const text = await res.text()
      // Pass the upstream response through byte-for-byte, preserving its own
      // status (429, 422, ...) and credit headers where the client can see
      // them, so the app can show Nansen's real error instead of a generic one.
      const upstreamError = !res.ok
      if (upstreamError) console.error('nansen upstream:', res.status, endpoint, text.slice(0, 200))
      return new Response(text, {
        status: res.status,
        headers: {
          ...headers,
          'X-Nansen-Upstream': String(res.status),
        },
      })
    } catch (e) {
      console.error('nansen fetch failed:', endpoint, String(e?.message || e).slice(0, 200))
      return json({ error: 'upstream_unreachable', detail: String(e?.message || e).slice(0, 120) }, headers, 502)
    }
  },
}
