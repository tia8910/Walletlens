#!/usr/bin/env node
/**
 * WalletLens — Medium Auto-Poster
 *
 * Posts articles to Medium via their API.
 *
 * Required env vars:
 *   MEDIUM_TOKEN  — Get from https://medium.com/me/integrations (Get access token)
 *
 * Usage:
 *   MEDIUM_TOKEN=xxx node promo/post-medium.mjs
 *   MEDIUM_TOKEN=xxx node promo/post-medium.mjs --dry-run
 *
 * Articles are stored in promo/submissions/medium-articles/ as .md files
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_KEY = process.env.MEDIUM_TOKEN
const DRY_RUN = process.argv.includes('--dry-run')
const ARTICLES_DIR = path.join(__dirname, 'submissions', 'medium-articles')
const POSTED_FILE = path.join(__dirname, 'medium-posted.json')

if (!API_KEY && !DRY_RUN) {
  console.error('Set MEDIUM_TOKEN env var. Get it from https://medium.com/me/integrations')
  process.exit(1)
}

function loadPosted() {
  try { return JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8')) } catch { return {} }
}

function savePosted(posted) {
  fs.writeFileSync(POSTED_FILE, JSON.stringify(posted, null, 2))
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return null
  const meta = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim()
  }
  return { meta, body: match[2].trim() }
}

async function getMediumUser() {
  const res = await fetch('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${API_KEY}` }
  })
  const data = await res.json()
  if (!data.data?.id) throw new Error('Failed to get Medium user: ' + JSON.stringify(data))
  return data.data
}

async function postArticle(user, article) {
  const { meta, body } = parseFrontmatter(article.content)
  if (!meta || !body) return null

  const payload = {
    title: meta.title,
    contentFormat: 'markdown',
    content: body,
    tags: (meta.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 5),
    publishStatus: 'public',
    canonicalUrl: meta.canonical_url || undefined,
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would post: "${payload.title}"`)
    return { dry: true }
  }

  const res = await fetch(`https://api.medium.com/v1/users/${user.id}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!data.data?.url) {
    console.error(`  Failed: ${JSON.stringify(data).slice(0, 200)}`)
    return null
  }

  console.log(`  Posted: ${data.data.url}`)
  return data.data
}

async function main() {
  const posted = loadPosted()

  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true })
    console.log(`Created ${ARTICLES_DIR}`)
    return
  }

  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'))
  if (files.length === 0) {
    console.log('No articles found in', ARTICLES_DIR)
    return
  }

  const user = DRY_RUN ? { id: 'dry-run' } : await getMediumUser()
  console.log(`Posting as: ${user.name || user.id}`)
  console.log(`Found ${files.length} article(s)`)

  for (const file of files) {
    if (posted[file]) {
      console.log(`  Skipping ${file} (already posted)`)
      continue
    }

    const content = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8')
    const result = await postArticle(user, { file, content })
    if (result && !result.dry) {
      posted[file] = { url: result.url, id: result.id, posted_at: new Date().toISOString() }
      savePosted(posted)
    }

    await new Promise(r => setTimeout(r, 30000))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
