#!/usr/bin/env node
/**
 * WalletLens — Multi-Platform Posting Agent
 *
 * Orchestrates posting across all platforms with rate limiting and
 * scheduled spacing to avoid spam flags.
 *
 * Required env vars:
 *   GH_TOKEN              — GitHub token (for awesome list PRs + discussions)
 *   DEVTO_API_KEY         — Dev.to API key (optional, skips if missing)
 *   REDDIT_CLIENT_ID      — Reddit OAuth client ID (optional)
 *   REDDIT_CLIENT_SECRET  — Reddit OAuth client secret (optional)
 *   REDDIT_USERNAME       — Reddit username (optional)
 *   REDDIT_PASSWORD       — Reddit password (optional)
 *
 * Usage:
 *   GH_TOKEN=xxx node promo/agent-post-all.mjs
 *   GH_TOKEN=xxx node promo/agent-post-all.mjs --dry-run
 *   GH_TOKEN=xxx node promo/agent-post-all.mjs --platform=devto
 *   GH_TOKEN=xxx node promo/agent-post-all.mjs --platform=github
 *   GH_TOKEN=xxx node promo/agent-post-all.mjs --platform=reddit
 *   GH_TOKEN=xxx node promo/agent-post-all.mjs --platform=directories
 *   GH_TOKEN=xxx node promo/agent-post-all.mjs --schedule=daily
 *
 * Schedule modes:
 *   --schedule=daily    Post 1 item per platform per day (24h spacing)
 *   --schedule=once     Post all items now (with 5-min spacing between platforms)
 *   (default)           Post all items now with standard rate limiting
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Parse args ────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const PLATFORM = (process.argv.find(a => a.startsWith('--platform=')) || '').replace('--platform=', '')
const SCHEDULE = (process.argv.find(a => a.startsWith('--schedule=')) || '').replace('--schedule=', '')
const MEDIUM_TOKEN = process.env.MEDIUM_TOKEN
const STATE_FILE = path.join(__dirname, 'agent-state.json')

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] ${msg}`)
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { posts: {}, lastRun: {} } }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function canPostToday(state, platform) {
  if (SCHEDULE !== 'daily') return true
  const last = state.lastRun[platform]
  if (!last) return true
  const hoursSince = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60)
  return hoursSince >= 24
}

// ── Platform: GitHub Awesome Lists ────────────────────────────────────────────

async function postGitHub(state) {
  if (!canPostToday(state, 'github')) {
    log('GitHub: Skipping (posted within 24h)')
    return
  }
  log('GitHub: Running awesome-list submissions...')
  try {
    const result = execSync(
      `GH_TOKEN=${process.env.GH_TOKEN} node ${path.join(__dirname, 'submit-awesome-lists.mjs')}${DRY_RUN ? ' --dry-run' : ''}`,
      { encoding: 'utf8', timeout: 120000 }
    )
    log(result.trim().split('\n').slice(-5).join('\n'))
    state.lastRun.github = new Date().toISOString()
  } catch (e) {
    log(`GitHub: Error — ${e.message}`)
  }
}

// ── Platform: Dev.to ──────────────────────────────────────────────────────────

async function postDevTo(state) {
  const apiKey = process.env.DEVTO_API_KEY
  if (!apiKey) {
    log('Dev.to: Skipping (DEVTO_API_KEY not set)')
    return
  }
  if (!canPostToday(state, 'devto')) {
    log('Dev.to: Skipping (posted within 24h)')
    return
  }
  log('Dev.to: Posting articles...')
  try {
    const result = execSync(
      `DEVTO_API_KEY=${apiKey} node ${path.join(__dirname, 'post-devto.mjs')}${DRY_RUN ? ' --dry-run' : ''}`,
      { encoding: 'utf8', timeout: 120000 }
    )
    log(result.trim().split('\n').slice(-5).join('\n'))
    state.lastRun.devto = new Date().toISOString()
  } catch (e) {
    log(`Dev.to: Error — ${e.message}`)
  }
}

// ── Platform: Medium ─────────────────────────────────────────────────────────

async function postMedium(state) {
  if (!MEDIUM_TOKEN) {
    log('Medium: Skipping (MEDIUM_TOKEN not set)')
    return
  }
  if (!canPostToday(state, 'medium')) {
    log('Medium: Skipping (posted within 24h)')
    return
  }
  log('Medium: Posting articles...')
  try {
    const result = execSync(
      `MEDIUM_TOKEN=${MEDIUM_TOKEN} node ${path.join(__dirname, 'post-medium.mjs')}${DRY_RUN ? ' --dry-run' : ''}`,
      { encoding: 'utf8', timeout: 120000 }
    )
    log(result.trim().split('\n').slice(-5).join('\n'))
    state.lastRun.medium = new Date().toISOString()
  } catch (e) {
    log(`Medium: Error — ${e.message}`)
  }
}

// ── Platform: Reddit ──────────────────────────────────────────────────────────

async function postReddit(state) {
  const hasCreds = process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME
  if (!hasCreds) {
    log('Reddit: Skipping (credentials not set)')
    return
  }
  if (!canPostToday(state, 'reddit')) {
    log('Reddit: Skipping (posted within 24h)')
    return
  }
  log('Reddit: Posting drafts...')
  try {
    const result = execSync(
      `REDdit_CLIENT_ID=${process.env.REDDIT_CLIENT_ID} REDDIT_CLIENT_SECRET=${process.env.REDDIT_CLIENT_SECRET} REDDIT_USERNAME=${process.env.REDDIT_USERNAME} REDDIT_PASSWORD=${process.env.REDDIT_PASSWORD} node ${path.join(__dirname, 'post-reddit-drafts.mjs')}`,
      { encoding: 'utf8', timeout: 120000 }
    )
    log(result.trim().split('\n').slice(-5).join('\n'))
    state.lastRun.reddit = new Date().toISOString()
  } catch (e) {
    log(`Reddit: Error — ${e.message}`)
  }
}

// ── Platform: Directory Submissions (manual) ──────────────────────────────────

async function postDirectories(state) {
  if (!canPostToday(state, 'directories')) {
    log('Directories: Skipping (posted within 24h)')
    return
  }
  log('Directories: Generating submission checklist...')
  const checklist = `
To submit to directories, visit each URL and fill in the form:

1. AlternativeTo: https://alternativeto.net/software/walletlens/add/
2. Product Hunt: https://www.producthunt.com/posts/new
3. StackShare: https://stackshare.io/walletlens
4. SaaSHub: https://www.saashub.com/submit
5. SourceForge: https://sourceforge.net/software-submit.php
6. Capterra: https://www.capterra.com/software/submit-listing/
7. G2: https://www.g2.com/products/new
8. Chrome Web Store: Already live at https://chromewebstore.google.com/detail/walletlens-portfolio/ajmjdeobjjmabgonhaeaaehoepfafhbn
9. PWA Directory: https://progressive-apps.github.io/pwa-directory/
10. There's an AI for That: https://theresanaiforthat.com/submit/
11. Futurepedia: https://futurepedia.io/submit-tool
12. TopAI.tools: https://topai.tools/submit
`
  log(checklist)
  state.lastRun.directories = new Date().toISOString()
}

// ── Platform: GitHub Discussions ──────────────────────────────────────────────

async function postDiscussions(state) {
  if (!canPostToday(state, 'discussions')) {
    log('Discussions: Skipping (posted within 24h)')
    return
  }
  log('Discussions: Creating discussions...')
  try {
    const result = execSync(
      `node ${path.join(__dirname, '..', '.github', 'workflows', 'discussions.yml')} 2>/dev/null || echo "Discussions workflow not available"`,
      { encoding: 'utf8', timeout: 60000 }
    )
    log(result.trim().split('\n').slice(-3).join('\n'))
    state.lastRun.discussions = new Date().toISOString()
  } catch (e) {
    log(`Discussions: Error — ${e.message}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('=== WalletLens Posting Agent ===')
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  log(`Schedule: ${SCHEDULE || 'default (now with rate limiting)'}`)
  log(`Platform filter: ${PLATFORM || 'all'}`)
  log('')

  const state = loadState()
  const platforms = {
    github: postGitHub,
    devto: postDevTo,
    medium: postMedium,
    reddit: postReddit,
    directories: postDirectories,
    discussions: postDiscussions,
  }

  const active = PLATFORM ? [PLATFORM] : Object.keys(platforms)

  for (const p of active) {
    if (!platforms[p]) {
      log(`Unknown platform: ${p}`)
      continue
    }
    await platforms[p](state)
    saveState(state)

    // Rate limit: 5 minutes between platforms
    if (active.indexOf(p) < active.length - 1) {
      log(`Waiting 5 minutes before next platform...`)
      await new Promise(r => setTimeout(r, 5 * 60 * 1000))
    }
  }

  log('')
  log('=== Agent Complete ===')
  log(`State saved to ${STATE_FILE}`)
}

main().catch(e => { console.error(e); process.exit(1) })
