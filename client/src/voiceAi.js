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
// Sonnet 5 — big multilingual accuracy jump over 4.6 on garbled / accented /
// multi-trade speech (Arabic dialects + English), while staying fast enough
// for an interactive voice UI.
const MODEL = 'claude-sonnet-5'

// Structured-output schema — forces Claude to return valid, parseable trade
// JSON every time. This REPLACES the old assistant-prefill "{" trick, which
// returns HTTP 400 on Sonnet 5 (and every current Claude model) — the reason
// the AI parse silently failed and only the first coin was ever detected.
const TRADES_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['trades'],
    properties: {
      trades: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'symbol', 'name', 'amount', 'price'],
          properties: {
            type: { anyOf: [{ type: 'string', enum: ['buy', 'sell'] }, { type: 'null' }] },
            symbol: { type: 'string' },
            name: { type: 'string' },
            amount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            price: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          },
        },
      },
    },
  },
}

// The owner-hosted voice-parse endpoint (Deno Deploy / Vercel) that holds the
// ANTHROPIC_API_KEY secret. The site is static (GitHub Pages) so it can't host
// this itself. Defaults to the Deno Deploy project name from voice-api/README;
// override at runtime without rebuilding via localStorage 'wl_voice_api'.
const DEFAULT_VOICE_API = 'https://walletlens-voice-parse.tia8910.deno.net/'
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

function buildPrompt(transcript, hintLang, alternatives = []) {
  const altBlock = alternatives.length > 1
    ? `\nThe speech-to-text engines produced these CANDIDATE transcripts of the SAME spoken sentence. They may disagree, drop words, or mis-hear coins — reconcile them into the single true intent (a coin appearing in any candidate is strong evidence it was said):\n${alternatives.map((a, i) => `  ${i + 1}. "${a}"`).join('\n')}\n\nPrimary (best-guess) transcript: "${transcript}"\n`
    : `\nTranscript: "${transcript}"\n`
  return `You are a world-class voice-trade interpreter for a crypto/stock/metals portfolio app. Accuracy is critical — a wrong coin or amount records a wrong trade.

The user spoke into their microphone and the speech-to-text engine produced this. The engine may have mis-heard words, mixed languages, or transcribed Arabic speech phonetically as English (e.g. "اشتري واحد بيتكوين" might become "street ultra bitcoin"). Slang/dialect is common: Saudi, Egyptian, Levantine, Maghrebi Arabic; English crypto-trader slang like "aped", "hodl", "scoop", "yolo'd", "tp'd", "rugged".

Transcript hint language: ${hintLang} (this is the AUTO-DETECTED language — the user may mix languages in one sentence). For Hindi/Urdu transcripts, treat romanised words like "kharid", "liya", "bech", "ek", "do" as Hindi/Urdu. For French treat "acheter", "vendre", "un", "deux" as French. For Spanish treat "comprar", "vender", "uno", "dos" as Spanish. For Turkish treat "al", "satis", "bir", "iki" as Turkish. Use the SAME rules for buy/sell detection as Arabic and English.
${altBlock}
Extract EVERY trade the user described. Return STRICT JSON ONLY — no markdown fences, no commentary outside the JSON. Use this shape:

{
  "trades": [
    {
      "type": "buy" | "sell" | null,
      "symbol": "BTC" | "ETH" | "SOL" | "AAPL" | "TSLA" | "XAU" | etc. (uppercase ticker the asset is commonly known by),
      "name": "Bitcoin" | "Solana" | "Apple" | etc. (full readable name),
      "amount": <number or null — the QUANTITY of units bought/sold, null if not stated>,
      "price": <number or null — only if a unit price was explicitly stated>
    }
  ]
}

Rules:
- MULTIPLE trades in one sentence → one object PER asset. Scan the ENTIRE sentence from start to finish — NEVER stop after the first coin. "I bought 1 Bitcoin and 1 Ethereum" → [{buy BTC 1},{buy ETH 1}]. "اشتريت واحد بيتكوين وواحد ايثيريوم" → the same two trades. A single intent verb governs every coin listed after it until a new verb appears — apply it to each. If you returned only 1 trade but the sentence contains multiple coin names, you missed trades — re-read and add them all.
- Worked Arabic example: "اشتريت اثنين سولانا وثلاث ايثيريوم وبعت نص بيتكوين" → [{buy SOL 2},{buy ETH 3},{sell BTC 0.5}]. The verb switches to "بعت" (sell) for Bitcoin only.
- A shared amount before a list applies to each unless a per-coin amount is given: "I bought 2 Solana and 3 Cardano" → [SOL × 2, ADA × 3]; "I bought 5 of Bitcoin and Ethereum" → [BTC × 5, ETH × 5].
- Arabic "و" (and) — attached or standalone — separates assets: "بيتكوين وايثيريوم" / "بيتكوين و ايثيريوم" = two assets. A comma, "ثم" (then), or a pause also separates assets. English "and", "plus", "also", "then", commas, and "&" separate assets too.
- If the transcript is too garbled to extract ANY trade, return { "trades": [] }.
- Recognise Arabic phonetics English STT mis-rendered (e.g. "selena" = Solana, "street ultra"/"ash tara"/"ish tari" = اشتري = buy, "baat"/"bat"/"bait" = بعت = sold).
- Arabic dialect intent verbs: اشتري/اشتريت/شريت/جبت/أخذت/خذيت/حطيت/كومت/جمعت/كسبت/استثمرت/دخلت/نزلت = BUY; بعت/بيع/صفيت/سحبت/كسرت/خرجت/طرحت/جنيت/طلعت/فشيت = SELL.
- Hindi/Urdu (romanised) intent: kharid/kharida/khareeda/liya/lo/lena = BUY; bech/becha/bikri/farokht = SELL. Devanagari: खरीद/लिया = BUY; बेच/बिक्री = SELL.
- French intent: acheter/achete/pris/prends = BUY; vendre/vends/vendu = SELL.
- Spanish intent: comprar/compre/compro = BUY; vender/vendi/vendo = SELL.
- Turkish intent: al/aldi/satin al = BUY; satis/saticak/satti = SELL.
- Arabic spelled numbers: واحد=1, اثنين/اتنين=2, ثلاثة/تلاتة=3, اربعة=4, خمسة=5, عشرة=10.
- Amount slang: "5K"/"5 grand"/"5 racks"/"5 stack" = 5000; "2 mil" = 2,000,000; "half" = 0.5; "quarter" = 0.25. Arabic: الف/ألف=1000, مليون=1,000,000, نص/نصف=0.5, ربع=0.25.
- Hindi/Urdu numbers: ek=1, do=2, teen=3, paanch=5, das=10, bees=20, sau=100, hazaar=1000, lakh=100000, crore=10M, aadha=0.5.
- French numbers: un/une=1, deux=2, trois=3, cent=100, mille=1000, million=1M.
- Spanish numbers: uno/un=1, dos=2, tres=3, cien=100, mil=1000, millón=1M.
- Turkish numbers: bir=1, iki=2, üç=3, yüz=100, bin=1000, milyon=1M
- Common STT mis-hearings of coins: Selena/Salina/Celina = Solana; "a theorem"/"etherium"/"a theory" = Ethereum; "big point"/"bit corn" = Bitcoin; "polka dot" = Polkadot; "chain link"/"jane link" = Chainlink; "ava lunch" = Avalanche; "throne" = TRON; "dough"/"doggie coin" = Dogecoin; "rebel"/"ripple" = XRP.
- Stocks: Apple = AAPL, Tesla = TSLA, Microsoft = MSFT, NVIDIA = NVDA, Google = GOOGL, Amazon = AMZN, Meta = META, Palantir = PLTR, Coinbase = COIN, Robinhood = HOOD.
- Metals: gold = XAU, silver = XAG, platinum = XPT, copper = HG.
- If the user only mentioned a coin with no clear buy/sell intent or amount, still include it with "type": null and "amount": null — the user will fill in those details.`
}

