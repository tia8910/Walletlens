// Daily all-markets recap generator.
//
// Pulls a live cross-market snapshot — crypto (CoinGecko), precious metals and
// US stock indices (Stooq) — computes a quick crypto fear/greed read, then asks
// Claude to write ONE dated, data-grounded recap article. The post is prepended
// to src/data/dailyRecaps.js (newest first, capped) which blogPosts.js merges
// into POSTS, so the deploy workflow's prerender turns it into crawlable static
// HTML and refreshes the sitemap / RSS / llms.txt automatically.
//
// The Anthropic key is read from ANTHROPIC_API_KEY (a GitHub Actions secret) —
// it is NEVER committed to the repo or shipped to the browser.
//
// Run:  ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-daily-recap.mjs

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECAPS_FILE = resolve(__dirname, '../src/data/dailyRecaps.js')
const MODEL = 'claude-sonnet-4-6'
const MAX_RECAPS = 30 // keep the feed bounded — newest 30 daily recaps

function note(msg) {
  console.log(msg)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) { try { appendFileSync(f, msg + '\n') } catch {} }
}
function fail(msg) {
  const oneLine = String(msg).replace(/\r?\n/g, ' ').slice(0, 800)
  console.error(msg)
  console.log(`::error::${oneLine}`)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) { try { appendFileSync(f, `\n**❌ ${oneLine}**\n`) } catch {} }
  process.exit(1)
}

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) fail('ANTHROPIC_API_KEY is not set. Add it as a repository secret (Settings → Secrets and variables → Actions).')

// ── Formatting helpers ───────────────────────────────────────────────────────
const fmtUsd = n => {
  if (n == null || isNaN(n)) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (abs >= 1)    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + n.toFixed(4)
}
const fmtPct = n => (n == null || isNaN(n)) ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

// ── Crypto via CoinGecko ─────────────────────────────────────────────────────
async function fetchCrypto() {
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h'
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`)
  return r.json()
}

// ── Stooq (CORS-free CSV) for metals + US indices ────────────────────────────
// Returns { symbol(lowercase): { close, change } }. change = (close-open)/open.
async function fetchStooq(symbols) {
  const s = symbols.join(',')
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlc&h&e=csv`
  const r = await fetch(url, { headers: { Accept: 'text/csv' } })
  if (!r.ok) throw new Error(`Stooq ${r.status}`)
  const csv = await r.text()
  const lines = csv.trim().split('\n')
  const headers = lines[0].split(',')
  const out = {}
  for (const line of lines.slice(1)) {
    const vals = line.split(',')
    const row = {}
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim() })
    const sym = (row.Symbol || '').toLowerCase()
    const close = parseFloat(row.Close)
    const open = parseFloat(row.Open)
    if (!sym || !isFinite(close) || close <= 0) continue
    const change = isFinite(open) && open > 0 ? ((close - open) / open) * 100 : null
    out[sym] = { close, change }
  }
  return out
}

// ── Build the cross-market snapshot ──────────────────────────────────────────
function cryptoFearGreed(coins) {
  const up = coins.filter(c => (c.price_change_percentage_24h || 0) > 0)
  const breadth = (up.length / coins.length) * 100
  const avgMove = coins.slice(0, 10).reduce((s, c) => s + (c.price_change_percentage_24h || 0), 0) / 10
  const normMomentum = Math.min(100, Math.max(0, 50 + avgMove * 5))
  const score = Math.round(breadth * 0.6 + normMomentum * 0.4)
  const label = score >= 75 ? 'Extreme Greed' : score >= 55 ? 'Greed' : score >= 45 ? 'Neutral' : score >= 25 ? 'Fear' : 'Extreme Fear'
  return { score, label, breadthUp: up.length, breadthTotal: coins.length }
}

