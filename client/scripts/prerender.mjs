// Build-time prerender — runs after `vite build`.
//
// WalletLens is a client-side SPA, so the raw HTML for every route is the same
// near-empty #root shell. Search crawlers and ad-network reviewers (e.g. Google
// AdSense) that don't fully execute JS therefore see "no content" → the site
// gets flagged as thin / low-value.
//
// This script injects REAL static HTML (full article text, homepage copy,
// titles, meta, canonical, JSON-LD) into per-route index.html files so crawlers
// get the actual content. React still mounts normally and replaces #root on
// load, so users get the full interactive app.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POSTS, relatedPosts } from '../src/data/blogPosts.js'
import { TRACK_COINS, TRACK_STOCKS, TRACK_METALS, ALL_TRACK_ASSETS } from '../src/data/trackCoins.js'
import { CALCULATORS } from '../src/data/calculators.js'
import { GLOSSARY } from '../src/data/glossary.js'
import { COMPARISONS } from '../src/data/comparisons.js'
import { PRICE_ASSETS } from '../src/data/priceAssets.js'
import { AR_FEATURES, AR_LANDING, AR_COMPARISONS, AR_VS } from '../src/data/arabic.js'
import { AR_POSTS } from '../src/data/arabicBlog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '..', 'dist')
const PUBLIC = resolve(__dirname, '..', 'public')
const ORIGIN = 'https://walletlens.live'
const OG_IMAGE = `${ORIGIN}/og-image.png`
const TODAY = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

const template = readFileSync(resolve(DIST, 'index.html'), 'utf8')

// ── helpers ────────────────────────────────────────────────────────────────
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// Parse a loose post date like "May 2026" → ISO "2026-05-01" for structured
// data. Falls back to the build date if it can't be parsed.
const MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 }
function postIsoDate(date) {
  if (!date) return TODAY
  // "Month DD, YYYY" (daily recaps) — keep the exact day.
  const dm = String(date).match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (dm && MONTHS[dm[1].toLowerCase()]) {
    return `${dm[3]}-${String(MONTHS[dm[1].toLowerCase()]).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}`
  }
  // "Month YYYY" (evergreen guides) — default to the 1st.
  const m = String(date).match(/([A-Za-z]+)\s+(\d{4})/)
  if (!m) return TODAY
  const mon = MONTHS[m[1].toLowerCase()]
  if (!mon) return TODAY
  return `${m[2]}-${String(mon).padStart(2, '0')}-01`
}

// Inline markdown: **bold** and [text](url)
function inline(text) {
  let out = esc(text)
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${esc(u)}">${t}</a>`)
  return out
}

