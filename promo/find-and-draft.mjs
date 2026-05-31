// WalletLens promotion agent — DISCOVER + DRAFT only (never auto-posts).
//
// Searches Reddit for recent posts where someone is genuinely asking for a
// net-worth / portfolio / investment-tracking tool, asks Claude to judge
// relevance and draft a helpful, honest reply that mentions WalletLens as one
// option (with an affiliation disclosure), then hands the drafts to a human via
// a GitHub Issue for review + manual posting. This keeps us fully compliant
// with Reddit/X rules — the actual posting stays human and authentic, which is
// also what makes replies convert instead of getting spam-flagged.
//
// Secrets: ANTHROPIC_API_KEY (required). REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET
// (optional — enables authenticated search, which is more reliable from CI IPs).
//
// Run:  ANTHROPIC_API_KEY=sk-ant-... node promo/find-and-draft.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEEN_FILE = resolve(__dirname, 'seen.json')
const ISSUE_FILE = resolve(__dirname, 'issue.json')
const MODEL = 'claude-sonnet-4-6'
const UA = 'walletlens-promo/1.0 (net-worth tracker; +https://walletlens.live)'

// ── GitHub-visible diagnostics ──────────────────────────────────────────────
function note(msg) {
  console.log(msg)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) { try { writeFileSync(f, msg + '\n', { flag: 'a' }) } catch {} }
}
function fail(msg) {
  const one = msg.replace(/\r?\n/g, ' ').slice(0, 800)
  console.error(msg)
  console.log(`::error::${one}`)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) { try { writeFileSync(f, `\n**❌ ${one}**\n`, { flag: 'a' }) } catch {} }
  process.exit(1)
}

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) fail('ANTHROPIC_API_KEY is not set (add it as a repository secret).')

// ── What we look for ────────────────────────────────────────────────────────
// Broad search queries across all of Reddit; recency-limited to the last week.
const QUERIES = [
  'net worth tracker',
  'track my net worth',
  'portfolio tracker app',
  'investment tracking app',
  'track all my investments',
  'net worth app recommendation',
  'best app to track portfolio',
]
// Coarse keyword prefilter so we only spend tokens on plausible posts.
const KEYWORDS = [
  'net worth', 'networth', 'portfolio tracker', 'track my investments',
  'investment tracker', 'track net worth', 'track my portfolio', 'tracking app',
  'track investments', 'portfolio app', 'net worth app', 'tracking spreadsheet',
]
const MAX_CANDIDATES = 12   // cap Claude cost per run
const RECENCY_DAYS = 8

const sleep = ms => new Promise(r => setTimeout(r, ms))
let blockedCount = 0   // Reddit 401/403/429 responses (IP/auth blocks)

// ── Reddit access (OAuth if creds provided, else public .json) ──────────────
async function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID
  const secret = process.env.REDDIT_CLIENT_SECRET
  if (!id || !secret) return null
  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) return null
    const j = await res.json()
    return j.access_token || null
  } catch { return null }
}

async function searchReddit(query, token) {
  const base = token
    ? `https://oauth.reddit.com/search?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25&type=link`
    : `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25&type=link`
  const headers = { 'User-Agent': UA }
  if (token) headers['Authorization'] = `Bearer ${token}`
  try {
    const res = await fetch(base, { headers })
    if (!res.ok) {
      if ([401, 403, 429].includes(res.status)) blockedCount++
      note(`  · search "${query}" → HTTP ${res.status}`)
      return []
    }
    const j = await res.json()
    return (j?.data?.children || []).map(c => c.data).filter(Boolean)
  } catch (e) {
    note(`  · search "${query}" failed: ${String(e).slice(0, 120)}`)
    return []
  }
}

// ── Gather + de-dupe candidates ─────────────────────────────────────────────
let seen = []
try { seen = JSON.parse(readFileSync(SEEN_FILE, 'utf8')) } catch {}
const seenSet = new Set(Array.isArray(seen) ? seen : [])

const token = await redditToken()
note(`Reddit auth: ${token ? 'OAuth (creds present)' : 'public .json (no creds)'}`)

const cutoff = Date.now() / 1000 - RECENCY_DAYS * 86400
const byId = new Map()
for (const q of QUERIES) {
  const posts = await searchReddit(q, token)
  for (const p of posts) {
    if (!p.id || seenSet.has(p.id)) continue
    if ((p.created_utc || 0) < cutoff) continue
    const text = `${p.title || ''}\n${p.selftext || ''}`.toLowerCase()
    if (!KEYWORDS.some(k => text.includes(k))) continue
    if (!byId.has(p.id)) byId.set(p.id, p)
  }
  await sleep(1500) // be polite to Reddit
}

const candidates = [...byId.values()]
  .sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0))
  .slice(0, MAX_CANDIDATES)

note(`Found ${candidates.length} new candidate post(s) after filtering.`)

// Reddit blocks unauthenticated requests from cloud IPs (CI runners included).
// If we got blocked and have no OAuth creds, say so clearly — this is the #1
// reason the agent finds nothing.
if (blockedCount > 0 && !token) {
  fail('Reddit blocked the search (HTTP 403/429) and no OAuth creds are set. ' +
    'Create a free Reddit app at https://www.reddit.com/prefs/apps (type: "script"), ' +
    'then add repository secrets REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET. ' +
    'Authenticated requests are not IP-blocked.')
}

