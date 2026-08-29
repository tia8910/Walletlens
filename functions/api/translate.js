/**
 * Serverless function — /api/translate
 *
 * Translates short, PUBLIC strings. It exists for one caller: the news ticker,
 * whose headlines arrive from CoinDesk / Decrypt / MarketWatch in English and
 * so cannot be covered by the translation table in i18n.js.
 *
 * PRIVACY: this endpoint must only ever receive text that was already public.
 * News headlines qualify. Portfolio data does not — no symbol, amount, wallet
 * name, note or any other user-entered string may be sent here, for the same
 * reason analytics.js refuses them: WalletLens is marketed as private, and an
 * outbound request is an outbound request whoever receives it. MAX_LEN is set
 * at headline length partly to make a paragraph of user text fail the check.
 *
 * Cost control, because this spends the site owner's API key:
 *   - a hard cap of MAX_ITEMS strings per request
 *   - Cloudflare's edge cache keyed on the exact batch, so a headline is
 *     translated once per language and then served from cache for a day
 *   - the client caches again in localStorage, so a returning reader on the
 *     same device costs nothing at all
 */

const MAX_ITEMS = 24
const MAX_LEN = 300
const LANGS = { ar: 'Arabic', fr: 'French', es: 'Spanish' }
const CACHE_SECONDS = 86400

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, ...extra } })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function onRequestPost(context) {
  const { env, request } = context

  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'not_configured' }, 503)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const lang = String(body?.lang || '')
  if (!LANGS[lang]) return json({ error: 'unsupported_language' }, 400)

  const texts = Array.isArray(body?.texts) ? body.texts : null
  if (!texts || !texts.length) return json({ error: 'no_texts' }, 400)
  if (texts.length > MAX_ITEMS) return json({ error: 'too_many' }, 400)
  if (texts.some(t => typeof t !== 'string' || t.length > MAX_LEN)) {
    return json({ error: 'text_too_long' }, 400)
  }

  // Cache key is the batch itself, so the same set of headlines in the same
  // language is a hit regardless of which reader asks for it.
  const keyBody = JSON.stringify({ lang, texts })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyBody))
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  const cacheKey = new Request(`https://translate.cache/${lang}/${hash}`, { method: 'GET' })
  const cache = caches.default

  const hit = await cache.match(cacheKey)
  if (hit) return hit

  let resp
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system:
          `Translate each item into ${LANGS[lang]}. These are financial news headlines.\n` +
          'Rules:\n' +
          '- Keep ticker symbols, company names, product names and numbers exactly as they are (BTC, ETH, SEC, Coinbase, $65,120).\n' +
          '- Keep the register of a news headline: concise, no added commentary.\n' +
          '- Translate every item, even if it looks like a fragment.\n' +
          'Reply with a JSON array of strings only — same length, same order, no prose, no markdown fence.',
        messages: [{ role: 'user', content: JSON.stringify(texts) }],
      }),
    })
  } catch {
    return json({ error: 'upstream_unreachable' }, 502)
  }

  if (!resp.ok) return json({ error: 'upstream_error', status: resp.status }, 502)

  let translations
  try {
    const data = await resp.json()
    const raw = (data?.content?.[0]?.text || '').trim().replace(/^```(?:json)?|```$/g, '').trim()
    translations = JSON.parse(raw)
  } catch {
    return json({ error: 'bad_upstream_shape' }, 502)
  }

  // A length mismatch would silently shift every headline onto the wrong
  // article, which is worse than showing English.
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    return json({ error: 'length_mismatch' }, 502)
  }
  if (translations.some(t => typeof t !== 'string')) {
    return json({ error: 'bad_upstream_shape' }, 502)
  }

  const out = json({ translations }, 200, {
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
  })
  context.waitUntil(cache.put(cacheKey, out.clone()))
  return out
}