async function buildSnapshot() {
  const [coins, stooq] = await Promise.all([
    fetchCrypto(),
    fetchStooq(['^spx', '^ndq', '^dji', 'xauusd', 'xagusd']),
  ])

  const fg = cryptoFearGreed(coins)
  const btc = coins.find(c => c.id === 'bitcoin') || coins[0]
  const eth = coins.find(c => c.id === 'ethereum') || coins[1]

  const volatile = coins.filter(c => !['tether', 'usd-coin', 'dai', 'first-digital-usd', 'binance-usd'].includes(c.id))
  const sorted = [...volatile].sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
  const gainer = sorted[0], loser = sorted[sorted.length - 1]

  const idx = (sym, name) => {
    const d = stooq[sym]
    return d ? { name, price: fmtUsd(d.close), change: fmtPct(d.change), raw: d.change } : null
  }

  return {
    crypto: {
      fearGreed: fg,
      btc: { price: fmtUsd(btc?.current_price), change: fmtPct(btc?.price_change_percentage_24h) },
      eth: { price: fmtUsd(eth?.current_price), change: fmtPct(eth?.price_change_percentage_24h) },
      gainer: gainer ? { name: gainer.symbol?.toUpperCase(), change: fmtPct(gainer.price_change_percentage_24h) } : null,
      loser: loser ? { name: loser.symbol?.toUpperCase(), change: fmtPct(loser.price_change_percentage_24h) } : null,
    },
    stocks: [idx('^spx', 'S&P 500'), idx('^ndq', 'Nasdaq Composite'), idx('^dji', 'Dow Jones')].filter(Boolean),
    metals: [idx('xauusd', 'Gold (oz)'), idx('xagusd', 'Silver (oz)')].filter(Boolean),
  }
}

// ── Ask Claude to write the recap ────────────────────────────────────────────
function snapshotText(s) {
  const lines = []
  lines.push(`Crypto Fear & Greed: ${s.crypto.fearGreed.score}/100 (${s.crypto.fearGreed.label}); ${s.crypto.fearGreed.breadthUp} of ${s.crypto.fearGreed.breadthTotal} top coins up`)
  lines.push(`Bitcoin: ${s.crypto.btc.price} (${s.crypto.btc.change} 24h)`)
  lines.push(`Ethereum: ${s.crypto.eth.price} (${s.crypto.eth.change} 24h)`)
  if (s.crypto.gainer) lines.push(`Top crypto gainer: ${s.crypto.gainer.name} ${s.crypto.gainer.change}`)
  if (s.crypto.loser)  lines.push(`Top crypto loser: ${s.crypto.loser.name} ${s.crypto.loser.change}`)
  for (const m of s.stocks) lines.push(`${m.name}: ${m.price} (${m.change})`)
  for (const m of s.metals) lines.push(`${m.name}: ${m.price} (${m.change})`)
  return lines.join('\n')
}

