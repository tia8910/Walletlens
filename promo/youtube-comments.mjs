// WalletLens YouTube Comment Agent — DISCOVER + DRAFT only (never auto-posts).
//
// Searches YouTube for videos about portfolio/net-worth tracking, finds comments
// that are questions or requests for tool recommendations, then uses Claude to
// draft helpful replies mentioning WalletLens. Outputs a GitHub Issue payload
// for human review — nothing is ever posted automatically.
//
// Required env vars:
//   YOUTUBE_API_KEY  — YouTube Data API v3 key
//   ANTHROPIC_API_KEY — Claude API key
//
// Run:  YOUTUBE_API_KEY=... ANTHROPIC_API_KEY=sk-ant-... node promo/youtube-comments.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEEN_FILE = resolve(__dirname, 'youtube-seen.json')
const ISSUE_FILE = resolve(__dirname, 'youtube-issue.json')
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

// ── Validate env vars ────────────────────────────────────────────────────────
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
if (!YOUTUBE_API_KEY) fail(
  'YOUTUBE_API_KEY is not set. ' +
  'Go to Google Cloud Console → Enable YouTube Data API v3 → Create API key → ' +
  'add as YOUTUBE_API_KEY repository secret.'
)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY is not set (add it as a repository secret).')

// ── What we promote ──────────────────────────────────────────────────────────
const FEATURES = `WalletLens (walletlens.live) — free, private, browser-based net-worth & portfolio tracker. 100% local (no account/login/email, nothing leaves the browser). Tracks crypto, stocks/ETFs, precious metals, real estate and cash in one net-worth view. Live prices, average cost basis, P&L, allocation donut. Manual + voice + screenshot + CSV import. On-device AI analysis (health score, fear & greed, stress test, rebalance). Sell-target tracking. Backup via export code. No exchange API keys required.`

// ── Search queries ───────────────────────────────────────────────────────────
const QUERIES = [
  'how to track crypto portfolio app',
  'best net worth tracker app',
  'portfolio tracker app review 2024',
  'how to track all investments one app',
  'best app to track stocks and crypto',
  'net worth tracking app comparison',
]

// ── Comment filter keywords ──────────────────────────────────────────────────
const COMMENT_KEYWORDS = [
  'track', 'tracker', 'app', 'tool', 'how do you', 'what do you use',
  'recommend', 'portfolio', 'net worth', 'spreadsheet',
]

// ── Delay helper ─────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Load seen comment IDs ────────────────────────────────────────────────────
let seen = []
try { seen = JSON.parse(readFileSync(SEEN_FILE, 'utf8')) } catch {}
const seenSet = new Set(Array.isArray(seen) ? seen : [])

// ── Step 1: Search YouTube for videos ───────────────────────────────────────
note('Searching YouTube for relevant videos...')

const videoMap = new Map()  // videoId → { videoId, title }

for (const query of QUERIES) {
  if (videoMap.size >= 20) {
    note('  Reached 20-video cap — stopping search early')
    break
  }

  const url = `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet` +
    `&q=${encodeURIComponent(query)}` +
    `&type=video` +
    `&maxResults=5` +
    `&order=relevance` +
    `&relevanceLanguage=en` +
    `&key=${YOUTUBE_API_KEY}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })

    if (!res.ok) {
      if (res.status === 403) {
        fail(
          'YouTube API returned 403 — quota likely exceeded. ' +
          'YouTube Data API v3 has a daily quota of 10,000 units. ' +
          'Wait until midnight Pacific Time for the quota to reset, or ' +
          'request a quota increase in Google Cloud Console.'
        )
      }
      note(`  Query "${query}": HTTP ${res.status} — skipping`)
      await delay(1200)
      continue
    }

    const data = await res.json()
    let added = 0
    for (const item of (data.items || [])) {
      const videoId = item.id && item.id.videoId
      if (!videoId || videoMap.has(videoId)) continue
      if (videoMap.size >= 20) break
      videoMap.set(videoId, {
        videoId,
        title: (item.snippet && item.snippet.title) || '',
      })
      added++
    }
    note(`  Query "${query}": ${added} new video(s) added (total: ${videoMap.size})`)
  } catch (e) {
    note(`  Query "${query}": fetch error (${String(e).slice(0, 120)}) — skipping`)
  }

  await delay(1200)
}

note(`Total unique videos: ${videoMap.size}`)

// ── Step 2 & 3: Fetch and filter comments ────────────────────────────────────
note('Fetching top comments per video...')

const candidates = []  // { commentId, videoId, videoTitle, author, text, likeCount, publishedAt, commentUrl }

for (const { videoId, title } of videoMap.values()) {
  if (candidates.length >= 30) {
    note('  Reached 30-candidate cap — stopping comment fetch early')
    break
  }

  const url = `https://www.googleapis.com/youtube/v3/commentThreads` +
    `?part=snippet` +
    `&videoId=${videoId}` +
    `&maxResults=20` +
    `&order=relevance` +
    `&key=${YOUTUBE_API_KEY}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })

    if (!res.ok) {
      if (res.status === 403) {
        note(`  Video: '${title}' — comments disabled or forbidden, skipping`)
        await delay(1200)
        continue
      }
      note(`  Video: '${title}' — HTTP ${res.status}, skipping`)
      await delay(1200)
      continue
    }

    const data = await res.json()
    let videoCount = 0

    for (const item of (data.items || [])) {
      if (candidates.length >= 30) break

      const commentId = item.id
      const snippet = item.snippet && item.snippet.topLevelComment && item.snippet.topLevelComment.snippet
      if (!snippet || !commentId) continue

      const text = snippet.textDisplay || ''
      const author = snippet.authorDisplayName || ''
      const likeCount = snippet.likeCount || 0
      const publishedAt = snippet.publishedAt || ''
      const commentVideoId = snippet.videoId || videoId

      // Filter: not seen, keyword match, length > 30
      if (seenSet.has(commentId)) continue

      const lowerText = text.toLowerCase()
      const hasKeyword = COMMENT_KEYWORDS.some(kw => lowerText.includes(kw))
      if (!hasKeyword) continue
      if (text.length <= 30) continue

      const commentUrl = `https://www.youtube.com/watch?v=${commentVideoId}&lc=${commentId}`

      candidates.push({
        commentId,
        videoId: commentVideoId,
        videoTitle: title,
        author,
        text,
        likeCount,
        publishedAt,
        commentUrl,
      })
      videoCount++
    }

    note(`  Video: '${title}' — ${videoCount} candidate comment(s)`)
  } catch (e) {
    note(`  Video: '${title}' — fetch error (${String(e).slice(0, 120)}) — skipping`)
  }

  await delay(1200)
}

