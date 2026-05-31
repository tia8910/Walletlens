// WalletLens promotion agent — DISCOVER + DRAFT only (never auto-posts).
//
// Uses Claude with built-in web search to find recent Reddit posts where someone
// is genuinely asking for a net-worth / portfolio / investment-tracking tool,
// then drafts honest, helpful replies for a human to review and post MANUALLY.
// Drafts are delivered as a GitHub Issue. No Reddit credentials needed.
//
// Required secret: ANTHROPIC_API_KEY
//
// Run:  ANTHROPIC_API_KEY=sk-ant-... node promo/find-and-draft.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEEN_FILE = resolve(__dirname, 'seen.json')
const ISSUE_FILE = resolve(__dirname, 'issue.json')
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

// ── What we promote ─────────────────────────────────────────────────────────
const FEATURES = `WalletLens (walletlens.live) — free, private, browser-based net-worth & portfolio tracker. 100% local (no account/login/email, nothing leaves the browser). Tracks crypto, stocks/ETFs, precious metals, real estate and cash in one net-worth view broken down by category. Live prices, average cost basis, P&L, allocation donut. Manual + voice + screenshot + CSV import. On-device AI analysis (health score, fear & greed, stress test, rebalance). Sell-target tracking. Backup via an export code. No exchange API keys required.`

// ── De-dupe: skip URLs we've already surfaced ───────────────────────────────
let seen = []
try { seen = JSON.parse(readFileSync(SEEN_FILE, 'utf8')) } catch {}
const seenSet = new Set(Array.isArray(seen) ? seen : [])

const seenBlock = seenSet.size
  ? `\nSkip posts whose URL matches any of these already-seen URLs:\n${[...seenSet].slice(-50).map(u => `- ${u}`).join('\n')}`
  : ''

// ── Ask Claude to search Reddit and draft replies ───────────────────────────
note('Searching Reddit via Claude built-in web search...')

const prompt = `You help promote WalletLens HONESTLY on Reddit by finding relevant posts and drafting replies a human will review and post manually. Be helpful first, never spammy.

PRODUCT (all true — never invent features):
${FEATURES}

YOUR TASK:
1. Use web_search to find Reddit threads about portfolio tracking, net worth, or investment management. Cast a wide net — include threads where people are asking for tools, discussing tools, comparing apps, or sharing how they track their finances. Any thread where a helpful reply mentioning WalletLens would fit naturally. Posts from the last year are fine. Run ALL of these searches:
   - reddit portfolio tracker app
   - reddit net worth tracker
   - reddit track investments app
   - reddit crypto portfolio tracker
   - reddit how to track net worth
   - reddit investment tracking spreadsheet app
   - reddit personal finance tracker app

2. For EACH Reddit thread you find, include it in the JSON and draft a reply if WalletLens fits. The bar is LOW — if there's any chance a reply could help someone in the thread, include it. The human will review and skip anything that doesn't feel right.

   A good reply:
   - Adds genuine value to the discussion first
   - Mentions WalletLens as ONE option where it fits naturally; never oversell
   - Includes "(disclosure: I'm on the team)"
   - Is ≤80 words, a single paragraph, no line breaks
   - Based ONLY on the real features above

3. Only mark relevant=false (and reply="") for threads that are: completely off-topic, from r/personalfinance or r/investing (strict no-promo rules), or hostile/locked.${seenBlock}

AIM FOR AT LEAST 5 posts with drafted replies. The human review step will discard anything not suitable.

IMPORTANT: Always respond with JSON. Return {"posts":[]} only if you truly found nothing at all.
Return STRICT JSON ONLY, no markdown fences, no explanatory text:
{"posts":[{"url":"https://reddit.com/r/...","subreddit":"subreddit_name","title":"post title","relevant":true,"reply":"single-paragraph reply or empty","reason":"one line why included or skipped"}]}`

let data
try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) fail(`Claude API returned ${res.status}. ${(await res.text().catch(() => '')).slice(0, 400)}`)
  data = await res.json()
} catch (e) { fail(`Claude request failed: ${String(e)}`) }

// Count how many web searches Claude actually performed (visibility into search)
const searchCount = (data.content || []).filter(b => b.type === 'server_tool_use').length
note(`Claude ran ${searchCount} web search(es).`)

// Response may contain tool_use blocks followed by a text block. Concatenate
// all text blocks in case the JSON is split across them.
const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
const m = text.match(/\{[\s\S]*\}/)
if (!m) {
  // Claude couldn't find posts or returned plain text — treat as empty result
  note('No JSON in Claude response (no posts found this run). Full response below:')
  note('```\n' + text.slice(0, 1500) + '\n```')
  process.exit(0)
}

let parsed
try { parsed = JSON.parse(m[0]) } catch (e) {
  note('Could not parse Claude JSON — treating as empty result. Error: ' + e.message)
  process.exit(0)
}

const allPosts = (parsed.posts || []).filter(p => p.url && p.url.startsWith('http'))
const drafts = allPosts.filter(p => p.relevant && p.reply && p.reply.trim())

note(`Found ${allPosts.length} post(s) total, ${drafts.length} with drafted replies.`)

// Mark all found posts as seen so we never re-surface them
const newSeen = Array.from(new Set([...seenSet, ...allPosts.map(p => p.url)])).slice(-500)
writeFileSync(SEEN_FILE, JSON.stringify(newSeen, null, 0) + '\n', 'utf8')

if (!drafts.length) {
  note('Nothing worth posting this run — no issue created.')
  const xLinks = [
    'net worth tracker', 'portfolio tracker app', 'track my investments',
    'net worth app recommendation', 'best app to track portfolio',
  ].map(q => `- [${q}](https://x.com/search?q=${encodeURIComponent(q)}&f=live)`).join('\n')
  note('\n### Manual X (Twitter) live searches to scan\n' + xLinks)
  process.exit(0)
}

// ── Build the GitHub Issue ──────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
let body = `Drafted by the WalletLens promotion agent on ${today}. **Review each one and post manually** — nothing has been posted automatically. Edit freely before posting; skip any that don't feel right.\n\n`

drafts.forEach(({ url, subreddit, title, reply, reason }, i) => {
  body += `### ${i + 1}. r/${subreddit} — ${(title || '').slice(0, 120)}\n`
  body += `**Post:** ${url}\n\n`
  body += `**Suggested reply:**\n\n> ${reply.trim()}\n\n`
  if (reason) body += `<sub>Why: ${reason.slice(0, 200)}</sub>\n\n`
  body += `---\n\n`
})

const xLinks = [
  'net worth tracker', 'portfolio tracker app', 'track my investments',
  'net worth app recommendation', 'best app to track portfolio',
].map(q => `- [${q}](https://x.com/search?q=${encodeURIComponent(q)}&f=live)`).join('\n')

body += `### Manual X (Twitter) live searches to scan\nX's API is paywalled, so scan these yourself and paste any tweet to get a drafted reply:\n${xLinks}\n`
body += `\n<sub>Reminder: lead with genuine help, keep the affiliation disclosure, and respect each subreddit's self-promotion rules.</sub>`

writeFileSync(ISSUE_FILE, JSON.stringify({
  title: `📣 WalletLens promo: ${drafts.length} reply draft(s) — ${today}`,
  body,
}), 'utf8')

note(`Wrote ${drafts.length} draft(s) to a GitHub Issue payload.`)
