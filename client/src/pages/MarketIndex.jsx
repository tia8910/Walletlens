import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'

// ── WalletLens Market Index ────────────────────────────────────────────────
// A public, auto-updating, *citable* data page. It distills the whole crypto
// market into one headline number — the WalletLens Market Index (0–100) — built
// entirely from public market data (no private user data; WalletLens is
// local-first). Designed so journalists and bloggers can cite a single stat and
// link back: "WalletLens Market Index: 68/100 (Constructive)".

const REFRESH_MS = 3 * 60 * 1000 // 3 min

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const ch24 = c => c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency ?? 0

const num = (d = 2) => n => n.toLocaleString(undefined, { maximumFractionDigits: d })
const usd = (d = 2) => n => `$${n.toLocaleString(undefined, { maximumFractionDigits: d })}`

const INDICES = [
  { sym: '^spx',  label: 'S&P 500',      fmt: num(2) },
  { sym: '^ndq',  label: 'Nasdaq',       fmt: num(2) },
  { sym: '^dji',  label: 'Dow Jones',    fmt: num(0) },
  { sym: '^rut',  label: 'Russell 2000', fmt: num(2) },
  { sym: '^vix',  label: 'VIX',          fmt: num(2) },
  { sym: '^ukx',  label: 'FTSE 100',     fmt: num(2) },
  { sym: '^dax',  label: 'DAX',          fmt: num(2) },
  { sym: '^nkx',  label: 'Nikkei 225',   fmt: num(0) },
]
const METALS = [
  { sym: 'xauusd', label: 'Gold (oz)',      fmt: usd(2) },
  { sym: 'xagusd', label: 'Silver (oz)',    fmt: usd(2) },
  { sym: 'xptusd', label: 'Platinum (oz)',  fmt: usd(2) },
  { sym: 'xpdusd', label: 'Palladium (oz)', fmt: usd(2) },
]
const FOREX = [
  { sym: 'eurusd', label: 'EUR / USD', fmt: num(4) },
  { sym: 'gbpusd', label: 'GBP / USD', fmt: num(4) },
  { sym: 'usdjpy', label: 'USD / JPY', fmt: num(2) },
  { sym: 'usdcad', label: 'USD / CAD', fmt: num(4) },
  { sym: 'audusd', label: 'AUD / USD', fmt: num(4) },
]
const COMMODITIES = [
  { sym: 'cl.f', label: 'WTI Crude',   fmt: usd(2) },
  { sym: 'bz.f', label: 'Brent Crude', fmt: usd(2) },
  { sym: 'ng.f', label: 'Nat Gas',     fmt: n => `$${n.toFixed(3)}` },
  { sym: 'hg.f', label: 'Copper',      fmt: n => `$${n.toFixed(3)}` },
]
const ALL_STOOQ = [...INDICES, ...METALS, ...FOREX, ...COMMODITIES]

