import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import { computeIndex, band } from '../marketIndexModel'

// ── WalletLens Market Index ────────────────────────────────────────────────
// A public, auto-updating, *citable* data page. It distills the whole crypto
// market into one headline number — the WalletLens Market Index (0–100) — built
// entirely from public market data (no private user data; WalletLens is
// local-first). Designed so journalists and bloggers can cite a single stat and
// link back: "WalletLens Market Index: 68/100 (Constructive)".

const REFRESH_MS = 3 * 60 * 1000 // 3 min

const ch24 = c => c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency ?? 0

const num = (d = 2) => n => n.toLocaleString(undefined, { maximumFractionDigits: d })
const usd = (d = 2) => n => `$${n.toLocaleString(undefined, { maximumFractionDigits: d })}`

// Equity indices, grouped the way a reader thinks of them — by region, the
// way Google Finance lays out its tab row — rather than as one flat list.
// A symbol Stooq does not answer for simply never renders (rows are filtered
// on arrival), so regional coverage can be grown without a failed ticker
// leaving a hole on the page.
const US_INDICES = [
  { sym: '^spx',  label: 'S&P 500',      fmt: num(2) },
  { sym: '^ndq',  label: 'Nasdaq',       fmt: num(2) },
  { sym: '^dji',  label: 'Dow Jones',    fmt: num(0) },
  { sym: '^rut',  label: 'Russell 2000', fmt: num(2) },
  { sym: '^vix',  label: 'VIX',          fmt: num(2) },
]
const EU_INDICES = [
  { sym: '^ukx',  label: 'FTSE 100',     fmt: num(2) },
  { sym: '^dax',  label: 'DAX',          fmt: num(2) },
  { sym: '^cac',  label: 'CAC 40',       fmt: num(2) },
]
const ASIA_INDICES = [
  { sym: '^nkx',  label: 'Nikkei 225',   fmt: num(0) },
  { sym: '^hsi',  label: 'Hang Seng',    fmt: num(0) },
  { sym: '^shc',  label: 'Shanghai',     fmt: num(2) },
]
const INDICES = [...US_INDICES, ...EU_INDICES, ...ASIA_INDICES]
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
    const high = parseFloat(row.High)
    const low  = parseFloat(row.Low)
    out[sym] = {
      close,
      change: isFinite(open) && open > 0 ? ((close - open) / open) * 100 : null,
      // The session's range, kept for the cards' meter. No intraday history
      // is available through this feed, so the meter is the honest version
      // of a sparkline: where in today's travel the price currently sits.
      high: isFinite(high) && high > 0 ? high : null,
      low:  isFinite(low)  && low  > 0 ? low  : null,
    }
  }
  return out
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
  const [tab, setTab]           = useState('all')
  const timerRef = useRef(null)

  useEffect(() => {
    document.title = 'WalletLens Market Index — Live Cross-Asset Risk Appetite Score'
    track('market_index_view')
    let lastLoad = Date.now()
    load()

    // Pause polling while the tab is hidden — a public data page like this
    // is often left open in a background tab, and there's no point burning
    // API quota refreshing data nobody is looking at.
    function handleVisibility() {
      if (document.hidden) {
        clearInterval(timerRef.current); timerRef.current = null
      } else {
        if (Date.now() - lastLoad > REFRESH_MS) { lastLoad = Date.now(); load() }
        if (!timerRef.current) timerRef.current = setInterval(() => { lastLoad = Date.now(); load() }, REFRESH_MS)
      }
    }
    if (!document.hidden) timerRef.current = setInterval(() => { lastLoad = Date.now(); load() }, REFRESH_MS)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
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

  // `markets` is in the dependency list because the score now reads it. It
  // was not, when the index was crypto-only, and leaving it out would have
  // been the quietest possible way to ship a cross-asset score that never
  // recomputed when the non-crypto quotes landed.
  const idx = useMemo(() => computeIndex(snapshot, markets), [snapshot, markets])
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
    const text = `WalletLens Market Index: ${idx.score}/100 — ${b.label}.\nLive cross-asset risk appetite — crypto, equities, metals, forex and commodities:`
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
      description: 'A live 0–100 cross-asset risk-appetite index built from crypto breadth and momentum, global equity indices, the VIX and gold, and the dollar, copper and oil.',
      url: 'https://walletlens.live/market-index',
      creator: { '@type': 'Organization', name: 'WalletLens', url: 'https://walletlens.live' },
      license: 'https://walletlens.live/terms',
      isAccessibleForFree: true,
      variableMeasured: 'WalletLens Market Index — cross-asset risk appetite (0–100)',
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
            One 0–100 risk-appetite score built from crypto, equity indices, volatility, precious metals,
            forex and commodities — all markets on one page, updated continuously. Free to read, free to cite.
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

            {/* Pillars — one per asset group, each 0-100 in the risk-on direction */}
            <section className="mki-pillars">
              <PillarBar label="Crypto" value={idx.scores.crypto}
                sub={idx.scores.crypto == null ? 'no data' : `${idx.gainers} of top 100 green · avg ${fmtPct(idx.avgMom)}`} />
              <PillarBar label="Equities" value={idx.scores.equities}
                sub={idx.scores.equities == null ? 'no data' : `${idx.pillars.equities.detail.covered} indices · avg ${fmtPct(idx.pillars.equities.detail.avgMove)}`} />
              <PillarBar label="Volatility & Havens" value={idx.scores.volatility}
                sub={idx.scores.volatility == null ? 'no data'
                  : idx.pillars.volatility.detail.vixLevel != null
                    ? `VIX ${idx.pillars.volatility.detail.vixLevel.toFixed(2)}`
                    : 'gold bid'} />
              <PillarBar label="Dollar & Growth" value={idx.scores.macro}
                sub={idx.scores.macro == null ? 'no data' : 'forex · copper · oil'} />
            </section>

            {/* What the score was actually built from.
                Only shown when a source is missing, and shown then without
                fail: a number from one pillar out of four is a different claim
                from one built on all of them, and a reader about to cite it is
                owed the difference. */}
            {idx.coverage < 0.999 && (
              <p className="mki-coverage">
                Partial data — scored from {idx.live.length} of 4 signal groups
                ({idx.live.join(', ')}). The market data feed did not answer for the rest;
                weights are rebalanced across what is live rather than counting the gaps as zero.
              </p>
            )}

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

            {/* Global markets — one tab row over regional boards, the way
                Google Finance arranges its front page. "All" stacks every
                board; a region tab shows just its own. Tabs for regions the
                feed did not answer for still render, but their panel says so
                instead of showing an empty stretch of page. */}
            <div className="mki-markets-head">
              <Icon name="globe" size={16} style={{ verticalAlign:'-2px', marginRight:'0.4em' }} />Global markets
              <span className="mki-markets-sub">live · alongside crypto</span>
            </div>
            <div className="mki-tabs" role="tablist" aria-label="Market region">
              {TABS.map(td => (
                <button
                  key={td.id}
                  role="tab"
                  aria-selected={tab === td.id}
                  className={`mki-tab${tab === td.id ? ' mki-tab-on' : ''}`}
                  onClick={() => { setTab(td.id); track('market_index_tab', { tab: td.id }) }}
                >{td.label}</button>
              ))}
            </div>
            {TABS.filter(td => tab === 'all' ? td.id !== 'all' : td.id === tab).map(td => (
              td.id === 'crypto'
                ? <CryptoBoard key="crypto" coins={idx.coins} />
                : <MarketBoard key={td.id} icon={td.icon} title={td.title} items={td.items}
                    markets={markets} standalone={tab !== 'all'} />
            ))}

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
                      {t.thumb && <img src={t.thumb} alt="" width="16" height="16" loading="lazy" decoding="async" />}
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
                The index measures <strong>risk appetite across every market on this page</strong>, not how much of
                it happens to be green. That distinction decides the arithmetic: gold rising is money running
                <em> from</em> risk, and a strengthening dollar tightens conditions for every risk asset there is —
                so both push the score <em>down</em>. Each of the four groups below is scored 0–100 in the
                risk-on direction, then blended:
              </p>
              <ul className="mki-method-list">
                <li><strong>Crypto — 30%.</strong> The share of the top 100 coins up over 24h, with the average
                  24h move of the top 50.</li>
                <li><strong>Equities — 30%.</strong> How many of ten major indices across the US, Europe
                  and Asia are up — S&amp;P 500, Nasdaq, Dow, Russell 2000, FTSE 100, DAX, CAC 40,
                  Nikkei 225, Hang Seng, Shanghai — and by how much.</li>
                <li><strong>Volatility &amp; havens — 20%.</strong> The VIX <em>level</em> (12 is calm, 35 is a
                  scare) and gold read as a safe-haven bid — a gold rally lowers the score.</li>
                <li><strong>Dollar &amp; growth — 20%.</strong> Dollar weakness across the major pairs, and
                  copper and oil as a read on industrial demand.</li>
              </ul>
              <p>
                Scores above 75 mean broad risk-taking — historically a time for caution, not chasing; below 25
                means a broad flight from risk. When a market data source does not answer, its group is dropped
                and the remaining weights are rebalanced, rather than being counted as zero — the page says so
                above the score whenever that happens. All inputs are public market data, and WalletLens stores
                no personal portfolio data on any server.
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

// The tab row over the global-markets boards. 'all' stacks every board;
// 'crypto' is drawn from the CoinGecko snapshot rather than Stooq.
const TABS = [
  { id: 'all',         label: 'All' },
  { id: 'us',          label: 'US',          icon: 'building', title: 'US Indices',      items: US_INDICES },
  { id: 'europe',      label: 'Europe',      icon: 'building', title: 'Europe',          items: EU_INDICES },
  { id: 'asia',        label: 'Asia',        icon: 'building', title: 'Asia',            items: ASIA_INDICES },
  { id: 'metals',      label: 'Metals',      icon: 'award',    title: 'Precious Metals', items: METALS },
  { id: 'forex',       label: 'Forex',       icon: 'exchange', title: 'Forex',           items: FOREX },
  { id: 'commodities', label: 'Commodities', icon: 'droplet',  title: 'Commodities',     items: COMMODITIES },
  { id: 'crypto',      label: 'Crypto' },
]

/**
 * Where in today's travel the price currently sits.
 *
 * The honest stand-in for a sparkline: this page's quote feed carries a
 * session's open/high/low/last and no intraday history, so a line would have
 * to be invented. A position marker on the day's range is the same glanceable
 * "how is it going" without fabricating a shape. Neutral ink on a recessive
 * track — the range is position, not polarity; the ▲/▼ chip above it already
 * carries direction, with a glyph as well as a colour.
 */
function RangeMeter({ low, high, value }) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(value) || high <= low) return null
  const pos = clamp01((value - low) / (high - low)) * 100
  return (
    <div className="mki-range" title={`Day range ${low} – ${high}`}>
      <span className="mki-range-track"><span className="mki-range-marker" style={{ left: `${pos}%` }} /></span>
    </div>
  )
}
const clamp01 = n => Math.max(0, Math.min(1, n))

