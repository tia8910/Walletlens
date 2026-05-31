// WalletLens promotion agent — DISCOVER + DRAFT only (never auto-posts).
//
// Fetches Reddit public RSS feeds to find recent posts where someone
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

// ── Subreddits to monitor ────────────────────────────────────────────────────
const SUBREDDITS = [
  'CryptoCurrency',
  'BitcoinBeginners',
  'CryptoMarkets',
  'CryptoInvesting',
  'eupersonalfinance',
  'UKPersonalFinance',
  'AusFinance',
  'financialindependence',
  'ETFs',
  'Bogleheads',
  'portfolios',
  'stocks',
  'algotrading',
]

// ── Keywords to filter posts ─────────────────────────────────────────────────
const KEYWORDS = [
  'track', 'tracker', 'tracking', 'portfolio', 'net worth', 'networth',
  'investments', 'app', 'tool', 'spreadsheet', 'manage', 'monitor',
  'allocation', 'holdings', 'balance',
]

// ── RSS parser (no external deps) ───────────────────────────────────────────
function parseRSS(xml) {
  const items = []
  // Extract all <item>...</item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let itemMatch
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1]

    const title = extractField(block, 'title')
    const link = extractField(block, 'link')
    const description = extractField(block, 'description')

    if (!link) continue

    // Extract post ID from URL: /comments/XXXX/
    const idMatch = link.match(/\/comments\/([a-z0-9]+)\//i)
    const id = idMatch ? idMatch[1] : null

    items.push({ title, link, description, id })
  }
  return items
}

function extractField(block, field) {
  // Try CDATA form first: <field><![CDATA[...]]></field>
  const cdataRegex = new RegExp(`<${field}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${field}>`, 'i')
  const cdataMatch = block.match(cdataRegex)
  if (cdataMatch) return decodeEntities(cdataMatch[1].trim())

  // Plain text form: <field>...</field>
  const plainRegex = new RegExp(`<${field}[^>]*>([\\s\\S]*?)<\\/${field}>`, 'i')
  const plainMatch = block.match(plainRegex)
  if (plainMatch) return decodeEntities(plainMatch[1].trim())

  // Self-closing or link as text node (Reddit sometimes puts link after </title>)
  // For <link>, also try the pattern where it's a bare URL text node between tags
  if (field === 'link') {
    const linkTextRegex = /<link>(https?:\/\/[^\s<]+)<\/link>/i
    const ltMatch = block.match(linkTextRegex)
    if (ltMatch) return ltMatch[1].trim()
  }

  return ''
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

// ── Keyword filter ───────────────────────────────────────────────────────────
function matchesKeyword(text) {
  const lower = (text || '').toLowerCase()
  return KEYWORDS.some(kw => lower.includes(kw))
}

// ── Delay helper ─────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── De-dupe: skip post IDs we've already surfaced ───────────────────────────
let seen = []
try { seen = JSON.parse(readFileSync(SEEN_FILE, 'utf8')) } catch {}
const seenSet = new Set(Array.isArray(seen) ? seen : [])

// ── Fetch RSS feeds ──────────────────────────────────────────────────────────
note('Fetching Reddit RSS feeds...')

const candidates = []   // { id, url, subreddit, title, description }
const seenIds = new Set(seenSet)  // dedupe by post ID during collection

for (const sub of SUBREDDITS) {
  const url = `https://www.reddit.com/r/${sub}/new.rss?limit=25`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'WalletLens-PromoBot/1.0 (promotion agent; contact walletlens.live)',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      note(`  r/${sub}: HTTP ${res.status} — skipping`)
      await delay(1200)
      continue
    }

    const xml = await res.text()
    const items = parseRSS(xml)

    // Filter: keyword match, not already seen, within last 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    let subCount = 0

    for (const item of items) {
      if (!item.id) continue
      if (seenIds.has(item.id)) continue

      const text = (item.title || '') + ' ' + (item.description || '')
      if (!matchesKeyword(text)) continue

      // Stop once we have 20 candidates total
      if (candidates.length >= 20) break

      seenIds.add(item.id)
      candidates.push({
        id: item.id,
        url: item.link,
        subreddit: sub,
        title: (item.title || '').slice(0, 300),
        description: (item.description || '').slice(0, 800),
      })
      subCount++
    }

    note(`  r/${sub}: ${items.length} posts fetched, ${subCount} candidate(s) added`)
  } catch (e) {
    note(`  r/${sub}: fetch error (${String(e).slice(0, 120)}) — skipping`)
  }

  if (candidates.length >= 20) {
    note('  Reached 20-candidate limit — stopping early')
    break
  }

  await delay(1200)
}

