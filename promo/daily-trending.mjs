// WalletLens — daily trending post agent.
//
// Fetches live market data (BTC, ETH, top movers), computes a quick fear/greed
// score, then asks Claude to write one timely, on-brand post referencing today's
// market conditions. Runs at 09:00 UTC daily (separate from lenz-social at 15:00).
//
// Modes:
//   • X API creds set   → posts directly to @wallet_lens
//   • No X creds        → writes promo/x-trending.json; workflow opens a review issue
//
// Secrets: ANTHROPIC_API_KEY (required)
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (optional, enables auto-post)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, 'x-trending.json')
const MODEL = 'claude-sonnet-4-6'

function note(m) {
  console.log(m)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) { try { writeFileSync(f, m + '\n', { flag: 'a' }) } catch {} }
}
function fail(m) { console.error(m); console.log(`::error::${String(m).slice(0, 800)}`); process.exit(1) }

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) fail('ANTHROPIC_API_KEY is not set.')

// ── Fetch live market snapshot ───────────────────────────────────────────────
async function fetchMarket() {
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h'
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`)
  return r.json()
}

function buildSnapshot(coins) {
  // Fear/greed from breadth + momentum (simplified version of /market-index calc)
  const upCoins = coins.filter(c => (c.price_change_percentage_24h || 0) > 0)
  const breadth = (upCoins.length / coins.length) * 100
  const avgMove = coins.slice(0, 10).reduce((s, c) => s + (c.price_change_percentage_24h || 0), 0) / 10
  const normMomentum = Math.min(100, Math.max(0, 50 + avgMove * 5))
  const score = Math.round(breadth * 0.6 + normMomentum * 0.4)
  const label = score >= 75 ? 'Extreme Greed' : score >= 55 ? 'Greed' : score >= 45 ? 'Neutral' : score >= 25 ? 'Fear' : 'Extreme Fear'

  const btc = coins.find(c => c.id === 'bitcoin') || coins[0]
  const eth = coins.find(c => c.id === 'ethereum') || coins[1]

  // Top gainer and loser (excluding stablecoins)
  const volatile = coins.filter(c => !['tether','usd-coin','dai','usdc','binance-usd'].includes(c.id))
  const sorted = [...volatile].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
  const topGainer = sorted[0]
  const topLoser  = sorted[sorted.length - 1]

  const fmt = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
  const pct = n => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

  return {
    score, label,
    btcPrice: fmt(btc?.current_price || 0),
    btcChange: pct(btc?.price_change_percentage_24h || 0),
    ethPrice: fmt(eth?.current_price || 0),
    ethChange: pct(eth?.price_change_percentage_24h || 0),
    topGainerName: topGainer?.symbol?.toUpperCase() || '',
    topGainerPct: pct(topGainer?.price_change_percentage_24h || 0),
    topLoserName: topLoser?.symbol?.toUpperCase() || '',
    topLoserPct: pct(topLoser?.price_change_percentage_24h || 0),
    upCount: upCoins.length,
    totalCount: coins.length,
  }
}

// ── Ask Claude for the post ──────────────────────────────────────────────────
async function generatePost(snap) {
  const prompt = `You are writing a daily market update post for @wallet_lens on X (Twitter).

Today's live market data:
- BTC: ${snap.btcPrice} (${snap.btcChange} 24h)
- ETH: ${snap.ethPrice} (${snap.ethChange} 24h)
- Fear & Greed Index: ${snap.score}/100 — ${snap.label}
- ${snap.upCount} of ${snap.totalCount} top coins are up today
- Top gainer: ${snap.topGainerName} ${snap.topGainerPct}
- Top loser: ${snap.topLoserName} ${snap.topLoserPct}

Product facts (only use these, never invent):
WalletLens (walletlens.live): free, private, no-account net-worth tracker. Tracks crypto, US stocks, gold, silver, cash in one live dashboard. On-device AI analysis. Shows live fear & greed index. Installable PWA.
Fear & Greed Index page: walletlens.live/fear-and-greed-index
Live market index: walletlens.live/market-index

Write ONE post (under 270 characters) that:
- References today's market conditions naturally (pick the most interesting data point)
- Mentions the fear & greed index score and what it signals
- Ends with a soft link to walletlens.live (or /fear-and-greed-index or /market-index)
- Sounds like a knowledgeable human, not a bot
- Uses at most 1-2 hashtags (#crypto or #Bitcoin if relevant)
- NEVER makes price predictions or return promises
- 0-2 emojis max

Return ONLY the post text.`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) fail(`Anthropic API ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return (j.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '')
}

// ── OAuth 1.0a for X ─────────────────────────────────────────────────────────
const enc = s => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
function oauthHeader(method, url) {
  const o = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  }
  const base = Object.keys(o).sort().map(k => `${enc(k)}=${enc(o[k])}`).join('&')
  const sigBase = `${method}&${enc(url)}&${enc(base)}`
  const key = `${enc(process.env.X_API_SECRET)}&${enc(process.env.X_ACCESS_SECRET)}`
  o.oauth_signature = crypto.createHmac('sha1', key).update(sigBase).digest('base64')
  return 'OAuth ' + Object.keys(o).sort().map(k => `${enc(k)}="${enc(o[k])}"`).join(', ')
}

async function postToX(text) {
  const url = 'https://api.twitter.com/2/tweets'
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: oauthHeader('POST', url) },
    body: JSON.stringify({ text }),
  })
  const body = await r.text()
  if (!r.ok) fail(`X API ${r.status}: ${body}`)
  return JSON.parse(body)
}

// ── Main ─────────────────────────────────────────────────────────────────────
note('## Daily Trending Post\n')

let snap
try {
  const coins = await fetchMarket()
  snap = buildSnapshot(coins)
  note(`**Market snapshot:** BTC ${snap.btcPrice} (${snap.btcChange}) · ETH ${snap.ethPrice} (${snap.ethChange}) · Fear & Greed: ${snap.score}/100 (${snap.label}) · ${snap.upCount}/${snap.totalCount} coins up`)
} catch (e) {
  fail(`Failed to fetch market data: ${e.message}`)
}

const text = await generatePost(snap)
if (!text || text.length > 280) fail(`Generated post invalid (len ${text?.length}): ${text}`)
note(`\n**Post (${text.length} chars):**\n\n${text}`)

const haveX = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'].every(k => process.env[k])

if (haveX) {
  const res = await postToX(text)
  note(`\n✅ Posted to X: id ${res.data?.id}`)
} else {
  writeFileSync(OUT, JSON.stringify({
    title: `[Trending] ${text.slice(0, 60)}…`,
    body: `**Fear & Greed: ${snap.score}/100 (${snap.label})** | BTC ${snap.btcPrice} ${snap.btcChange}\n\n${text}\n\n— auto-drafted by daily-trending (add X_API_* secrets to enable auto-posting).`,
  }))
  note('\nℹ️ No X API secrets — wrote promo/x-trending.json for review.')
}
