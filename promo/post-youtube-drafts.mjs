#!/usr/bin/env node
/**
 * Posts YouTube comment reply drafts from a GitHub Issue.
 *
 * Required secrets (GitHub Actions):
 *   GITHUB_TOKEN
 *   YOUTUBE_OAUTH_CLIENT_ID
 *   YOUTUBE_OAUTH_CLIENT_SECRET
 *   YOUTUBE_OAUTH_REFRESH_TOKEN  (obtained by running: node promo/youtube-oauth.mjs)
 *
 * Optional env vars:
 *   ISSUE_NUMBER  — specific issue number (defaults to latest open YouTube promo issue)
 *   SKIP_DRAFTS   — comma-separated draft numbers to skip, e.g. "3,7"
 */
import https from 'https'
import fs from 'fs'

const REPO = process.env.GITHUB_REPOSITORY
const GH_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET
const REFRESH_TOKEN = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN
const ISSUE_NUM = process.env.ISSUE_NUMBER ? parseInt(process.env.ISSUE_NUMBER) : null
const SKIP = new Set(
  (process.env.SKIP_DRAFTS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number)
)

const SUMMARY = process.env.GITHUB_STEP_SUMMARY

function log(msg) {
  console.log(msg)
  if (SUMMARY) fs.appendFileSync(SUMMARY, msg + '\n')
}
function fail(msg) {
  console.error('::error::' + msg)
  if (SUMMARY) fs.appendFileSync(SUMMARY, `❌ ${msg}\n`)
  process.exit(1)
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const bodyBuf = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {})
      }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (bodyBuf) req.write(bodyBuf)
    req.end()
  })
}

function unescapeHtml(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

async function ghGet(path) {
  const res = await request(`https://api.github.com${path}`, {
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'WalletLens-PostAgent/1.0'
    }
  })
  if (res.status !== 200) throw new Error(`GitHub ${res.status}: ${res.body.slice(0, 200)}`)
  return JSON.parse(res.body)
}

async function ghPatch(path, payload) {
  await request(`https://api.github.com${path}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'WalletLens-PostAgent/1.0'
    }
  }, JSON.stringify(payload))
}

function parseYouTubeDrafts(rawBody) {
  const body = unescapeHtml(rawBody)
  const drafts = []
  const sections = body.split(/\n---\n/)
  for (const section of sections) {
    const numMatch = section.match(/^###\s+(\d+)\./m)
    if (!numMatch) continue
    const num = parseInt(numMatch[1])

    // Comment link contains both video ID and comment ID
    const linkMatch = section.match(/\*\*Comment link:\*\*\s*(https?:\/\/\S+)/)
    if (!linkMatch) continue
    const commentLink = linkMatch[1].trim()

    const videoMatch = commentLink.match(/[?&]v=([^&\s]+)/)
    const commentMatch = commentLink.match(/[?&]lc=([^&\s]+)/)
    if (!videoMatch || !commentMatch) continue
    const videoId = videoMatch[1]
    const commentId = commentMatch[1]

    // Extract blockquote reply text
    const replyMatch = section.match(/\*\*Suggested reply:\*\*[\s\S]*?\n(>[\s\S]*?)(?:\n<sub>|\n---|\s*$)/)
    if (!replyMatch) continue
    const replyText = replyMatch[1]
      .split('\n')
      .filter(l => l.startsWith('>'))
      .map(l => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim()
    if (!replyText) continue

    drafts.push({ num, videoId, commentId, commentLink, replyText })
  }
  return drafts
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token'
  }).toString()

  const res = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, body)

  const data = JSON.parse(res.body)
  if (!data.access_token) throw new Error(`Token refresh failed: ${res.body.slice(0, 300)}`)
  return data.access_token
}

async function postYouTubeReply(accessToken, commentId, text) {
  const bodyObj = JSON.stringify({
    snippet: { parentId: commentId, textOriginal: text }
  })
  const res = await request('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }, bodyObj)

  if (res.status !== 200) {
    let msg = `HTTP ${res.status}`
    try { msg = JSON.parse(res.body).error?.message || msg } catch {}
    throw new Error(msg)
  }
  return JSON.parse(res.body)
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    fail(
      'Missing YouTube OAuth credentials. ' +
      'Run node promo/youtube-oauth.mjs locally to get YOUTUBE_OAUTH_REFRESH_TOKEN, ' +
      'then add YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, YOUTUBE_OAUTH_REFRESH_TOKEN as repository secrets.'
    )
  }

  let issue
  if (ISSUE_NUM) {
    issue = await ghGet(`/repos/${REPO}/issues/${ISSUE_NUM}`)
  } else {
    const issues = await ghGet(`/repos/${REPO}/issues?state=open&per_page=20`)
    issue = issues.find(i => i.title.includes('WalletLens YouTube'))
    if (!issue) fail('No open YouTube promo issue found. Run the YouTube agent first.')
  }

  log(`## Posting from Issue #${issue.number}: ${issue.title}\n`)

  const drafts = parseYouTubeDrafts(issue.body)
  if (drafts.length === 0) fail('No drafts could be parsed from the issue body.')

  log(`Found ${drafts.length} draft(s). Skip list: ${SKIP.size > 0 ? [...SKIP].join(', ') : 'none'}\n`)

  log('Getting YouTube access token...')
  const accessToken = await getAccessToken()
  log('✓ YouTube auth OK\n')

  let posted = 0, skipped = 0, failed = 0

  for (const draft of drafts) {
    if (SKIP.has(draft.num)) {
      log(`⏭  Draft ${draft.num} — skipped`)
      skipped++
      continue
    }

    try {
      log(`📤 Posting draft ${draft.num} (video ${draft.videoId}, comment ${draft.commentId})`)
      await postYouTubeReply(accessToken, draft.commentId, draft.replyText)
      log(`   ✓ Posted → ${draft.commentLink}`)
      posted++
    } catch (err) {
      log(`   ⚠ Draft ${draft.num} failed: ${err.message}`)
      failed++
    }

    await sleep(2000) // avoid burst rate limits
  }

  log(`\n### Results: ${posted} posted · ${skipped} skipped · ${failed} failed`)

  if (failed === 0 && posted + skipped === drafts.length) {
    log(`\nClosing issue #${issue.number} — all drafts handled.`)
    await ghPatch(`/repos/${REPO}/issues/${issue.number}`, { state: 'closed' })
    log('✓ Issue closed.')
  }
}

main().catch(err => fail(err.message))