// Strip the markdown subset to plain text (for JSON-LD answer text).
function stripMd(s) {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Convert the post markdown subset (## h2, **bold** lines, - lists, | tables)
// into an HTML string — mirrors renderMarkdown() in Blog.jsx.
function mdToHtml(text) {
  const lines = text.trim().split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('### ')) {
      out.push(`<h3>${inline(line.slice(4))}</h3>`)
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`)
    } else if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) { items.push(`<li>${inline(lines[i].slice(2))}</li>`); i++ }
      out.push(`<ul>${items.join('')}</ul>`); continue
    } else if (line.startsWith('| ')) {
      const rows = []
      // Match any pipe-led line so the |---| separator (which starts with "|-",
      // not "| ") doesn't break the group; the separator row is skipped below.
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        if (!lines[i].includes('---')) rows.push(lines[i].split('|').filter(c => c.trim()).map(c => c.trim()))
        i++
      }
      if (rows.length) {
        const head = `<tr>${rows[0].map(c => `<th>${inline(c)}</th>`).join('')}</tr>`
        const body = rows.slice(1).map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
        out.push(`<table class="blog-table"><thead>${head}</thead><tbody>${body}</tbody></table>`)
      }
      continue
    } else if (line.trim() !== '') {
      out.push(`<p>${inline(line)}</p>`)
    }
    i++
  }
  return out.join('\n')
}

// Build a page from the template: swap title/description/canonical/OG/Twitter
// and inject the static content as the first child of #root (React wipes it on
// mount, so it's purely for crawlers / no-JS fetches).
// alternates: [{ hreflang, path }] — emits <link rel="alternate" hreflang>
// for international SEO (tells Google which URLs are language variants of each
// other). Pass for any page that has an English↔Arabic counterpart.
// GitHub Pages serves every route as a directory (route/index.html) and 301s
// /route → /route/. Canonical, og:url, hreflang, sitemap and internal links
// must therefore all use the trailing-slash form — otherwise Google reports
// "Page with redirect" and "Duplicate, Google chose different canonical".
const withSlash = (p) => (p === '/' || p.endsWith('/') ? p : p + '/')

// Keep meta descriptions within Google's ~160-char display window so the
// snippet shown in search results ends cleanly instead of being truncated
// mid-word by the engine. Prefers a sentence boundary; falls back to the last
// word boundary + ellipsis. Anything already within budget is returned as-is.
// Append the " | WalletLens" brand suffix to a title only when the result
// still fits Google's ~60-char title display. For long editorial titles the
// brand is dropped so the keyword-rich part shows in full instead of the brand
// being truncated mid-word. (Brand is still conveyed via og:site_name + JSON-LD.)
const BRAND_SUFFIX = ' | WalletLens'
const brandTitle = (t) => (t.length + BRAND_SUFFIX.length <= 60 ? t + BRAND_SUFFIX : t)

function clampDesc(s, max = 158) {
  if (!s || s.length <= max) return s
  const slice = s.slice(0, max + 1)
  const sentEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (sentEnd >= 100) return s.slice(0, sentEnd + 1).trim()
  const sp = slice.lastIndexOf(' ')
  // Trim a dangling word and any trailing connector punctuation so the snippet
  // reads "fully free…" rather than "fully free,…".
  return (sp > 0 ? s.slice(0, sp) : s.slice(0, max)).replace(/[\s,;:.—–-]+$/, '') + '…'
}

// canonicalOverride: use a different URL for the canonical tag than `path`
//   (e.g. Arabic /ar/vs/ pages → English /vs/ canonical to avoid "Duplicate,
//   Google chose different canonical").
// ogType: 'article' | 'website' (default). Blog posts pass 'article'.
// published / modified: ISO date strings for article:published_time /
//   article:modified_time — only emitted when ogType === 'article'.
function buildPage({ path, canonicalOverride, title, description, bodyHtml, jsonLd, lang = 'en', dir = 'ltr', alternates, noindex = false, ogType = 'website', published, modified }) {
  const canonUrl = ORIGIN + withSlash(canonicalOverride || path)
  const pageUrl  = ORIGIN + withSlash(path)
  description = clampDesc(description)
  let html = template
  if (lang !== 'en' || dir !== 'ltr') {
    html = html.replace(/<html[^>]*>/, `<html lang="${lang}" dir="${dir}">`)
  }
  // og:type — "article" for blog posts gives social platforms (Facebook,
  // LinkedIn, Discord, Slack) a rich article card and lets Google read the
  // publish/modify dates from the page head as well as from JSON-LD.
  if (ogType !== 'website') {
    html = html.replace(/(<meta property="og:type" content=")[^"]*(")/, `$1${esc(ogType)}$2`)
  }
  if (ogType === 'article') {
    const tags = []
    if (published) tags.push(`  <meta property="article:published_time" content="${esc(published)}" />`)
    if (modified)  tags.push(`  <meta property="article:modified_time" content="${esc(modified)}" />`)
    tags.push(`  <meta property="article:publisher" content="${ORIGIN}/" />`)
    if (tags.length) html = html.replace('</head>', `${tags.join('\n')}\n  </head>`)
  }
  // Templated SEO pages (track/price/calculator) are kept live for users but
  // excluded from Google's index to avoid "scaled content" / low-value flags
  // (AdSense + Search quality). follow lets crawlers still pass link equity.
  if (noindex) {
    html = html.replace(
      /<meta name="robots" content="[^"]*"\s*\/?>/,
      '<meta name="robots" content="noindex, follow" />'
    )
  }
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(/(<meta name="description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/,         `$1${esc(canonUrl)}$2`)
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/,  `$1${esc(title)}$2`)
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/,    `$1${esc(pageUrl)}$2`)
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/,  `$1${esc(title)}$2`)
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
  if (alternates && alternates.length) {
    const links = alternates.map(a =>
      `  <link rel="alternate" hreflang="${a.hreflang}" href="${esc(ORIGIN + withSlash(a.path))}" />`
    ).join('\n')
    html = html.replace('</head>', `${links}\n  </head>`)
  }
  if (jsonLd) {
    const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
    // Escape "<" so content containing "</script>" can't break out of the JSON-LD block.
    const scripts = blocks.map(b => `  <script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`).join('\n')
    html = html.replace('</head>', `${scripts}\n  </head>`)
  }
  // Hidden-but-crawlable content block, injected as first child of #root.
  // z-index:0 + first-child: the loading splash (fixed, z-index:0, later in the
  // DOM) paints over this for real users, while crawlers/no-JS fetches still
  // read the full text. React wipes #root (and this block) on mount.
  // Internal links get a trailing slash so crawlers never follow a 301 hop
  // (only bare paths like /track/bitcoin — anchors/queries/files untouched).
  const slashedBody = bodyHtml.replace(/href="(\/[a-z0-9\-\/]*[a-z0-9\-])"/gi, 'href="$1/"')
  const seo = `<div id="prerender-content" dir="${dir}" style="position:absolute;left:0;top:0;width:100%;z-index:0;padding:2rem 1.25rem;color:#e7eaf0;font-family:system-ui,-apple-system,sans-serif;line-height:1.7">${slashedBody}</div>`
  html = html.replace('<div id="root">', `<div id="root">${seo}`)
  return html
}

// Convenience: hreflang set for an EN/AR pair (+ x-default → English).
function hreflangPair(enPath, arPath) {
  return [
    { hreflang: 'en', path: enPath },
    { hreflang: 'ar', path: arPath },
    { hreflang: 'x-default', path: enPath },
  ]
}

// Build a visible FAQ section + matching FAQPage JSON-LD from one source, so
// the structured data always matches the on-page text (a Google requirement)
// and AI answer engines can extract clean, citable Q&A.
//   faqs: [{ q, a }]  →  { html, jsonLd }
function faqBlock(faqs) {
  const html = `<h2>Frequently asked questions</h2>\n` + faqs.map(f =>
    `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`
  ).join('\n')
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
  return { html, jsonLd }
}

// HowTo JSON-LD from a title + ordered steps (string[]). Answer engines and
// Google surface HowTo steps directly for "how to …" queries.
function howToJsonLd(name, steps) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    step: steps.map((s, i) => ({
      '@type': 'HowToStep', position: i + 1, name: s, text: s,
    })),
  }
}

function write(routePath, html) {
  const dir = routePath === '/' ? DIST : resolve(DIST, routePath.replace(/^\//, ''))
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'index.html'), html, 'utf8')
  console.log('prerendered', routePath)
}

// ── Homepage ─────────────────────────────────────────────────────────────────
const homeBody = `
<h1>WalletLens — Free Portfolio Tracker: Crypto, Stocks, Gold &amp; Net Worth</h1>
<p>WalletLens is a <strong>free portfolio tracker</strong> and <strong>free net worth tracker</strong> for <strong>crypto, US stocks, gold, silver, bonds, cash and FX</strong> — all in one private dashboard. Track and manage all your investments in one place with no account, no subscription, and your data kept on your device. The best free alternative to Kubera, CoinStats, and Personal Capital.</p>
<h2>Why WalletLens is the best free portfolio tracker</h2>
<ul>
<li><strong>No account required</strong> — open the app and start tracking instantly. No sign-up, no email, no password.</li>
<li><strong>Track crypto and stocks together</strong> — Bitcoin, Ethereum, and 10,000+ coins alongside Apple, Tesla, Nvidia, ETFs, gold, silver, and cash in one net-worth total.</li>
<li><strong>100% free</strong> — no paid tier, no premium paywall, no subscription. Every feature is free forever.</li>
<li><strong>Private portfolio tracker</strong> — data stays in your browser's localStorage. Nothing is sent to a server.</li>
<li><strong>AI portfolio analysis</strong> — portfolio health score A–F, diversification grade, risk scanner, stress test, and rebalance planner — all on your device.</li>
<li><strong>Import from screenshot</strong> — <a href="/import-portfolio-from-screenshot">photograph any exchange, broker or wallet screen</a>; AI reads it into your portfolio.</li>
<li><strong>Voice import (English &amp; Arabic)</strong> — <a href="/add-holdings-by-voice">speak your trades hands-free</a>, AI logs them instantly.</li>
<li><strong>Excel / CSV import &amp; export</strong> — <a href="/export-portfolio-to-excel">download your portfolio as a CSV</a> for Excel, Google Sheets, or your accountant; import a spreadsheet to bulk-add holdings.</li>
<li><strong>Crypto tax report export</strong> — <a href="/crypto-portfolio-tax-report">export your full transaction history</a> as a CSV for Koinly, CoinTracker, TurboTax, or your tax professional.</li>
</ul>
<h2>What you can do with WalletLens</h2>
<ul>
<li><strong>Track your whole net worth</strong> across every asset class in a single dashboard with live prices.</li>
<li><strong>Investment performance tracker</strong> — see your P&amp;L, ROI, and cost basis in dollars and percentage, broken down by asset and category.</li>
<li><strong>AI portfolio analysis</strong> — health score, personalised Fear &amp; Greed gauge, stress tests, entry quality, and a rebalance planner, all computed on your device.</li>
<li><strong>Multi-target sell plans</strong> — set crypto price targets and the percentage of each holding to sell, with live progress bars.</li>
<li><strong>Whale tracker</strong> — real-time large Bitcoin transactions and volume anomalies.</li>
<li><strong>Private by design</strong> — portfolio tracker with no bank account link required; no exchange API keys needed.</li>
</ul>
<h2>Free portfolio tracker vs paid alternatives</h2>
<p>WalletLens is a free alternative to every paid portfolio tracker:</p>
<ul>
<li><strong>Free alternative to Kubera</strong> — Kubera costs $199/yr. WalletLens is free forever, covers the same asset classes, and keeps data on your device.</li>
<li><strong>Free alternative to CoinStats</strong> — WalletLens is free with no account; CoinStats requires sign-up and a paid plan for full features.</li>
<li><strong>Free alternative to Personal Capital / Empower</strong> — WalletLens requires no bank login and no account; Empower upsells wealth-management services.</li>
<li><strong>Free alternative to CoinTracker / Delta</strong> — WalletLens tracks stocks, gold and FX too, not just crypto, and stores everything locally.</li>
</ul>
<h2>Track popular cryptocurrencies free</h2>
<ul>
${TRACK_COINS.map(c => `<li><a href="/track/${c.slug}">Track ${esc(c.name)} (${esc(c.symbol)})</a></li>`).join('\n')}
</ul>
<h2>Track US stocks &amp; ETFs free</h2>
<ul>
${TRACK_STOCKS.map(c => `<li><a href="/track/${c.slug}">Track ${esc(c.name)} (${esc(c.symbol)})</a></li>`).join('\n')}
</ul>
<h2>Track precious metals free</h2>
<ul>
${TRACK_METALS.map(c => `<li><a href="/track/${c.slug}">Track ${esc(c.name)} (${esc(c.symbol)})</a></li>`).join('\n')}
</ul>
<h2>Free profit &amp; ROI calculators</h2>
<ul>
${CALCULATORS.filter(c => c.type !== 'general').map(c => `<li><a href="/calculator/${c.slug}">${esc(c.name)}${c.type === 'stock' ? ' stock' : ''} profit calculator</a></li>`).join('\n')}
<li><a href="/calculator/crypto-profit-calculator">Crypto profit calculator (any coin)</a></li>
<li><a href="/calculator/investment-profit-calculator">Investment profit calculator (any asset)</a></li>
<li><a href="/rebalancing-calculator">Portfolio rebalancing calculator</a></li>
</ul>
<h2>Live prices</h2>
<ul>
${PRICE_ASSETS.map(a => `<li><a href="/price/${a.slug}">${esc(a.name)} price today (${esc(a.symbol)})</a></li>`).join('\n')}
</ul>
<h2>Compare WalletLens</h2>
<ul>
${COMPARISONS.map(c => `<li><a href="/vs/${c.slug}">WalletLens vs ${esc(c.competitor)}</a></li>`).join('\n')}
</ul>
<h2>Investing &amp; crypto glossary</h2>
<ul>
${GLOSSARY.map(t => `<li><a href="/learn/${t.slug}">What is ${esc(t.term)}?</a></li>`).join('\n')}
</ul>
<h2>Guides &amp; articles</h2>
<ul>
${POSTS.map(p => `<li><a href="/blog/${p.slug}">${esc(p.title)}</a> — ${esc(p.summary)}</li>`).join('\n')}
</ul>
<p><a href="/dashboard">Open the WalletLens dashboard</a> · <a href="/free-net-worth-tracker">Free net worth tracker comparison</a> · <a href="/blog">Read the blog</a> · <a href="/about">About</a></p>
`
write('/', buildPage({
  path: '/',
  title: 'WalletLens — Free Portfolio Tracker with Live Prices',
  description: 'Track crypto, stocks, gold & cash in one free dashboard — live prices, AI analysis, fear & greed index. No account. Your data stays on your device. 100% free.',
  bodyHtml: homeBody,
  jsonLd: [
    // WebApplication + Organization are emitted once site-wide from the global
    // JSON-LD in index.html (single canonical instance, one aggregateRating).
    // The homepage only adds its page-specific FAQPage to avoid duplicate /
    // conflicting entities that Google flags as low-quality structured data.
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Is WalletLens free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens is 100% free with no paid tier, no premium paywall, and no subscription. You can track unlimited assets, use all AI features, and export backups without ever paying.' } },
        { '@type': 'Question', name: 'Do I need an account to use WalletLens?', acceptedAnswer: { '@type': 'Answer', text: 'No. WalletLens requires no sign-up, no email, and no password. Open the app and start tracking immediately. There is no account to hack, leak, or lock you out.' } },
        { '@type': 'Question', name: 'Where is my portfolio data stored?', acceptedAnswer: { '@type': 'Answer', text: "Entirely in your browser's localStorage on your device. WalletLens has no backend database. Your financial data never leaves your device." } },
        { '@type': 'Question', name: 'What assets can I track with WalletLens?', acceptedAnswer: { '@type': 'Answer', text: 'Crypto (10,000+ coins including Bitcoin, Ethereum, Solana), US stocks and ETFs (Apple, Tesla, Nvidia, etc.), gold, silver, platinum, fiat currencies, cash, bonds, and custom assets — all in one live dashboard.' } },
        { '@type': 'Question', name: 'What is the best free net worth tracker?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is a top choice for a free net worth tracker: it covers every asset class (crypto, stocks, gold, cash), needs no account, keeps data private on your device, and includes AI analysis — all at no cost.' } },
        { '@type': 'Question', name: 'Where can I see all my investments in one place?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens combines crypto, US stocks and ETFs, gold and silver, cash, bonds and FX into a single live dashboard with one net-worth total, an allocation breakdown and profit/loss — without linking a bank account and without any subscription.' } },
        { '@type': 'Question', name: 'How can I check if my portfolio is too risky or not diversified?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens runs an on-device AI analysis that gives your portfolio a health score, a diversification grade, a concentration/risk scan and a correlation matrix, so you can see where you are over-exposed — all computed locally, with no account.' } },
        { '@type': 'Question', name: 'What is a good free alternative to CoinStats, Kubera, or Empower?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is a free, no-account alternative that tracks every asset class (not just crypto), keeps your data on your device, and includes AI analysis — with no paid tier, no bank login, and no exchange API connection required.' } },
        { '@type': 'Question', name: 'Can I import my portfolio from a screenshot?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens can read a screenshot of any exchange, broker, or wallet app and automatically extract each asset, amount and price into your portfolio — no manual typing, no CSV, no account required.' } },
        { '@type': 'Question', name: 'Does WalletLens support voice import?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Say your holdings naturally ("I have half a Bitcoin and 20 Apple shares") and WalletLens AI parses your speech into structured holdings. Voice import works in both English and Arabic.' } },
        { '@type': 'Question', name: 'Can I track crypto and stocks in the same portfolio?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens tracks Bitcoin, Ethereum, Solana, and 10,000+ crypto coins alongside US stocks (Apple, Tesla, Nvidia), ETFs, gold, silver, bonds, cash and FX — all in one free dashboard with a single net-worth total.' } },
        { '@type': 'Question', name: 'Is there a free portfolio tracker with no sign up?', acceptedAnswer: { '@type': 'Answer', text: 'Yes — WalletLens is a free portfolio tracker that requires no sign-up, no email, and no account. Open it and start tracking immediately. All your data stays in your browser.' } },
        { '@type': 'Question', name: 'What is the best free alternative to Kubera?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is the best free alternative to Kubera. It tracks the same asset classes (crypto, stocks, gold, fiat), keeps data on your device, requires no account, and is completely free — versus Kubera at $199/year.' } },
        { '@type': 'Question', name: 'What is the best free alternative to CoinStats?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is a free, no-account alternative to CoinStats. It covers crypto, stocks, gold and FX, stores data locally, and has AI analysis — all without a subscription or sign-up.' } },
        { '@type': 'Question', name: 'How do I track my investment ROI for free?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is a free investment ROI tracker: enter your purchase price and quantity for any asset (crypto, stock, gold, etc.) and it shows your profit/loss in dollars and percentage, with AI insights — no account needed.' } },
        { '@type': 'Question', name: 'Is there a portfolio tracker that does not link to my bank account?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens is a private portfolio tracker that never links to a bank account, exchange API, or wallet. You enter holdings manually (or via screenshot/voice import) and all data stays on your device.' } },
        { '@type': 'Question', name: 'What is the best free portfolio tracker in 2026?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is one of the best free portfolio trackers in 2026: it covers every major asset class, requires no account, provides AI analysis, and is 100% free with no paid tier — comparing favorably to Kubera, CoinStats, Delta, and Empower.' } },
        { '@type': 'Question', name: 'Can I analyze portfolio risk for free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens includes a free AI portfolio risk analyzer that scans every holding for concentration risk, volatility grade and health score. It also shows a correlation matrix and diversification grade — all on your device, no account required.' } },
      ],
    },
  ],
}))

// ── Free Net Worth Tracker (comparison landing) ──────────────────────────────
const compareRow = (feat, cells) =>
  `<tr><th scope="row">${esc(feat)}</th>${cells.map((c, i) => `<td${i === 0 ? ' class="us"' : ''}>${esc(c)}</td>`).join('')}</tr>`
const fnwtBody = `
<h1>Free Net Worth Tracker — Track All Your Investments in One Place</h1>
<p>WalletLens is a <strong>free net worth tracker</strong> for managing every asset you own — crypto, US stocks &amp; ETFs, gold, silver, cash and FX — in one private dashboard. No account, no subscription, and no bank logins. Your data stays on your device.</p>
<p><a href="/dashboard">Track your net worth free →</a></p>
<h2>WalletLens vs the popular net worth trackers</h2>
<table>
<thead><tr><th>Feature</th><th>WalletLens</th><th>Empower (Personal Capital)</th><th>Kubera</th><th>CoinStats</th><th>Spreadsheet</th></tr></thead>
<tbody>
${compareRow('Price', ['Free forever', 'Free*', '$199/yr', 'Freemium', 'Free'])}
${compareRow('No account required', ['Yes', 'No', 'No', 'No', 'Yes'])}
${compareRow('Crypto + stocks + metals + cash', ['Yes', 'Yes', 'Yes', 'Crypto-led', 'Manual'])}
${compareRow('Data stays on your device', ['Yes', 'No', 'No', 'No', 'Yes'])}
${compareRow('No bank / exchange login required', ['Yes', 'No', 'Optional', 'No', 'Yes'])}
${compareRow('Built-in AI analysis', ['Yes', 'Limited', 'No', 'Limited', 'No'])}
${compareRow('Live prices & auto-update', ['Yes', 'Yes', 'Yes', 'Yes', 'No'])}
${compareRow('Installable app (PWA)', ['Yes', 'Yes', 'Web', 'Yes', 'No'])}
</tbody>
</table>
<p><small>*Empower (formerly Personal Capital) is free to use but markets paid wealth-management services. Comparison reflects publicly documented features and is for general guidance, not endorsement.</small></p>
<h2>Why choose a free, local-first net worth tracker?</h2>
<ul>
<li><strong>It is genuinely free</strong> — no paid tier, no upsells, no ads on the app.</li>
<li><strong>Every asset class</strong> — crypto, stocks, precious metals, cash and FX combine into one live net-worth total.</li>
<li><strong>Private by design</strong> — holdings are stored only in your browser; nothing is sent to a server and no bank credentials are linked.</li>
<li><strong>AI analysis included</strong> — a portfolio health score, risk scan and the Magic Indicator, computed on your device.</li>
</ul>
<h2>Frequently asked questions</h2>
<h3>What is the best free net worth tracker?</h3>
<p>WalletLens is a strong choice: it tracks your entire net worth across crypto, stocks, gold, cash and FX, needs no account, and keeps data private on your device — all for free.</p>
<h3>Can I manage all my investments in one app for free?</h3>
<p>Yes. WalletLens combines every asset class into a single free dashboard with a live net-worth total, allocation breakdown and AI analysis, with no account or subscription.</p>
<p><a href="/dashboard">Open WalletLens free</a> · <a href="/about">About</a> · <a href="/blog/best-free-net-worth-tracker">Read the full guide</a></p>
`
write('/free-net-worth-tracker', buildPage({
  path: '/free-net-worth-tracker',
  title: 'Free Net Worth Tracker — All Your Investments | WalletLens',
  description: 'A free net worth tracker to manage all your investments in one place — crypto, stocks, gold, silver, cash & FX. No account, no bank logins, data stays on your device. See how WalletLens compares to Empower, Kubera and CoinStats.',
  bodyHtml: fnwtBody,
  jsonLd: [
    // WebApplication is emitted once globally from index.html — not repeated
    // here, to avoid a duplicate/conflicting entity for the same app.
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Free Net Worth Tracker', item: ORIGIN + '/free-net-worth-tracker/' },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'What is the best free net worth tracker?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is a top choice: it tracks your entire net worth across crypto, stocks, gold, cash and FX, needs no account, keeps data private on your device, and is completely free with no paid tier.' } },
        { '@type': 'Question', name: 'Is there a free net worth tracker with no account?', acceptedAnswer: { '@type': 'Answer', text: 'Yes — WalletLens requires no sign-up or email. Open it and start tracking immediately. All your portfolio data stays in your browser and never reaches a server.' } },
        { '@type': 'Question', name: 'How does WalletLens compare to Empower and Kubera?', acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is free with no paid tier. Kubera costs $199/year. Empower is free but upsells wealth management. Both Empower and Kubera require account creation and store data on their servers. WalletLens stores everything locally.' } },
      ],
    },
  ],
  alternates: hreflangPair('/free-net-worth-tracker', '/ar/free-net-worth-tracker'),
}))

// ── Long-tail landing pages ──────────────────────────────────────────────────
// Two genuinely unique, high-intent pages a new domain can realistically rank
// for (far less competition than the "free net worth tracker" head term):
//   1. crypto + stocks together — most trackers do one OR the other
//   2. no-account / no-sign-up — WalletLens's strongest differentiator
// Each is substantial, hand-written content (NOT templated) with its own
// Breadcrumb + FAQ schema, so it adds indexed quality instead of diluting it.

const cryptoStockBody = `
<h1>Crypto &amp; Stock Portfolio Tracker — Track Both in One App</h1>
<p>Most portfolio trackers force a choice: a crypto app for your coins, a separate broker app for your stocks, and a spreadsheet to glue them together. <strong>WalletLens tracks crypto and stocks side by side</strong> — Bitcoin, Ethereum and 10,000+ coins next to Apple, Tesla, Nvidia and any US stock or ETF — in one live dashboard with a single net-worth total. It's <strong>free</strong>, needs <strong>no account</strong>, and keeps your data on your device.</p>
<h2>Why track crypto and stocks together</h2>
<ul>
<li><strong>One real net-worth number.</strong> Your true financial picture isn't "crypto P&amp;L" and "stock P&amp;L" in two apps — it's both combined. WalletLens adds crypto, stocks, gold, cash and FX into one total.</li>
<li><strong>See your real allocation.</strong> Most people don't realise they're 90% crypto until a crash. A combined view shows your crypto-vs-stocks split instantly so you can rebalance.</li>
<li><strong>One P&amp;L, one cost basis.</strong> Track profit, loss and ROI in dollars and percent across every asset class, not per-app.</li>
<li><strong>Uncorrelated by design.</strong> Stocks and crypto don't always move together — seeing them in one place makes diversification obvious.</li>
</ul>
<h2>How WalletLens tracks both</h2>
<ul>
<li><strong>Crypto:</strong> 10,000+ coins with live prices — <a href="/track/bitcoin">Bitcoin</a>, <a href="/track/ethereum">Ethereum</a>, <a href="/track/solana">Solana</a> and more.</li>
<li><strong>US stocks &amp; ETFs:</strong> live quotes for <a href="/track/apple">Apple</a>, <a href="/track/tesla">Tesla</a>, <a href="/track/nvidia">Nvidia</a> and thousands more.</li>
<li><strong>Gold, silver, cash &amp; FX:</strong> round out your full net worth in the same dashboard.</li>
<li><strong>Fast import:</strong> <a href="/import-portfolio-from-screenshot">snap a screenshot</a> of your exchange or broker, or <a href="/add-holdings-by-voice">add holdings by voice</a> — AI does the data entry.</li>
<li><strong>AI analysis:</strong> a health score, diversification grade and risk scan across crypto and stocks together, computed on your device.</li>
</ul>
<h2>Free, private, no account</h2>
<p>WalletLens is 100% free with no paid tier, requires no sign-up or email, and stores your portfolio in your browser — never on a server. It's a private alternative to CoinStats, Delta, Kubera and Empower that covers <em>both</em> crypto and stocks.</p>
<p><strong>Related:</strong> <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/portfolio-tracker-no-account">Portfolio tracker with no account</a> · <a href="/dashboard">Open WalletLens free</a> · <a href="/">Home</a></p>
`
write('/crypto-and-stock-portfolio-tracker', buildPage({
  path: '/crypto-and-stock-portfolio-tracker',
  title: 'Crypto & Stock Portfolio Tracker in One App',
  description: 'Track crypto and stocks together in one free dashboard — Bitcoin, Ethereum & 10,000+ coins next to Apple, Tesla, Nvidia and any US stock or ETF. One net-worth total, no account, data stays on your device.',
  bodyHtml: cryptoStockBody,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Crypto & Stock Portfolio Tracker', item: ORIGIN + '/crypto-and-stock-portfolio-tracker/' },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Can I track crypto and stocks in the same app?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens tracks Bitcoin, Ethereum and 10,000+ crypto coins alongside US stocks and ETFs like Apple, Tesla and Nvidia — plus gold, silver, cash and FX — in one free dashboard with a single net-worth total.' } },
        { '@type': 'Question', name: 'Is there a free app that tracks both crypto and stocks?', acceptedAnswer: { '@type': 'Answer', text: 'Yes — WalletLens is completely free with no paid tier and no account. It combines crypto and stock holdings into one live portfolio with combined P&L, ROI and allocation.' } },
        { '@type': 'Question', name: 'Do I need a broker or exchange API to track stocks and crypto?', acceptedAnswer: { '@type': 'Answer', text: 'No. WalletLens needs no API keys and no bank or broker login. Add holdings manually, by voice, or by screenshot. Your data stays in your browser on your device.' } },
      ],
    },
  ],
}))

const noAccountBody = `
<h1>Portfolio Tracker With No Account — No Sign-Up Required</h1>
<p>Every other portfolio tracker wants your email, a password, and often a bank or exchange login before you can see a single number. <strong>WalletLens needs none of it.</strong> Open it and start tracking instantly — no account, no sign-up, no email. Your portfolio lives in your browser on your device and is never uploaded to a server.</p>
<h2>Why a no-account tracker matters</h2>
<ul>
<li><strong>Nothing to hack or leak.</strong> There's no account database, so there's no honeypot of users' net worth for attackers to steal.</li>
<li><strong>Your holdings stay private.</strong> Your portfolio is stored locally in your browser — WalletLens has no backend that can see what you own.</li>
<li><strong>No lock-outs.</strong> No forgotten passwords, no email verification, no two-factor dance. Just open and track.</li>
<li><strong>Start in seconds.</strong> Add your first holding the moment the app loads.</li>
</ul>
<h2>What you can do without an account</h2>
<ul>
<li><strong>Track everything:</strong> crypto, US stocks &amp; ETFs, gold, silver, cash and FX in one net-worth dashboard.</li>
<li><strong>AI portfolio analysis:</strong> health score, diversification grade, risk scan and stress test — all computed on your device.</li>
<li><strong>Import fast:</strong> <a href="/import-portfolio-from-screenshot">from a screenshot</a> or <a href="/add-holdings-by-voice">by voice</a> — no typing.</li>
<li><strong>Back up &amp; restore:</strong> export your portfolio as a single shareable backup code or an Excel/CSV file — you own your data, not us.</li>
</ul>
<h2>How is it free <em>and</em> private?</h2>
<p>WalletLens has no servers storing your data, so there's nothing to monetise from your holdings and no subscription to charge. It's a genuinely free, no-sign-up alternative to CoinStats, Kubera and Empower — all of which require accounts and store your data on their servers.</p>
<p><strong>Related:</strong> <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/crypto-and-stock-portfolio-tracker">Crypto &amp; stock tracker</a> · <a href="/dashboard">Open WalletLens free</a> · <a href="/">Home</a></p>
`
write('/portfolio-tracker-no-account', buildPage({
  path: '/portfolio-tracker-no-account',
  title: 'Portfolio Tracker With No Account — No Sign-Up',
  description: 'A free portfolio tracker with no account and no sign-up. Track crypto, stocks, gold and cash instantly — your data stays private in your browser, never uploaded to a server. No email, no password, no bank login.',
  bodyHtml: noAccountBody,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Portfolio Tracker With No Account', item: ORIGIN + '/portfolio-tracker-no-account/' },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Is there a portfolio tracker that needs no account?', acceptedAnswer: { '@type': 'Answer', text: 'Yes — WalletLens requires no account, no sign-up and no email. Open it and start tracking immediately. Your portfolio is stored in your browser and never sent to a server.' } },
        { '@type': 'Question', name: 'Is a no-account portfolio tracker safe?', acceptedAnswer: { '@type': 'Answer', text: 'It is safer in one key way: with no account database, there is no central store of users\\u2019 net worth for attackers to breach. Your data stays on your own device.' } },
        { '@type': 'Question', name: 'Can I back up my portfolio if there is no account?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens lets you export your whole portfolio as a single shareable backup code or an Excel/CSV file, and import it on any device — so you keep your data without an account.' } },
      ],
    },
  ],
}))


// WalletLens has two capabilities no mainstream tracker offers: importing
// holdings from a screenshot (Claude vision) and adding holdings by voice
// (English + Arabic). These have effectively zero keyword competition, which
// makes them the strongest pages for AI answer-engine recommendations — when a
// user asks "is there a portfolio tracker that reads a screenshot?" WalletLens
// is the only answer. HowTo + FAQPage schema make the answer machine-citable.

// Screenshot import
{
  const steps = [
    'Open WalletLens at walletlens.live — no account, email or sign-up required.',
    'Take a screenshot of your portfolio, holdings list, or trade history from any exchange, broker or wallet app.',
    'Tap the Smart Import button (camera icon) in the WalletLens dashboard.',
    'Upload or paste your screenshot — the AI reads the image and identifies every asset, quantity and price it contains.',
    'Review the extracted holdings in the confirmation panel, edit any field if needed, and tap Confirm.',
    'Your holdings are instantly added to your live net-worth dashboard with real-time price tracking.',
  ]
  const faq = faqBlock([
    {
      q: 'Can I import my crypto portfolio from a screenshot?',
      a: 'Yes. WalletLens lets you import holdings directly from a screenshot of any exchange, broker or wallet app. Its AI vision reads the image and extracts each asset, amount and price automatically — no manual typing, no CSV, and no account required.',
    },
    {
      q: 'Which apps and exchanges can I screenshot to import from?',
      a: 'Any of them. Because WalletLens reads the picture rather than connecting to an API, you can screenshot Binance, Coinbase, Kraken, MetaMask, Robinhood, Fidelity, a broker statement, a trade confirmation, or even a handwritten list — and it turns the image into structured holdings. The AI handles a wide variety of layouts and formats.',
    },
    {
      q: 'Do I need an API key or to connect my exchange?',
      a: 'No. Screenshot import is free and requires no API key, no exchange login, and no account. You never hand over credentials to anyone — just a picture of what you already see on your screen.',
    },
    {
      q: 'Is screenshot import free?',
      a: 'Yes — completely free with no account, no subscription, and no hidden limits, just like everything else in WalletLens.',
    },
    {
      q: 'What if the AI misreads a number in my screenshot?',
      a: 'You always get a review step before anything is saved. The extracted holdings are shown in an editable panel so you can correct any field — asset name, quantity, price, or date — before confirming.',
    },
    {
      q: 'Can I import a screenshot that shows multiple assets?',
      a: 'Yes. If your screenshot shows a full holdings page with ten or twenty assets, the AI reads them all at once and creates a holding entry for each. You review and confirm the full list in one step.',
    },
    {
      q: 'Is my screenshot uploaded to a server?',
      a: 'The image is sent to the WalletLens AI service for processing but is not stored — it is processed once to extract the holdings data and then discarded. The extracted holdings are saved only to your browser\'s local storage, not to any server.',
    },
  ])
  const body = `
<h1>Import Your Portfolio From a Screenshot</h1>
<p>WalletLens is the only free net-worth tracker that can build your entire portfolio from a <strong>screenshot</strong>. Photograph or capture your holdings on any exchange, broker or wallet app, and WalletLens reads the image with AI — extracting every asset, quantity and price automatically. No manual entry. No CSV. No account. No API key. Just a picture.</p>
<p><a href="/dashboard">Try screenshot import free →</a></p>

<h2>Why screenshot import changes how people track portfolios</h2>
<p>The biggest barrier to portfolio tracking is the setup. If you hold assets on three exchanges, a broker, and a hardware wallet, manually entering every holding takes 30–60 minutes. Most people give up partway through and end up tracking only part of their portfolio — which makes the data almost useless.</p>
<p>Screenshot import eliminates that barrier entirely. Instead of typing "I hold 0.3412 BTC, 2.5 ETH, 150 ADA…" you open each exchange app, take a screenshot of the holdings page, and upload it to WalletLens. The AI reads the image and creates the entries for you. A full five-exchange portfolio migration can take under three minutes.</p>
<p>The other reason screenshot import is uniquely powerful is that it works with <em>anything</em>. Most "automatic import" solutions require an API integration — which means the tracker only works with whichever exchanges have partnered with it, and you must create API keys with read access to your account. Screenshot import has no such limitation. If you can see it on your screen, WalletLens can read it.</p>

<h2>How to import a portfolio from a screenshot</h2>
<ol>
${steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol>
<p>The entire process — from opening the app to seeing your holdings tracked live with real-time prices — takes under two minutes for most portfolios.</p>
<p><a href="/dashboard">Open WalletLens and import a screenshot →</a></p>

<h2>What exchanges and apps are supported</h2>
<p>Screenshot import works with any exchange, broker, or wallet app — because it reads the visual layout of the screen rather than connecting to an API. Supported sources include:</p>
<ul>
<li><strong>Crypto exchanges:</strong> Binance, Coinbase, Kraken, OKX, Bybit, KuCoin, Gate.io, Bitfinex, Gemini, Crypto.com</li>
<li><strong>Wallets:</strong> MetaMask, Trust Wallet, Phantom, Ledger Live, Exodus, Atomic Wallet, Rainbow</li>
<li><strong>Stock brokers:</strong> Robinhood, Fidelity, Charles Schwab, TD Ameritrade, Interactive Brokers, eToro, Trading 212</li>
<li><strong>Other:</strong> Brokerage account statements, trade confirmation emails, bank statements showing investment balances, handwritten or printed holding lists</li>
</ul>
<p>If the layout is unusual or the AI misses a field, the editable review step lets you correct it before saving — so even unsupported formats work in practice.</p>

<h2>What asset types can be extracted</h2>
<p>WalletLens tracks crypto, US stocks, metals (gold, silver, platinum), and cash. Screenshot import supports all of them:</p>
<ul>
<li><strong>Cryptocurrency:</strong> Bitcoin (BTC), Ethereum (ETH), Solana (SOL), and thousands of altcoins by ticker or full name</li>
<li><strong>US stocks and ETFs:</strong> Any asset with a valid ticker symbol (AAPL, TSLA, SPY, QQQ, etc.)</li>
<li><strong>Precious metals:</strong> Gold and silver in grams, troy ounces, or kilograms</li>
<li><strong>Stablecoins:</strong> USDT, USDC, DAI — tracked separately from invested assets so your P&amp;L stays honest</li>
</ul>

<h2>Screenshot import vs other import methods</h2>
<p>WalletLens offers several ways to add holdings. Here is how they compare:</p>
<ul>
<li><strong>Screenshot import</strong> — fastest for migrating from another app or importing a full exchange balance at once. Works with any source. Best for: initial setup, periodic bulk imports.</li>
<li><strong><a href="/add-holdings-by-voice">Voice import</a></strong> — fastest for adding individual trades as you make them. Say "I bought 0.5 ETH at $3,200" and the trade is logged. Best for: recording trades hands-free on mobile.</li>
<li><strong>Manual entry</strong> — most precise, best for correcting an entry or entering a single asset with exact historical dates. Best for: fine-grained control.</li>
<li><strong>On-chain wallet import</strong> — paste an Ethereum, Bitcoin, or Solana address and WalletLens fetches live balances automatically. Best for: self-custody wallets without an exchange UI.</li>
</ul>

<h2>Privacy and data security</h2>
<p>Your screenshot is sent to the WalletLens AI processing service only to extract the holdings data. It is not stored, logged, or shared. Once the AI returns the extracted data, the image is discarded. The extracted holdings are saved exclusively to your browser's local storage — they never reach a WalletLens server, and they are not associated with any account (because there are no accounts).</p>
<p>This means your financial data is as private as anything stored on your own device. No employee of WalletLens can see your holdings, and there is no database to be breached.</p>

${faq.html}

<p><strong>Related:</strong> <a href="/add-holdings-by-voice">Add holdings by voice</a> · <a href="/export-portfolio-to-excel">Export portfolio to Excel</a> · <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/">Home</a></p>`
  write('/import-portfolio-from-screenshot', buildPage({
    path: '/import-portfolio-from-screenshot',
    title: 'Import Your Portfolio From a Screenshot — Free | WalletLens',
    description: 'WalletLens reads a screenshot of any exchange, broker or wallet and extracts every holding automatically — no manual entry, no API key, no account. Free AI screenshot portfolio import.',
    bodyHtml: body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Import From Screenshot', item: ORIGIN + '/import-portfolio-from-screenshot/' },
        ],
      },
      howToJsonLd('How to import a portfolio from a screenshot', steps),
      faq.jsonLd,
    ],
    alternates: hreflangPair('/import-portfolio-from-screenshot', '/ar/import-portfolio-from-screenshot'),
  }))
}

