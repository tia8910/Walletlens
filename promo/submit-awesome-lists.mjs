#!/usr/bin/env node
/**
 * WalletLens — Awesome List Auto-Submitter
 *
 * Forks each awesome-list repo, adds WalletLens in the right section,
 * and opens a PR — all via the GitHub REST API.
 *
 * Usage:
 *   GH_TOKEN=ghp_xxx node promo/submit-awesome-lists.mjs
 *
 * Get a token at: https://github.com/settings/tokens/new
 * Required scopes: public_repo (to fork and create PRs on public repos)
 *
 * Flags:
 *   --dry-run   Print what would be done without making any API calls
 *   --only=slug Run only one entry, e.g. --only=awesome-privacy
 */

import { setTimeout as sleep } from 'timers/promises'

// ── Config ────────────────────────────────────────────────────────────────────

const GH_TOKEN = process.env.GH_TOKEN
const DRY_RUN  = process.argv.includes('--dry-run')
const ONLY     = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '')

const YOUR_GH_USERNAME = process.env.GH_USERNAME || '' // optional override; auto-detected from token

const WALLETLENS_URL  = 'https://walletlens.live'
const WALLETLENS_REPO = 'https://github.com/tia8910/walletlens'

// ── Submission targets ────────────────────────────────────────────────────────

const TARGETS = [
  {
    slug: 'awesome-privacy',
    repo: 'pluja/awesome-privacy',
    branch: 'main',
    file: 'README.md',
    // Find this exact heading line in the file, insert our entry after it
    insertAfterPattern: /#{2,4}\s+Finance/i,
    // If a more specific sub-section exists, use it
    insertAfterPatternAlt: /Personal Finance/i,
    entry: '- [WalletLens](https://walletlens.live) — Free net worth tracker for crypto, stocks, gold, and fiat. No account, no server — all data stays in your browser\'s localStorage.',
    prTitle: 'Add WalletLens — privacy-first net worth tracker',
    prBody: `WalletLens is a free, no-account portfolio tracker that stores all data locally in the browser. There is no backend, no login, and nothing is sent to a server.\n\nIt covers crypto (10,000+ coins via CoinGecko), US stocks, gold, silver, fiat, and cash in one dashboard. Fits the Finance section as a privacy-respecting alternative to cloud-based trackers.\n\n${WALLETLENS_REPO}`,
  },
  {
    slug: 'awesome-pwa',
    repo: 'hemanth/awesome-pwa',
    branch: 'master',
    file: 'README.md',
    insertAfterPatternAlt: /Finance/i,
    insertAfterPattern: /Finance/i,
    entry: '- [WalletLens](https://walletlens.live) — Net worth tracker PWA — crypto, stocks, gold, fiat, cash. Installable, works offline, no account required.',
    prTitle: 'Add WalletLens — finance PWA for net worth tracking',
    prBody: `WalletLens is a fully installable PWA (web app manifest + service worker) that tracks crypto, stocks, precious metals, fiat and cash in one dashboard. Works offline via service worker cache. No account or sign-up required.\n\n${WALLETLENS_REPO}`,
  },
  {
    slug: 'cryptolist',
    repo: 'coinpride/CryptoList',
    branch: 'master',
    file: 'README.md',
    insertAfterPattern: /Portfolio/i,
    insertAfterPatternAlt: /Portfolio Tracker/i,
    entry: '- [WalletLens](https://walletlens.live) — Free, no-account portfolio tracker. Tracks crypto + stocks + gold + fiat. All data stays on your device. Includes AI analysis.',
    prTitle: 'Add WalletLens to Portfolio Trackers',
    prBody: `WalletLens is a free multi-asset portfolio tracker that covers crypto, US stocks, gold, silver, fiat and cash in one dashboard. No account required, no server — data stored locally in the browser.\n\n${WALLETLENS_REPO}`,
  },
  {
    slug: 'awesome-oss-alternatives',
    repo: 'RunaCapital/awesome-oss-alternatives',
    branch: 'main',
    file: 'README.md',
    insertAfterPattern: /Finance|Personal Finance|Money/i,
    entry: '- [WalletLens](https://walletlens.live) — Open-source alternative to Kubera / CoinStats / Empower. Free, no account, local-first net worth tracker.',
    prTitle: 'Add WalletLens — open source alternative to Kubera/CoinStats/Empower',
    prBody: `WalletLens is a free, local-first net worth and portfolio tracker. It covers the same asset classes as paid tools (Kubera $150/yr, CoinStats Pro) but requires no account and stores all data in the user's browser.\n\n${WALLETLENS_REPO}`,
  },
  {
    slug: 'awesome-ai-in-finance',
    repo: 'georgezouq/awesome-ai-in-finance',
    branch: 'main',
    file: 'README.md',
    insertAfterPattern: /Portfolio|Tools/i,
    entry: '- [WalletLens](https://walletlens.live) — Free multi-asset portfolio tracker with built-in AI analysis (portfolio health score, sell plans, risk scoring). No account required.',
    prTitle: 'Add WalletLens — free multi-asset portfolio tracker with AI analysis',
    prBody: `WalletLens includes built-in AI portfolio analysis: health scoring, stress testing, entry quality analysis, rebalancing plans, and a Fear & Greed gauge. Free, no account, covers crypto + stocks + gold + fiat.\n\n${WALLETLENS_REPO}`,
  },
]