function filterTrades(arr) {
  return Array.isArray(arr)
    ? arr.filter(t => {
        if (!t || !t.symbol) return false
        // Keep every well-formed trade, INCLUDING partials: "bought Bitcoin"
        // (type but no amount) pre-fills the card as Buy+BTC and the user just
        // types the amount; "2 Solana" (amount but no verb) pre-fills the rest.
        // Dropping partials threw away most of what Claude understood.
        if (t.type != null && t.type !== 'buy' && t.type !== 'sell') return false
        if (t.amount != null && !(typeof t.amount === 'number' && t.amount > 0)) return false
        return true
      })
    : []
}

// Returns a (possibly empty) array of { type, symbol, name?, amount, price? }.
//
// PRIMARY path is the serverless /api/voice-parse endpoint, which uses the
// app owner's ANTHROPIC_API_KEY secret — so every user gets smart parsing
// with no key of their own and the key is never exposed to the browser.
// Falls back to a direct in-browser call only if the server is unreachable
// or not configured AND a local key happens to be present (dev convenience).
export async function parseTradesWithClaude(transcript, hintLang = 'en', alternatives = []) {
  const text = (transcript || '').toString().trim().slice(0, 500)
  if (!text) return []
  // Pass the detected language through — collapsing everything to ar/en threw
  // away the hint for Hindi/French/Spanish/Turkish transcripts.
  const lang = ['ar', 'hi', 'fr', 'tr', 'es'].includes(hintLang) ? hintLang : 'en'
  // De-dupe candidate transcripts (from the parallel recognizers) and keep the
  // primary one first; these let Claude triangulate what was really said.
  const alts = Array.from(new Set([
    text,
    ...(Array.isArray(alternatives) ? alternatives : [])
      .map(a => (a || '').toString().trim().slice(0, 500))
      .filter(Boolean),
  ])).slice(0, 12)

  // 1) Owner-hosted endpoint with the secret key (works for everyone).
  try {
    const resp = await fetch(voiceEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text, hintLang: lang, alternatives: alts }),
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
          // Higher cap so long multi-trade JSON is never truncated.
          max_tokens: 2048,
          // Thinking off: this is a latency-sensitive extraction task and the
          // prompt already carries explicit rules + worked examples.
          thinking: { type: 'disabled' },
          // Guaranteed valid JSON — replaces the old assistant-prefill trick.
          output_config: { format: TRADES_FORMAT },
          messages: [
            { role: 'user', content: buildPrompt(text, lang, alts) },
          ],
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