// Voice import
{
  const steps = [
    'Open WalletLens at walletlens.live — no account or sign-up needed.',
    'Tap the microphone (Voice Import) button in the dashboard.',
    'Allow microphone access when your browser prompts — required only for recording.',
    'Say your holdings or trades naturally: "I bought half a Bitcoin at sixty-five thousand, and twenty Apple shares at one eighty-five."',
    'WalletLens transcribes your speech with AI, parses each asset, quantity and price, and shows you the results in a review panel.',
    'Edit any field if needed, then confirm — the holdings are added to your live net-worth dashboard instantly.',
  ]
  const faq = faqBlock([
    {
      q: 'Can I add my holdings by voice?',
      a: 'Yes. WalletLens lets you add holdings just by speaking — say something like "I bought half a Bitcoin at 45,000 and ten Tesla shares at 250" and its AI parses your speech into structured holdings. No typing and no account required.',
    },
    {
      q: 'Does voice import work in Arabic?',
      a: 'Yes. WalletLens supports voice import in both English and Arabic, with full handling for Arabic number words, asset name transliterations, and regional phrasing. You can speak your portfolio in either language and the AI understands both.',
    },
    {
      q: 'Is voice import free?',
      a: 'Yes — completely free, no subscription, no account, no API key required. Voice import is built into WalletLens and works the same as every other feature.',
    },
    {
      q: 'Can I record multiple trades in one sentence?',
      a: 'Yes. You can say "I have half a Bitcoin, twenty Apple shares, and two ounces of gold" and WalletLens will parse all three into separate holdings in one recording. You can also add trades one at a time.',
    },
    {
      q: 'What assets can I add by voice?',
      a: 'Any asset WalletLens tracks — Bitcoin, Ethereum, Solana, and thousands of cryptocurrencies; US stocks and ETFs by company name or ticker; gold and silver in any common unit; and stablecoins. If you are not sure of the exact name, just say what you know and the AI will match it.',
    },
    {
      q: 'Does voice import work on iPhone and Android?',
      a: 'Yes. Voice import uses the browser\'s built-in Web Speech API, which is supported in Chrome on Android and Safari on iOS. For the best experience on iOS, use Safari; on Android, use Chrome.',
    },
    {
      q: 'What happens to my audio recording?',
      a: 'Your audio is transcribed by the browser\'s speech API (no audio leaves your device at the recording stage). The resulting text transcript is sent to the WalletLens AI service to extract structured holdings — it is processed once and not stored. Your portfolio data is saved only in your browser\'s local storage.',
    },
  ])
  const body = `
<h1>Add Your Holdings by Voice</h1>
<p>WalletLens is the only free net-worth tracker you can update just by <strong>speaking</strong>. Say your trades out loud — "I bought half a Bitcoin at 65K and twenty Apple shares at 185" — and WalletLens AI turns your speech into structured portfolio entries automatically. Works in <strong>English and Arabic</strong>. No typing, no spreadsheet, no account.</p>
<p><a href="/dashboard">Try voice import free →</a></p>

<h2>Why voice is the fastest way to log a trade</h2>
<p>Recording a trade manually involves opening an app, searching for the asset, typing the quantity, entering the price, selecting a date, and saving. That is five to eight taps for each trade. If you made three trades today, that is 15–25 taps before your portfolio is up to date.</p>
<p>With voice import, the entire flow collapses into one sentence. While the trade is still fresh — right after you execute it on your exchange — you say what you did and WalletLens logs it. No navigating menus, no keyboard, no risk of a typo in a price. It works while you are walking, commuting, or have your hands full.</p>
<p>For active traders who execute multiple positions per week, voice import saves meaningful time every session. For casual investors who make one or two trades per month, it makes updating the portfolio feel effortless rather than a chore to defer.</p>

<h2>How to add holdings by voice</h2>
<ol>
${steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol>
<p>The review step is designed so you can quickly scan the AI's interpretation and fix anything in seconds. Most of the time, no edits are needed.</p>
<p><a href="/dashboard">Open WalletLens and add holdings by voice →</a></p>

<h2>Natural language phrases the AI understands</h2>
<p>You do not need to memorise a command syntax. Voice import understands conversational English and Arabic including many natural variations:</p>
<ul>
<li>"I bought half a Bitcoin at sixty-five thousand dollars last Tuesday."</li>
<li>"Add twenty shares of Apple at one eighty-five."</li>
<li>"I have two ounces of gold and one ounce of platinum."</li>
<li>"I bought 0.3 ETH at three thousand two hundred and fifty SOL at one forty."</li>
<li>"I picked up ten thousand USDT as a stablecoin reserve."</li>
<li>"Sold five Tesla shares at two twenty."</li>
</ul>
<p>You can record a single holding or an entire portfolio summary in one utterance. The AI parses each distinct asset–quantity–price group and creates a separate entry for each.</p>

<h2>Supported languages: English and Arabic</h2>
<p>WalletLens voice import is available in two languages, making it the only multilingual voice-import portfolio tracker available free:</p>
<ul>
<li><strong>English</strong> — standard US/UK English, including informal phrasing like "sixty-five K" for $65,000, "half a Bitcoin" for 0.5 BTC, and "a grand" for $1,000.</li>
<li><strong>Arabic (العربية)</strong> — full support for Arabic number words, fractional expressions, and asset name transliterations. The Arabic voice import page is at <a href="/ar/add-holdings-by-voice">/ar/add-holdings-by-voice</a> for Arabic-speaking users.</li>
</ul>

<h2>What asset types you can add by voice</h2>
<ul>
<li><strong>Cryptocurrency:</strong> Bitcoin (BTC), Ethereum (ETH), Solana (SOL), and thousands of others by name or ticker</li>
<li><strong>US stocks and ETFs:</strong> Any stock by company name ("Apple", "Tesla") or ticker ("AAPL", "TSLA")</li>
<li><strong>Precious metals:</strong> Gold and silver in grams, ounces, kilograms, or troy ounces</li>
<li><strong>Stablecoins:</strong> USDT, USDC, DAI — treated as cash in your net worth</li>
</ul>

<h2>Voice import vs other import methods</h2>
<p>WalletLens gives you several ways to build your portfolio. Choose based on your situation:</p>
<ul>
<li><strong>Voice import</strong> — fastest for recording individual trades as you make them. Best for: staying up to date hands-free.</li>
<li><strong><a href="/import-portfolio-from-screenshot">Screenshot import</a></strong> — fastest for bulk-importing an entire exchange balance at once. Best for: initial portfolio setup or migrating from another app.</li>
<li><strong>Manual entry</strong> — best for precise control, exact historical dates, or correcting an entry. Best for: fine-tuning.</li>
<li><strong>On-chain wallet import</strong> — paste a wallet address and WalletLens auto-imports all holdings. Best for: self-custody wallets.</li>
</ul>

<h2>Privacy and data security</h2>
<p>Your microphone audio is processed by your browser's built-in speech recognition — no raw audio is transmitted from your device to WalletLens. The text transcript is sent to the WalletLens AI service to extract structured trade data. This transcript is processed once and not stored. Your final portfolio data is saved only in your browser's local storage and never reaches any WalletLens server.</p>

${faq.html}

<p><strong>Related:</strong> <a href="/import-portfolio-from-screenshot">Import from a screenshot</a> · <a href="/export-portfolio-to-excel">Export portfolio to Excel</a> · <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/">Home</a></p>`
  write('/add-holdings-by-voice', buildPage({
    path: '/add-holdings-by-voice',
    title: 'Add Holdings by Voice — Free, English & Arabic | WalletLens',
    description: 'WalletLens lets you log trades just by speaking — AI turns your voice into structured holdings in English or Arabic. Free, no account, hands-free, data stays on device.',
    bodyHtml: body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Add Holdings by Voice', item: ORIGIN + '/add-holdings-by-voice/' },
        ],
      },
      howToJsonLd('How to add holdings by voice', steps),
      faq.jsonLd,
    ],
    alternates: hreflangPair('/add-holdings-by-voice', '/ar/add-holdings-by-voice'),
  }))
}

// ── Export feature pages ──────────────────────────────────────────────────────
// Three high-intent export pages targeting users who want to take their data out
// of WalletLens (or bring it in via spreadsheet). These keywords have almost no
// competition for a free, no-account tool and capture users at the "committed
// tracker" stage — the highest-retention user segment.

// Export to Excel / CSV
{
  const steps = [
    'Open WalletLens at walletlens.live — no account needed.',
    'Go to the Settings tab (gear icon) in the dashboard.',
    'Tap "Export CSV" under the Data section.',
    'Your browser downloads a .csv file containing all your holdings: asset, quantity, average cost, current price, P&L, and allocation percentage.',
    'Open the file in Microsoft Excel, Google Sheets, LibreOffice Calc, or any spreadsheet app to analyse or reformat your data.',
  ]
  const faq = faqBlock([
    {
      q: 'Can I export my portfolio to Excel for free?',
      a: 'Yes. WalletLens exports your complete portfolio as a CSV file — compatible with Microsoft Excel, Google Sheets, and any other spreadsheet app — entirely free, with no account or subscription required.',
    },
    {
      q: 'What data is included in the CSV export?',
      a: 'The export includes each asset\'s name, ticker, quantity, average cost basis, current live price, unrealised P&L in dollars and percentage, and your allocation percentage. Transaction history is also available as a separate export.',
    },
    {
      q: 'Can I import the CSV back into WalletLens?',
      a: 'Yes. WalletLens can read back a CSV or Excel file you have exported or edited, so you can make bulk changes in a spreadsheet and re-import them. This is useful for correcting historical cost basis across many holdings at once.',
    },
    {
      q: 'Can I use the export for tax purposes?',
      a: 'The CSV export gives you a complete record of your holdings and average cost basis, which is useful as input for a tax calculation. For a full capital-gains tax report including buy/sell dates and proceeds, see the transaction history export. WalletLens does not give tax advice; consult a qualified tax professional for your specific situation.',
    },
    {
      q: 'Does the export work in Google Sheets?',
      a: 'Yes. Download the CSV and upload it to Google Drive, then open it with Google Sheets. All columns import cleanly. You can also connect it to a Google Sheets IMPORTDATA formula if you want to keep the data refreshing automatically.',
    },
  ])
  const body = `
<h1>Export Your Portfolio to Excel or CSV — Free</h1>
<p>WalletLens lets you export your entire portfolio as a <strong>CSV file</strong> — ready to open in Microsoft Excel, Google Sheets, or any spreadsheet app. Free, instant, no account required. Your holdings, cost basis, live prices, and P&amp;L in one downloadable file.</p>
<p><a href="/dashboard">Open WalletLens and export your portfolio →</a></p>

<h2>Why export your portfolio to Excel?</h2>
<p>WalletLens does the live tracking. Sometimes you need the data in a spreadsheet — to build a custom analysis, prepare for tax season, share with a financial advisor, or create a report in a format your accountant expects. The CSV export bridges that gap without you having to manually copy numbers out of a screen.</p>
<p>Common uses for the portfolio CSV export:</p>
<ul>
<li><strong>Tax preparation:</strong> Import into a tax tool or share with your accountant as the starting point for a capital-gains calculation.</li>
<li><strong>Custom analysis:</strong> Build a pivot table, a charting dashboard, or a rebalancing model in Excel using your real position data.</li>
<li><strong>Record-keeping:</strong> Keep dated snapshots of your portfolio in a folder. Run an export at month-end each month and you have a full year of performance history without any manual work.</li>
<li><strong>Sharing:</strong> Send a clean spreadsheet to a partner, a tax professional, or an estate planner who needs to see your assets without accessing the app.</li>
<li><strong>Migration:</strong> Moving to a different tracker? Export your data first so you do not lose your cost basis history.</li>
</ul>

<h2>How to export your portfolio to Excel</h2>
<ol>
${steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol>
<p><a href="/dashboard">Download your portfolio CSV now →</a></p>

<h2>What the CSV export contains</h2>
<p>The holdings export includes one row per asset with these columns:</p>
<ul>
<li><strong>Asset</strong> — full name (e.g. Bitcoin) and ticker (BTC)</li>
<li><strong>Quantity</strong> — how much you hold</li>
<li><strong>Average cost basis</strong> — your weighted average buy price</li>
<li><strong>Current price</strong> — live market price at time of export</li>
<li><strong>Current value</strong> — quantity × current price</li>
<li><strong>Unrealised P&amp;L</strong> — gain or loss in dollars and as a percentage</li>
<li><strong>Allocation</strong> — this asset as a percentage of your total portfolio</li>
</ul>
<p>A separate transaction history export lists every individual buy, sell or transfer with its date, quantity, price, and total cost — useful for reconstructing a full trading ledger.</p>

<h2>Import from Excel or CSV</h2>
<p>WalletLens also accepts CSV imports. If you already track your portfolio in a spreadsheet, you can import it directly rather than entering each holding manually. The expected format matches the export format, so you can edit an exported file and re-import it — useful for bulk-correcting cost basis records or cleaning up historical data.</p>
<p>You can also combine import methods: use screenshot import or voice import for new trades, and fall back to CSV import for a bulk historical migration.</p>

<h2>Privacy: your data never touches our servers</h2>
<p>The CSV export is generated entirely in your browser from your local data. No data is transmitted to WalletLens servers during the export. The file downloads directly to your device. Your portfolio data stays under your full control at every step.</p>

${faq.html}

<p><strong>Related:</strong> <a href="/import-portfolio-from-screenshot">Import from a screenshot</a> · <a href="/add-holdings-by-voice">Add holdings by voice</a> · <a href="/crypto-portfolio-tax-report">Crypto tax report export</a> · <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/">Home</a></p>`
  write('/export-portfolio-to-excel', buildPage({
    path: '/export-portfolio-to-excel',
    title: 'Export Portfolio to Excel or CSV Free — WalletLens',
    description: 'Download your WalletLens portfolio as a CSV — holdings, cost basis, P&L, allocation — ready for Excel, Google Sheets, or your accountant. Free, no account, instant download.',
    bodyHtml: body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Export Portfolio to Excel', item: ORIGIN + '/export-portfolio-to-excel/' },
        ],
      },
      howToJsonLd('How to export a portfolio to Excel or CSV', steps),
      faq.jsonLd,
    ],
  }))
}