async function generatePost(snap, dateStr, year) {
  const system = `You are the senior markets writer for WalletLens (walletlens.live), a free, private, browser-based portfolio tracker for crypto, stocks, precious metals, real estate and cash — all in one net-worth view, no account, all data on-device. You write concise, accurate daily market recaps. Educational, never financial advice. Never invent numbers — use ONLY the data provided. Never promise or predict prices.`

  const prompt = `Write today's all-markets daily recap for ${dateStr}.

Today's live snapshot (use these exact numbers — do not invent others):
${snapshotText(snap)}

Write a tight, scannable recap (450-650 words) covering crypto, US stocks and precious metals together, so a reader sees the whole picture in one place. Requirements:
- Open with 1-2 plain paragraphs summarising the day's cross-market mood (NO H1 — the title is rendered separately).
- Use ## H2 sections. Suggested: "Crypto", "Stocks", "Precious Metals", then a short "What It Means" wrap-up.
- Include a Markdown table summarising the key moves (asset, level/price, 24h change).
- Reference the crypto Fear & Greed reading and what that sentiment band signals (no prediction).
- Mention WalletLens naturally ONCE or TWICE where it genuinely helps (e.g. tracking crypto + stocks + metals in one net-worth view), and link [walletlens.live](https://walletlens.live) once and the [Fear & Greed Index](/fear-and-greed-index) once.
- End with a one-line educational-not-advice note.
- Use the year ${year} where natural.

Return EXACTLY this plain-text format. Begin your reply immediately with "TITLE:" — output nothing before it, no preamble, no code fences:

TITLE: <specific, <=70 chars, includes the date, e.g. "Markets Today — ${dateStr}: ...">
SLUG: market-recap-${snap._slugDate}
SUMMARY: <1-2 sentence meta description, 120-160 chars, mentions crypto, stocks and metals>
READTIME: <N min read>
BODY:
<the full recap body in Markdown>`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!resp.ok) fail(`Claude API ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 400)}`)
  const data = await resp.json()
  let out = data.content?.[0]?.text || ''
  const tStart = out.indexOf('TITLE:')
  if (tStart === -1) fail('Response has no TITLE: header. First 400 chars: ' + out.slice(0, 400))
  out = out.slice(tStart)

  const bodyIdx = out.indexOf('\nBODY:')
  if (bodyIdx === -1) fail('Response missing BODY: marker. First 400 chars: ' + out.slice(0, 400))
  const headerText = out.slice(0, bodyIdx)
  let content = out.slice(bodyIdx + '\nBODY:'.length).replace(/^\r?\n/, '')
  const field = name => {
    const m = headerText.match(new RegExp('^' + name + ':\\s*(.+)$', 'mi'))
    return m ? m[1].trim() : ''
  }
  content = content.replace(/^```[a-z]*\s*\n/i, '').replace(/\n?```\s*$/i, '').trim()
  return { title: field('TITLE'), summary: field('SUMMARY'), readTime: field('READTIME') || '4 min read', content }
}

// ── Read / write the recaps file (JSON-safe array literal) ────────────────────
function readRecaps() {
  const raw = readFileSync(RECAPS_FILE, 'utf8')
  const m = raw.match(/export const DAILY_RECAPS\s*=\s*(\[[\s\S]*\])\s*;?\s*$/)
  if (!m) fail('Could not parse DAILY_RECAPS array in dailyRecaps.js.')
  try { return JSON.parse(m[1]) } catch (e) { fail('DAILY_RECAPS is not valid JSON: ' + e.message) }
}
function writeRecaps(arr) {
  const header = `// AUTO-GENERATED — do not edit by hand.
//
// Daily all-markets recap posts written by scripts/generate-daily-recap.mjs
// (run by .github/workflows/daily-recap.yml). Each entry has the same shape as
// the hand-written articles in blogPosts.js and is merged into POSTS there, so
// the blog pages, prerender, sitemap, RSS feed and llms.txt all pick them up
// automatically. The generator keeps only the most recent entries (newest
// first) to stay bounded.
export const DAILY_RECAPS = `
  writeFileSync(RECAPS_FILE, header + JSON.stringify(arr, null, 2) + '\n', 'utf8')
}

// ── Main ─────────────────────────────────────────────────────────────────────
const now = new Date()
const slugDate = now.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
const dateStr = now.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const slug = `market-recap-${slugDate}`

const existing = readRecaps()
if (existing.some(p => p.slug === slug)) {
  note(`Recap for ${slugDate} already exists — nothing to do.`)
  process.exit(0)
}

note('## Daily Market Recap\n')
let snap
try {
  snap = await buildSnapshot()
  snap._slugDate = slugDate
} catch (e) {
  fail(`Failed to fetch market data: ${e.message}`)
}
note('**Snapshot:**\n\n```\n' + snapshotText(snap) + '\n```\n')

const post = await generatePost(snap, dateStr, now.getUTCFullYear())
if (!post.title || !post.content || post.content.length < 400) {
  fail(`Generated recap too short. title=${!!post.title} contentLen=${post.content.length}`)
}

const recap = {
  slug,
  title: post.title,
  date: dateStr,
  readTime: post.readTime,
  summary: post.summary,
  content: '\n' + post.content + '\n',
}

// Newest first, capped.
const updated = [recap, ...existing].slice(0, MAX_RECAPS)
writeRecaps(updated)
note(`✓ Added recap: "${post.title}" (slug: ${slug}, ${post.content.split(/\s+/).length} words). Feed now holds ${updated.length} recaps.`)
