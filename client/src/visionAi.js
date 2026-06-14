// Claude-vision screenshot importer.
//
// Turns a screenshot of a portfolio / holdings list / trade history / order
// confirmation into structured holdings. PRIMARY path is the owner-hosted Deno
// endpoint (mode: "vision"), which holds the Anthropic key as a server-side
// secret — so every user gets screenshot import with no key of their own and
// the key is never exposed to the browser. Falls back to a direct in-browser
// call only if the endpoint is unreachable AND a local key happens to be set.

import { ANTHROPIC_KEY } from './anthropic'

const KEY_STORAGE = 'walletlens_anthropic_key'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const DEFAULT_VOICE_API = 'https://walletlens-voice-parse.tia8910.deno.net/'

function endpoint() {
  try {
    const o = localStorage.getItem('wl_voice_api')
    if (o && o.trim()) return o.trim()
  } catch {}
  return DEFAULT_VOICE_API
}

function localKey() {
  try {
    const stored = localStorage.getItem(KEY_STORAGE)
    if (stored && stored.trim()) return stored.trim()
  } catch {}
  if (ANTHROPIC_KEY && ANTHROPIC_KEY !== 'YOUR_KEY_HERE') return ANTHROPIC_KEY
  return null
}

const VISION_PROMPT = `You are a precise data-extraction engine for a crypto/stock/metals portfolio app. The user uploaded a screenshot — it may be an exchange/wallet portfolio, a holdings list, a trade/order history, or a single order confirmation.

Extract EVERY asset position or trade you can read. Return STRICT JSON ONLY — a single JSON array, no markdown, no commentary. Each item:
{ "symbol": "BTC", "name": "Bitcoin", "amount": <number of units>, "price": <number, unit price in USD or 0 if not shown>, "type": "buy" | "sell" }

Rules:
- "amount" is the QUANTITY of units (coins/shares/oz), never the fiat value. If only a fiat value and a price are shown, divide to get units.
- If a row shows a holding/balance with no explicit buy/sell, use "buy".
- Use the ticker for "symbol" (BTC, ETH, SOL, AAPL, TSLA, XAU, …) in uppercase.
- INCLUDE stablecoins (USDT, USDC, BUSD, DAI, TUSD, FDUSD, PYUSD, etc.) — they are real crypto assets, not fiat cash.
- Ignore only true fiat balances (USD, EUR, GBP labels that are wallet/bank deposits, not crypto tokens), ads, totals rows, and UI chrome.
- If nothing can be read, return [].`

function normalize(arr) {
  if (!Array.isArray(arr)) return []
  return arr
    .map((r) => ({
      symbol: (r?.symbol || '').toString().toUpperCase().trim(),
      name: (r?.name || r?.symbol || '').toString().trim(),
      amount: Number(r?.amount) || 0,
      price: Number(r?.price) || 0,
      type: r?.type === 'sell' ? 'sell' : 'buy',
    }))
    .filter((r) => r.symbol)
}

// Returns an array of { symbol, name, amount, price, type }.
// Throws an Error with a user-friendly message when neither the endpoint nor a
// local key can be used.
export async function parseScreenshotWithClaude(base64, mediaType = 'image/png') {
  if (!base64) return []

  // 1) Owner-hosted endpoint with the secret key (works for everyone).
  try {
    const resp = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'vision', image: base64, mediaType }),
    })
    if (resp.ok) {
      const data = await resp.json()
      return normalize(data?.holdings)
    }
    // 503 not_configured / older deploy without vision → try browser fallback.
  } catch {
    // network error → try browser fallback
  }

  // 2) Direct browser call (only if a local key exists — e.g. local dev).
  const apiKey = localKey()
  if (apiKey) {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: VISION_PROMPT },
          ],
        }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `API error ${res.status}`)
    }
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    return normalize(match ? JSON.parse(match[0]) : [])
  }

  throw new Error('Screenshot import needs the AI endpoint. It looks unavailable right now — try again, or use Excel/CSV import.')
}