// Crypto portfolio tax report export
{
  const steps = [
    'Open WalletLens at walletlens.live — no account or sign-up required.',
    'Make sure all your trades are logged (use screenshot import, voice import, or manual entry to add any missing transactions).',
    'Go to Settings → Export and tap "Transaction History CSV".',
    'Your browser downloads a CSV with every buy, sell, and transfer: date, asset, quantity, price per unit, and total value.',
    'Open the file in Excel or Google Sheets, or upload it directly to a tax tool like Koinly, CoinTracker, or TurboTax.',
  ]
  const faq = faqBlock([
    {
      q: 'Can I generate a crypto tax report for free?',
      a: 'WalletLens exports your complete transaction history as a free CSV — the foundation of any crypto tax calculation. The CSV is free with no account. For automatic gain/loss calculations, you can import the CSV into a dedicated tax tool like Koinly or CoinTracker.',
    },
    {
      q: 'What information does the tax report CSV contain?',
      a: 'Each row covers one transaction: date and time, asset name and ticker, quantity, price per unit at time of transaction, total value, and transaction type (buy, sell, or transfer). This gives a tax professional or tax tool everything needed to calculate short-term and long-term capital gains.',
    },
    {
      q: 'Which tax tools accept the WalletLens CSV export?',
      a: 'The CSV format is compatible with most major crypto tax platforms including Koinly, CoinTracker, CryptoTaxCalculator, TaxBit, and ZenLedger. You may need to map the column headers to the format each tool expects — this is a one-time step usually covered in their import documentation.',
    },
    {
      q: 'Does WalletLens calculate my capital gains?',
      a: 'WalletLens shows your unrealised gain or loss per holding (the difference between your average cost basis and the current price). It does not calculate realised capital gains for tax purposes. For an official tax report with short/long-term gain split, import the transaction CSV into a dedicated tax tool.',
    },
    {
      q: 'Is my transaction history private?',
      a: 'Yes. Your transaction data is stored only in your browser\'s local storage. When you export, the CSV is generated in your browser and downloaded directly to your device. No transaction data is transmitted to WalletLens servers.',
    },
  ])
  const body = `
<h1>Crypto Portfolio Tax Report — Free Export</h1>
<p>WalletLens exports your complete <strong>transaction history as a free CSV</strong> — every buy, sell, and transfer with date, asset, quantity and price. Use it to prepare your crypto tax return, import into a tax tool like Koinly or CoinTracker, or share with your accountant. No account, no subscription, no API key.</p>
<p><a href="/dashboard">Open WalletLens and export your transaction history →</a></p>

<h2>Why crypto tax reporting starts with accurate transaction records</h2>
<p>Crypto tax authorities (IRS, HMRC, ATO, and others) treat cryptocurrency as a taxable asset — every sale, trade, and in some cases transfer is a taxable event. To calculate your tax liability, you need a complete, accurate record of every transaction: what asset, how much, at what price, and on what date.</p>
<p>The challenge is that most people hold crypto across multiple exchanges and wallets. Manually assembling a complete transaction log is tedious, error-prone, and easy to defer until tax season — when reconstructing months of trades becomes genuinely painful.</p>
<p>WalletLens solves this by acting as the single place you log every trade as you make it, using whatever input method is fastest: voice, screenshot, or manual entry. At tax time, you export one clean CSV instead of logging into six exchanges and downloading six separate reports.</p>

<h2>How to export your crypto transaction history for tax</h2>
<ol>
${steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol>
<p><a href="/dashboard">Export your transaction history now →</a></p>

<h2>What the tax export CSV contains</h2>
<p>Each row in the transaction history export represents one transaction:</p>
<ul>
<li><strong>Date &amp; time</strong> — exact timestamp of the trade</li>
<li><strong>Asset</strong> — name and ticker (e.g. Bitcoin / BTC)</li>
<li><strong>Type</strong> — Buy, Sell, or Transfer</li>
<li><strong>Quantity</strong> — how much was bought or sold</li>
<li><strong>Price per unit</strong> — the price at time of transaction (your cost basis for buys)</li>
<li><strong>Total value</strong> — quantity × price</li>
<li><strong>Notes</strong> — any label you added to the trade</li>
</ul>
<p>This format gives a tax professional or software tool everything needed to compute short-term and long-term capital gains under any accounting method (FIFO, LIFO, average cost).</p>

<h2>How to use the export with tax tools</h2>
<p>After downloading the CSV, you have several options:</p>
<ul>
<li><strong>Koinly:</strong> Import → Custom CSV → map the WalletLens columns. Koinly calculates gains, generates tax reports, and supports most countries.</li>
<li><strong>CoinTracker:</strong> Accepts CSV uploads directly. Free tier covers up to 25 transactions.</li>
<li><strong>TurboTax:</strong> Import as a CSV under the cryptocurrency section. Works with the standard column format.</li>
<li><strong>Your accountant:</strong> Simply email the CSV. Any accountant who handles crypto will know how to use a transaction log in this format.</li>
<li><strong>Excel / Google Sheets:</strong> Do your own FIFO calculation using the date-sorted transaction list and standard spreadsheet formulas.</li>
</ul>

<h2>Cost basis tracking in WalletLens</h2>
<p>WalletLens tracks your <strong>average cost basis</strong> per asset automatically — updated with every new buy or sell you record. This is the weighted average price you paid across all your purchases, which is the most commonly used method for crypto tax in many jurisdictions. You can see your cost basis per holding directly in the dashboard at any time, without waiting for tax season.</p>

<h2>Privacy: your transaction data stays on your device</h2>
<p>WalletLens stores your transaction history in your browser's local storage only. No transaction data is transmitted to any server — not when you log a trade, not when you view your history, and not when you export. The CSV is generated locally and downloaded directly to your device.</p>

${faq.html}

<p><strong>Related:</strong> <a href="/export-portfolio-to-excel">Export holdings to Excel</a> · <a href="/import-portfolio-from-screenshot">Import from a screenshot</a> · <a href="/add-holdings-by-voice">Add holdings by voice</a> · <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/">Home</a></p>`
  write('/crypto-portfolio-tax-report', buildPage({
    path: '/crypto-portfolio-tax-report',
    title: 'Crypto Portfolio Tax Report — Free CSV Export | WalletLens',
    description: 'Export your complete crypto transaction history as a free CSV — date, asset, quantity, price — for tax tools like Koinly, CoinTracker, or your accountant. No account needed.',
    bodyHtml: body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Crypto Portfolio Tax Report', item: ORIGIN + '/crypto-portfolio-tax-report/' },
        ],
      },
      howToJsonLd('How to export a crypto transaction history for tax', steps),
      faq.jsonLd,
    ],
  }))
}

// ── Arabic pages (/ar/...) ───────────────────────────────────────────────────
// High-value, low-competition Arabic versions for the Arabic community and for
// AI answer engines responding in Arabic. RTL + hreflang-paired to English.
for (const key of ['screenshot', 'voice']) {
  const f = AR_FEATURES[key]
  const arFaq = faqBlock(f.faq)
  const body = `
<h1>${esc(f.h1)}</h1>
<p>${f.intro}</p>
<p><a href="/dashboard">${esc(f.cta)}</a></p>
<h2>${esc(f.howToName)}</h2>
<ol>
${f.steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol>
<p>${esc(f.outro)}</p>
<p><a href="/dashboard">${esc(f.cta)}</a></p>
${arFaq.html}
<p><a href="/ar/${key === 'screenshot' ? AR_FEATURES.voice.slug : AR_FEATURES.screenshot.slug}">${key === 'screenshot' ? 'إضافة الأصول بالصوت' : 'الاستيراد من لقطة شاشة'}</a> · <a href="/ar/free-net-worth-tracker">متتبّع الثروة المجاني</a> · <a href="/">English</a></p>`
  write('/ar/' + f.slug, buildPage({
    path: '/ar/' + f.slug,
    title: f.title,
    description: f.description,
    bodyHtml: body,
    lang: 'ar',
    dir: 'rtl',
    jsonLd: [
      howToJsonLd(f.howToName, f.steps),
      arFaq.jsonLd,
    ],
    alternates: hreflangPair('/' + f.slug, '/ar/' + f.slug),
  }))
}

// Arabic free-net-worth-tracker landing
{
  const arFaq = faqBlock(AR_LANDING.faq)
  const body = `${AR_LANDING.bodyHtml}\n${arFaq.html}\n<p><a href="/ar/import-portfolio-from-screenshot">الاستيراد من لقطة شاشة</a> · <a href="/ar/add-holdings-by-voice">الإضافة بالصوت</a> · <a href="/free-net-worth-tracker">English</a></p>`
  write('/ar/free-net-worth-tracker', buildPage({
    path: '/ar/free-net-worth-tracker',
    title: AR_LANDING.title,
    description: AR_LANDING.description,
    bodyHtml: body,
    lang: 'ar',
    dir: 'rtl',
    jsonLd: [arFaq.jsonLd],
    alternates: hreflangPair('/free-net-worth-tracker', '/ar/free-net-worth-tracker'),
  }))
}

// Arabic comparison pages (/ar/vs/:slug)
for (const c of COMPARISONS) {
  const ar = AR_COMPARISONS[c.slug]
  if (!ar) continue
  const rowsHtml = AR_VS.rows.map(r =>
    `<tr><th scope="row">${esc(r.feature)}</th><td>${esc(r.walletlens)}</td><td>${esc(r.them)}</td></tr>`
  ).join('\n')
  const arFaq = faqBlock(AR_VS.faq(ar.name))
  const body = `
<h1>WalletLens مقابل ${esc(ar.name)}</h1>
<p>${esc(AR_VS.tagline)}</p>
<p><a href="/dashboard">${esc(AR_VS.tryFree)}</a></p>
<h2>${esc(AR_VS.featureComparison)}</h2>
<table>
<thead><tr><th>${esc(AR_VS.thFeature)}</th><th>WalletLens</th><th>${esc(ar.name)}</th></tr></thead>
<tbody>
${rowsHtml}
</tbody>
</table>
<h2>${esc(AR_VS.verdictHeading)}</h2>
<p>${esc(ar.verdict)}</p>
<p><a href="/dashboard">${esc(AR_VS.openFree)}</a></p>
${arFaq.html}
<p><small>${esc(AR_VS.disclaimer)}</small></p>
<p><a href="/ar/free-net-worth-tracker">متتبّع الثروة المجاني</a> · <a href="/vs/${c.slug}">English</a></p>`
  write('/ar/vs/' + c.slug, buildPage({
    path: '/ar/vs/' + c.slug,
    // Canonical → English URL: Google was overriding the Arabic self-referencing
    // canonical with the English version anyway ("Duplicate, Google chose different
    // canonical"). Pointing it to the English URL explicitly resolves the conflict
    // and turns the status to "Alternate page with proper canonical tag", which is
    // the correct hreflang pattern.
    canonicalOverride: '/vs/' + c.slug,
    title: `WalletLens مقابل ${ar.name} — متتبّع صافي ثروة مجاني`,
    description: `مقارنة بين WalletLens و${ar.name}: بديل مجاني وبلا حساب لتتبّع صافي ثروتك عبر العملات الرقمية والأسهم والمعادن والنقد، مع بقاء بياناتك على جهازك.`,
    bodyHtml: body,
    lang: 'ar',
    dir: 'rtl',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'WalletLens', item: ORIGIN + '/ar/free-net-worth-tracker/' },
          { '@type': 'ListItem', position: 2, name: `WalletLens مقابل ${ar.name}`, item: `${ORIGIN}/ar/vs/${c.slug}/` },
        ],
      },
      arFaq.jsonLd,
    ],
    alternates: hreflangPair('/vs/' + c.slug, '/ar/vs/' + c.slug),
  }))
}
console.log(`Prerendered Arabic pages (features + landing + ${Object.keys(AR_COMPARISONS).length} /vs).`)

// ── Per-asset landing pages (/track/:slug) ───────────────────────────────────
// Programmatic SEO: one focused page per top asset targeting "[asset] portfolio
// tracker" / "track [asset] free" searches. Covers crypto, US stocks/ETFs, and
// precious metals. Each is distinct (unique blurb, FAQ, title) to avoid
// thin/doorway-content penalties.
for (const c of ALL_TRACK_ASSETS) {
  const isStock = c.type === 'stock'
  const isMetal = c.type === 'metal'
  const isCrypto = !isStock && !isMetal

  const heroTitle = isStock
    ? `Track ${esc(c.name)} Stock (${esc(c.symbol)}) — Free, No Account`
    : isMetal
    ? `Track ${esc(c.name)} Price (${esc(c.symbol)}) — Free, No Account`
    : `Track ${esc(c.name)} (${esc(c.symbol)}) — Free, No Account`

  const heroPara = isStock
    ? `Add ${esc(c.name)} shares to your free WalletLens portfolio and watch the live price, your cost basis, and your profit/loss update automatically — alongside your crypto and other investments. No sign-up needed and your data stays on your device.`
    : isMetal
    ? `Add ${esc(c.name)} to your free WalletLens portfolio and watch its live price per ounce, your cost basis, and your profit/loss update automatically — alongside your crypto, stocks and other assets. No sign-up needed and your data stays on your device.`
    : `Add ${esc(c.name)} to your free WalletLens portfolio and watch its live price, your cost basis, and your profit/loss update automatically — alongside the rest of your net worth. No sign-up, no wallet connection, and your data stays on your device.`

  const whatHeading = isStock ? `What is ${esc(c.name)} stock?` : `What is ${esc(c.name)}?`

  const tradeWord = isStock ? 'position' : isMetal ? 'holding' : 'trade'

  const sideByBullet = isStock
    ? `<li><strong>All in one place</strong> — see ${esc(c.symbol)} next to your crypto, gold and cash in a single net-worth view.</li>`
    : isMetal
    ? `<li><strong>All in one place</strong> — see ${esc(c.symbol)} next to your crypto, stocks and cash in a single net-worth view.</li>`
    : `<li><strong>All in one place</strong> — see ${esc(c.symbol)} next to your other crypto, stocks, gold and cash in a single net-worth view.</li>`

  const privacyBullet = isStock
    ? `<li><strong>No brokerage login needed</strong> — enter holdings manually; your data stays on your device.</li>`
    : isMetal
    ? `<li><strong>No dealer login needed</strong> — enter your holdings manually; your data stays on your device.</li>`
    : `<li><strong>Private by design</strong> — your holdings never leave your device; no exchange API keys required.</li>`

  const aiBullet = isCrypto
    ? `<li><strong>AI analysis</strong> — a health score, risk scan and the Magic Indicator direction for ${esc(c.symbol)}.</li>`
    : `<li><strong>AI portfolio health score</strong> — see how your ${esc(c.symbol)} position affects your overall portfolio.</li>`

  const addStep = isStock
    ? `Add ${esc(c.symbol)} shares with the quantity and your average cost per share.`
    : isMetal
    ? `Add ${esc(c.symbol)} with your quantity in ounces and the price you paid.`
    : `Add a ${esc(c.symbol)} trade with the amount and price you paid.`

  const pageTitle = isStock
    ? `Track ${c.name} Stock (${c.symbol}) Free — No Account | WalletLens`
    : isMetal
    ? `Track ${c.name} (${c.symbol}) Price Free — No Account | WalletLens`
    : `Track ${c.name} (${c.symbol}) Free — No Account Portfolio Tracker | WalletLens`

  const pageDesc = isStock
    ? `Track your ${c.name} (${c.symbol}) shares free on WalletLens — live price, cost basis and P&L alongside your whole net worth. No account, no brokerage login, data stays on your device.`
    : isMetal
    ? `Track your ${c.name} (${c.symbol}) holdings free on WalletLens — live price per ounce, cost basis and P&L alongside your whole net worth. No account needed, data stays on your device.`
    : `Track ${c.name} (${c.symbol}) for free with WalletLens — live price, cost basis and profit/loss, alongside your whole net worth. No account, no wallet connection, data stays on your device.`

  const faq1q = isStock
    ? `How can I track ${c.name} stock for free?`
    : isMetal
    ? `How can I track my ${c.name} holdings for free?`
    : `How can I track ${c.name} for free?`

  const faq1a = isStock
    ? `Add ${c.name} (${c.symbol}) to WalletLens, a free portfolio tracker with no account needed. Enter your share count and cost basis and it tracks the live price, your P&L, and your position's weight in your net worth automatically.`
    : isMetal
    ? `Add ${c.name} (${c.symbol}) to WalletLens, a free portfolio tracker with no account needed. Enter your ounces and the price you paid, and it tracks the live price per ounce, your cost basis and P&L automatically, stored privately on your device.`
    : `Add ${c.name} (${c.symbol}) to WalletLens, a free portfolio tracker that needs no account. Enter your ${c.symbol} trades and it tracks live price, cost basis and profit/loss automatically, with your data stored privately on your device.`

  const faq2q = isStock
    ? `Can I see my ${c.symbol} shares alongside my crypto holdings?`
    : isMetal
    ? `Can I track ${c.name} alongside my crypto and stocks?`
    : `Can I track ${c.symbol} without connecting my wallet or exchange?`

  const faq2a = isStock
    ? `Yes. WalletLens is a full net worth tracker — it shows ${c.symbol} shares alongside your crypto, gold, cash and other assets in a single live dashboard, with no brokerage connection required.`
    : isMetal
    ? `Yes. WalletLens combines every asset class — crypto, stocks, precious metals, cash and FX — in one free dashboard. Your ${c.name} holdings appear next to your other assets with a live net-worth total.`
    : `Yes. WalletLens uses manual or imported entry, so you never connect a wallet or share exchange API keys. You add your ${c.symbol} holdings and it values them with live prices.`

  const assetBody = `
<h1>${heroTitle}</h1>
<p>${heroPara}</p>
<p><a href="/dashboard">Track ${esc(c.symbol)} free →</a> · <a href="/asset/${esc(c.id)}">View ${esc(c.symbol)} analysis</a></p>
<h2>${whatHeading}</h2>
<p>${esc(c.name)} (${esc(c.symbol)}) is ${esc(c.blurb)}</p>
<h2>Why track ${esc(c.symbol)} with WalletLens?</h2>
<ul>
<li><strong>100% free</strong> — no account, no subscription, no ads.</li>
<li><strong>Live ${esc(c.symbol)} price</strong> and automatic profit/loss on every ${tradeWord} you log.</li>
${sideByBullet}
${privacyBullet}
${aiBullet}
</ul>
<h2>How to track ${esc(c.name)} for free</h2>
<ol>
<li>Open WalletLens — no account or email needed.</li>
<li>${addStep}</li>
<li>Watch your ${esc(c.name)} value, P&amp;L and allocation update with live prices.</li>
</ol>
<p><a href="/dashboard">Add ${esc(c.symbol)} to your portfolio →</a></p>
<h2>Frequently asked questions</h2>
<h3>${esc(faq1q)}</h3>
<p>${esc(faq1a)}</p>
<h3>${esc(faq2q)}</h3>
<p>${esc(faq2a)}</p>
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a></p>`

  write('/track/' + c.slug, buildPage({
    path: '/track/' + c.slug,
    title: pageTitle,
    description: pageDesc,
    bodyHtml: assetBody,
    noindex: true,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `Track ${c.name}`, item: `${ORIGIN}/track/${c.slug}/` },
        ],
      },
    ],
  }))
}
console.log(`Prerendered ${ALL_TRACK_ASSETS.length} /track asset pages (${TRACK_COINS.length} crypto, ${TRACK_STOCKS.length} stocks, ${TRACK_METALS.length} metals).`)

