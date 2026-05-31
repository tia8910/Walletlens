// Automated SEO blog-post generator.
//
// Calls Claude to write ONE fresh, original long-form article targeting an
// untapped long-form/long-tail keyword in WalletLens's niche (crypto / stocks /
// metals / net-worth portfolio tracking, privacy, DCA, profit targets, etc.),
// then inserts it into src/data/blogPosts.js. The deploy workflow's prerender
// step turns it into crawlable static HTML and refreshes the sitemap.
//
// The Anthropic key is read from the ANTHROPIC_API_KEY env var (a GitHub
// Actions secret) — it is NEVER committed to the repo or shipped to the browser.
//
// Run:  ANTHROPIC_API_KEY=sk-... node scripts/generate-blog-post.mjs

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTS_FILE = resolve(__dirname, '../src/data/blogPosts.js')
const MODEL = 'claude-sonnet-4-6'

// Surface diagnostics where they're actually visible: a GitHub "::error::"
// annotation (shows in the run's Annotations panel) + the step summary, not
// just buried in the step log.
function note(msg) {
  console.log(msg)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) { try { appendFileSync(f, msg + '\n') } catch {} }
}
function fail(msg) {
  const oneLine = msg.replace(/\r?\n/g, ' ').slice(0, 800)
  console.error(msg)
  console.log(`::error::${oneLine}`)
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) { try { appendFileSync(f, `\n**❌ ${oneLine}**\n`) } catch {} }
  process.exit(1)
}

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  fail('ANTHROPIC_API_KEY is not set. Add it as a repository secret: Settings → Secrets and variables → Actions → New repository secret, named exactly ANTHROPIC_API_KEY.')
}
// Safe key diagnostic — never prints the key itself, only its shape.
note(`Key present: yes · length ${apiKey.length} · prefix "${apiKey.slice(0, 7)}…"`)
if (!/^sk-ant-/.test(apiKey)) {
  note('⚠ Key does not start with "sk-ant-" — it may be the wrong value (Anthropic keys start with sk-ant-).')
}

const raw = readFileSync(POSTS_FILE, 'utf8')

// Pull existing slugs + titles so Claude doesn't repeat a topic.
const existingSlugs = [...raw.matchAll(/slug:\s*'([^']+)'/g)].map(m => m[1])
const existingTitles = [...raw.matchAll(/title:\s*'([^']*(?:\\'[^']*)*)'/g)].map(m => m[1].replace(/\\'/g, "'"))

if (!existingTitles.length) {
  console.error('Could not parse existing posts — aborting to avoid corrupting the file.')
  process.exit(1)
}

const now = new Date()
const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
const year = now.getFullYear()

const system = `You are the senior content writer for WalletLens (walletlens.live), a free, private, browser-based portfolio tracker for crypto, stocks, precious metals, real estate and cash. Key facts about the product, all true — ground the article in them and never invent features:
- 100% local-first: all data lives in the browser, no account, no login, no email, nothing sent to a server.
- Tracks 10,000+ crypto assets plus stocks, ETFs, gold/silver/platinum, real estate and cash in one net-worth view, broken down by category.
- Manual + voice + screenshot + Excel/CSV import of trades. Voice: say "I bought 0.5 ETH at 3200".
- Live prices, average cost basis, unrealized P&L, allocation donut by category.
- AI analysis (health score, fear & greed gauge, stress test, entry quality, rebalance planner) computed on-device.
- Sell Targets: up to 5 price targets per asset with progress bars and projected proceeds.
- Whale-transaction tracking and a crypto news ticker.
- Backup/restore via a compact WLZ export code (no cloud).
You write accurate, genuinely useful, non-spammy long-form articles (900-1300 words) optimised for SEO and AEO. Educational first; WalletLens is mentioned naturally where relevant, not forced into every paragraph. No financial advice — add an educational-not-advice note where touching tax or strategy.`