// Mark every candidate as seen so we never re-surface it, regardless of verdict.
const newSeen = Array.from(new Set([...seenSet, ...candidates.map(c => c.id)])).slice(-2000)
writeFileSync(SEEN_FILE, JSON.stringify(newSeen, null, 0) + '\n', 'utf8')

if (!candidates.length) {
  note('No new relevant posts this run. (X: scan the manual search links in the workflow summary.)')
  process.exit(0)
}

// ── Claude: judge relevance + draft replies ─────────────────────────────────
const FEATURES = `WalletLens (walletlens.live) — free, private, browser-based net-worth & portfolio tracker. 100% local (no account/login/email, nothing leaves the browser). Tracks crypto, stocks/ETFs, precious metals, real estate and cash in one net-worth view broken down by category. Live prices, average cost basis, P&L, allocation donut. Manual + voice + screenshot + CSV import. On-device AI analysis (health score, fear & greed, stress test, rebalance). Sell-target tracking. Backup via an export code. No exchange API keys required.`

const items = candidates.map((p, i) => {
  const body = (p.selftext || '').replace(/\s+/g, ' ').slice(0, 700)
  return `[${i + 1}] id=${p.id} r/${p.subreddit}
Title: ${(p.title || '').slice(0, 300)}
Body: ${body || '(no body text)'}`
}).join('\n\n')

const prompt = `You help promote WalletLens HONESTLY on Reddit by drafting replies a human will review and post manually. Be helpful first, never spammy.

PRODUCT:
${FEATURES}

Below are Reddit posts. For EACH, decide if the author is genuinely asking for (or would clearly welcome) a net-worth / portfolio / investment-tracking tool recommendation. Only those are "relevant".

For each relevant post, write a reply that:
- Answers/helps the person FIRST, like a real Redditor.
- Mentions WalletLens as ONE option (not the only one) where it genuinely fits; never oversell.
- Includes a short honest affiliation disclosure (e.g. "(disclosure: I'm on the team)").
- Is concise (<= 80 words), natural, specific to their question, and grounded ONLY in the real features above — never invent features.
- Is a SINGLE paragraph with NO line breaks.
If a post is NOT relevant (off-topic, not seeking a tool, already resolved, hostile, or a subreddit that bans self-promo like r/personalfinance recommendations), set relevant=false and reply="".

Return STRICT JSON ONLY, no markdown fences:
{"results":[{"id":"<id>","relevant":true,"reply":"<single-paragraph reply or empty>","reason":"<short why/why not>"}]}

POSTS:
${items}`

let data
try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) fail(`Claude API returned ${res.status}. ${(await res.text().catch(() => '')).slice(0, 400)}`)
  data = await res.json()
} catch (e) { fail(`Claude request failed: ${String(e)}`) }

const text = data.content?.[0]?.text || ''
const m = text.match(/\{[\s\S]*\}/)
if (!m) fail('No JSON in Claude response. First 400 chars: ' + text.slice(0, 400))
let parsed
try { parsed = JSON.parse(m[0]) } catch (e) { fail('Failed to parse Claude JSON: ' + e.message) }

const verdicts = new Map((parsed.results || []).map(r => [String(r.id), r]))
const drafts = candidates
  .map(p => ({ post: p, v: verdicts.get(String(p.id)) }))
  .filter(x => x.v && x.v.relevant && x.v.reply && x.v.reply.trim())

note(`Claude drafted ${drafts.length} reply/replies (of ${candidates.length} reviewed).`)

// ── Build the GitHub Issue (the human review surface) ───────────────────────
const xLinks = QUERIES.map(q =>
  `- [${q}](https://x.com/search?q=${encodeURIComponent(q)}&f=live)`
).join('\n')

if (!drafts.length) {
  note('Nothing worth posting this run — no issue created.')
  // Still surface the X manual-scan links for the human.
  note('\n### Manual X (Twitter) live searches to scan\n' + xLinks)
  process.exit(0)
}

const today = new Date().toISOString().slice(0, 10)
let body = `Drafted by the WalletLens promotion agent on ${today}. **Review each one and post manually** — nothing has been posted automatically. Edit freely before posting; skip any that don't feel right.\n\n`

drafts.forEach(({ post, v }, i) => {
  const url = `https://www.reddit.com${post.permalink}`
  body += `### ${i + 1}. r/${post.subreddit} — ${post.title}\n`
  body += `**Post:** ${url}\n\n`
  body += `**Suggested reply:**\n\n> ${v.reply.trim()}\n\n`
  body += `<sub>Why: ${(v.reason || '').slice(0, 200)}</sub>\n\n---\n\n`
})

body += `### Manual X (Twitter) live searches to scan\nX's API is paywalled, so scan these yourself and tell me a tweet to reply to and I'll draft it:\n${xLinks}\n`
body += `\n<sub>Reminder: lead with genuine help, keep the affiliation disclosure, and respect each subreddit's self-promotion rules.</sub>`

writeFileSync(ISSUE_FILE, JSON.stringify({
  title: `📣 WalletLens promo: ${drafts.length} reply draft(s) — ${today}`,
  body,
}), 'utf8')

note(`Wrote ${drafts.length} draft(s) to a GitHub Issue payload.`)