// ── Calculator landing pages (/calculator/:slug) ──────────────────────────
// Targets "[asset] profit calculator" searches. Each page has a working
// interactive widget in SPA mode; prerender provides unique title/meta/body.
for (const c of CALCULATORS) {
  const isStock = c.type === 'stock'
  const isMetal = c.type === 'metal'
  const isGeneral = c.type === 'general'
  const unitWord = c.unit === 'oz' ? 'ounces' : c.unit === 'shares' ? 'shares' : c.unit

  const pageTitle = isGeneral
    ? `${c.name} Profit & ROI Calculator — Free | WalletLens`
    : isStock
    ? `${c.name} Profit Calculator — Free ${c.symbol} Stock ROI | WalletLens`
    : `${c.name} Profit Calculator (${c.symbol}) — Free ROI Calculator | WalletLens`

  const pageDesc = isGeneral
    ? `Free ${c.name.toLowerCase()} profit and ROI calculator — works for any asset. Enter buy price, quantity, and target to see P&L, ROI, and break-even instantly.`
    : `Free ${c.name} (${c.symbol}) profit calculator — enter your buy price, ${unitWord}, and target price to see P&L, ROI, and break-even instantly. No account needed.`

  const h1 = `${c.name}${isStock ? ' Stock' : ''} Profit Calculator — Free & Instant`

  const heroPara = isGeneral
    ? `${c.blurb} No account needed and results update instantly.`
    : `${c.blurb} Free, instant, no account required.`

  const faq1q = isGeneral
    ? `How do I calculate investment profit and ROI?`
    : `How do I calculate ${c.name} profit and ROI?`

  const faq1a = isGeneral
    ? `Profit = (Sell Price − Buy Price) × Quantity. ROI = (Profit ÷ Amount Invested) × 100. Enter your numbers in the calculator above for an instant result.`
    : `Profit = (Sell Price − Buy Price) × ${unitWord}. ROI = (Profit ÷ Invested) × 100. Enter your ${c.symbol} buy price, ${unitWord} held, and target price in the calculator above for an instant result.`

  const faq2q = isGeneral
    ? `What is a break-even price?`
    : `Can I track ${c.name} live instead of calculating manually?`

  const faq2a = isGeneral
    ? `Your break-even price is where you recover exactly what you invested — no profit or loss. It equals your buy price (before fees).`
    : `Yes — WalletLens tracks your ${c.name} P&L in real time with live prices. Add your position once and it updates automatically, alongside your entire net worth.`

  const calcBody = `
<h1>${esc(h1)}</h1>
<p>${esc(heroPara)}</p>
<p><strong>To use:</strong> Enter your ${esc(unitWord)}, buy price, and target price. Profit/loss, ROI %, and break-even appear instantly.</p>
<p><a href="/dashboard">Track ${isGeneral ? 'all assets' : esc(c.symbol)} live in WalletLens →</a></p>
<h2>How to calculate ${isGeneral ? 'profit and ROI' : `${esc(c.name)} profit`}</h2>
<ul>
<li><strong>Profit / Loss</strong> = (Sell Price − Buy Price) × Quantity</li>
<li><strong>ROI %</strong> = (Profit ÷ Amount Invested) × 100</li>
<li><strong>Break-even price</strong> = your buy price (the price at which you neither gain nor lose)</li>
</ul>
<h2>Track ${isGeneral ? 'all assets' : esc(c.name)} live — beyond the calculator</h2>
<p>The calculator gives you quick estimates. WalletLens updates your P&amp;L in real time with live prices — no manual entry needed after your first setup. Log every buy and it blends your cost basis automatically, showing your true gain or loss alongside all your other investments.</p>
<ul>
<li><strong>Live price updates</strong> — P&amp;L refreshes automatically.</li>
<li><strong>Multiple buy entries</strong> — blended cost basis across all trades.</li>
<li><strong>All assets in one dashboard</strong> — crypto, stocks, gold and cash together.</li>
<li><strong>100% free, no account</strong> — open the dashboard and start in under a minute.</li>
</ul>
<p><a href="/dashboard">Open free portfolio tracker →</a></p>
<h2>Frequently asked questions</h2>
<h3>${esc(faq1q)}</h3>
<p>${esc(faq1a)}</p>
<h3>${esc(faq2q)}</h3>
<p>${esc(faq2a)}</p>
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`

  write('/calculator/' + c.slug, buildPage({
    path: '/calculator/' + c.slug,
    title: pageTitle,
    description: pageDesc,
    bodyHtml: calcBody,
    noindex: true,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: `${c.name} Profit Calculator`,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        url: `${ORIGIN}/calculator/${c.slug}/`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `${c.name} Profit Calculator`, item: `${ORIGIN}/calculator/${c.slug}/` },
        ],
      },
    ],
  }))
}
console.log(`Prerendered ${CALCULATORS.length} /calculator pages.`)

// ── Glossary pages (/learn/:slug) ────────────────────────────────────────────
// Schema-rich definitions designed to be cited by answer engines (AEO).
for (const t of GLOSSARY) {
  const paras = t.body.split('\n\n')
  const related = (t.related || []).map(s => GLOSSARY.find(g => g.slug === s)).filter(Boolean)
  const articlePrefix = t.article ? `${t.article} ` : ''
  const pageTitle = `What Is ${articlePrefix}${t.term}?`
  const faqHtml = t.faqs?.length ? `
<h2>Frequently Asked Questions</h2>
${t.faqs.map(f => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}` : ''
  const featuredLinkHtml = t.featuredLink ? `<p><a href="${t.featuredLink.href}">${esc(t.featuredLink.label)}</a></p>` : ''
  const keyPointsHtml = t.keyPoints?.length ? `
<h2>Key takeaways</h2>
<ul>\n${t.keyPoints.map(k => `<li>${esc(k)}</li>`).join('\n')}\n</ul>` : ''
  const exampleHtml = t.example ? `
<h2>Example</h2>
<p>${esc(t.example)}</p>` : ''
  const learnBody = `
<h1>${esc(pageTitle)}</h1>
<p>${esc(t.short)}</p>
${featuredLinkHtml}
<h2>Definition</h2>
${paras.map(p => `<p>${esc(p)}</p>`).join('\n')}
${keyPointsHtml}
${exampleHtml}
${faqHtml}
<h2>Track it in WalletLens</h2>
<p>WalletLens is a free, private net-worth tracker that puts concepts like this into practice — it tracks your crypto, stocks, gold and cash in one dashboard, computing cost basis, P&amp;L and allocation automatically with live prices. No account, and your data stays on your device.</p>
<p><a href="/dashboard">Open the free tracker →</a></p>
${related.length ? `<h2>Related terms</h2>\n<ul>\n${related.map(r => `<li><a href="/learn/${r.slug}">${esc(r.term)}</a></li>`).join('\n')}\n</ul>` : ''}
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`
  const faqJsonLd = t.faqs?.length ? [{
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: t.faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }] : []
  write('/learn/' + t.slug, buildPage({
    path: '/learn/' + t.slug,
    title: `${pageTitle} Definition & Guide`,
    description: t.short,
    bodyHtml: learnBody,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'DefinedTerm',
        name: t.term,
        description: t.short,
        inDefinedTermSet: `${ORIGIN}/learn`,
        url: `${ORIGIN}/learn/${t.slug}/`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: pageTitle, item: `${ORIGIN}/learn/${t.slug}/` },
        ],
      },
      ...faqJsonLd,
    ],
  }))
}
console.log(`Prerendered ${GLOSSARY.length} /learn glossary pages.`)

// ── Comparison pages (/vs/:slug) ─────────────────────────────────────────────
// High commercial-intent "WalletLens vs <competitor>" pages.
for (const c of COMPARISONS) {
  const rowsHtml = c.rows.map(r =>
    `<tr><th scope="row">${esc(r.feature)}</th><td>${esc(r.walletlens)}</td><td>${esc(r.them)}</td></tr>`
  ).join('\n')
  // AI-targeted Q&A — mirrors how people phrase queries to answer engines
  // ("is there a free alternative to X?", "do I need an account?").
  const vsFaq = faqBlock([
    {
      q: `Is WalletLens a free alternative to ${c.competitor}?`,
      a: `Yes. WalletLens is a 100% free, no-account alternative to ${c.competitor} that tracks your whole net worth — crypto, US stocks and ETFs, precious metals, fiat and cash — in one dashboard, with no subscription and no credit card.`,
    },
    {
      q: `Do I need an account or a bank login to use WalletLens?`,
      a: `No. Unlike ${c.competitor}, WalletLens needs no sign-up, email, password, or bank/exchange login. Open it and start tracking immediately; you enter your holdings yourself.`,
    },
    {
      q: `Is my financial data private with WalletLens?`,
      a: `Yes. WalletLens stores all of your portfolio data locally in your browser (localStorage). Your holdings are never sent to a server, so your financial data never leaves your device.`,
    },
    {
      q: `What assets can WalletLens track?`,
      a: `Cryptocurrencies (Bitcoin, Ethereum and 10,000+ coins via CoinGecko), US stocks and ETFs, precious metals (gold, silver, platinum), fiat currencies and cash — your complete net worth in a single view.`,
    },
  ])
  const vsBody = `
<h1>WalletLens vs ${esc(c.competitor)}</h1>
<p>${esc(c.tagline)}</p>
<p><a href="/dashboard">Try WalletLens free →</a></p>
<h2>Feature comparison</h2>
<table>
<thead><tr><th>Feature</th><th>WalletLens</th><th>${esc(c.competitor)}</th></tr></thead>
<tbody>
${rowsHtml}
</tbody>
</table>
<h2>The verdict</h2>
<p>${esc(c.verdict)}</p>
<p><a href="/dashboard">Open WalletLens free →</a></p>
${vsFaq.html}
<p><small>Comparison reflects publicly documented features and is for general guidance, not endorsement or financial advice.</small></p>
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`
  write('/vs/' + c.slug, buildPage({
    path: '/vs/' + c.slug,
    title: `WalletLens vs ${c.competitor} — Free Comparison`,
    description: c.summary,
    bodyHtml: vsBody,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `WalletLens vs ${c.competitor}`, item: `${ORIGIN}/vs/${c.slug}/` },
        ],
      },
      vsFaq.jsonLd,
    ],
    alternates: AR_COMPARISONS[c.slug] ? hreflangPair('/vs/' + c.slug, '/ar/vs/' + c.slug) : undefined,
  }))
}
console.log(`Prerendered ${COMPARISONS.length} /vs comparison pages.`)

// ── Live-price pages (/price/:slug) ──────────────────────────────────────────
// "X price today" — very high recurring volume. Price is fetched live in the
// SPA; the prerender provides crawlable evergreen context (no stale numbers).
for (const a of PRICE_ASSETS) {
  const priceFaq = faqBlock([
    {
      q: `How much is ${a.name} worth today?`,
      a: `The live ${a.name} (${a.symbol}) price updates from market data when you open the page. For continuously updating prices and your own profit/loss, track ${a.symbol} in WalletLens.`,
    },
    {
      q: `Where can I track ${a.name} for free?`,
      a: `WalletLens tracks ${a.name} for free with no account — add your holding once and it values it with live prices alongside your entire net worth, with data kept on your device.`,
    },
  ])
  const priceBody = `
<h1>${esc(a.name)} Price Today (${esc(a.symbol)})</h1>
<p>Live ${esc(a.name)} (${esc(a.symbol)}) price and your personal profit/loss — free in WalletLens, no account required. ${esc(a.name)} is ${esc(a.blurb)}</p>
<p><a href="/dashboard">Track ${esc(a.symbol)} free →</a> · <a href="/asset/${esc(a.id)}">${esc(a.symbol)} analysis</a></p>
<h2>How to track ${esc(a.name)} live</h2>
<ol>
<li>Open WalletLens — no account or email needed.</li>
<li>Add your ${esc(a.symbol)} holding with the amount and price you paid.</li>
<li>Watch the live ${esc(a.name)} price, your P&amp;L and allocation update automatically.</li>
</ol>
<p><a href="/dashboard">Track ${esc(a.symbol)} in your portfolio →</a></p>
${priceFaq.html}
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`
  write('/price/' + a.slug, buildPage({
    path: '/price/' + a.slug,
    title: `${a.name} Price Today (${a.symbol}) — Live Price & Free Tracker | WalletLens`,
    description: `Live ${a.name} (${a.symbol}) price today, plus a free way to track your ${a.symbol} profit and loss in WalletLens — no account, data stays on your device.`,
    bodyHtml: priceBody,
    noindex: true,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `${a.name} Price`, item: `${ORIGIN}/price/${a.slug}/` },
        ],
      },
      priceFaq.jsonLd,
    ],
  }))
}
console.log(`Prerendered ${PRICE_ASSETS.length} /price pages.`)

// ── Blog index ───────────────────────────────────────────────────────────────
const blogBody = `
<h1>WalletLens Blog</h1>
<p>Guides and insights on portfolio tracking, crypto investing, and market analysis.</p>
${POSTS.map(p => `
<article>
  <h2><a href="/blog/${p.slug}">${esc(p.title)}</a></h2>
  <p><em>${esc(p.date)} · ${esc(p.readTime)}</em></p>
  <p>${esc(p.summary)}</p>
</article>`).join('\n')}
`
write('/blog', buildPage({
  path: '/blog',
  title: 'WalletLens Blog — Crypto & Investing Guides',
  description: 'Crypto fear and greed index explained, DCA strategy, gold vs Bitcoin, portfolio diversification, net worth tracking — free investing guides from WalletLens.',
  bodyHtml: blogBody,
}))

