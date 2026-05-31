// WalletLens — weekly educational Twitter/X thread generator.
//
// Generates an 8-12 tweet educational thread on a personal finance topic that
// rotates each week. WalletLens is mentioned naturally in 1-2 tweets only.
// The ready-to-post thread is written to promo/thread.json for the GitHub
// Actions step that opens a review issue.
//
// Required secret: ANTHROPIC_API_KEY
//
// Run:  ANTHROPIC_API_KEY=sk-ant-... node promo/generate-thread.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const THREAD_FILE = resolve(__dirname, 'thread.json')
const MODEL = 'claude-sonnet-4-6'

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

// ── What we promote (never invent features) ─────────────────────────────────
const FEATURES = `WalletLens (walletlens.live) — free, private, browser-based net-worth & portfolio tracker. 100% local (no account/login/email, nothing leaves the browser). Tracks crypto, stocks/ETFs, precious metals, real estate and cash in one net-worth view. Live prices, average cost basis, P&L, allocation donut. Manual + voice + screenshot + CSV import. On-device AI analysis (health score, fear & greed, stress test, rebalance). Sell-target tracking. Backup via an export code. No exchange API keys required.`

// ── Weekly topic rotation (deterministic from ISO week number) ───────────────
const TOPICS = [
  'portfolio rebalancing',
  'cost basis tracking',
  'crypto tax mistakes',
  'net worth milestones',
  'diversification across asset classes',
  'privacy in fintech',
  'DCA strategies',
  'sell target planning',
  'fear & greed in investing',
  'how to read P&L correctly',
]

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

const now = new Date()
const weekNum = isoWeekNumber(now)
const topic = TOPICS[weekNum % TOPICS.length]
const today = now.toISOString().slice(0, 10)

note(`Week ${weekNum} → topic: "${topic}"`)

// ── Ask Claude to write the thread ──────────────────────────────────────────
const prompt = `You are writing a genuinely educational Twitter/X thread for a personal finance audience. The thread will be posted by someone who builds WalletLens, a free private portfolio tracker.

TOPIC: ${topic}

WALLETLENS PRODUCT FACTS (only mention features that are TRUE — do not invent):
${FEATURES}

THREAD REQUIREMENTS:
- 8 to 12 tweets total
- Tweets numbered: "1/", "2/", etc.
- Educational first — real, actionable tips a knowledgeable person would share
- Conversational, not corporate; avoid buzzwords and fluff
- WalletLens mentioned naturally in 1 or 2 tweets ONLY (not every tweet)
- The final tweet MUST include the URL walletlens.live and the text "(I'm on the team)"
- Every tweet MUST be 280 characters or fewer (count carefully — this is a hard limit)
- Maximum 2 hashtags in the entire thread combined
- No emoji spam; use emojis sparingly if at all
- No promotional language in the non-WalletLens tweets

Return STRICT JSON ONLY — no markdown fences, no explanatory text:
{"topic":"${topic}","tweets":["1/ ...","2/ ...","3/ ..."]}`

note('Calling Claude to generate thread...')

let data
try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) fail(`Claude API returned ${res.status}. ${(await res.text().catch(() => '')).slice(0, 400)}`)
  data = await res.json()
} catch (e) { fail(`Claude request failed: ${String(e)}`) }

const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
const m = text.match(/\{[\s\S]*\}/)
if (!m) fail(`No JSON found in Claude response. Got: ${text.slice(0, 600)}`)

let parsed
try { parsed = JSON.parse(m[0]) } catch (e) { fail(`Could not parse Claude JSON: ${e.message}`) }

const tweets = parsed.tweets
if (!Array.isArray(tweets) || tweets.length < 8) {
  fail(`Expected at least 8 tweets, got ${Array.isArray(tweets) ? tweets.length : 'non-array'}. Response: ${text.slice(0, 600)}`)
}

// Warn if any tweet exceeds 280 chars (don't hard-fail — a human will review)
tweets.forEach((t, i) => {
  if (t.length > 280) note(`⚠️  Tweet ${i + 1} is ${t.length} chars (over 280 — needs trimming before posting)`)
})

note(`Generated ${tweets.length} tweets for topic: "${parsed.topic}"`)

// ── Build the GitHub Issue ───────────────────────────────────────────────────
const title = `🧵 Weekly thread: ${parsed.topic} — ${today}`

let body = `Generated by the WalletLens thread generator on ${today}.\n`
body += `**Topic:** ${parsed.topic}\n`
body += `**Tweets:** ${tweets.length}\n\n`
body += `Review, edit freely, then post as a thread on X/Twitter.\n\n`
body += `---\n\n`
body += `\`\`\`\n`
tweets.forEach(t => { body += t + '\n\n' })
body = body.trimEnd() + '\n```\n\n'
body += `---\n\n`
body += `<sub>WalletLens thread generator · walletlens.live</sub>`

writeFileSync(THREAD_FILE, JSON.stringify({ title, body }), 'utf8')
note(`Wrote thread.json with ${tweets.length} tweets.`)