// Fetch live quotes from Stooq for US indices + metals (direct, CORS proxies as fallback)
const STOOQ_PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
]
async function fetchStooqQuotes(symbols) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbols.join(','))}&f=sd2t2ohlc&h&e=csv`
  const tryFetch = async (u) => {
    const res = await Promise.race([fetch(u), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 6000))])
    if (!res.ok) throw new Error(res.status)
    return res.text()
  }
  let csv = null
  try { csv = await tryFetch(url) } catch {}
  if (!csv) {
    for (const wrap of STOOQ_PROXIES) {
      try { csv = await tryFetch(wrap(url)); break } catch {}
    }
  }
  if (!csv) return null
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return null
  const headers = lines[0].split(',')
  const out = {}
  for (const line of lines.slice(1)) {
    const vals = line.split(',')
    const row = {}
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim() })
    const sym = (row.Symbol || '').toLowerCase()
    const close = parseFloat(row.Close)
    const open  = parseFloat(row.Open)
    if (!sym || !isFinite(close) || close <= 0) continue
    out[sym] = { close, change: isFinite(open) && open > 0 ? ((close - open) / open) * 100 : null }
  }
  return out
}

// Composite index from a market snapshot. Three transparent, citable pillars:
//   • Breadth      — % of the top 100 coins green over 24h
//   • Momentum     — average 24h move of the top 50, mapped from [-8%,+8%]
//   • Leadership   — % of the top 10 by market cap that are green
function computeIndex(snapshot) {
  if (!snapshot?.length) return null
  const byCap = [...snapshot].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
  const top100 = byCap.slice(0, 100)
  const top50  = byCap.slice(0, 50)
  const top10  = byCap.slice(0, 10)

  const breadth = (top100.filter(c => ch24(c) > 0).length / top100.length) * 100
  const avgMom  = top50.reduce((s, c) => s + ch24(c), 0) / top50.length
  const momentum = clamp(((avgMom + 8) / 16) * 100, 0, 100)
  const leadership = (top10.filter(c => ch24(c) > 0).length / top10.length) * 100

  const score = Math.round(0.45 * breadth + 0.35 * momentum + 0.20 * leadership)

  const totalMcap = snapshot.reduce((s, c) => s + (c.market_cap || 0), 0)
  const btc = snapshot.find(c => (c.symbol || '').toLowerCase() === 'btc')
  const btcDom = btc && totalMcap > 0 ? (btc.market_cap / totalMcap) * 100 : null

  const gainers = top100.filter(c => ch24(c) > 0).length
  const losers  = top100.length - gainers

  return {
    score,
    pillars: {
      breadth: Math.round(breadth),
      momentum: Math.round(momentum),
      leadership: Math.round(leadership),
    },
    avgMom,
    totalMcap,
    btcDom,
    gainers,
    losers,
    coins: byCap,
  }
}

function band(score) {
  if (score >= 75) return { label: 'Overheated',      color: '#fbbf24', note: 'Broad euphoria — historically a time for caution, not chasing.' }
  if (score >= 56) return { label: 'Constructive',    color: '#10b981', note: 'Healthy participation — the market is broadly trending up.' }
  if (score >= 45) return { label: 'Neutral',         color: '#94a3b8', note: 'Mixed signals — no clear directional edge right now.' }
  if (score >= 25) return { label: 'Caution',         color: '#fb923c', note: 'Weak breadth — most coins are under pressure.' }
  return                   { label: 'Extreme Caution', color: '#f87171', note: 'Widespread selling — fear dominates the market.' }
}

function fmtBig(n) {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  return `$${Math.round(n).toLocaleString()}`
}
const fmtPct = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const fmtPrice = n => n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 6 })}`