note(`Total candidates: ${candidates.length}`)

if (candidates.length === 0) {
  note('No matching posts found this run — no issue created.')
  const xLinks = [
    'net worth tracker', 'portfolio tracker app', 'track my investments',
    'net worth app recommendation', 'best app to track portfolio',
  ].map(q => `- [${q}](https://x.com/search?q=${encodeURIComponent(q)}&f=live)`).join('\n')
  note('\n### Manual X (Twitter) live searches to scan\n' + xLinks)
  process.exit(0)
}

// ── Mark all candidate IDs as seen ──────────────────────────────────────────
const newSeen = Array.from(new Set([...seenSet, ...candidates.map(c => c.id)])).slice(-500)
writeFileSync(SEEN_FILE, JSON.stringify(newSeen, null, 0) + '\n', 'utf8')

// ── Ask Claude to judge relevance and draft replies ──────────────────────────
note('Sending candidates to Claude for relevance check and reply drafting...')

const postsBlock = candidates.map((c, i) =>
  `[${i + 1}] id=${c.id} sub=r/${c.subreddit}\nTitle: ${c.title}\nBody snippet: ${c.description}`
).join('\n\n')

const prompt = `You help promote WalletLens HONESTLY on Reddit by judging whether posts are relevant and drafting replies a human will review and post manually. Be helpful first, never spammy.

PRODUCT (all true — never invent features):
${FEATURES}

POSTS TO EVALUATE:
${postsBlock}

For each post, decide if WalletLens would be a genuinely helpful mention. Draft a reply for relevant ones.

A good reply:
- Adds genuine value to the discussion first
- Mentions WalletLens as ONE option where it fits naturally; never oversell
- Includes "(disclosure: I'm on the team)"
- Is ≤80 words, a single paragraph, no line breaks
- Based ONLY on the real features listed above

Mark relevant=false (and reply="") only for posts that are completely off-topic, from subreddits with strict no-promo rules (r/personalfinance, r/investing), or clearly hostile/locked.

Return STRICT JSON ONLY, no markdown fences, no explanatory text:
{"results":[{"id":"<reddit_post_id>","relevant":true,"reply":"single-paragraph reply or empty string","reason":"one line why included or skipped"}]}`

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
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) fail(`Claude API returned ${res.status}. ${(await res.text().catch(() => '')).slice(0, 400)}`)
  data = await res.json()
} catch (e) { fail(`Claude request failed: ${String(e)}`) }

const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
const m = text.match(/\{[\s\S]*\}/)
if (!m) {
  note('No JSON in Claude response — treating as empty result. Full response:')
  note('```\n' + text.slice(0, 1500) + '\n```')
  process.exit(0)
}

let parsed
try { parsed = JSON.parse(m[0]) } catch (e) {
  note('Could not parse Claude JSON — treating as empty result. Error: ' + e.message)
  process.exit(0)
}

// Merge Claude judgements back with original candidate metadata
const results = (parsed.results || [])
const drafts = results
  .filter(r => r.relevant && r.reply && r.reply.trim())
  .map(r => {
    const candidate = candidates.find(c => c.id === r.id)
    return {
      id: r.id,
      url: candidate ? candidate.url : `https://reddit.com/comments/${r.id}/`,
      subreddit: candidate ? candidate.subreddit : 'unknown',
      title: candidate ? candidate.title : '',
      reply: r.reply,
      reason: r.reason || '',
    }
  })

note(`Evaluated ${results.length} post(s), ${drafts.length} with drafted replies.`)

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
