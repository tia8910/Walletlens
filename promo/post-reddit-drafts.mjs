#!/usr/bin/env node
/**
 * Posts Reddit reply drafts from a GitHub Issue.
 *
 * Required secrets (GitHub Actions):
 *   GITHUB_TOKEN, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *
 * Optional env vars:
 *   ISSUE_NUMBER  — specific issue number to post from (defaults to latest open Reddit promo issue)
 *   SKIP_DRAFTS   — comma-separated draft numbers to skip, e.g. "2,4"
 *
 * Reddit app setup:
 *   1. Go to https://www.reddit.com/prefs/apps and click "create another app"
 *   2. Choose type "script"
 *   3. Set redirect URI to http://localhost:8080 (required but unused for script apps)
 *   4. Note the client ID (under the app name) and client secret
 */
import https from 'https'
import fs from 'fs'

const REPO = process.env.GITHUB_REPOSITORY
const GH_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.REDDIT_CLIENT_ID
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET
const USERNAME = process.env.REDDIT_USERNAME
const PASSWORD = process.env.REDDIT_PASSWORD
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
    const bodyBuf = body ? Buffer.from(body) : null
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
  const body = JSON.stringify(payload)
  await request(`https://api.github.com${path}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'WalletLens-PostAgent/1.0'
    }
  }, body)
}

function parseRedditDrafts(rawBody) {
  const body = unescapeHtml(rawBody)
  const drafts = []
  const sections = body.split(/\n---\n/)
  for (const section of sections) {
    const numMatch = section.match(/^###\s+(\d+)\./m)
    if (!numMatch) continue
    const num = parseInt(numMatch[1])

    const postMatch = section.match(/\*\*Post:\*\*\s*(https?:\/\/\S+)/)
    if (!postMatch) continue
    const postUrl = postMatch[1].trim()

    const idMatch = postUrl.match(/\/comments\/([a-z0-9]+)/)
    if (!idMatch) continue
    const postId = idMatch[1]

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

    drafts.push({ num, postUrl, postId, replyText })
  }
  return drafts
}

async function getRedditToken() {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const body = `grant_type=password&username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`
  const res = await request('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `script:walletlens-promo:1.0 (by /u/${USERNAME})`
    }
  }, body)
  const data = JSON.parse(res.body)
  if (!data.access_token) throw new Error(`Reddit auth failed: ${res.body.slice(0, 300)}`)
  return data.access_token
}

async function postRedditReply(token, postId, text) {
  const body = `api_type=json&parent=t3_${postId}&text=${encodeURIComponent(text)}`
  const res = await request('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `script:walletlens-promo:1.0 (by /u/${USERNAME})`
    }
  }, body)
  const data = JSON.parse(res.body)
  const errors = data.json?.errors
  if (errors && errors.length > 0) throw new Error(JSON.stringify(errors))
  return data
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !USERNAME || !PASSWORD) {
    fail('Missing Reddit credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD secrets.')
  }

  let issue
  if (ISSUE_NUM) {
    issue = await ghGet(`/repos/${REPO}/issues/${ISSUE_NUM}`)
  } else {
    const issues = await ghGet(`/repos/${REPO}/issues?state=open&per_page=20`)
    issue = issues.find(i => i.title.includes('WalletLens promo'))
    if (!issue) fail('No open Reddit promo issue found. Run the promotion agent first.')
  }

  log(`## Posting from Issue #${issue.number}: ${issue.title}\n`)

  const drafts = parseRedditDrafts(issue.body)
  if (drafts.length === 0) fail('No drafts could be parsed from the issue body.')

  log(`Found ${drafts.length} draft(s). Skip list: ${SKIP.size > 0 ? [...SKIP].join(', ') : 'none'}\n`)

  log('Authenticating with Reddit...')
  const token = await getRedditToken()
  log('✓ Reddit auth OK\n')

  let posted = 0, skipped = 0, failed = 0

  for (const draft of drafts) {
    if (SKIP.has(draft.num)) {
      log(`⏭  Draft ${draft.num} — skipped`)
      skipped++
      continue
    }

    try {
      log(`📤 Posting draft ${draft.num} → ${draft.postUrl}`)
      await postRedditReply(token, draft.postId, draft.replyText)
      log(`   ✓ Posted: https://www.reddit.com/comments/${draft.postId}`)
      posted++
    } catch (err) {
      log(`   ⚠ Draft ${draft.num} failed: ${err.message}`)
      failed++
    }

    await sleep(2000) // Reddit rate limit: stay well under 60 req/min
  }

  log(`\n### Results: ${posted} posted · ${skipped} skipped · ${failed} failed`)

  if (failed === 0 && posted + skipped === drafts.length) {
    log(`\nClosing issue #${issue.number} — all drafts handled.`)
    await ghPatch(`/repos/${REPO}/issues/${issue.number}`, { state: 'closed' })
    log('✓ Issue closed.')
  }
}

main().catch(err => fail(err.message))