// Reusable "global markets" board — one asset class per card, premium cells
// with a coloured ▲/▼ move over a day-range meter. Only symbols the data
// source returned are shown; a standalone (single-tab) board says when the
// feed gave it nothing, because an empty pane otherwise reads as a bug.
function MarketBoard({ icon, title, items, markets, standalone = false }) {
  const rows = items.filter(x => markets?.[x.sym])
  if (!rows.length) {
    if (!standalone) return null
    return (
      <section className="mki-ext-section glass-card">
        <div className="mki-section-title"><Icon name={icon} size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{title}</div>
        <p className="mki-ext-empty">No live quotes right now — the market data feed did not answer. It retries on the next refresh.</p>
      </section>
    )
  }
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
              <RangeMeter low={d.low} high={d.high} value={d.close} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

// The crypto tab's board: the top of the market by cap, in the same cell
// shape as the Stooq boards so the tabs feel like one surface. Range comes
// from CoinGecko's own 24h high/low.
function CryptoBoard({ coins }) {
  const rows = (coins || []).slice(0, 12)
  if (!rows.length) {
    return (
      <section className="mki-ext-section glass-card">
        <div className="mki-section-title"><Icon name="coins" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Crypto</div>
        <p className="mki-ext-empty">No live prices right now — retrying on the next refresh.</p>
      </section>
    )
  }
  return (
    <section className="mki-ext-section glass-card">
      <div className="mki-section-title"><Icon name="coins" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Crypto · top of the market</div>
      <div className="mki-ext-grid">
        {rows.map(c => {
          const chg = ch24(c)
          const up = chg >= 0
          return (
            <div key={c.id} className="mki-ext-cell">
              <div className="mki-ext-label">
                {c.image && <img src={c.image} alt="" width="14" height="14" loading="lazy" decoding="async" style={{ verticalAlign:'-2px', marginRight:'0.35em', borderRadius:'50%' }} />}
                {(c.symbol || '').toUpperCase()}
              </div>
              <div className="mki-ext-val">{fmtPrice(c.current_price ?? 0)}</div>
              <div className="mki-ext-chg" style={{ color: up ? '#10b981' : '#f87171' }}>{up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</div>
              <RangeMeter low={c.low_24h} high={c.high_24h} value={c.current_price} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

// One asset group's contribution, 0-100 in the risk-on direction.
//
// `value` is null when that group's data source did not answer. It renders as
// an em dash over an empty track, deliberately distinct from a score of 0 —
// zero is a real reading here (a broad flight from risk) and a feed outage
// must never be able to impersonate one.
function PillarBar({ label, value, sub }) {
  const missing = value == null || !Number.isFinite(value)
  const color = missing ? 'var(--text-sub)' : value >= 56 ? '#10b981' : value >= 45 ? '#94a3b8' : '#fb923c'
  return (
    <div className={`mki-pillar glass-card${missing ? ' mki-pillar-off' : ''}`}>
      <div className="mki-pillar-top">
        <span className="mki-pillar-label">{label}</span>
        <span className="mki-pillar-val" style={{ color }}>{missing ? '—' : value}</span>
      </div>
      <div className="mki-pillar-track">
        <div className="mki-pillar-fill" style={{ width: missing ? '0%' : `${value}%`, background: color }} />
      </div>
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
              {c.image && <img src={c.image} alt="" width="20" height="20" loading="lazy" decoding="async" />}
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