const prompt = `Write ONE new blog article for ${monthYear}.

We ALREADY have these articles — pick a genuinely DIFFERENT topic with strong search intent that none of these cover:
${existingTitles.map(t => `- ${t}`).join('\n')}

Target a specific long-tail keyword a real person would search (e.g. "how to track net worth in multiple currencies", "crypto portfolio rebalancing strategy", "best way to track gold and silver investments", "is it safe to connect exchange API to a tracker", "how to read a portfolio allocation chart"). Be original and specific — not a rehash of an existing title.

Return the result in EXACTLY this plain-text format — four header lines, then a BODY: line, then the full Markdown article. Your reply MUST begin immediately with "TITLE:" — output nothing before it (no preamble, no commentary, no code fences):

TITLE: <compelling, specific, <=70 chars, title case>
SLUG: <url-safe-kebab-case, lowercase, derived from the topic, must be unique>
SUMMARY: <1-2 sentence meta description, 120-160 chars, search-friendly>
READTIME: <N min read>
BODY:
<the full article body in Markdown, spanning as many lines as needed>

Content rules:
- 900-1300 words. Start with 1-2 plain paragraphs (NO H1 — the title is rendered separately).
- Use ## H2 section headings, **bold** for emphasis, bullet/numbered lists, and Markdown tables where they genuinely help.
- Mention WalletLens naturally 2-4 times where it actually solves the problem; link as [walletlens.live](https://walletlens.live) once.
- End with a "## Conclusion" section.
- IMPORTANT — the content is stored inside a JavaScript template literal, so it MUST NOT contain any backtick characters or the sequence "\${". Use plain quotes and write currency as "$3,200" (the dollar sign is fine; just never "$" immediately followed by "{").
- Use the year ${year} where a year is natural.`

console.log(`Generating a new blog post for ${monthYear}...`)
console.log(`(${existingSlugs.length} existing posts)`)

const resp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 4000,
    system,
    // No assistant prefill: this model rejects it ("must end with a user
    // message"). The prompt already instructs the model to begin its reply
    // with "TITLE:"; we tolerate any stray preamble when parsing below.
    messages: [
      { role: 'user', content: prompt },
    ],
  }),
})

if (!resp.ok) {
  const body = await resp.text().catch(() => '')
  fail(`Claude API returned ${resp.status} ${resp.statusText}. ${body.slice(0, 400)}`)
}

const data = await resp.json()
let raw_out = (data.content?.[0]?.text || '')
// Drop any preamble the model emitted before the first "TITLE:" header.
const tStart = raw_out.indexOf('TITLE:')
if (tStart === -1) {
  fail('Response has no TITLE: header. First 400 chars: ' + raw_out.slice(0, 400))
}
raw_out = raw_out.slice(tStart)

// Parse the newline-safe sentinel format (avoids JSON-in-string newline bugs
// that long Markdown bodies trigger). Headers first, everything after "BODY:"
// is the article.
const bodyIdx = raw_out.indexOf('\nBODY:')
if (bodyIdx === -1) {
  fail('Response missing BODY: marker. First 400 chars: ' + raw_out.slice(0, 400))
}
const headerText = raw_out.slice(0, bodyIdx)
let content = raw_out.slice(bodyIdx + '\nBODY:'.length).replace(/^\r?\n/, '')
const field = name => {
  const m = headerText.match(new RegExp('^' + name + ':\\s*(.+)$', 'mi'))
  return m ? m[1].trim() : ''
}

// ── Validate + sanitise ────────────────────────────────────────────────────
const slugify = s => (s || '').toString().toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

let title    = field('TITLE')
let slug     = field('SLUG')
let summary  = field('SUMMARY')
let readTime = field('READTIME')
slug = slugify(slug || title)

if (!title || !slug || !summary || !content || content.length < 500) {
  fail(`Generated post missing fields or too short. title=${!!title} slug=${!!slug} summary=${!!summary} contentLen=${content.length}`)
}

if (existingSlugs.includes(slug)) {
  console.log(`Slug "${slug}" already exists — skipping to avoid a duplicate.`)
  process.exit(0)
}

// Strip any stray Markdown code fences the model may have wrapped the body in.
content = content.replace(/^```[a-z]*\s*\n/i, '').replace(/\n?```\s*$/i, '').trim()

// The content lives inside a JS template literal: neutralise backticks and ${.
const safe = str => str.toString().replace(/`/g, "'").replace(/\$\{/g, '$ {')
title    = safe(title).replace(/'/g, "\\'")
summary  = safe(summary).replace(/'/g, "\\'")
readTime = safe(readTime || '6 min read').replace(/'/g, "\\'")
content  = safe(content).trim()

const block = `  {
    slug: '${slug}',
    title: '${title}',
    date: '${monthYear}',
    readTime: '${readTime}',
    summary: '${summary}',
    content: \`
${content}
    \`
  },
`

// Insert the new post at the END of the POSTS array (before the final "]").
const closeIdx = raw.lastIndexOf(']')
if (closeIdx === -1) {
  fail('Could not find the closing "]" of the POSTS array in blogPosts.js.')
}
const updated = raw.slice(0, closeIdx) + block + raw.slice(closeIdx)
writeFileSync(POSTS_FILE, updated, 'utf8')

note(`✓ Added new post: "${title}" (slug: ${slug}, ${content.split(/\s+/).length} words)`)
