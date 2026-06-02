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

// Extract FAQ pairs from a post: any ## / ### heading ending in "?" plus the
// first answer block beneath it. Powers per-post FAQPage structured data, which
// answer engines (Google AI Overviews, ChatGPT, Perplexity) lift directly.
function extractFaqs(content) {
  const lines = content.trim().split('\n')
  const faqs = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{2,3}\s+(.*\?)\s*$/)
    if (!m) continue
    const q = stripMd(m[1])
    let j = i + 1
    while (j < lines.length && lines[j].trim() === '') j++
    const ansParts = []
    while (j < lines.length) {
      const l = lines[j]
      if (l.trim() === '') break
      if (/^#{2,3}\s/.test(l) || l.startsWith('|')) break
      if (l.startsWith('- ')) ansParts.push(stripMd(l.slice(2)))
      else ansParts.push(stripMd(l))
      j++
    }
    const a = ansParts.join(' ').trim()
    if (q && a.length > 25) faqs.push({ q, a: a.length > 320 ? a.slice(0, 317).trimEnd() + '…' : a })
  }
  return faqs
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
      while (i < lines.length && lines[i].startsWith('| ')) {
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
function buildPage({ path, title, description, bodyHtml, jsonLd }) {
  const url = ORIGIN + path
  let html = template
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(/(<meta name="description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/,         `$1${esc(url)}$2`)
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/,  `$1${esc(title)}$2`)
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/,    `$1${esc(url)}$2`)
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/,  `$1${esc(title)}$2`)
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/,  `$1${esc(description)}$2`)
  if (jsonLd) {
    const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
    const scripts = blocks.map(b => `  <script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n')
    html = html.replace('</head>', `${scripts}\n  </head>`)
  }
  // Hidden-but-crawlable content block, injected as first child of #root.
  // z-index:0 + first-child: the loading splash (fixed, z-index:0, later in the
  // DOM) paints over this for real users, while crawlers/no-JS fetches still
  // read the full text. React wipes #root (and this block) on mount.
  const seo = `<div id="prerender-content" style="position:absolute;left:0;top:0;width:100%;z-index:0;padding:2rem 1.25rem;color:#e7eaf0;font-family:system-ui,-apple-system,sans-serif;line-height:1.7">${bodyHtml}</div>`
  html = html.replace('<div id="root">', `<div id="root">${seo}`)
  return html
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
  title: 'WalletLens — Free Net Worth & Portfolio Tracker | Crypto, Stocks, Gold',
  description: 'Track your entire net worth in one free app — crypto, US stocks, gold, silver, cash & FX. The free net worth tracker for managing all your investments in one place. No account, AI insights, data stays on your device.',
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
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'What is the best free net worth tracker?',
          acceptedAnswer: { '@type': 'Answer', text: 'WalletLens is a strong choice: it tracks your entire net worth across crypto, stocks, gold, cash and FX, needs no account, and keeps data private on your device — all for free.' } },
        { '@type': 'Question', name: 'Can I manage all my investments in one app for free?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes. WalletLens combines every asset class into a single free dashboard with a live net-worth total, allocation breakdown and AI analysis, with no account or subscription.' } },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Free Net Worth Tracker', item: ORIGIN + '/free-net-worth-tracker' },
      ],
    },
  ],
}))

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
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a></p>`

  write('/track/' + c.slug, buildPage({
    path: '/track/' + c.slug,
    title: pageTitle,
    description: pageDesc,
    bodyHtml: assetBody,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: faq1q,
            acceptedAnswer: { '@type': 'Answer', text: faq1a } },
          { '@type': 'Question', name: faq2q,
            acceptedAnswer: { '@type': 'Answer', text: faq2a } },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `Track ${c.name}`, item: `${ORIGIN}/track/${c.slug}` },
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
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: faq1q,
            acceptedAnswer: { '@type': 'Answer', text: faq1a } },
          { '@type': 'Question', name: faq2q,
            acceptedAnswer: { '@type': 'Answer', text: faq2a } },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: `${c.name} Profit Calculator`,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        url: `${ORIGIN}/calculator/${c.slug}`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `${c.name} Profit Calculator`, item: `${ORIGIN}/calculator/${c.slug}` },
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
        url: `${ORIGIN}/learn/${t.slug}`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: `What is ${t.term}?`,
            acceptedAnswer: { '@type': 'Answer', text: t.short } },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `What is ${t.term}?`, item: `${ORIGIN}/learn/${t.slug}` },
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
          { '@type': 'ListItem', position: 2, name: `WalletLens vs ${c.competitor}`, item: `${ORIGIN}/vs/${c.slug}` },
        ],
      },
    ],
  }))
}
console.log(`Prerendered ${COMPARISONS.length} /vs comparison pages.`)