// ── GitHub API helpers ────────────────────────────────────────────────────────

async function gh(method, path, body) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${method} https://api.github.com${path}`)
    if (body) console.log('  body:', JSON.stringify(body).slice(0, 200))
    return { dry: true }
  }

  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'walletlens-awesome-submitter/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }

  if (!res.ok && res.status !== 422) {
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }

  return json
}

async function getMe() {
  const me = await gh('GET', '/user')
  return me.login
}

async function forkRepo(owner, repo) {
  console.log(`  Forking ${owner}/${repo}...`)
  const fork = await gh('POST', `/repos/${owner}/${repo}/forks`, { default_branch_only: true })
  if (fork.dry) return { owner: YOUR_GH_USERNAME, repo }
  // Wait for fork to be ready
  await sleep(3000)
  return { owner: fork.owner.login, repo: fork.name }
}

async function getFile(owner, repo, path, branch) {
  const data = await gh('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
  // In dry-run mode return a fake README that includes the section heading
  // so the insertion logic can show what would be added
  if (data.dry) return { content: `## Finance\n\n- [SomeOtherTool](https://example.com) — Example tool.\n`, sha: 'dry-sha' }
  const content = Buffer.from(data.content, 'base64').toString('utf8')
  return { content, sha: data.sha }
}

async function updateFile(owner, repo, path, branch, content, sha, message) {
  return gh('PUT', `/repos/${owner}/${repo}/contents/${path}`, {
    message,
    content: Buffer.from(content).toString('base64'),
    sha,
    branch,
  })
}

async function createBranch(owner, repo, newBranch, fromBranch) {
  // Get SHA of tip of fromBranch
  const ref = await gh('GET', `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`)
  if (ref.dry) return
  const sha = ref.object.sha
  await gh('POST', `/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${newBranch}`,
    sha,
  })
}

async function createPR(upstreamOwner, upstreamRepo, head, base, title, body) {
  return gh('POST', `/repos/${upstreamOwner}/${upstreamRepo}/pulls`, {
    title,
    body,
    head,   // e.g. "youruser:add-walletlens"
    base,
    maintainer_can_modify: true,
  })
}

// ── Entry insertion logic ─────────────────────────────────────────────────────

/**
 * Insert `entry` into `content` after the first line matching `pattern`.
 * Tries `patternAlt` first if provided.
 * Returns null if no matching section found.
 */
