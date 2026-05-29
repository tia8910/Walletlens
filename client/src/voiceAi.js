// Claude-powered voice-trade interpreter (client side).
//
// Turns a raw speech-to-text transcript — any language, Arabic dialects,
// English, mixed, slang, or multiple trades in one breath — into one or
// more structured trades. Mirrors the server-side /api/voice-parse prompt
// but runs DIRECTLY from the browser using the user's own Anthropic key
// (same pattern as AIAdvisor.jsx / SmartImport.jsx), so it works with no
// server and keeps the app "100% local". If no local key is present it
// transparently falls back to the serverless endpoint.

import { ANTHROPIC_KEY } from './anthropic'

const KEY_STORAGE  = 'walletlens_anthropic_key'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

// The owner-hosted voice-parse endpoint (Deno Deploy / Vercel) that holds the
// ANTHROPIC_API_KEY secret. The site is static (GitHub Pages) so it can't host
// this itself. Defaults to the Deno Deploy project name from voice-api/README;
// override at runtime without rebuilding via localStorage 'wl_voice_api'.
const DEFAULT_VOICE_API = 'https://walletlens-voice-parse.deno.dev/'
function voiceEndpoint() {
  try {
    const o = localStorage.getItem('wl_voice_api')
    if (o && o.trim()) return o.trim()
  } catch {}
  return DEFAULT_VOICE_API
}

// User-supplied key from the in-app settings (preferred), else the build
// constant. Returns null when neither is configured.
export function getAnthropicKey() {
  try {
    const stored = localStorage.getItem(KEY_STORAGE)
    if (stored && stored.trim()) return stored.trim()
  } catch {}
  if (ANTHROPIC_KEY && ANTHROPIC_KEY !== 'YOUR_KEY_HERE') return ANTHROPIC_KEY
  return null
}

export function hasAnthropicKey() {
  return !!getAnthropicKey()
}

function buildPrompt(transcript, hintLang) {
  return `You are a voice-trade interpreter for a crypto/stock/metals portfolio app.

The user spoke into their microphone and the speech-to-text engine produced this raw transcript. The engine may have mis-heard words, mixed languages, or transcribed Arabic speech phonetically as English (e.g. "اشتري واحد بيتكوين" might become "street ultra bitcoin"). Slang/dialect is common: Saudi, Egyptian, Levantine, Maghrebi Arabic; English crypto-trader slang like "aped", "hodl", "scoop", "yolo'd", "tp'd", "rugged".

Transcript hint language: ${hintLang}

Transcript: "${transcript}"

Extract EVERY trade the user described. Return STRICT JSON ONLY — no markdown fences, no commentary outside the JSON. Use this shape:

{
  "trades": [
    {
      "type": "buy" | "sell",
      "symbol": "BTC" | "ETH" | "SOL" | "AAPL" | "TSLA" | "XAU" | etc. (uppercase ticker the asset is commonly known by),
      "name": "Bitcoin" | "Solana" | "Apple" | etc. (full readable name),
      "amount": <number, the QUANTITY of units bought/sold>,
      "price": <number or null — only if a unit price was explicitly stated>
    }
  ]
}

Rules:
- MULTIPLE trades in one sentence → one object PER asset. "I bought 1 Bitcoin and 1 Ethereum" → [{buy BTC 1},{buy ETH 1}]. "اشتريت واحد بيتكوين وواحد ايثيريوم" → the same two trades. A single intent verb can govern several coins — apply it to each.
- A shared amount before a list applies to each unless a per-coin amount is given: "I bought 2 Solana and 3 Cardano" → [SOL × 2, ADA × 3]; "I bought 5 of Bitcoin and Ethereum" → [BTC × 5, ETH × 5].
- If the transcript is too garbled to extract ANY trade, return { "trades": [] }.
- Recognise Arabic phonetics English STT mis-rendered (e.g. "selena" = Solana, "street ultra"/"ash tara"/"ish tari" = اشتري = buy, "baat"/"bat"/"bait" = بعت = sold).
- Arabic dialect intent verbs: اشتري/شريت/جبت/أخذت/حطيت/كومت/جمعت/كسبت/استثمرت = BUY; بعت/بيع/صفيت/سحبت/كسرت/خرجت/طرحت/جنيت = SELL.
- Amount slang: "5K"/"5 grand"/"5 racks"/"5 stack" = 5000; "2 mil" = 2,000,000; "half" = 0.5; "quarter" = 0.25. Arabic: الف=1000, مليون=1,000,000, نص=0.5, ربع=0.25.
- Common STT mis-hearings of coins: Selena/Salina/Celina = Solana; "a theorem"/"etherium"/"a theory" = Ethereum; "big point"/"bit corn" = Bitcoin; "polka dot" = Polkadot; "chain link"/"jane link" = Chainlink; "ava lunch" = Avalanche; "throne" = TRON; "dough"/"doggie coin" = Dogecoin; "rebel"/"ripple" = XRP.
- Stocks: Apple = AAPL, Tesla = TSLA, Microsoft = MSFT, NVIDIA = NVDA, Google = GOOGL, Amazon = AMZN, Meta = META, Palantir = PLTR, Coinbase = COIN, Robinhood = HOOD.
- Metals: gold = XAU, silver = XAG, platinum = XPT, copper = HG.
- If the user only mentioned a coin without a clear buy/sell intent, do NOT invent one — skip that trade.`
}

function filterTrades(arr) {
  return Array.isArray(arr)
    ? arr.filter(t => t && (t.type === 'buy' || t.type === 'sell') && t.symbol && typeof t.amount === 'number' && t.amount > 0)
    : []
}

// Returns a (possibly empty) array of { type, symbol, name?, amount, price? }.
//
// PRIMARY path is the serverless /api/voice-parse endpoint, which uses the
// app owner's ANTHROPIC_API_KEY secret — so every user gets smart parsing
// with no key of their own and the key is never exposed to the browser.
// Falls back to a direct in-browser call only if the server is unreachable
// or not configured AND a local key happens to be present (dev convenience).
export async function parseTradesWithClaude(transcript, hintLang = 'en') {
  const text = (transcript || '').toString().trim().slice(0, 500)
  if (!text) return []
  const lang = hintLang === 'ar' ? 'ar' : 'en'

  // 1) Owner-hosted endpoint with the secret key (works for everyone).
  try {
    const resp = await fetch(voiceEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text, hintLang: lang }),
    })
    if (resp.ok) {
      const data = await resp.json()
      const trades = filterTrades(data?.trades)
      if (trades.length) return trades
    }
    // 503 not_configured / 5xx → try the browser fallback below
  } catch {
    // network error → try the browser fallback below
  }

  // 2) Direct browser call (only if a local key exists — e.g. local dev).
  const apiKey = getAnthropicKey()
  if (apiKey) {
    try {
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
          max_tokens: 700,
          messages: [{ role: 'user', content: buildPrompt(text, lang) }],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const out = data.content?.[0]?.text || ''
        const m = out.match(/\{[\s\S]*\}/)
        if (m) return filterTrades(JSON.parse(m[0]).trades)
      }
    } catch {
      // give up gracefully
    }
  }
  return []
}