// ── Live-price pages (/price/:slug) ──────────────────────────────────────────
// "X price today" — very high recurring volume. Price is fetched live in the
// SPA; the prerender provides crawlable evergreen context (no stale numbers).
for (const a of PRICE_ASSETS) {
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
<h2>Frequently asked questions</h2>
<h3>How much is ${esc(a.name)} worth today?</h3>
<p>The live ${esc(a.name)} (${esc(a.symbol)}) price updates from market data when you open the page. For continuously updating prices and your own profit/loss, track ${esc(a.symbol)} in WalletLens.</p>
<h3>Where can I track ${esc(a.name)} for free?</h3>
<p>WalletLens tracks ${esc(a.name)} for free with no account — add your holding once and it values it with live prices alongside your entire net worth, with data kept on your device.</p>
<p><a href="/free-net-worth-tracker">Free net worth tracker</a> · <a href="/blog">Blog</a> · <a href="/about">About</a> · <a href="/">Home</a></p>`
  write('/price/' + a.slug, buildPage({
    path: '/price/' + a.slug,
    title: `${a.name} Price Today (${a.symbol}) — Live Price & Free Tracker | WalletLens`,
    description: `Live ${a.name} (${a.symbol}) price today, plus a free way to track your ${a.symbol} profit and loss in WalletLens — no account, data stays on your device.`,
    bodyHtml: priceBody,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: `How much is ${a.name} worth today?`,
            acceptedAnswer: { '@type': 'Answer', text: `The live ${a.name} (${a.symbol}) price updates from market data when you open the page. For continuously updating prices and your own profit/loss, track ${a.symbol} in WalletLens for free.` } },
          { '@type': 'Question', name: `Where can I track ${a.name} for free?`,
            acceptedAnswer: { '@type': 'Answer', text: `WalletLens tracks ${a.name} for free with no account — add your holding once and it values it with live prices alongside your entire net worth, with data kept on your device.` } },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: `${a.name} Price`, item: `${ORIGIN}/price/${a.slug}` },
        ],
      },
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
  const faqs = extractFaqs(p.content)
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
      mainEntityOfPage: `${ORIGIN}/blog/${p.slug}`,
      url: `${ORIGIN}/blog/${p.slug}`,
      // Speakable: lets voice assistants read the headline + lead paragraph aloud.
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', 'article > p:nth-of-type(1)'] },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: ORIGIN + '/blog' },
        { '@type': 'ListItem', position: 3, name: p.title, item: `${ORIGIN}/blog/${p.slug}` },
      ],
    },
  ]
  // Per-post FAQ structured data — only when the article genuinely has ≥2 Q&As.
  if (faqs.length >= 2) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })
  }
  write('/blog/' + p.slug, buildPage({
    path: '/blog/' + p.slug,
    title: `${p.title} | WalletLens`,
    description: p.summary,
    bodyHtml: articleHtml,
    jsonLd,
  }))
}

// ── About ────────────────────────────────────────────────────────────────────
write('/about', buildPage({
  path: '/about',
  title: 'About WalletLens — Free Net Worth & All-Asset Portfolio Tracker',
  description: 'WalletLens is a free, private, browser-based net worth tracker for personal investment management. No account, no server, no data collection. Track your whole net worth — crypto, stocks, gold, silver, cash and FX — in one dashboard.',
  bodyHtml: `
<h1>About WalletLens</h1>
<p>WalletLens is a free, private net worth tracker that runs entirely in your browser. It is a complete tool for personal investment management — track and manage every asset you own in one place — with no account, no email, and no server, so your holdings never leave your device.</p>
<h2>What we built</h2>
<p>A single dashboard for your entire net worth: crypto, US stocks &amp; ETFs, gold, silver, platinum, fiat currencies, bonds, and any other asset. Live prices, cost-basis tracking, P&amp;L, allocation donut, multi-target sell plans, and on-device AI analysis — all free, forever.</p>
<h2>Why local-first?</h2>
<p>Every portfolio tracker we tried asked us to hand over our holdings to a server, connect exchange API keys, or create an account. We didn't want to make that trade-off. WalletLens stores your data in your browser's localStorage and exports it as a single encrypted backup code you control.</p>
<h2>Privacy by design</h2>
<p>There is no backend database. There is no login because there is nothing to log into. The only external calls are to public price APIs (CoinGecko, Binance, Stooq, Gold-API) and, optionally, the Anthropic API for AI analysis — both are called directly from your browser with no intermediary server.</p>
<p><a href="/dashboard">Open the dashboard</a> · <a href="/blog">Read the blog</a> · <a href="/privacy">Privacy Policy</a></p>
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
<p><a href="/about">About WalletLens</a> · <a href="/privacy">Privacy Policy</a></p>
`,
}))

console.log(`\nPrerendered ${POSTS.length + 6} content pages into dist/.`)

// ── sitemap.xml ────────────────────────────────────────────────────────────
// Only list pages with prerendered content and their own canonical tags.
// App routes (/dashboard, /whales, /alpha, etc.) are intentionally excluded:
// they serve the same index.html as the homepage and cause Google to flag
// "Duplicate, Google chose different canonical than user".
const STATIC_ROUTES = [
  { path: '/',        changefreq: 'weekly',  priority: '1.0' },
  { path: '/free-net-worth-tracker', changefreq: 'weekly', priority: '0.9' },
  { path: '/blog',    changefreq: 'weekly',  priority: '0.9' },
  { path: '/about',   changefreq: 'monthly', priority: '0.7' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.5' },
  { path: '/terms',   changefreq: 'monthly', priority: '0.5' },
]
function urlEntry({ loc, lastmod, changefreq, priority }) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
}
const sitemapUrls = [
  ...STATIC_ROUTES.map(r => urlEntry({ loc: ORIGIN + r.path, lastmod: TODAY, changefreq: r.changefreq, priority: r.priority })),
  ...ALL_TRACK_ASSETS.map(c => urlEntry({ loc: `${ORIGIN}/track/${c.slug}`, lastmod: TODAY, changefreq: 'weekly', priority: '0.7' })),
  ...POSTS.map(p => urlEntry({ loc: `${ORIGIN}/blog/${p.slug}`, lastmod: postIsoDate(p.date), changefreq: 'monthly', priority: '0.85' })),
  ...CALCULATORS.map(c => urlEntry({ loc: `${ORIGIN}/calculator/${c.slug}`, lastmod: TODAY, changefreq: 'monthly', priority: '0.8' })),
  ...PRICE_ASSETS.map(a => urlEntry({ loc: `${ORIGIN}/price/${a.slug}`, lastmod: TODAY, changefreq: 'daily', priority: '0.8' })),
  ...COMPARISONS.map(c => urlEntry({ loc: `${ORIGIN}/vs/${c.slug}`, lastmod: TODAY, changefreq: 'monthly', priority: '0.75' })),
  ...GLOSSARY.map(t => urlEntry({ loc: `${ORIGIN}/learn/${t.slug}`, lastmod: TODAY, changefreq: 'monthly', priority: '0.6' })),
]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.join('\n')}\n</urlset>\n`
writeFileSync(resolve(DIST, 'sitemap.xml'), sitemap, 'utf8')
console.log(`Wrote sitemap.xml (${STATIC_ROUTES.length + ALL_TRACK_ASSETS.length + POSTS.length + CALCULATORS.length + PRICE_ASSETS.length + COMPARISONS.length + GLOSSARY.length} urls).`)

// ── llms.txt ───────────────────────────────────────────────────────────────
// Keep the curated llms.txt body, but regenerate the "## Blog articles" list
// from POSTS so every article is always advertised to AI answer engines.
try {
  const llmsTemplate = readFileSync(resolve(PUBLIC, 'llms.txt'), 'utf8')
  const articleList = POSTS.map(p => `- [${p.title}](${ORIGIN}/blog/${p.slug}): ${p.summary}`).join('\n')
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
    `## ${p.title}\n${ORIGIN}/blog/${p.slug}\n_${p.date} · ${p.readTime}_\n\n${p.summary}\n\n${stripMd(p.content).replace(/\s+/g, ' ').trim()}`
  ).join('\n\n---\n\n')
  const llmsFull = `${llmsBase}\n\n# Full article corpus\n\n${fullArticles}\n`
  writeFileSync(resolve(DIST, 'llms-full.txt'), llmsFull, 'utf8')
  console.log(`Wrote llms-full.txt (${POSTS.length} full articles).`)
} catch (e) {
  console.warn('llms.txt generation skipped:', e.message)
}