note(`Total candidate comments: ${candidates.length}`)

// ── Add all evaluated IDs to seen set now (before Claude, so re-runs skip them)
const allCommentIds = candidates.map(c => c.commentId)
const newSeen = Array.from(new Set([...seenSet, ...allCommentIds])).slice(-2000)
writeFileSync(SEEN_FILE, JSON.stringify(newSeen, null, 0) + '\n', 'utf8')

if (candidates.length === 0) {
  note('No matching comments found this run — no issue created.')
  process.exit(0)
}

// ── Step 4: Claude drafts replies ────────────────────────────────────────────
note('Sending candidate comments to Claude for relevance check and reply drafting...')

const items = candidates.map((c, i) =>
  `[${i + 1}] id=${c.commentId}\nVideo: "${c.videoTitle}"\nAuthor: @${c.author}\nComment: ${c.text.slice(0, 500)}`
).join('\n\n')

const prompt = `You help promote WalletLens honestly on YouTube by drafting replies a human will review and post manually.

PRODUCT: ${FEATURES}

Below are YouTube comments. For each, decide if WalletLens is a genuinely helpful reply.

For each RELEVANT comment (person asking about tracking tools, looking for app recommendations, or sharing a tracking problem WalletLens solves), draft a reply that:
- Helps the person FIRST
- Mentions WalletLens as ONE option with the URL walletlens.live
- Includes "(disclosure: I'm affiliated with WalletLens)"
- Is ≤100 words, natural and conversational
- Grounded ONLY in real features above

Mark relevant=false if: off-topic, hostile, already resolved, or WalletLens genuinely doesn't fit.

COMMENTS:
${items}

Return STRICT JSON ONLY, no markdown:
{"results":[{"id":"comment_id","relevant":true,"reply":"drafted reply or empty","reason":"one line"}]}`

let data
try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
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

const responseText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
const jsonMatch = responseText.match(/\{[\s\S]*\}/)
if (!jsonMatch) {
  note('No JSON in Claude response — treating as empty result. Full response:')
  note('```\n' + responseText.slice(0, 1500) + '\n```')
  process.exit(0)
}

let parsed
try { parsed = JSON.parse(jsonMatch[0]) } catch (e) {
  note('Could not parse Claude JSON — treating as empty result. Error: ' + e.message)
  process.exit(0)
}

// ── Step 5: Dedup + output ───────────────────────────────────────────────────
const results = parsed.results || []
const drafts = results
  .filter(r => r.relevant && r.reply && r.reply.trim())
  .map(r => {
    const candidate = candidates.find(c => c.commentId === r.id)
    return {
      commentId: r.id,
      videoId: candidate ? candidate.videoId : '',
      videoTitle: candidate ? candidate.videoTitle : '',
      author: candidate ? candidate.author : '',
      text: candidate ? candidate.text : '',
      commentUrl: candidate ? candidate.commentUrl : '',
      reply: r.reply,
      reason: r.reason || '',
    }
  })

note(`Evaluated ${results.length} comment(s), ${drafts.length} with drafted replies.`)

if (drafts.length === 0) {
  note('Nothing worth posting this run — no issue created.')
  process.exit(0)
}

// ── Build the GitHub Issue ───────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
let body = `Drafted by the WalletLens YouTube agent on ${today}. Review and post manually — nothing has been sent automatically.\n\n`

drafts.forEach(({ videoId, videoTitle, author, text, commentUrl, reply, reason }, i) => {
  body += `### ${i + 1}. "${videoTitle}"\n`
  body += `**Video:** https://youtube.com/watch?v=${videoId}\n`
  body += `**Comment by @${author}:** "${text.slice(0, 300)}${text.length > 300 ? '…' : ''}"\n`
  body += `**Comment link:** ${commentUrl}\n\n`
  body += `**Suggested reply:**\n> ${reply.trim()}\n\n`
  if (reason) body += `<sub>Why: ${reason.slice(0, 200)}</sub>\n\n`
  body += `---\n\n`
})

writeFileSync(ISSUE_FILE, JSON.stringify({
  title: `📣 WalletLens YouTube: ${drafts.length} reply draft(s) — ${today}`,
  body,
}), 'utf8')

note(`Wrote ${drafts.length} draft(s) to promo/youtube-issue.json.`)
