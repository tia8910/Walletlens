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

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTS_FILE = resolve(__dirname, '../src/data/blogPosts.js')
const MODEL = 'claude-sonnet-4-6'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set — aborting.')
  process.exit(1)
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

Return STRICT JSON ONLY, no markdown fences, no commentary, this exact shape:
{
  "title": "<compelling, specific, <=70 chars, title case>",
  "slug": "<url-safe-kebab-case, lowercase, derived from the topic, must be unique>",
  "summary": "<1-2 sentence meta description, 120-160 chars, search-friendly>",
  "readTime": "<N min read>",
  "content": "<the full article body in Markdown>"
}

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
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' },
    ],
  }),
})

if (!resp.ok) {
  console.error('Claude API error:', resp.status, await resp.text())
  process.exit(1)
}

const data = await resp.json()
const text = '{' + (data.content?.[0]?.text || '')
const match = text.match(/\{[\s\S]*\}/)
if (!match) {
  console.error('No JSON found in Claude response.')
  process.exit(1)
}

let post
try {
  post = JSON.parse(match[0])
} catch (e) {
  console.error('Failed to parse JSON from Claude:', e.message)
  process.exit(1)
}

// ── Validate + sanitise ────────────────────────────────────────────────────
const slugify = s => (s || '').toString().toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

let { title, slug, summary, readTime, content } = post
slug = slugify(slug || title)

if (!title || !slug || !summary || !content || content.length < 500) {
  console.error('Generated post is missing required fields or too short — aborting.')
  process.exit(1)
}

if (existingSlugs.includes(slug)) {
  console.log(`Slug "${slug}" already exists — skipping to avoid a duplicate.`)
  process.exit(0)
}

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
  console.error('Could not find the closing "]" of the POSTS array — aborting.')
  process.exit(1)
}
const updated = raw.slice(0, closeIdx) + block + raw.slice(closeIdx)
writeFileSync(POSTS_FILE, updated, 'utf8')

console.log(`✓ Added new post: "${title}"`)
console.log(`  slug: ${slug}`)
console.log(`  ${content.split(/\s+/).length} words`)
