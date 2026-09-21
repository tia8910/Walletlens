/**
 * Serverless function — /api/voice/*
 *
 * The voice worker, reached through walletlens.live.
 *
 * WHY
 * Screenshot import posts the image to this worker, which holds the Anthropic
 * key. The worker is on workers.dev, and /diag on the reporting device showed
 * that host failing in 4ms while same-origin answered in ~430ms — the request
 * never left the phone. The import then reported "No holdings detected in any
 * screenshot. Try clearer, tighter shots", which sent the person off to
 * photograph their exchange again for a request that was never sent.
 *
 * This is the sixth feature to break on that hostname, after push
 * registration, the six datasets, the news, the coin icons and Drive sign-in.
 * It also carries RSS import and two of the coin-logo fallbacks, so they come
 * back with it.
 *
 * Not an open proxy: the upstream is fixed, only the four routes the worker
 * answers are forwarded, and /proxy has its own target allowlist and rate
 * limiter inside the worker.
 */

// Must match VOICE_HOST in client/src/apiHosts.js.
const VOICE = 'https://walletlens-voice.tarek-abdelhameed.workers.dev'

// '' is the worker root, which takes the POST modes: vision, voice, mail.
const ROUTES = new Set(['', 'proxy', 'guardian-reset', 'subscribers'])

const json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

export async function onRequest(context) {
  const { request, params } = context
  const rest = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  if (!ROUTES.has(rest)) return json({ error: 'not_found' }, 404)

  const url = new URL(request.url)

  // Built, not forwarded — with one deliberate exception. The worker rate
  // limits /proxy per IP, and reading it from the edge would make every
  // visitor share one bucket and throttle each other. The browser used to call
  // this worker directly, so it already saw these addresses: passing it on is
  // the same exposure, not new exposure.
  const headers = new Headers({ Accept: 'application/json' })
  for (const h of ['content-type', 'cf-connecting-ip']) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }

  const method = request.method
  const body = method === 'GET' || method === 'HEAD' ? undefined : request.body

  let res
  try {
    res = await fetch(`${VOICE}/${rest}${url.search}`, {
      method,
      headers,
      body,
      // Screenshot import posts a base64 image; streaming it avoids buffering
      // the whole payload here for no gain.
      ...(body ? { duplex: 'half' } : {}),
    })
  } catch {
    return json({ error: 'voice_unreachable' }, 502)
  }

  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/json',
      // /proxy answers are price and RSS payloads the caller caches itself.
      'Cache-Control': res.headers.get('cache-control') || 'no-store',
    },
  })
}
