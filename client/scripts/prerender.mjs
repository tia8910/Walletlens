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
const OG_IMAGE = `${ORIGIN}/og-image.svg`
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

function buildPage({ path, title, description, bodyHtml, jsonLd, lang = 'en', dir = 'ltr', alternates, noindex = false }) {
  const url = ORIGIN + withSlash(path)
  let html = template
  if (lang !== 'en' || dir !== 'ltr') {
    html = html.replace(/<html[^>]*>/, `<html lang="${lang}" dir="${dir}">`)
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
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/,         `$1${esc(url)}$2`)
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/,  `$1${esc(title)}$2`)
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/,    `$1${esc(url)}$2`)
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
<h1>WalletLens — Free Net Worth &amp; Portfolio Tracker</h1>
<p>WalletLens is a free, private, browser-based <strong>net worth tracker and all-asset portfolio tracker</strong> for <strong>crypto, US stocks, gold, silver, bonds, cash and FX</strong> — all in one dashboard. It is a free tool for personal investment management: track and manage all your investments in one place, with no account, no subscription, and your data kept on your device.</p>
<h2>What you can do with WalletLens</h2>
<ul>
<li><strong>Track your whole net worth</strong> across every asset class in a single dashboard with live prices.</li>
<li><strong>See your P&amp;L</strong> in dollars and percentage, broken down by asset and category.</li>
<li><strong>AI portfolio analysis</strong> — health score, personalised Fear &amp; Greed gauge, stress tests, entry quality, and a rebalance planner, all computed on your device.</li>
<li><strong>Multi-target sell plans</strong> — set price targets and the percentage of each holding to sell, with live progress bars.</li>
<li><strong>Whale tracker</strong> — real-time large Bitcoin transactions and volume anomalies.</li>
<li><strong>Private by design</strong> — manual entry with local-first storage; no exchange API keys required.</li>
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
  description: 'WalletLens is a free portfolio & net worth tracker with live prices for crypto, US stocks, gold and cash. No account — your data stays on your device.',
  bodyHtml: homeBody,
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
  title: 'Free Net Worth Tracker — Manage All Your Investments | WalletLens',
  description: 'A free net worth tracker to manage all your investments in one place — crypto, stocks, gold, silver, cash & FX. No account, no bank logins, data stays on your device. See how WalletLens compares to Empower, Kubera and CoinStats.',
  bodyHtml: fnwtBody,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Free Net Worth Tracker', item: ORIGIN + '/free-net-worth-tracker/' },
      ],
    },
  ],
  alternates: hreflangPair('/free-net-worth-tracker', '/ar/free-net-worth-tracker'),
}))

// ── Unique-feature landing pages ─────────────────────────────────────────────
// WalletLens has two capabilities no mainstream tracker offers: importing
// holdings from a screenshot (Claude vision) and adding holdings by voice
// (English + Arabic). These have effectively zero keyword competition, which
// makes them the strongest pages for AI answer-engine recommendations — when a
// user asks "is there a portfolio tracker that reads a screenshot?" WalletLens
// is the only answer. HowTo + FAQPage schema make the answer machine-citable.