// ── Individual posts ─────────────────────────────────────────────────────────
for (const p of POSTS) {
  const articleHtml = `
<article>
  <p><em>${esc(p.date)} · ${esc(p.readTime)}</em></p>
  <h1>${esc(p.title)}</h1>
  <p>${esc(p.summary)}</p>
  ${mdToHtml(p.content)}
  <p><a href="/dashboard">Start tracking your portfolio for free with WalletLens →</a></p>
  <nav aria-label="Related articles">
    <h2>Keep reading</h2>
    <ul>
${relatedPosts(p.slug, 3).map(r => `      <li><a href="/blog/${r.slug}">${esc(r.title)}</a> — ${esc(r.summary)}</li>`).join('\n')}
    </ul>
  </nav>
  <p><a href="/blog">← All articles</a></p>
</article>`
  const iso = postIsoDate(p.date)
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.summary,
      image: OG_IMAGE,
      datePublished: iso,
      dateModified: TODAY,
      author: { '@type': 'Organization', name: 'WalletLens', url: ORIGIN },
      publisher: {
        '@type': 'Organization',
        name: 'WalletLens',
        url: ORIGIN,
        logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon-512.svg` },
      },
      mainEntityOfPage: `${ORIGIN}/blog/${p.slug}/`,
      url: `${ORIGIN}/blog/${p.slug}/`,
      // Speakable: lets voice assistants read the headline + lead paragraph aloud.
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', 'article > p:nth-of-type(1)'] },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: ORIGIN + '/blog/' },
        { '@type': 'ListItem', position: 3, name: p.title, item: `${ORIGIN}/blog/${p.slug}/` },
      ],
    },
  ]
  const hasAr = AR_POSTS.some(a => a.slug === p.slug)
  write('/blog/' + p.slug, buildPage({
    path: '/blog/' + p.slug,
    title: brandTitle(p.seoTitle || p.title),
    description: p.summary,
    bodyHtml: articleHtml,
    jsonLd,
    ogType: 'article',
    published: iso,
    modified: TODAY,
    alternates: hasAr ? hreflangPair('/blog/' + p.slug, '/ar/blog/' + p.slug) : undefined,
  }))
}

// Arabic blog articles (/ar/blog/:slug) — net-worth guides translated to Arabic.
for (const p of AR_POSTS) {
  const articleHtml = `
<article>
  <p><em>${esc(p.date)} · ${esc(p.readTime)}</em></p>
  <h1>${esc(p.title)}</h1>
  <p>${esc(p.summary)}</p>
  ${mdToHtml(p.content)}
  <p><a href="/dashboard">ابدأ تتبّع محفظتك مجاناً مع WalletLens ←</a></p>
  <p><a href="/ar/free-net-worth-tracker">متتبّع الثروة المجاني</a> · <a href="/blog/${p.slug}">English</a></p>
</article>`
  const iso = TODAY
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      inLanguage: 'ar',
      headline: p.title,
      description: p.summary,
      image: OG_IMAGE,
      datePublished: iso,
      dateModified: TODAY,
      author: { '@type': 'Organization', name: 'WalletLens', url: ORIGIN },
      publisher: {
        '@type': 'Organization',
        name: 'WalletLens',
        url: ORIGIN,
        logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon-512.svg` },
      },
      mainEntityOfPage: `${ORIGIN}/ar/blog/${p.slug}/`,
      url: `${ORIGIN}/ar/blog/${p.slug}/`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'WalletLens', item: ORIGIN + '/ar/free-net-worth-tracker/' },
        { '@type': 'ListItem', position: 2, name: p.title, item: `${ORIGIN}/ar/blog/${p.slug}/` },
      ],
    },
  ]
  write('/ar/blog/' + p.slug, buildPage({
    path: '/ar/blog/' + p.slug,
    title: brandTitle(p.title),
    description: p.summary,
    bodyHtml: articleHtml,
    lang: 'ar',
    dir: 'rtl',
    jsonLd,
    ogType: 'article',
    published: iso,
    modified: TODAY,
    alternates: hreflangPair('/blog/' + p.slug, '/ar/blog/' + p.slug),
  }))
}
console.log(`Prerendered ${AR_POSTS.length} Arabic blog articles.`)

// ── About ────────────────────────────────────────────────────────────────────
const aboutFaqs = [
  { q: 'Is WalletLens really free?',
    a: 'Yes. WalletLens is 100% free with no paid tiers, no premium paywall, and no freemium limits. Track unlimited assets, use the AI analysis, and export backups without ever paying. The app is sustained by unobtrusive advertising.' },
  { q: 'Do I need an account or email to use it?',
    a: 'No. There is no sign-up, no email, and no password. You open the app and start tracking immediately, so there is nothing to hack, leak, or lock you out of.' },
  { q: 'Where is my portfolio data stored?',
    a: "Entirely in your own browser's localStorage on your device. WalletLens has no backend database and no server that receives your holdings; your data never leaves your device unless you export a backup code." },
  { q: 'What assets can I track in one place?',
    a: 'Crypto (10,000+ coins), US stocks and ETFs, gold, silver, platinum, fiat currencies, cash, and bonds — all in a single net worth dashboard with live prices, cost basis, and profit/loss.' },
  { q: 'How is WalletLens different from CoinStats, Empower, or Kubera?',
    a: 'Most trackers focus only on crypto, charge a subscription, require exchange or bank logins, or store your data on their servers. WalletLens covers every asset class, is free forever, needs no logins, and keeps all data on your device.' },
  { q: 'Can I use WalletLens on my phone?',
    a: 'Yes. WalletLens is a Progressive Web App (PWA) — install it to your home screen on iOS, Android, or desktop for a fast, app-like experience that works offline.' },
]
write('/about', buildPage({
  path: '/about',
  title: 'About WalletLens — Free Private Net Worth Tracker',
  description: 'WalletLens is a free, private net worth tracker for all your investments — crypto, stocks, gold, silver, cash & FX in one dashboard. No account, no server, no data collection. Learn what it does, who it is for, and how it compares.',
  bodyHtml: `
<h1>About WalletLens — The Free, Private Net Worth Tracker</h1>
<p>WalletLens is a free net worth tracker and all-asset portfolio manager that runs entirely in your browser. Track every investment you own — crypto, US stocks, ETFs, gold, silver, fiat currencies, cash, and bonds — in one unified dashboard, with no account, no email, and no server, so your holdings never leave your device.</p>
<h2>What we built</h2>
<p>A single dashboard for your entire net worth: crypto, US stocks &amp; ETFs, gold, silver, platinum, fiat currencies, bonds, and any other asset. Live prices, cost-basis tracking, profit &amp; loss, allocation donut, multi-target sell plans, a Bitcoin whale tracker, and on-device AI analysis — all free, forever.</p>
<h2>Who WalletLens is for</h2>
<ul>
<li>Multi-asset investors who hold crypto and stocks and precious metals and are tired of juggling separate apps.</li>
<li>Privacy-conscious people who don't want to connect bank logins or hand their holdings to a cloud server.</li>
<li>Anyone who wants a free net worth tracker with no subscription, trial, or credit card.</li>
<li>DIY investors who want cost-basis tracking, profit targets, and clear P&amp;L without a spreadsheet.</li>
</ul>
<h2>Why local-first?</h2>
<p>Every portfolio tracker we tried asked us to hand over our holdings to a server, connect exchange API keys, or create an account. We didn't want to make that trade-off. WalletLens stores your data in your browser's localStorage and exports it as a single backup code you control.</p>
<h2>Privacy by design</h2>
<p>There is no backend database. There is no login because there is nothing to log into. The only external calls are to public price APIs (CoinGecko, Binance, Stooq, Gold-API) and, optionally, the Anthropic API for AI analysis — both called directly from your browser with no intermediary server.</p>
<h2>Frequently asked questions</h2>
${aboutFaqs.map(f => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}
<p><a href="/dashboard">Open WalletLens free</a> · <a href="/free-net-worth-tracker">Free net worth tracker comparison</a> · <a href="/blog/best-free-net-worth-tracker">Best free net worth tracker guide</a> · <a href="/blog">Read the blog</a> · <a href="/privacy">Privacy Policy</a> · <a href="mailto:contact@walletlens.live">contact@walletlens.live</a></p>
`,
  // Organization is emitted once globally from index.html (the richer instance
  // with sameAs + contactPoint); the About page adds no duplicate of its own.
}))

// ── FAQ ──────────────────────────────────────────────────────────────────────
// Mirrors client/src/pages/FAQ.jsx (FAQ_SECTIONS) — keep the two in sync.
const faqPageSections = [
  { title: 'Getting Started', faqs: [
    { q: 'Is WalletLens really free?',
      a: 'Yes. WalletLens is 100% free with no paid tiers, no premium paywall, and no freemium limits. You can track unlimited assets, use the AI analysis, and export backups without ever paying. The app is sustained by unobtrusive advertising.' },
    { q: 'Do I need an account or email to use it?',
      a: 'No. There is no sign-up, no email, and no password. You open the app and start tracking immediately. Because there is no account, there is nothing to hack, leak, or lock you out of.' },
    { q: 'How do I add my first holding?',
      a: 'Open the dashboard and tap "Add Trade". Search for the asset, enter the amount and the price you paid, and save. You can also speak a trade with voice input, import a screenshot of an exchange or broker app, or paste a backup code from another device.' },
    { q: 'Can I use WalletLens on my phone?',
      a: 'Yes. WalletLens is a Progressive Web App (PWA) — install it to your home screen on iOS, Android, or desktop for a fast, app-like experience that works offline. There is also a Chrome browser extension for quick portfolio checks.' },
    { q: 'Does WalletLens support languages other than English?',
      a: 'Yes — the interface and blog are available in Arabic with full right-to-left layout, and more languages are planned.' },
  ]},
  { title: 'Privacy & Data', faqs: [
    { q: 'Where is my portfolio data stored?',
      a: "Entirely in your own browser's localStorage on your device. WalletLens has no backend database and no server that receives your holdings. Your financial data never leaves your device unless you choose to export a backup code." },
    { q: 'Can WalletLens see my portfolio?',
      a: 'No. The only network calls the app makes are to public price APIs (CoinGecko, Binance, Stooq, Gold-API and similar) to fetch market prices, and those requests never include your holdings, amounts, or any identity. Optional AI analysis sends only anonymous aggregates.' },
    { q: 'How do I back up my portfolio?',
      a: 'Open Settings → Backup and copy your WLZ backup code (or show it as a QR code). The code is a compressed snapshot of your whole portfolio. Store it somewhere safe — because there is no cloud account, the backup code is the only way to restore your data if you clear your browser.' },
    { q: 'How do I move my portfolio to a new device?',
      a: 'Export a backup code (or QR) on the old device, then paste or scan it on the new one. The import takes seconds and nothing passes through any server.' },
    { q: 'How do I delete all my data?',
      a: "Clearing your browser's site data for walletlens.live removes everything, because everything lives in your browser. There is no server-side copy to ask us to delete." },
  ]},
  { title: 'Assets & Prices', faqs: [
    { q: 'What assets can I track in one place?',
      a: 'Crypto (10,000+ coins), US stocks and ETFs, gold, silver, platinum, fiat currencies, cash, bonds, and custom assets like real estate — all in a single net worth dashboard with live prices, cost basis, and profit/loss.' },
    { q: 'Where do the live prices come from?',
      a: 'Crypto prices come from CoinGecko with Binance, CryptoCompare, CoinCap and CoinPaprika as automatic fallbacks. US stocks come from Stooq, precious metals from Gold-API, and currency rates from open exchange-rate APIs. If your network blocks these sources, the app falls back to a snapshot served from walletlens.live itself.' },
    { q: 'Why is a price missing or showing zero?',
      a: 'Usually the asset is custom (bonds, real estate) and needs a manual price — edit the holding to set its current value. For listed assets, a hard refresh typically restores live prices; the app retries several sources automatically.' },
    { q: 'How is my profit & loss calculated?',
      a: 'WalletLens tracks your cost basis per asset from your buy and sell transactions using the average-cost method. Unrealized P&L is the difference between current market value and the cost basis of what you still hold.' },
  ]},
  { title: 'Features & AI', faqs: [
    { q: 'What does the AI analysis do?',
      a: 'The AI Decision Engine reviews each position — momentum, portfolio weight, profit/loss — and suggests an action (hold, add, trim, sell) with reasons. There is also a wallet health evaluation, a risk scanner, stress tests, a sell-plan generator, and price-target tracking. None of it is financial advice.' },
    { q: 'Can I set price alerts?',
      a: 'Yes. Set "rises above" or "falls below" alerts on any holding. With notifications enabled you get alerted even when WalletLens is in a background tab, complete with a sound.' },
    { q: 'What is the voice import?',
      a: 'Tap the microphone and say something like "I bought half a Bitcoin at sixty thousand dollars in January" — the AI parses it into a structured transaction for you to confirm. It works in English and Arabic.' },
    { q: 'What is the screenshot import?',
      a: 'Upload a screenshot of any exchange, broker, or bank app and the AI reads the holdings from the image and adds them to your portfolio — useful for migrating from another tracker in one step.' },
    { q: 'What does the Chrome extension do?',
      a: 'The WalletLens extension shows your portfolio total, all holdings with live prices, market data, the Fear & Greed index, news, and technical signals from your browser toolbar. It syncs with the web app through your local data — no account needed.' },
  ]},
  { title: 'Comparisons & Troubleshooting', faqs: [
    { q: 'How is WalletLens different from CoinStats, Empower, or Kubera?',
      a: 'Most trackers focus only on crypto, charge a subscription, require you to connect exchange or bank logins, or store your data on their servers. WalletLens covers every asset class, is free forever, needs no logins, and keeps all data on your device.' },
    { q: 'The app loads but data is empty — what do I do?',
      a: 'First hard-refresh (Ctrl+Shift+R on desktop, pull-to-refresh on mobile) to pick up the latest version. If market sections stay empty, your network may block crypto price APIs — WalletLens automatically falls back to a same-origin price snapshot within a few seconds.' },
    { q: 'I cleared my browser and lost my portfolio. Can you restore it?',
      a: 'Only if you saved a WLZ backup code — paste it in Settings → Backup to restore everything instantly. There is no server-side copy, which is the price of true privacy, so export a backup regularly.' },
    { q: 'Is WalletLens open source?',
      a: 'Yes. You can inspect the code, report issues, or contribute on GitHub at github.com/tia8910/walletlens.' },
    { q: 'How do I report a bug or request a feature?',
      a: 'Email contact@walletlens.live or open an issue on GitHub — we read everything.' },
  ]},
]
const allFaqPageQs = faqPageSections.flatMap(s => s.faqs)
write('/faq', buildPage({
  path: '/faq',
  title: 'FAQ — WalletLens Free Net Worth Tracker',
  description: 'Answers to common questions about WalletLens: is it free, where your data is stored, supported assets, live price sources, backups, the AI analysis, the Chrome extension, and troubleshooting.',
  bodyHtml: `
<h1>Frequently Asked Questions</h1>
<p>Everything about tracking your net worth with WalletLens — free, private, no account. Can't find your answer? Email <a href="mailto:contact@walletlens.live">contact@walletlens.live</a>.</p>
${faqPageSections.map(s => `<h2>${esc(s.title)}</h2>\n` + s.faqs.map(f => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')).join('\n')}
<p><a href="/dashboard">Open WalletLens free</a> · <a href="/about">About</a> · <a href="/blog">Blog</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a></p>
`,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: allFaqPageQs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}))

// ── Market Index (data page — press & citation magnet) ───────────────────────
write('/market-index', buildPage({
  path: '/market-index',
  title: 'WalletLens Market Index — Live Crypto Sentiment Data',
  description: 'A free, citable live crypto market sentiment dataset — a 0–100 score from market breadth, momentum and large-cap leadership across the top 250 coins. Open data for journalists and researchers.',
  bodyHtml: `
<h1>Crypto Fear & Greed Index — WalletLens Market Sentiment Score</h1>
<p>The WalletLens Market Index is a live <strong>0–100 fear and greed score</strong> for the crypto market — updated continuously from three public-data signals across the top 250 cryptocurrencies. It is free for anyone to read, cite, and link.</p>
<h2>How the fear and greed score is calculated</h2>
<p>The score is a weighted blend of <strong>market breadth</strong> (45%, the share of the top 100 coins up over 24h), <strong>momentum</strong> (35%, the average normalised 24h move of the top 50), and <strong>large-cap leadership</strong> (20%, the share of the top 10 by market cap that are up). All inputs are public market data.</p>
<h2>How to read the score</h2>
<ul>
<li><strong>0–24 — Extreme Fear:</strong> most participants are selling. Historically a contrarian buy signal.</li>
<li><strong>25–49 — Fear:</strong> market pessimistic; may be oversold.</li>
<li><strong>50 — Neutral:</strong> balanced sentiment.</li>
<li><strong>51–74 — Greed:</strong> positive momentum; watch for overextension.</li>
<li><strong>75–100 — Extreme Greed:</strong> often precedes corrections.</li>
</ul>
<h2>Citing the WalletLens Market Index</h2>
<p>Journalists, researchers and bloggers may cite the index freely. Use the format: "WalletLens Market Index: [score]/100 ([label])" and link <a href="/market-index">walletlens.live/market-index</a>.</p>
<p><a href="/fear-and-greed-index">Fear and Greed Index guide</a> · <a href="/dashboard">Open WalletLens free</a> · <a href="/blog">Blog</a> · <a href="/">Home</a></p>
`,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'WalletLens Crypto Fear & Greed Index',
      description: 'A live 0–100 crypto fear and greed index built from market breadth, momentum and large-cap leadership across the top 250 cryptocurrencies.',
      url: `${ORIGIN}/market-index`,
      creator: { '@type': 'Organization', name: 'WalletLens', url: ORIGIN },
      license: `${ORIGIN}/terms`,
      isAccessibleForFree: true,
      variableMeasured: 'Crypto Fear and Greed Index (0–100)',
      keywords: 'fear and greed index, crypto sentiment, market mood, crypto fear greed',
    },
  ],
}))
console.log('Prerendered /market-index data page.')

