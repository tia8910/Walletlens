#!/usr/bin/env node
/**
 * WalletLens — Dev.to Auto-Poster
 *
 * Posts articles to Dev.to via their API.
 *
 * Required env vars:
 *   DEVTO_API_KEY  — Get from https://dev.to/settings/extensions (Generate API Key)
 *
 * Usage:
 *   DEVTO_API_KEY=xxx node promo/post-devto.mjs
 *   DEVTO_API_KEY=xxx node promo/post-devto.mjs --dry-run
 *   DEVTO_API_KEY=xxx node promo/post-devto.mjs --slug=privacy-first-portfolio-tracker
 *
 * Articles are stored in promo/submissions/devto-articles/ as .md files
 * with YAML frontmatter (title, tags, description, etc.)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_KEY = process.env.DEVTO_API_KEY
const DRY_RUN = process.argv.includes('--dry-run')
const ONLY_SLUG = (process.argv.find(a => a.startsWith('--slug=')) || '').replace('--slug=', '')
const ARTICLES_DIR = path.join(__dirname, 'submissions', 'devto-articles')
const POSTED_FILE = path.join(__dirname, 'devto-posted.json')

if (!API_KEY && !DRY_RUN) {
  console.error('Set DEVTO_API_KEY env var. Get it from https://dev.to/settings/extensions')
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

async function postArticle(article) {
  const { meta, body } = parseFrontmatter(article.content)
  if (!meta || !body) {
    console.error(`  Invalid frontmatter in ${article.file}`)
    return null
  }

  const payload = {
    title: meta.title,
    body_markdown: body,
    tags: (meta.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 4),
    published: true,
    series: meta.series || undefined,
    canonical_url: meta.canonical_url || undefined,
    description: meta.description || undefined,
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would post: "${payload.title}"`)
    console.log(`    Tags: ${payload.tags.join(', ')}`)
    console.log(`    Body length: ${body.length} chars`)
    return { dry: true }
  }

  const res = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: {
      'api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error(`  Failed: ${res.status} — ${JSON.stringify(data).slice(0, 200)}`)
    return null
  }

  console.log(`  Posted: ${data.url}`)
  return data
}

async function main() {
  const posted = loadPosted()

  // Ensure articles directory exists
  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true })
    console.log(`Created ${ARTICLES_DIR} — add .md files with YAML frontmatter`)
    console.log('See devto-article-full.md for an example')
    return
  }

  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'))
  if (files.length === 0) {
    console.log('No articles found in', ARTICLES_DIR)
    console.log('Copy devto-article-full.md there and customize it')
    return
  }

  console.log(`Found ${files.length} article(s)`)
  let posted_count = 0

  for (const file of files) {
    if (ONLY_SLUG && !file.includes(ONLY_SLUG)) continue
    if (posted[file]) {
      console.log(`  Skipping ${file} (already posted: ${posted[file].url})`)
      continue
    }

    const content = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8')
    const result = await postArticle({ file, content })
    if (result && !result.dry) {
      posted[file] = { url: result.url, id: result.id, posted_at: new Date().toISOString() }
      savePosted(posted)
      posted_count++
    }

    // Rate limit: 1 article per 30 seconds
    await new Promise(r => setTimeout(r, 30000))
  }

  console.log(`\nDone. Posted ${posted_count} article(s).`)
}

main().catch(e => { console.error(e); process.exit(1) })
