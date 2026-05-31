// WalletLens — launch copy generator (one-time use).
//
// Generates ready-to-post copy for:
//   • Show HN (Hacker News) — title + body
//   • Product Hunt — tagline, description, maker first comment
//   • IndieHackers — title + intro paragraph
//
// All three are produced in a single Claude call and written to
// promo/launch-copy.json for the GitHub Actions step that opens a review issue.
//
// Required secret: ANTHROPIC_API_KEY
//
// Run:  ANTHROPIC_API_KEY=sk-ant-... node promo/launch-copy.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_FILE = resolve(__dirname, 'launch-copy.json')
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

// ── Ask Claude to write all three in one call ────────────────────────────────
const prompt = `You are writing launch copy for WalletLens, a free private portfolio tracker. Write copy for three platforms in a single response.

PRODUCT FACTS (only describe features that are TRUE — do not invent):
${FEATURES}

---

PLATFORM 1 — Show HN (Hacker News)
Rules:
- Title must start with "Show HN:" and be concise (under 80 chars)
- Body: 150-300 words; explain what it is, the main technical/privacy angle, why you built it, and what stage it's at. HN tone: honest, technical, no marketing fluff. First person, from the builder. Include the URL walletlens.live.

PLATFORM 2 — Product Hunt listing
Rules:
- tagline: ≤60 characters; punchy, no hype, no exclamation mark unless it really earns one
- description: ≤260 characters; plain English, highlights the key differentiator (private/local)
- first_comment: 150-200 words; maker's intro comment. Explain why you built it, what problem it solves, what's special about the privacy-first approach. Warm, genuine, no corporate speak.

PLATFORM 3 — IndieHackers post
Rules:
- title: catchy, honest headline for an IH audience (builders and indie makers)
- body: 200-300 words intro paragraph for a story post about building WalletLens. Share the motivation, the technical approach, early results or lessons. IH tone: candid, reflective, builder-to-builder. Include walletlens.live.

---

Return STRICT JSON ONLY — no markdown fences, no explanatory text:
{
  "showhn": {"title": "...", "body": "..."},
  "producthunt": {"tagline": "...", "description": "...", "first_comment": "..."},
  "indiehackers": {"title": "...", "body": "..."}
}`

note('Calling Claude to generate launch copy...')

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
      max_tokens: 3000,
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

// Basic validation
const required = [
  ['showhn', ['title', 'body']],
  ['producthunt', ['tagline', 'description', 'first_comment']],
  ['indiehackers', ['title', 'body']],
]
for (const [section, fields] of required) {
  if (!parsed[section]) fail(`Missing section "${section}" in Claude response`)
  for (const field of fields) {
    if (!parsed[section][field]) fail(`Missing field "${section}.${field}" in Claude response`)
  }
}

// Warn on length violations (don't hard-fail — a human will review)
const phTagline = parsed.producthunt.tagline || ''
const phDesc = parsed.producthunt.description || ''
if (phTagline.length > 60) note(`⚠️  Product Hunt tagline is ${phTagline.length} chars (limit 60 — needs trimming)`)
if (phDesc.length > 260) note(`⚠️  Product Hunt description is ${phDesc.length} chars (limit 260 — needs trimming)`)

const today = new Date().toISOString().slice(0, 10)

note('Launch copy generated successfully.')
note(`  Show HN title: ${parsed.showhn.title}`)
note(`  Product Hunt tagline: ${phTagline}`)
note(`  IndieHackers title: ${parsed.indiehackers.title}`)

// ── Build the GitHub Issue ───────────────────────────────────────────────────
const title = `🚀 WalletLens launch copy — ${today}`

let body = `Generated by the WalletLens launch copy generator on ${today}.\n`
body += `Review each section, edit freely, then post when ready.\n\n`
body += `---\n\n`

body += `## Show HN\n\n`
body += `**Title:**\n\`\`\`\n${parsed.showhn.title}\n\`\`\`\n\n`
body += `**Body:**\n\`\`\`\n${parsed.showhn.body}\n\`\`\`\n\n`
body += `---\n\n`

body += `## Product Hunt\n\n`
body += `**Tagline** (${phTagline.length}/60 chars):\n\`\`\`\n${phTagline}\n\`\`\`\n\n`
body += `**Description** (${phDesc.length}/260 chars):\n\`\`\`\n${phDesc}\n\`\`\`\n\n`
body += `**First comment (maker intro):**\n\`\`\`\n${parsed.producthunt.first_comment}\n\`\`\`\n\n`
body += `---\n\n`

body += `## IndieHackers\n\n`
body += `**Title:**\n\`\`\`\n${parsed.indiehackers.title}\n\`\`\`\n\n`
body += `**Body:**\n\`\`\`\n${parsed.indiehackers.body}\n\`\`\`\n\n`
body += `---\n\n`

body += `<sub>WalletLens launch copy generator · walletlens.live</sub>`

writeFileSync(OUTPUT_FILE, JSON.stringify({ title, body }), 'utf8')
note(`Wrote launch-copy.json.`)