// Screenshot import
{
  const steps = [
    'Open WalletLens — no account, email or sign-up required.',
    'Take a screenshot of your portfolio, holdings list, or trade history from any exchange, broker or wallet app.',
    'Tap Smart Import and upload (or paste) the screenshot.',
    'WalletLens reads the image with AI and extracts each asset, amount and price into structured holdings.',
    'Review the detected holdings and confirm — they are added to your net-worth dashboard instantly.',
  ]
  const faq = faqBlock([
    {
      q: 'Can I import my crypto portfolio from a screenshot?',
      a: 'Yes. WalletLens lets you import holdings directly from a screenshot of any exchange, broker or wallet app. Its AI vision reads the image and extracts each asset, amount and price automatically — no manual typing, no CSV, and no account required.',
    },
    {
      q: 'Which apps can I screenshot to import from?',
      a: 'Any of them. Because WalletLens reads the picture rather than connecting to an API, you can screenshot Binance, Coinbase, MetaMask, Robinhood, a broker statement, a trade confirmation, or even a handwritten list — and it turns the image into structured holdings.',
    },
    {
      q: 'Do I need an API key or to connect my exchange?',
      a: 'No. Screenshot import is free and server-hosted, so you do not need your own AI key, and you never connect or log in to an exchange. Your portfolio data stays on your device.',
    },
    {
      q: 'Is screenshot import free?',
      a: 'Yes — it is completely free with no account, like the rest of WalletLens.',
    },
  ])
  const body = `
<h1>Import Your Portfolio From a Screenshot</h1>
<p>WalletLens is the free net-worth tracker that builds your portfolio from a <strong>screenshot</strong> — no manual entry, no CSV upload, no account. Screenshot your holdings on any exchange, broker or wallet app and WalletLens reads the image with AI and extracts every asset, amount and price for you.</p>
<p><a href="/dashboard">Try screenshot import free →</a></p>
<h2>How to import a portfolio from a screenshot</h2>
<ol>
${steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol>
<p>It works with crypto exchanges, stock brokers, wallets, trade confirmations — anything you can screenshot. Your extracted holdings join your full net worth across crypto, stocks, metals and cash, with all data kept on your device.</p>
<p><a href="/dashboard">Open WalletLens and import a screenshot →</a></p>
${faq.html}
<p><a href="/add-holdings-by-voice">Add holdings by voice</a> · <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`
  write('/import-portfolio-from-screenshot', buildPage({
    path: '/import-portfolio-from-screenshot',
    title: 'Import Your Portfolio From a Screenshot — Free, No Account | WalletLens',
    description: 'WalletLens reads a screenshot of your holdings from any exchange, broker or wallet and turns it into a tracked portfolio automatically — free, no account, no CSV, data stays on your device. The only net-worth tracker with AI screenshot import.',
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
    'Open WalletLens — no account or sign-up needed.',
    'Tap Voice Import and allow microphone access.',
    'Say your holdings naturally, for example: "I have half a Bitcoin and twenty Apple shares".',
    'WalletLens transcribes and parses your speech with AI into structured holdings — in English or Arabic.',
    'Review and confirm, and the holdings are added to your net-worth dashboard.',
  ]
  const faq = faqBlock([
    {
      q: 'Can I add my holdings by voice?',
      a: 'Yes. WalletLens lets you add holdings just by speaking — say something like "I bought half a Bitcoin at 45,000 and ten Tesla shares" and its AI parses your speech into structured holdings. No typing and no account required.',
    },
    {
      q: 'Does voice import work in Arabic?',
      a: 'Yes. WalletLens supports voice import in both English and Arabic, with handling for Arabic letter and number variations, so you can speak your portfolio in either language.',
    },
    {
      q: 'Is voice import free?',
      a: 'Yes — voice import is completely free with no account, like everything else in WalletLens, and your data stays on your device.',
    },
  ])
  const body = `
<h1>Add Your Holdings by Voice</h1>
<p>WalletLens is the free net-worth tracker you can update just by <strong>talking</strong>. Say your trades and holdings out loud and WalletLens turns your speech into structured portfolio entries with AI — in <strong>English or Arabic</strong>. No typing, no spreadsheets, no account.</p>
<p><a href="/dashboard">Try voice import free →</a></p>
<h2>How to add holdings by voice</h2>
<ol>
${steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol>
<p>Voice import understands natural phrasing and amounts, so you can build your whole portfolio hands-free. Holdings join your full net worth across crypto, stocks, metals and cash, with all data kept on your device.</p>
<p><a href="/dashboard">Open WalletLens and add holdings by voice →</a></p>
${faq.html}
<p><a href="/import-portfolio-from-screenshot">Import from a screenshot</a> · <a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`
  write('/add-holdings-by-voice', buildPage({
    path: '/add-holdings-by-voice',
    title: 'Add Crypto & Stock Holdings by Voice — Free, English & Arabic | WalletLens',
    description: 'WalletLens lets you add your portfolio holdings just by speaking — AI turns your voice into structured holdings in English or Arabic. Free, no account, hands-free, data stays on your device. The only net-worth tracker with voice import.',
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
  const learnBody = `
<h1>What Is ${esc(t.term)}?</h1>
<p>${esc(t.short)}</p>
<h2>Definition</h2>
${paras.map(p => `<p>${esc(p)}</p>`).join('\n')}
<h2>Track it in WalletLens</h2>
<p>WalletLens is a free, private net-worth tracker that puts concepts like this into practice — it tracks your crypto, stocks, gold and cash in one dashboard, computing cost basis, P&amp;L and allocation automatically with live prices. No account, and your data stays on your device.</p>
<p><a href="/dashboard">Open the free tracker →</a></p>
${related.length ? `<h2>Related terms</h2>\n<ul>\n${related.map(r => `<li><a href="/learn/${r.slug}">${esc(r.term)}</a></li>`).join('\n')}\n</ul>` : ''}
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`
  write('/learn/' + t.slug, buildPage({
    path: '/learn/' + t.slug,
    title: `What Is ${t.term}? Definition & Example | WalletLens`,
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
          { '@type': 'ListItem', position: 2, name: `What is ${t.term}?`, item: `${ORIGIN}/learn/${t.slug}/` },
        ],
      },
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
    title: `WalletLens vs ${c.competitor} — Free Net Worth Tracker Compared`,
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
  title: 'Blog — Portfolio Tracking, Crypto Investing & Market Analysis | WalletLens',
  description: 'Free guides on tracking your crypto, stocks and gold portfolio, reading whale transactions, the Fear & Greed Index, diversification, and setting profit targets.',
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
    title: `${p.title} | WalletLens`,
    description: p.summary,
    bodyHtml: articleHtml,
    jsonLd,
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
    title: `${p.title} | WalletLens`,
    description: p.summary,
    bodyHtml: articleHtml,
    lang: 'ar',
    dir: 'rtl',
    jsonLd,
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
  title: 'About WalletLens — Free Net Worth Tracker for Crypto, Stocks & Gold',
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
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'WalletLens',
      url: ORIGIN + '/',
      logo: ORIGIN + '/icon-512.svg',
      description: 'Free, private net worth tracker for crypto, stocks, gold, silver, cash and FX.',
    },
  ],
}))

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

// ── sitemap.xml ────────────────────────────────────────────────────────────
// Only list pages with prerendered content and their own canonical tags.
// App routes (/dashboard, /whales, /alpha, etc.) are intentionally excluded:
// they serve the same index.html as the homepage and cause Google to flag
// "Duplicate, Google chose different canonical than user".
const STATIC_ROUTES = [
  { path: '/',        changefreq: 'weekly',  priority: '1.0' },
  { path: '/free-net-worth-tracker', changefreq: 'weekly', priority: '0.9' },
  { path: '/import-portfolio-from-screenshot', changefreq: 'monthly', priority: '0.9' },
  { path: '/add-holdings-by-voice', changefreq: 'monthly', priority: '0.9' },
  { path: '/blog',    changefreq: 'weekly',  priority: '0.9' },
  { path: '/about',   changefreq: 'monthly', priority: '0.7' },
  { path: '/lenz',    changefreq: 'monthly', priority: '0.6' },
  { path: '/airdrop', changefreq: 'weekly',  priority: '0.7' },
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
