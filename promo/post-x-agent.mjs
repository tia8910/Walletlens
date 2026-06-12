// WalletLens / $LENZ — daily X (Twitter) post agent.
//
// Claude writes one on-brand post (rotating theme, grounded in real product facts,
// never a price/returns claim). Then:
//   • If X API creds are set → posts it directly to @wallet_lens.
//   • Otherwise → writes promo/x-post.json so the workflow opens a review issue.
//
// Engagement (replies/follows) stays HUMAN on purpose — automating that risks an
// X suspension and reads as a bot. This agent only publishes original posts.
//
// Secrets: ANTHROPIC_API_KEY (required); for auto-post also
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (OAuth 1.0a user context).
//
// Run: ANTHROPIC_API_KEY=sk-ant-... node promo/post-x-agent.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, 'x-post.json')
const MODEL = 'claude-sonnet-4-6'

function note(m) { console.log(m); const f = process.env.GITHUB_STEP_SUMMARY; if (f) { try { writeFileSync(f, m + '\n', { flag: 'a' }) } catch {} } }
function fail(m) { console.error(m); console.log(`::error::${String(m).slice(0, 800)}`); process.exit(1) }

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) fail('ANTHROPIC_API_KEY is not set (add it as a repository secret).')

// Grounding — never invent features or make price/returns claims.
const FACTS = `WalletLens (walletlens.live): free, private, no-account net-worth & portfolio tracker. All data stays on the user's device (no server, no login). Tracks crypto, US stocks/ETFs, gold/silver/platinum, fiat & cash in one net-worth view with live prices, cost basis, P&L, on-device AI insights. Installable PWA.
$LENZ: the native token of WalletLens on Sui. 10,000,000 hard cap, mint frozen on-chain, NO team/insider allocation, fair flat airdrop, NO sale/IPO. Pages: /lenz (token) and /airdrop (free airdrop, no wallet connection to register). Official X: @wallet_lens.`

const THEMES = [
  'the privacy angle: portfolio data stays on your device, no account',
  'all-asset tracking in one place (crypto + stocks + metals + cash)',
  'introduce $LENZ: 10M hard cap, mint frozen, no insider bag',
  'the free $LENZ airdrop — no purchase, no wallet connection to register',
  'why Sui: fast, cheap, easy to buy & list',
  'a practical portfolio-tracking tip, then mention WalletLens naturally',
  'fair-launch values: no sale, no IPO, no founder allocation',
  'anti-scam reminder: we never ask you to connect a wallet to register',
  'WalletLens is free forever, no upsells, sustained simply',
  'a short engagement question about portfolio tracking pain points',
]
const theme = THEMES[Math.floor(Date.now() / 864e5) % THEMES.length]

async function callClaude() {
  const prompt = `Write ONE post for the X account @wallet_lens.
Theme for today: ${theme}.

Facts (only use these, never invent):
${FACTS}

Rules:
- ONE post, under 270 characters.
- Lead with the product/value, not hype. Human, confident, not salesy.
- You MAY include the link walletlens.live (or /lenz or /airdrop if relevant).
- At most 2 relevant hashtags (e.g. #Sui #crypto).
- NEVER promise price, gains, returns, or call $LENZ an investment.
- No emojis spam (0-2 max). No hashtag stuffing.
Return ONLY the post text, nothing else.`
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) fail(`Anthropic API ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return (j.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '')
}

// ── OAuth 1.0a (user context) for POST /2/tweets ────────────────────────────
const enc = (s) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
function oauthHeader(method, url) {
  const o = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  }
  const base = Object.keys(o).sort().map((k) => `${enc(k)}=${enc(o[k])}`).join('&')
  const sigBase = `${method}&${enc(url)}&${enc(base)}`
  const key = `${enc(process.env.X_API_SECRET)}&${enc(process.env.X_ACCESS_SECRET)}`
  o.oauth_signature = crypto.createHmac('sha1', key).update(sigBase).digest('base64')
  return 'OAuth ' + Object.keys(o).sort().map((k) => `${enc(k)}="${enc(o[k])}"`).join(', ')
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

const haveX = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'].every((k) => process.env[k])

const text = await callClaude()
if (!text || text.length > 280) fail(`Generated post invalid (len ${text?.length}): ${text}`)
note(`**Theme:** ${theme}\n\n**Post (${text.length} chars):**\n\n${text}`)

if (haveX) {
  const res = await postToX(text)
  note(`\n✅ Posted to X: id ${res.data?.id}`)
} else {
  // Draft mode → workflow opens a review issue from this file.
  writeFileSync(OUT, JSON.stringify({ title: `[X draft] ${text.slice(0, 60)}…`, body: text + '\n\n— auto-drafted by post-x-agent (add X_API_* secrets to auto-post).' }))
  note('\nℹ️ No X API secrets set — wrote promo/x-post.json for review (draft mode).')
}