function insertAfterSection(content, pattern, patternAlt, entry) {
  const lines = content.split('\n')

  // Try alt pattern first (more specific), then primary
  const patterns = [patternAlt, pattern].filter(Boolean)

  for (const pat of patterns) {
    const idx = lines.findIndex(l => pat.test(l))
    if (idx === -1) continue

    // Skip blank lines and existing list items after the heading, find insertion point
    // Insert after the heading line (and any existing entries to avoid being first/last)
    let insertAt = idx + 1
    // Skip blank lines right after the heading
    while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++

    // Check entry not already present
    if (lines.some(l => l.includes('walletlens.live') || l.toLowerCase().includes('walletlens'))) {
      return { content: null, reason: 'already present' }
    }

    // Insert the entry
    lines.splice(insertAt, 0, entry)
    return { content: lines.join('\n'), reason: null }
  }

  return { content: null, reason: 'section not found' }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processTarget(t, myUsername) {
  console.log(`\n📋 ${t.slug} (${t.repo})`)

  const [upstreamOwner, upstreamRepoName] = t.repo.split('/')
  const branchName = 'add-walletlens'

  // 1. Fork
  const fork = await forkRepo(upstreamOwner, upstreamRepoName)
  if (!DRY_RUN) await sleep(2000)

  // 2. Read file from upstream (not fork, so we get fresh content)
  console.log(`  Reading ${t.file}...`)
  const { content, sha } = await getFile(
    DRY_RUN ? upstreamOwner : fork.owner,
    DRY_RUN ? upstreamRepoName : fork.repo,
    t.file,
    t.branch,
  )

  // 3. Insert entry
  const { content: newContent, reason } = insertAfterSection(
    content,
    t.insertAfterPattern,
    t.insertAfterPatternAlt,
    t.entry,
  )

  if (!newContent) {
    console.log(`  ⚠️  Skipped: ${reason}. Edit manually using promo/awesome-list-submissions.md`)
    return
  }

  // 4. Create branch in fork
  console.log(`  Creating branch ${branchName}...`)
  await createBranch(fork.owner, fork.repo, branchName, t.branch)
  if (!DRY_RUN) await sleep(1000)

  // 5. Commit file
  console.log(`  Committing change...`)
  await updateFile(
    fork.owner,
    fork.repo,
    t.file,
    branchName,
    newContent,
    sha,
    `Add WalletLens — free privacy-first net worth tracker`,
  )
  if (!DRY_RUN) await sleep(1000)

  // 6. Open PR
  console.log(`  Opening PR...`)
  const pr = await createPR(
    upstreamOwner,
    upstreamRepoName,
    `${fork.owner}:${branchName}`,
    t.branch,
    t.prTitle,
    t.prBody,
  )

  if (DRY_RUN) {
    console.log(`  ✅ [dry-run] Would open PR: "${t.prTitle}"`)
  } else {
    console.log(`  ✅ PR opened: ${pr.html_url}`)
  }
}

async function main() {
  if (!GH_TOKEN && !DRY_RUN) {
    console.error('❌ Set GH_TOKEN env var. Get one at https://github.com/settings/tokens/new (scope: public_repo)')
    process.exit(1)
  }

  const targets = ONLY ? TARGETS.filter(t => t.slug === ONLY) : TARGETS
  if (ONLY && targets.length === 0) {
    console.error(`❌ Unknown slug "${ONLY}". Valid slugs: ${TARGETS.map(t => t.slug).join(', ')}`)
    process.exit(1)
  }

  console.log(`🚀 WalletLens Awesome List Submitter`)
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log(`   Targets: ${targets.map(t => t.slug).join(', ')}\n`)

  let myUsername = YOUR_GH_USERNAME
  if (!DRY_RUN && !myUsername) {
    myUsername = await getMe()
    console.log(`   GitHub user: ${myUsername}\n`)
  }

  for (const target of targets) {
    try {
      await processTarget(target, myUsername)
      // Respectful rate limiting between submissions
      if (!DRY_RUN) await sleep(4000)
    } catch (err) {
      console.error(`  ❌ ${target.slug}: ${err.message}`)
    }
  }

  console.log('\n✅ Done.')
  if (!DRY_RUN) {
    console.log('\nNext steps:')
    console.log('  1. Check your GitHub notifications for PR feedback from maintainers')
    console.log('  2. Respond to any review requests within 24 hours')
    console.log('  3. Run again in 30 days if PRs are merged — new articles = re-submit with updated entry')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
