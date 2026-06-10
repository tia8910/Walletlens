// Dedicated $LENZ social agent — generates a branded card AND the post each run.
//
// Claude writes the post + the card's headline/subline (grounded, no price claims).
// Then renders an on-brand image (lenz-card.mjs) and either:
//   • posts the image + text to @wallet_lens (if X_API_* secrets are set), or
//   • saves the PNG + opens a GitHub issue draft (the workflow uploads the PNG).
//
// Only original posts — never auto-reply/follow (that risks an X ban). Engagement
// stays human.
//
// Secrets: ANTHROPIC_API_KEY (required); X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/
//   X_ACCESS_SECRET (optional → auto-post with image).
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import crypto from 'node:crypto'
import { renderCard } from './lenz-card.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODEL = 'claude-sonnet-4-6'
const note = (m) => { console.log(m); const f = process.env.GITHUB_STEP_SUMMARY; if (f) { try { writeFileSync(f, m + '\n', { flag: 'a' }) } catch {} } }
const fail = (m) => { console.error(m); console.log(`::error::${String(m).slice(0, 800)}`); process.exit(1) }

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) fail('ANTHROPIC_API_KEY is not set.')

const FACTS = `WalletLens (walletlens.live): free, private, no-account net-worth & portfolio tracker; all data stays on the user's device. Tracks crypto, US stocks/ETFs, gold/silver, fiat & cash.
$LENZ: native token on Sui. Fixed 10,000,000 supply, mint frozen, 0% insider/team, no sale/IPO. Use-&-earn: earn $LENZ by using and sharing the app; hold for ad-free + pro perks. Pages: /lenz and /airdrop (join the waitlist, no wallet connection). Official X: @wallet_lens. Coming soon (pre-launch).`

const HEADLINES = ['COMING SOON', 'USE & EARN', 'FAIR LAUNCH', 'EARN BY USING', 'JOIN THE WAITLIST', 'BUILT ON SUI', 'FREE TO EARN']
const headlineHint = HEADLINES[Math.floor(Date.now() / 864e5) % HEADLINES.length]

async function callClaude() {
  const prompt = `Create one social media update for @wallet_lens about $LENZ.
Use ONLY these facts (never invent, never promise price/returns):
${FACTS}

Return STRICT JSON with three fields and nothing else:
{
  "post": "the tweet text, under 260 chars, human and confident, lead with value not hype, may include walletlens.live/airdrop, 0-2 hashtags (#Sui), NEVER a price/returns claim",
  "headline": "a punchy 1-3 word card headline (e.g. ${headlineHint})",
  "subline": "one short line under ~60 chars for the card, e.g. 'Use & earn $LENZ — free, fair, on Sui.'"
}`
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) fail(`Anthropic ${r.status}: ${await r.text()}`)
  const j = await r.json()
  const text = (j.content?.[0]?.text || '').trim()
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) fail('Claude did not return JSON: ' + text)
  return JSON.parse(m[0])
}

// ── OAuth 1.0a ───────────────────────────────────────────────────────────────
const enc = (s) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
function oauthHeader(method, url) {
  const o = {
    oauth_consumer_key: process.env.X_API_KEY, oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_version: '1.0',
  }
  const base = Object.keys(o).sort().map((k) => `${enc(k)}=${enc(o[k])}`).join('&')
  const sigBase = `${method}&${enc(url)}&${enc(base)}`
  const key = `${enc(process.env.X_API_SECRET)}&${enc(process.env.X_ACCESS_SECRET)}`
  o.oauth_signature = crypto.createHmac('sha1', key).update(sigBase).digest('base64')
  return 'OAuth ' + Object.keys(o).sort().map((k) => `${enc(k)}="${enc(o[k])}"`).join(', ')
}
async function uploadMedia(png) {
  const url = 'https://upload.twitter.com/1.1/media/upload.json'
  const fd = new FormData()
  fd.append('media', new Blob([png], { type: 'image/png' }), 'lenz.png')
  const r = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url) }, body: fd })
  const t = await r.text(); if (!r.ok) fail(`media upload ${r.status}: ${t}`)
  return JSON.parse(t).media_id_string
}
async function tweet(text, mediaId) {
  const url = 'https://api.twitter.com/2/tweets'
  const body = mediaId ? { text, media: { media_ids: [mediaId] } } : { text }
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: oauthHeader('POST', url) }, body: JSON.stringify(body) })
  const t = await r.text(); if (!r.ok) fail(`tweet ${r.status}: ${t}`)
  return JSON.parse(t)
}

const haveX = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'].every((k) => process.env[k])

const { post, headline, subline } = await callClaude()
if (!post || post.length > 280) fail(`post invalid (len ${post?.length}): ${post}`)
const { png } = renderCard({ headline, subline })
note(`**Headline:** ${headline}\n**Subline:** ${subline}\n\n**Post (${post.length}):**\n\n${post}\n\n(image: ${png.length} bytes)`)

// Always save the rendered card.
const outDir = resolve(__dirname, 'lenz-drafts')
mkdirSync(outDir, { recursive: true })
const imgPath = resolve(outDir, `card-${new Date().toISOString().slice(0, 10)}.png`)
writeFileSync(imgPath, png)

if (haveX) {
  const mediaId = await uploadMedia(png)
  const res = await tweet(post, mediaId)
  note(`\n✅ Posted to X with image: id ${res.data?.id}`)
} else {
  writeFileSync(resolve(__dirname, 'x-post.json'), JSON.stringify({
    title: `[X draft] ${post.slice(0, 60)}…`,
    body: `${post}\n\n— auto-drafted by lenz-social-agent. The rendered card is attached as a workflow artifact (lenz-card). Add X_API_* secrets to auto-post with the image.`,
  }))
  note('\nℹ️ No X API secrets — saved card to promo/lenz-drafts/ and wrote x-post.json (draft mode).')
}