// ── Fear & Greed Index (dedicated SEO landing — targets 73 impressions/0 clicks) ──
const fgFaq = faqBlock([
  {
    q: 'What is the crypto fear and greed index?',
    a: 'The crypto fear and greed index is a 0–100 sentiment score that measures whether market participants are currently fearful (selling, pessimistic) or greedy (buying, optimistic). Scores below 25 indicate extreme fear; above 75 indicate extreme greed. It is used as a contrarian indicator — extreme fear often precedes rallies, while extreme greed often precedes corrections.',
  },
  {
    q: 'What does an extreme fear reading mean?',
    a: 'Extreme fear (0–24) means the majority of market participants are selling or holding cash out of fear. Historically, extreme fear readings in crypto have often preceded market recoveries, though fear can deepen before reversing. Many investors treat it as a potential buying opportunity, following Warren Buffett\'s principle: "be fearful when others are greedy and greedy when others are fearful."',
  },
  {
    q: 'What does an extreme greed reading mean?',
    a: 'Extreme greed (75–100) signals that the market is overheated — most participants are buying aggressively and FOMO is elevated. Historically, sustained extreme greed readings have often preceded price corrections. Risk-aware investors use this as a signal to reduce exposure or tighten stop-losses.',
  },
  {
    q: 'How often is the fear and greed index updated?',
    a: 'The WalletLens fear and greed index is updated continuously in real time from live market data across the top 250 cryptocurrencies by market cap.',
  },
  {
    q: 'What is a good fear and greed index number to buy?',
    a: 'There is no universal "good" number — it depends on your strategy and risk tolerance. Contrarian investors typically look for readings below 25 (extreme fear) as potential entry points. Long-term investors often ignore short-term sentiment and focus on fundamentals. The index is a supporting tool, not a standalone buy or sell signal.',
  },
  {
    q: 'How is the WalletLens fear and greed index calculated?',
    a: 'The WalletLens index is a weighted blend of market breadth (45% — the share of top 100 coins up over 24h), momentum (35% — the average normalised 24h price move of the top 50 coins), and large-cap leadership (20% — the share of the top 10 coins by market cap that are up). All data comes from public market sources.',
  },
  {
    q: 'Where can I see the live fear and greed index?',
    a: 'The live WalletLens fear and greed index is displayed on the Market Index page at walletlens.live/market-index and inside the WalletLens dashboard at walletlens.live/dashboard — free, no account required.',
  },
])
write('/fear-and-greed-index', buildPage({
  path: '/fear-and-greed-index',
  title: 'Fear and Greed Index — Live Crypto Sentiment Score | WalletLens',
  description: 'Live fear and greed index for crypto: a 0–100 sentiment score from market breadth, momentum and volume across 250 coins. See if markets are in extreme fear or extreme greed right now — free.',
  bodyHtml: `
<h1>Fear and Greed Index — Live Crypto Market Sentiment</h1>
<p>The <strong>fear and greed index</strong> is a 0–100 score that captures whether crypto market participants are currently driven by fear (selling, panic) or greed (buying, FOMO). The WalletLens index is updated continuously from live market data across the top 250 cryptocurrencies.</p>
<p><a href="/market-index">→ See the live score on the Market Index page</a></p>

<h2>How to read the fear and greed scale</h2>
<ul>
<li><strong>0–24 — Extreme Fear:</strong> Market participants are panic-selling or holding cash. Historically a contrarian buy opportunity.</li>
<li><strong>25–49 — Fear:</strong> Pessimism dominates. Market may be oversold but sellers are still in control.</li>
<li><strong>50 — Neutral:</strong> Balanced sentiment between buyers and sellers.</li>
<li><strong>51–74 — Greed:</strong> Optimism and positive momentum. Watch for overextension.</li>
<li><strong>75–100 — Extreme Greed:</strong> FOMO-driven buying. Historically precedes corrections.</li>
</ul>

<h2>How the WalletLens fear and greed index works</h2>
<p>The score is calculated from three signals across the top 250 cryptocurrencies:</p>
<ul>
<li><strong>Market breadth (45%):</strong> the share of the top 100 coins that are up over 24 hours. When most coins are rising, sentiment is greedy; when most are falling, fearful.</li>
<li><strong>Momentum (35%):</strong> the average normalised 24-hour price move of the top 50 coins. Strong up-moves push the score toward greed; sharp declines push toward fear.</li>
<li><strong>Large-cap leadership (20%):</strong> the share of the top 10 coins by market cap that are up. Bitcoin and Ethereum leading up signals broader confidence.</li>
</ul>

<h2>How to use the fear and greed index in your investing</h2>
<p>The fear and greed index is a <strong>contrarian sentiment tool</strong> — it tells you what the crowd is doing so you can decide whether to follow or fade them:</p>
<ul>
<li><strong>Extreme fear as a buying signal:</strong> When the index is below 25, fear is peak. Historically, buying during extreme fear and holding has outperformed buying during greed in most crypto cycles.</li>
<li><strong>Extreme greed as a risk-reduction signal:</strong> When the index is above 75, assess whether to reduce exposure, set tighter stop-losses, or take partial profits.</li>
<li><strong>Confirm with technicals:</strong> Sentiment alone is not a trading signal. Combine with price structure, support/resistance levels, and your own time horizon.</li>
<li><strong>Ignore short-term noise:</strong> Daily swings in the fear and greed index are common. The signal is most useful at extremes (below 20 or above 80) and when sustained for multiple days.</li>
</ul>

<h2>Track your portfolio alongside the fear and greed index</h2>
<p><a href="https://walletlens.live">WalletLens</a> shows the live fear and greed index inside the dashboard alongside your full portfolio — crypto, stocks, gold, and cash — so you always know the market sentiment context when you are looking at your holdings. It is 100% free, needs no account, and keeps all your data on your device.</p>
<p><a href="/market-index">Live fear and greed score →</a> · <a href="/dashboard">Open portfolio dashboard →</a> · <a href="/blog">Read the blog →</a></p>

${fgFaq.html}
`,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Fear and Greed Index', item: `${ORIGIN}/fear-and-greed-index/` },
      ],
    },
    fgFaq.jsonLd,
  ],
}))
console.log('Prerendered /fear-and-greed-index landing page.')

// ── Portfolio rebalancing calculator (/rebalancing-calculator) ───────────────
// Targets high-impression, zero-click rebalancing queries seen in Search
// Console: "how to rebalance a crypto portfolio", "asset rebalancing",
// "rebalancing portfolio", "portfolio rebalancing calculator". An interactive
// tool page that gives searchers exactly what they want.
const rbFaq = faqBlock([
  {
    q: 'How do I calculate how much to rebalance?',
    a: 'For each asset, multiply your target percentage by your total portfolio value to get its target dollar value, then subtract its current value. A positive result means buy that amount; a negative result means sell it. The WalletLens rebalancing calculator does this for every asset instantly.',
  },
  {
    q: 'How often should I rebalance my portfolio?',
    a: 'Common approaches are rebalancing on a fixed schedule — quarterly or annually — or whenever an allocation drifts beyond a set threshold like 5%. Rebalancing too often raises trading costs and taxes; too rarely lets risk build up. A threshold-based check every quarter is a popular middle ground.',
  },
  {
    q: 'How do I rebalance a crypto portfolio without selling?',
    a: 'Use new contributions. Instead of selling overweight coins, direct fresh cash only into the underweight assets until your allocation is back on target. This avoids triggering capital-gains tax. The calculator has a "new cash to invest" field that rebalances using contributions first.',
  },
  {
    q: 'Does rebalancing improve returns?',
    a: 'Rebalancing is primarily about controlling risk, not maximising returns. It keeps your portfolio aligned with your plan and enforces a buy-low, sell-high discipline. In a long one-way bull market it can lag a portfolio left untouched, but it meaningfully reduces drawdowns when trends reverse.',
  },
  {
    q: 'Is the rebalancing calculator free?',
    a: 'Yes — the WalletLens portfolio rebalancing calculator is 100% free, requires no account or sign-up, and runs entirely in your browser. Nothing you enter is stored or sent to a server.',
  },
])
write('/rebalancing-calculator', buildPage({
  path: '/rebalancing-calculator',
  title: 'Portfolio Rebalancing Calculator — Free & Instant | WalletLens',
  description: 'Free portfolio rebalancing calculator. Enter your holdings and target allocation to see exactly how much of each asset to buy or sell — crypto, stocks, metals and cash. No account needed.',
  bodyHtml: `
<h1>Portfolio Rebalancing Calculator — Free &amp; Instant</h1>
<p>Enter your holdings and your target allocation, and this <strong>portfolio rebalancing calculator</strong> shows exactly how much of each asset to <strong>buy or sell</strong> to get back to your plan — crypto, stocks, metals and cash in one place. Free, no account, nothing leaves your browser.</p>

<h2>How to rebalance your portfolio</h2>
<ol>
<li>List each <strong>asset</strong> you hold — Bitcoin, Ethereum, stocks, gold, cash, anything.</li>
<li>Enter its <strong>current value</strong> in dollars.</li>
<li>Set your <strong>target allocation %</strong> for each asset (these should add up to 100%).</li>
<li>Optionally add <strong>new cash</strong> you plan to invest — the calculator rebalances with it first, which avoids selling and reduces taxes.</li>
<li>Read the <strong>action</strong> for each asset: the exact dollar amount to buy or sell.</li>
</ol>

<h2>What is portfolio rebalancing?</h2>
<p>Rebalancing is the discipline of periodically restoring your portfolio to its target allocation. Over time, winning assets grow to take up a larger share than you intended, which quietly raises your risk. Rebalancing trims overweight winners and tops up underweight positions, enforcing a built-in buy-low, sell-high habit and keeping your risk consistent with your plan.</p>
<p>Most investors rebalance on a schedule (quarterly or annually) or when an allocation drifts past a threshold such as 5%. If you add money regularly, you can often rebalance with new contributions alone — buying only the underweight assets — so you never have to sell and trigger capital-gains tax.</p>

<h2>Track your allocation live — beyond the calculator</h2>
<p>This calculator is perfect for a one-off rebalance, but your allocation drifts every day as prices move. <a href="https://walletlens.live">WalletLens</a> shows your live allocation across crypto, stocks, metals and cash automatically — so you see the moment a position drifts and can decide whether to rebalance. It is 100% free, needs no account, and your data stays on your device.</p>
<p><a href="/dashboard">Open the free portfolio tracker →</a> · <a href="/learn/portfolio-rebalancing">What is rebalancing?</a> · <a href="/learn/asset-allocation">Asset allocation</a> · <a href="/blog/how-to-rebalance-crypto-stock-portfolio">Rebalancing guide</a></p>

${rbFaq.html}
`,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Portfolio Rebalancing Calculator', item: `${ORIGIN}/rebalancing-calculator/` },
      ],
    },
    howToJsonLd('How to rebalance your portfolio', [
      'List each asset you hold — crypto, stocks, gold, cash.',
      'Enter the current dollar value of each asset.',
      'Set your target allocation percentage for each asset, totalling 100%.',
      'Optionally add new cash to invest, which rebalances with contributions first.',
      'Read the action for each asset: the exact dollar amount to buy or sell.',
    ]),
    rbFaq.jsonLd,
  ],
}))
console.log('Prerendered /rebalancing-calculator tool page.')

// ── $LENZ token ──────────────────────────────────────────────────────────────
const lenzFaqs = [
  { q: 'What is $LENZ?',
    a: '$LENZ is the native token of walletlens.live — a free, no-account, privacy-first all-asset portfolio tracker on Sui. It is a standard Sui coin with a fixed 10,000,000 supply and minting frozen forever. You earn $LENZ by using and sharing the app, and holders unlock premium features. The free core tracker never requires it.' },
  { q: 'How do I earn $LENZ?',
    a: 'By using WalletLens and helping it grow — tracking your portfolio, daily streaks, completing Academy lessons, referring active users, and sharing content. Earning opens at launch (you can join the waitlist now). You collect points that convert to $LENZ — no purchase, ever.' },
  { q: 'Why Sui?',
    a: 'Sui is fast, low-fee and has a large, growing ecosystem, so $LENZ is easy to buy (Cetus, Turbos, FlowX, DeepBook and aggregators) and easy to discover — listing on CoinGecko and CoinMarketCap is free, with no costly gatekeepers.' },
  { q: 'Does holding $LENZ change the app?',
    a: 'The free tracker is always 100% free and never requires $LENZ. Holding or locking $LENZ unlocks optional extras — an ad-free app, pro analytics and governance — rolling out after launch. It only adds on top; it never gates the core features.' },
  { q: 'Is $LENZ private?',
    a: 'No, and we will not pretend otherwise. Sui is a public chain, so balances and transfers are visible on a block explorer. The privacy is in the product: WalletLens keeps all your portfolio data on your device. $LENZ is the native/utility token of that privacy-first app, not a privacy coin.' },
  { q: 'What is the supply, and are there unlocks?',
    a: 'A fixed 10,000,000 LENZ, minted once with minting frozen forever — no inflation. There is no team or insider allocation. Reward and reserve tokens are released transparently over time from a public, time-locked schedule rather than all at once, which protects holders from sudden sell pressure. Everything is verifiable on-chain.' },
  { q: 'Where can I get or trade $LENZ?',
    a: 'At launch, on Sui DEXes (Cetus, Turbos, FlowX) and aggregators; it also auto-appears on DexScreener and DexTools, and we will apply to CoinGecko and CoinMarketCap (both free). Before launch, you earn it by using the app — join the waitlist on the Earn page.' },
  { q: 'How do I know $LENZ is not a scam?',
    a: 'Verify instead of trusting: fixed 10,000,000 supply, minting frozen, immutable metadata, 0% insider allocation, reserves time-locked on a public schedule, and locked liquidity — all verifiable on-chain (the repo ships a verify-onchain.sh that prints a PASS/FAIL report). The only official package id and coin type are published on this page and in the open-source repo.' },
  { q: 'Is this financial advice or an investment offer?',
    a: 'No. This page is informational only. $LENZ is not financial advice and nothing here is an offer to sell a security. Do your own research.' },
]
write('/lenz', buildPage({
  path: '/lenz',
  title: '$LENZ — Native Token of walletlens.live (on Sui)',
  description: '$LENZ is the native token of walletlens.live, a free privacy-first all-asset portfolio tracker. A fixed 10M-supply Sui coin with minting frozen and 0% insider allocation. Earn it by using the app; hold for perks. Tokenomics, distribution, utility and FAQ. Informational only, not financial advice.',
  bodyHtml: `
<h1>$LENZ — The Native Token of walletlens.live</h1>
<p>$LENZ is the native token of walletlens.live — a 100% free, no-account, privacy-first all-asset portfolio tracker for crypto, stocks, precious metals, fiat and real estate, with AI insights and live prices, where all your data stays on your device. It is a standard Sui coin with a fixed 10,000,000 supply and minting frozen forever. You earn $LENZ by using and sharing the app, and holders unlock premium features.</p>
<h2>Why Sui</h2>
<p>Sui is fast and low-fee with a large, growing ecosystem, so $LENZ is easy to buy (Cetus, Turbos, FlowX, DeepBook and aggregators) and easy to list — CoinGecko and CoinMarketCap applications are free. Sui is a public chain, so $LENZ is the native/utility token of a privacy-first app, not a privacy coin. The privacy is in the product: your portfolio data stays on your device.</p>
<h2>Tokenomics — fixed supply, fair</h2>
<ul>
<li>Name / ticker: WalletLens / LENZ</li>
<li>Type: standard Sui coin; supply locked by freezing the TreasuryCap</li>
<li>Chain: Sui</li>
<li>Max supply: 10,000,000 LENZ — fixed, minting frozen forever (no inflation)</li>
<li>Insiders: 0% — no team or VC allocation</li>
<li>Distribution: earn-based; reward &amp; reserve tokens released over time from a public, time-locked schedule</li>
<li>Decimals: 6 (1 LENZ = 1,000,000 base units)</li>
<li>Supply: publicly verifiable on-chain</li>
</ul>
<h2>Distribution — community-first, no insider bag</h2>
<ul>
<li>Community rewards (use &amp; earn) — 50% (5,000,000 LENZ), released over time</li>
<li>Liquidity — 35% (3,500,000 LENZ), LP locked</li>
<li>Ecosystem / DAO treasury — 15% (1,500,000 LENZ), transparent &amp; time-locked</li>
<li>Founder / team — 0%</li>
</ul>
<h2>Utility</h2>
<ul>
<li>Use &amp; earn — earn $LENZ by using WalletLens and sharing it; no purchase required.</li>
<li>Holders unlock an ad-free app and pro features (after launch).</li>
<li>Governance over the roadmap, supported assets, and treasury spend.</li>
<li>The free core tracker always stays free and never requires $LENZ.</li>
</ul>
<h2>How to buy and hold $LENZ (wallet &amp; gas)</h2>
<p>$LENZ lives on Sui, so you need a Sui wallet and a little SUI for gas.</p>
<ol>
<li>Install a wallet — Slush (Sui Wallet) or Suiet.</li>
<li>Get a little SUI for gas — buy SUI and withdraw to your Sui address. A fraction of a SUI covers many transactions.</li>
<li>Swap for $LENZ on a Sui DEX (Cetus, Turbos, BlueMove) or an aggregator, using the official coin type published here once live.</li>
<li>Verify the coin type before swapping — only trade the official package::lenz::LENZ shown on this page, to avoid impostor coins.</li>
</ol>
<h2>Legitimacy — don't trust, verify</h2>
<p>$LENZ is a real, long-term token, and every protection is independently verifiable on-chain. Once deployed, the official package id and coin type are published here and in the repo, and anyone can run the verification script to confirm the total supply is 10,000,000 LENZ, that the TreasuryCap is frozen so minting is permanently impossible, that the metadata is immutable, that there is no team or insider allocation (reserves are time-locked on a public schedule), and that liquidity is locked.</p>
<p><strong>Beware of scams.</strong> The only official $LENZ package id and coin type live on this page and in the WalletLens repo. WalletLens will never DM you, never run a "claim/airdrop" site that asks you to connect a wallet or sign a transaction, and never asks for your seed phrase. Anything that does is fraudulent.</p>
<h2>Frequently asked questions</h2>
${lenzFaqs.map(f => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}
<h2>Disclaimer</h2>
<p>This page is informational only and is not financial advice and not an offer to sell a security. Tokenomics shown are draft launch parameters and may change. Do your own research.</p>
<p><a href="/about">About WalletLens</a> · <a href="/privacy">Privacy Policy</a> · <a href="/">Home</a></p>
`,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: lenzFaqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}))

// ── $LENZ airdrop ─────────────────────────────────────────────────────────────
write('/airdrop', buildPage({
  path: '/airdrop',
  title: 'Earn $LENZ — Use WalletLens, get rewarded (coming soon)',
  description: 'Earn $LENZ, the native token of walletlens.live, by using the app and sharing it. Use & earn — daily streaks, Academy, referrals, threads. Points convert to $LENZ at launch. No purchase, no wallet connection to join. Coming soon — join the waitlist.',
  bodyHtml: `
<h1>Earn $LENZ</h1>
<p>WalletLens is the net-worth tracker that rewards you for using it. Use the app and share it to earn points — converted to $LENZ at launch. Free forever, no purchase. <strong>Coming soon</strong> — join the waitlist now by adding your Sui address (no wallet connection).</p>
<h2>Ways to earn (coming soon)</h2>
<p>Use the app: daily streaks, create a portfolio, track 3+ assets, complete Academy lessons, use features, install the PWA. Share &amp; grow: refer an active friend, write a thread about WalletLens/$LENZ, mention @wallet_lens, share an article or your portfolio card, follow + repost.</p>
<h2>How it works</h2>
<p>Now: join the waitlist with just your Sui address — no wallet connection, no signature. At launch: earning opens; points convert to $LENZ from a fixed budget, pro-rata, capped per wallet, claimed on-chain (claim-once). Fair and private: no sale, no insider bag; we store only your address and points, never your holdings. After launch: hold or lock $LENZ to unlock perks (ad-free, pro features) — coming soon.</p>
<p><strong>Beware of scams.</strong> The only official page is walletlens.live/airdrop. WalletLens will never DM you a claim link, never ask you to connect a wallet to join, and never asks for your seed phrase.</p>
<h2>Disclaimer</h2>
<p>Informational only — not financial advice and not an offer to sell a security. Earning is not live yet; actions, points and dates are draft and may change. Participation does not guarantee an allocation. Do your own research.</p>
<p><a href="/lenz">About $LENZ</a> · <a href="/">WalletLens</a> · <a href="/privacy">Privacy Policy</a></p>
`,
}))