export default function MarketIndex() {
  const [snapshot, setSnapshot] = useState([])
  const [trending, setTrending] = useState([])
  const [markets, setMarkets]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [updated, setUpdated]   = useState(null)
  const [copied, setCopied]     = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    document.title = 'WalletLens Market Index — Live Crypto Market Sentiment Score'
    track('market_index_view')
    load()
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => clearInterval(timerRef.current)
  }, [])

  async function load() {
    try {
      const allSyms = ALL_STOOQ.map(x => x.sym)
      const [snap, trend, mkts] = await Promise.all([
        api.getWhaleMarketSnapshot().catch(() => []),
        api.getTrendingCoins().catch(() => []),
        fetchStooqQuotes(allSyms).catch(() => null),
      ])
      if (snap?.length) setSnapshot(snap)
      if (trend?.length) setTrending(trend.slice(0, 7))
      if (mkts) setMarkets(mkts)
      setUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  const idx = useMemo(() => computeIndex(snapshot), [snapshot])
  const b = idx ? band(idx.score) : null

  const topGainers = useMemo(
    () => idx ? [...idx.coins].sort((a, c) => ch24(c) - ch24(a)).slice(0, 5) : [],
    [idx]
  )
  const topLosers = useMemo(
    () => idx ? [...idx.coins].sort((a, c) => ch24(a) - ch24(c)).slice(0, 5) : [],
    [idx]
  )

  const dateStr = (updated || new Date()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const citation = idx
    ? `WalletLens Market Index: ${idx.score}/100 (${b.label}) — ${dateStr}. Source: WalletLens, https://walletlens.live/market-index`
    : ''

  function copyCitation() {
    if (!citation) return
    navigator.clipboard?.writeText(citation).then(() => {
      setCopied(true); track('market_index_cite_copy')
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  function shareX() {
    if (!idx) return
    const text = `WalletLens Market Index: ${idx.score}/100 — ${b.label}.\nLive crypto market sentiment, updated continuously:`
    track('market_index_share', { network: 'x' })
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://walletlens.live/market-index')}`, '_blank', 'noopener')
  }

  // Dataset structured data so Google & AI answer engines treat the index as a
  // citable dataset. Injected at runtime; the prerendered HTML carries a static
  // description for crawlers that don't run JS.
  useEffect(() => {
    if (!idx) return
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'WalletLens Market Index',
      description: 'A live 0–100 crypto market sentiment index built from market breadth, momentum and large-cap leadership across the top 250 cryptocurrencies.',
      url: 'https://walletlens.live/market-index',
      creator: { '@type': 'Organization', name: 'WalletLens', url: 'https://walletlens.live' },
      license: 'https://walletlens.live/terms',
      isAccessibleForFree: true,
      variableMeasured: 'WalletLens Market Index (0–100)',
      temporalCoverage: new Date().toISOString().slice(0, 10),
    })
    document.head.appendChild(ld)
    return () => { document.head.removeChild(ld) }
  }, [idx?.score])

  return (
    <div className="dvx-page mki-page">
      <div className="mki-wrap">

        {/* Header */}
        <header className="mki-head">
          <div className="mki-eyebrow"><Icon name="bar-chart" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />WALLETLENS MARKET INDEX</div>
          <h1 className="mki-h1">All markets, one page.</h1>
          <p className="mki-lede">
            Crypto sentiment score (0–100) plus live equity indices, precious metals, forex and commodities —
            all markets on one page, updated continuously. Free to read, free to cite.
          </p>
        </header>

        {loading && !idx && (
          <div className="mki-loading">Calculating the index…</div>
        )}

        {idx && (
          <>
            {/* The big number */}
            <section className="mki-hero glass-card">
              <div className="mki-gauge" style={{ '--mki-color': b.color }}>
                <div className="mki-score" style={{ color: b.color }}>{idx.score}</div>
                <div className="mki-outof">/ 100</div>
              </div>
              <div className="mki-verdict">
                <div className="mki-label" style={{ color: b.color }}>{b.label}</div>
                <p className="mki-note">{b.note}</p>
                <div className="mki-updated">
                  Updated {updated ? updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} · auto-refreshes
                </div>
              </div>
            </section>

            {/* Pillars */}
            <section className="mki-pillars">
              <PillarBar label="Market Breadth" value={idx.pillars.breadth} sub={`${idx.gainers} of top 100 green`} />
              <PillarBar label="Momentum"       value={idx.pillars.momentum} sub={`avg 24h ${fmtPct(idx.avgMom)}`} />
              <PillarBar label="Large-Cap Leadership" value={idx.pillars.leadership} sub="top-10 trend" />
            </section>

            {/* Cite / share */}
            <section className="mki-cite glass-card">
              <div className="mki-cite-label"><Icon name="clipboard" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Cite this index</div>
              <div className="mki-cite-text">{citation}</div>
              <div className="mki-cite-actions">
                <button className="mki-btn mki-btn-primary" onClick={copyCitation}>
                  {copied ? '✓ Copied' : 'Copy citation'}
                </button>
                <button className="mki-btn" onClick={shareX}>Share on X</button>
              </div>
              <p className="mki-cite-hint">Writers & researchers: link <code>walletlens.live/market-index</code> — free, no attribution barrier.</p>
            </section>

            {/* Crypto stats */}
            <section className="mki-stats">
              <Stat label="Total market cap" value={fmtBig(idx.totalMcap)} />
              <Stat label="BTC dominance" value={idx.btcDom != null ? `${idx.btcDom.toFixed(1)}%` : '—'} />
              <Stat label="24h gainers" value={`${idx.gainers}`} accent="#10b981" />
              <Stat label="24h losers" value={`${idx.losers}`} accent="#f87171" />
            </section>

            {/* Global markets — equities, metals, forex, commodities */}
            {markets && ALL_STOOQ.some(x => markets[x.sym]) && (
              <>
                <div className="mki-markets-head">
                  <Icon name="globe" size={16} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />Global markets
                  <span className="mki-markets-sub">live · alongside crypto</span>
                </div>
                <MarketBoard icon="building" title="Equity Indices"  items={INDICES}     markets={markets} />
                <MarketBoard icon="award"    title="Precious Metals" items={METALS}      markets={markets} />
                <MarketBoard icon="exchange" title="Forex"           items={FOREX}       markets={markets} />
                <MarketBoard icon="droplet"  title="Commodities"     items={COMMODITIES} markets={markets} />
              </>
            )}

            {/* Movers */}
            <div className="mki-movers">
              <MoverTable title="Top gainers (24h)" coins={topGainers} accent="#10b981" />
              <MoverTable title="Top losers (24h)" coins={topLosers} accent="#f87171" />
            </div>

            {/* Trending */}
            {trending.length > 0 && (
              <section className="mki-trending glass-card">
                <div className="mki-section-title"><Icon name="flame" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Most searched right now</div>
                <div className="mki-trend-row">
                  {trending.map(t => (
                    <span key={t.id} className="mki-trend-chip">
                      {t.thumb && <img src={t.thumb} alt="" width="16" height="16" />}
                      {t.symbol?.toUpperCase()}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Methodology — transparency makes it citable */}
            <section className="mki-method glass-card">
              <div className="mki-section-title">How it's calculated</div>
              <p>
                The WalletLens Market Index is a weighted blend of three signals across the top 250
                cryptocurrencies: <strong>market breadth</strong> (45%, the share of the top 100 coins up over 24h),
                <strong> momentum</strong> (35%, the average 24h move of the top 50, normalised), and
                <strong> large-cap leadership</strong> (20%, the share of the top 10 by market cap that are up).
                Scores above 75 signal an overheated market; below 25 signals extreme caution. All inputs are public
                market data — WalletLens stores no personal portfolio data on any server.
              </p>
              <p className="mki-foot-cta">
                Want your own portfolio scored against the market?{' '}
                <Link to="/dashboard">Open WalletLens free →</Link>
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// Reusable "global markets" board — one asset class per card, premium cells
// with a coloured ▲/▼ move. Only symbols the data source returned are shown.
function MarketBoard({ icon, title, items, markets }) {
  const rows = items.filter(x => markets?.[x.sym])
  if (!rows.length) return null
  return (
    <section className="mki-ext-section glass-card">
      <div className="mki-section-title"><Icon name={icon} size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{title}</div>
      <div className="mki-ext-grid">
        {rows.map(({ sym, label, fmt }) => {
          const d = markets[sym]
          const chg = d.change
          const up = chg != null && chg >= 0
          const chgColor = chg == null ? 'var(--text-muted)' : up ? '#10b981' : '#f87171'
          return (
            <div key={sym} className="mki-ext-cell">
              <div className="mki-ext-label">{label}</div>
              <div className="mki-ext-val">{fmt(d.close)}</div>
              {chg != null && (
                <div className="mki-ext-chg" style={{ color: chgColor }}>{up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PillarBar({ label, value, sub }) {
  const color = value >= 56 ? '#10b981' : value >= 45 ? '#94a3b8' : '#fb923c'
  return (
    <div className="mki-pillar glass-card">
      <div className="mki-pillar-top">
        <span className="mki-pillar-label">{label}</span>
        <span className="mki-pillar-val" style={{ color }}>{value}</span>
      </div>
      <div className="mki-pillar-track"><div className="mki-pillar-fill" style={{ width: `${value}%`, background: color }} /></div>
      <div className="mki-pillar-sub">{sub}</div>
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className="mki-stat glass-card">
      <div className="mki-stat-label">{label}</div>
      <div className="mki-stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  )
}

function MoverTable({ title, coins, accent }) {
  return (
    <section className="mki-mover glass-card">
      <div className="mki-section-title" style={{ color: accent }}>{title}</div>
      <ul className="mki-mover-list">
        {coins.map(c => (
          <li key={c.id} className="mki-mover-row">
            <span className="mki-mover-name">
              {c.image && <img src={c.image} alt="" width="20" height="20" />}
              <strong>{(c.symbol || '').toUpperCase()}</strong>
            </span>
            <span className="mki-mover-price">{fmtPrice(c.current_price || 0)}</span>
            <span className="mki-mover-chg" style={{ color: ch24(c) >= 0 ? '#10b981' : '#f87171' }}>{fmtPct(ch24(c))}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