// ── Privacy ──────────────────────────────────────────────────────────────────
write('/privacy', buildPage({
  path: '/privacy',
  title: 'Privacy Policy — WalletLens',
  description: 'WalletLens privacy policy. Your portfolio data is stored locally in your browser. No server, no account, no data collection.',
  bodyHtml: `
<h1>Privacy Policy</h1>
<p><em>Effective: January 2025</em></p>
<h2>Data we do not collect</h2>
<p>WalletLens does not collect, store, or transmit any personal data or portfolio information. There is no account, no login, no database, and no server that receives your holdings.</p>
<h2>Local storage</h2>
<p>All portfolio data (trades, targets, wallet names) is stored in your browser's <code>localStorage</code>. It never leaves your device except when you explicitly export a backup code, which you copy yourself.</p>
<h2>External API calls</h2>
<p>To display live prices, WalletLens calls public APIs directly from your browser: CoinGecko, Binance, CoinCap, Stooq, Gold-API, and open exchange-rate APIs. These calls contain no personal information.</p>
<h2>AI analysis</h2>
<p>If you use the AI Portfolio Analysis feature, an anonymised snapshot of your holdings (no names, no account details) is sent to the Anthropic API for processing. This is opt-in, performed on demand, and subject to Anthropic's privacy policy.</p>
<h2>Analytics</h2>
<p>We use Google Analytics (anonymised, no ad conversion signals) to understand aggregate traffic. No personally identifiable information is collected.</p>
<h2>Contact</h2>
<p>If you have any questions about this Privacy Policy, please email us at <a href="mailto:contact@walletlens.live">contact@walletlens.live</a>.</p>
<p><a href="/about">About WalletLens</a> · <a href="/terms">Terms of Service</a></p>
`,
}))

// ── Terms ────────────────────────────────────────────────────────────────────
write('/terms', buildPage({
  path: '/terms',
  title: 'Terms of Service — WalletLens',
  description: 'WalletLens terms of service. Free to use, no warranty. All portfolio data stays in your browser.',
  bodyHtml: `
<h1>Terms of Service</h1>
<p><em>Effective: January 2025</em></p>
<h2>Acceptance</h2>
<p>By using WalletLens you agree to these terms. If you do not agree, please do not use the service.</p>
<h2>Free service, no warranty</h2>
<p>WalletLens is provided free of charge and "as is", without warranty of any kind. Live prices are sourced from public APIs and may be delayed or inaccurate. Nothing on WalletLens constitutes financial advice.</p>
<h2>Your data</h2>
<p>Your portfolio data is stored in your browser. You are solely responsible for maintaining backups via the export feature. WalletLens has no ability to recover lost data.</p>
<h2>Acceptable use</h2>
<p>You may not use WalletLens for any unlawful purpose, attempt to reverse-engineer or scrape the service, or misuse the public price APIs it relies on.</p>
<h2>Changes</h2>
<p>We may update these terms at any time. Continued use of WalletLens after changes constitutes acceptance of the updated terms.</p>
<h2>Contact</h2>
<p>If you have any questions about these Terms, please email us at <a href="mailto:contact@walletlens.live">contact@walletlens.live</a>.</p>
<p><a href="/about">About WalletLens</a> · <a href="/privacy">Privacy Policy</a></p>
`,
}))

console.log(`\nPrerendered ${POSTS.length + 8} content pages into dist/.`)

// ── App-route shells (noindex) ───────────────────────────────────────────────
// In-app pages have no crawlable content (everything renders client-side from
// the user's local data). Without a prerendered dir, GitHub Pages serves
// 404.html + a JS redirect, which Googlebot reports as "Discovered – currently
// not indexed" noise. A 200 + explicit noindex,follow gives crawlers a clean,
// stable answer and keeps these URLs out of indexing reports.
// ── Vision page (/vision) ──────────────────────────────────────────────────
{
  const vFaq = faqBlock([
    {
      q: 'What is a portfolio vision plan?',
      a: 'A portfolio vision plan divides your net worth into named buckets — such as an emergency fund, a long-term hold, and a withdrawal plan — so you always know what each dollar is for and how long your money will last.',
    },
    {
      q: 'How do I set up a withdrawal runway?',
      a: 'In WalletLens Vision, create a bucket for your spending funds and enter your monthly withdrawal amount. The app automatically calculates how many months and years your current balance can sustain that spend rate.',
    },
    {
      q: 'Can I link my actual portfolio holdings to a bucket?',
      a: 'Yes. When editing a bucket, select any of your tracked assets (crypto, stocks, metals, cash) to link them. The bucket\'s current value is then pulled live from your holdings so you always see your real allocation.',
    },
    {
      q: 'Is Portfolio Vision free?',
      a: 'Yes — Portfolio Vision is part of WalletLens, which is 100% free with no account, no subscription, and no ads. All your bucket data is stored privately on your device.',
    },
    {
      q: 'How is the unallocated (rest) bucket calculated?',
      a: 'If you mark a bucket as "Remaining", WalletLens automatically sets its value to your total net worth minus the sum of all other buckets. This ensures every dollar is accounted for.',
    },
  ])
  const vBody = `
<h1>Portfolio Vision — Plan Every Dollar of Your Net Worth</h1>
<p>WalletLens Portfolio Vision lets you divide your entire net worth into purpose-driven <strong>buckets</strong> — an emergency fund, a long-term BTC hold, a monthly salary bucket, and anything else you need — and see a live donut chart, progress bars, and a <strong>withdrawal runway</strong> for each one. All free, no account, data stays on your device.</p>
<p><a href="/vision">Open Portfolio Vision free →</a></p>
<h2>What you can do with Portfolio Vision</h2>
<ul>
<li><strong>Name every dollar</strong> — create buckets like "Salary cover 3 years", "BTC long-term hold", and "Alt coins" and assign real holdings to each.</li>
<li><strong>Withdrawal runway calculator</strong> — enter a monthly spend for any bucket and see exactly how many months and years the balance will last.</li>
<li><strong>Live values</strong> — link your tracked assets so each bucket's value updates automatically with live market prices.</li>
<li><strong>Progress toward targets</strong> — set a fixed-dollar or percentage-of-net-worth target per bucket and track progress with a visual bar.</li>
<li><strong>Donut chart overview</strong> — see your entire vision in one colour-coded allocation chart.</li>
</ul>
<h2>How to set up your portfolio vision</h2>
<ol>
<li>Open WalletLens — no account or email required.</li>
<li>Navigate to Portfolio Vision from the side menu.</li>
<li>Click "Add Bucket" and give it a name, type (emergency / hold / withdrawal / investment / rest), and colour.</li>
<li>Optionally set a target amount or a percentage of your net worth.</li>
<li>Enter a monthly withdrawal to see the runway for that bucket.</li>
<li>Link any of your tracked holdings so the bucket value stays live.</li>
</ol>
<p><a href="/vision">Start planning your portfolio vision →</a></p>
${vFaq.html}
<p><a href="/dashboard">Portfolio dashboard</a> · <a href="/blog/portfolio-vision-planning">Portfolio Vision Planning guide</a> · <a href="/blog/crypto-withdrawal-strategy">Crypto Withdrawal Strategy</a> · <a href="/blog/net-worth-goal-buckets">Net Worth Goal Buckets</a> · <a href="/free-net-worth-tracker">Free net worth tracker</a></p>`

  write('/vision', buildPage({
    path: '/vision',
    title: brandTitle('Portfolio Vision — Plan Every Dollar of Your Net Worth'),
    description: 'Plan your entire net worth with purpose-driven buckets in WalletLens. Set withdrawal runway, link live holdings, track targets — free, no account, data on your device.',
    bodyHtml: vBody,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: 'Portfolio Vision', item: ORIGIN + '/vision/' },
        ],
      },
      howToJsonLd('How to set up your portfolio vision plan', [
        'Open WalletLens — no account or email required.',
        'Navigate to Portfolio Vision from the side menu.',
        'Click "Add Bucket" and give it a name, type, and colour.',
        'Set a target amount or a percentage of your net worth.',
        'Enter a monthly withdrawal amount to calculate your runway.',
        'Link your tracked holdings so the bucket value updates live.',
      ]),
      vFaq.jsonLd,
    ],
  }))
  console.log('Prerendered /vision.')
}

const APP_ROUTES = [
  { path: '/dashboard',    title: 'Dashboard — WalletLens',      description: 'Your private portfolio dashboard. Data stays on your device.' },
  { path: '/transactions', title: 'Trades — WalletLens',         description: 'Your transaction history. Data stays on your device.' },
  { path: '/whales',       title: 'Whale Tracker — WalletLens',  description: 'Real-time large Bitcoin transactions and volume anomalies.' },
  { path: '/alpha',        title: 'Alpha — WalletLens',          description: 'Market signals and analysis tools.' },
  { path: '/academy',      title: 'Academy — WalletLens',        description: 'Learn portfolio tracking and investing concepts.' },
  { path: '/coach',        title: 'AI Coach — WalletLens',       description: 'AI-powered portfolio analysis, computed on your device.' },
  { path: '/technicals',   title: 'Analysis — WalletLens',       description: 'Technical analysis for your holdings.' },
  { path: '/settings',     title: 'Settings — WalletLens',       description: 'App preferences. Data stays on your device.' },
]
for (const r of APP_ROUTES) {
  write(r.path, buildPage({
    path: r.path,
    title: r.title,
    description: r.description,
    noindex: true,
    bodyHtml: `<h1>${esc(r.title.replace(' — WalletLens', ''))}</h1><p>${esc(r.description)} <a href="/">Open WalletLens</a> — free, private, no account needed.</p>`,
  }))
}
console.log(`Prerendered ${APP_ROUTES.length} app-route shells (noindex).`)

// ── Deleted-route redirect stubs ───────────────────────────────────────────
// GitHub Pages ignores _redirects. For removed pages that Googlebot has cached
// (shows up in Search Console as "Not found 404"), we emit a prerendered HTML
// stub with meta-refresh + canonical pointing to the replacement URL, plus
// noindex,follow. This gives Googlebot a 200 with a clear redirect signal,
// dequeuing the 404 from Search Console without creating a new indexable page.
function writeRedirect(fromPath, toPath, title) {
  const toUrl = ORIGIN + withSlash(toPath)
  let html = template
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/,    `$1${esc(toUrl)}$2`)
  html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, follow" />')
  html = html.replace('</head>', `  <meta http-equiv="refresh" content="0;url=${esc(toUrl)}" />\n</head>`)
  const seo = `<div id="prerender-content" style="position:absolute;left:0;top:0;width:100%;z-index:0;padding:2rem 1.25rem;color:#e7eaf0;font-family:system-ui,-apple-system,sans-serif;line-height:1.7"><p>This page has moved. <a href="${esc(toUrl)}">Continue →</a></p></div>`
  html = html.replace('<div id="root">', `<div id="root">${seo}`)
  write(fromPath, html)
}

writeRedirect('/market', '/dashboard', 'Market — WalletLens')
console.log('Prerendered /market redirect stub → /dashboard.')

// ── sitemap.xml ────────────────────────────────────────────────────────────
// Only list pages with prerendered content and their own canonical tags.
// App routes (/dashboard, /whales, /alpha, etc.) are intentionally excluded:
// they serve the same index.html as the homepage and cause Google to flag
// "Duplicate, Google chose different canonical than user".
const STATIC_ROUTES = [
  { path: '/',        changefreq: 'weekly',  priority: '1.0' },
  { path: '/free-net-worth-tracker', changefreq: 'weekly', priority: '0.9' },
  { path: '/crypto-and-stock-portfolio-tracker', changefreq: 'weekly', priority: '0.9' },
  { path: '/portfolio-tracker-no-account', changefreq: 'weekly', priority: '0.9' },
  { path: '/import-portfolio-from-screenshot', changefreq: 'monthly', priority: '0.9' },
  { path: '/add-holdings-by-voice', changefreq: 'monthly', priority: '0.9' },
  { path: '/export-portfolio-to-excel', changefreq: 'monthly', priority: '0.9' },
  { path: '/crypto-portfolio-tax-report', changefreq: 'monthly', priority: '0.9' },
  { path: '/blog',    changefreq: 'weekly',  priority: '0.9' },
  { path: '/market-index', changefreq: 'daily', priority: '0.9' },
  { path: '/fear-and-greed-index', changefreq: 'daily', priority: '0.9' },
  { path: '/rebalancing-calculator', changefreq: 'monthly', priority: '0.85' },
  { path: '/about',   changefreq: 'monthly', priority: '0.7' },
  { path: '/lenz',    changefreq: 'monthly', priority: '0.6' },
  { path: '/airdrop', changefreq: 'weekly',  priority: '0.7' },
  { path: '/vision',  changefreq: 'monthly', priority: '0.8' },
  { path: '/faq',     changefreq: 'monthly', priority: '0.7' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.5' },
  { path: '/terms',   changefreq: 'monthly', priority: '0.5' },
]
function urlEntry({ loc, lastmod, changefreq, priority }) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
}
// Arabic routes (hreflang relationships are declared in each page's <head>).
const AR_ROUTES = [
  '/ar/free-net-worth-tracker',
  '/ar/import-portfolio-from-screenshot',
  '/ar/add-holdings-by-voice',
  ...Object.keys(AR_COMPARISONS).map(slug => `/ar/vs/${slug}`),
  ...AR_POSTS.map(p => `/ar/blog/${p.slug}`),
]
// NOTE: /track, /calculator and /price are intentionally EXCLUDED from the
// sitemap and marked noindex in their prerendered HTML. They are templated SEO
// pages (same structure, only the asset name changes) — listing them dilutes
// the site's indexed quality and triggers "scaled content" / low-value flags
// (Google Search quality + AdSense). They remain live and usable for direct
// visitors. Only genuinely unique content (articles, glossary, comparisons,
// core pages) is submitted for indexing.
const sitemapUrls = [
  ...STATIC_ROUTES.map(r => urlEntry({ loc: ORIGIN + withSlash(r.path), lastmod: TODAY, changefreq: r.changefreq, priority: r.priority })),
  ...POSTS.map(p => urlEntry({ loc: `${ORIGIN}/blog/${p.slug}/`, lastmod: postIsoDate(p.date), changefreq: 'monthly', priority: '0.85' })),
  ...COMPARISONS.map(c => urlEntry({ loc: `${ORIGIN}/vs/${c.slug}/`, lastmod: TODAY, changefreq: 'monthly', priority: '0.75' })),
  ...GLOSSARY.map(t => urlEntry({ loc: `${ORIGIN}/learn/${t.slug}/`, lastmod: TODAY, changefreq: 'monthly', priority: '0.6' })),
  ...AR_ROUTES.map(p => urlEntry({ loc: ORIGIN + withSlash(p), lastmod: TODAY, changefreq: 'monthly', priority: '0.85' })),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.join('\n')}\n</urlset>\n`
writeFileSync(resolve(DIST, 'sitemap.xml'), sitemap, 'utf8')
console.log(`Wrote sitemap.xml (${sitemapUrls.length} urls; track/calculator/price excluded as noindex).`)

// ── rss.xml (blog feed) ──────────────────────────────────────────────────────
// A real RSS 2.0 feed of every article. Feed readers, news aggregators, AI
// ingestion pipelines and search engines use it to discover and re-crawl fresh
// content fast — far quicker than waiting for a full site recrawl. Linked from
// every page's <head> via <link rel="alternate" type="application/rss+xml">.
const rssDate = (d) => new Date(d).toUTCString()
// POSTS, newest first by parsed date (falls back to build date for unparseable).
const sortedPosts = [...POSTS].sort((a, b) => new Date(postIsoDate(b.date)) - new Date(postIsoDate(a.date)))
const rssItems = sortedPosts.map(p => `    <item>
      <title>${esc(p.title)}</title>
      <link>${ORIGIN}/blog/${p.slug}/</link>
      <guid isPermaLink="true">${ORIGIN}/blog/${p.slug}/</guid>
      <pubDate>${rssDate(postIsoDate(p.date))}</pubDate>
      <description>${esc(p.summary)}</description>
    </item>`).join('\n')
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WalletLens Blog</title>
    <link>${ORIGIN}/blog/</link>
    <atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Guides on tracking your net worth and managing crypto, stocks, gold and cash — from WalletLens, the free private all-asset portfolio tracker.</description>
    <language>en</language>
    <lastBuildDate>${rssDate(TODAY)}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`
writeFileSync(resolve(DIST, 'rss.xml'), rss, 'utf8')
console.log(`Wrote rss.xml (${sortedPosts.length} articles).`)

// ── llms.txt ───────────────────────────────────────────────────────────────
// Keep the curated llms.txt body, but regenerate the "## Blog articles" list
// from POSTS so every article is always advertised to AI answer engines.
try {
  const llmsTemplate = readFileSync(resolve(PUBLIC, 'llms.txt'), 'utf8')
  const articleList = POSTS.map(p => `- [${p.title}](${ORIGIN}/blog/${p.slug}/): ${p.summary}`).join('\n')
  const newSection = `## Blog articles\n\n${articleList}\n`
  // Replace from the "## Blog articles" heading up to the next "## " heading.
  const llms = llmsTemplate.replace(
    /## Blog articles[\s\S]*?(?=\n## )/,
    newSection + '\n'
  )
  writeFileSync(resolve(DIST, 'llms.txt'), llms, 'utf8')
  console.log(`Wrote llms.txt (${POSTS.length} articles).`)

  // ── llms-full.txt ──────────────────────────────────────────────────────────
  // The llmstxt.org "full" companion: the curated llms.txt followed by the
  // complete plain-text body of every article, so AI ingestion tools get the
  // entire corpus in one fetch instead of crawling each page.
  const llmsBase = llms.replace(/## Blog articles[\s\S]*$/, '').trimEnd()
  const fullArticles = POSTS.map(p =>
    `## ${p.title}\n${ORIGIN}/blog/${p.slug}/\n_${p.date} · ${p.readTime}_\n\n${p.summary}\n\n${stripMd(p.content).replace(/\s+/g, ' ').trim()}`
  ).join('\n\n---\n\n')
  const llmsFull = `${llmsBase}\n\n# Full article corpus\n\n${fullArticles}\n`
  writeFileSync(resolve(DIST, 'llms-full.txt'), llmsFull, 'utf8')
  console.log(`Wrote llms-full.txt (${POSTS.length} full articles).`)
} catch (e) {
  console.warn('llms.txt generation skipped:', e.message)
}
