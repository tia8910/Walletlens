import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { track } from '../analytics'
import CoinLogo from '../components/CoinLogo'

const CG = 'https://api.coingecko.com/api/v3'
const CACHE_KEY = 'wl_alpha_cache_v1'
const CACHE_TTL = 5 * 60 * 1000 // 5 min

async function fetchJSON(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (r.ok) return r.json()
  } catch {}
  return null
}

function loadCache() {
  try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function saveCache(data) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })) } catch {} }

// ── Portfolio Alpha Score ──────────────────────────────────────────────────
function calcAlphaScore(enriched, prices) {
  if (!enriched?.length) return null
  const totalValue = enriched.reduce((s, h) => s + (h.value || 0), 0)
  if (totalValue === 0) return null

  const weights = enriched.map(h => h.value / totalValue)

  // Momentum (0–30): weighted 24h change, clamped -20 to +20
  let momentum = 0
  enriched.forEach((h, i) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    momentum += chg * weights[i]
  })
  const momentumScore = Math.round(((Math.max(-20, Math.min(20, momentum)) + 20) / 40) * 30)

  // P&L health (0–30): % of holdings in profit, weighted by value
  let inProfitWeight = 0
  enriched.forEach((h, i) => {
    if ((h.pnlPct || 0) > 0) inProfitWeight += weights[i]
  })
  const pnlScore = Math.round(inProfitWeight * 30)

  // Diversification (0–20): penalise concentration
  const maxWeight = Math.max(...weights)
  const divScore = Math.round(Math.max(0, 1 - maxWeight) * 20)

  // Opportunity (0–20): holdings significantly below ATH but with positive momentum = upside potential
  const upCount = enriched.filter((h) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return chg > 0 && (h.pnlPct || 0) < 100
  }).length
  const oppScore = Math.round((upCount / Math.max(enriched.length, 1)) * 20)

  const total = momentumScore + pnlScore + divScore + oppScore
  const grade = total >= 80 ? 'STRONG' : total >= 60 ? 'GOOD' : total >= 40 ? 'NEUTRAL' : total >= 20 ? 'WEAK' : 'POOR'
  const color = total >= 80 ? '#34d399' : total >= 60 ? '#60a5fa' : total >= 40 ? '#f59e0b' : '#f87171'
  return { total, grade, color, momentum, momentumScore, pnlScore, divScore, oppScore }
}

// ── Alpha Score Ring ──────────────────────────────────────────────────────
function AlphaRing({ score, color }) {
  const r = 52, circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
      <text x="64" y="60" textAnchor="middle" dominantBaseline="central"
        fontSize="24" fontWeight="900" fill={color} fontFamily="Inter,sans-serif">{score}</text>
      <text x="64" y="80" textAnchor="middle"
        fontSize="10" fontWeight="700" fill="rgba(255,255,255,0.4)" fontFamily="Inter,sans-serif">/ 100</text>
    </svg>
  )
}

// ── Signal row ─────────────────────────────────────────────────────────────
function SignalRow({ icon, color, title, value, sub, badge }) {
  return (
    <div className="alpha-signal-row">
      <div className="alpha-signal-icon" style={{ background: color + '18', color }}>{icon}</div>
      <div className="alpha-signal-body">
        <div className="alpha-signal-title">{title}</div>
        {sub && <div className="alpha-signal-sub muted">{sub}</div>}
      </div>
      <div className="alpha-signal-right">
        {value && <span className="alpha-signal-value" style={{ color }}>{value}</span>}
        {badge && <span className="alpha-badge" style={{ background: color + '18', color, borderColor: color + '33' }}>{badge}</span>}
      </div>
    </div>
  )
}

// ── Coin signal card ───────────────────────────────────────────────────────
function CoinCard({ coin, badge, badgeColor, reason, sub }) {
  return (
    <div className="alpha-coin-card">
      <div className="alpha-coin-left">
        <CoinLogo image={coin.thumb || coin.coin_image} symbol={coin.symbol} size={36} />
        <div>
          <div className="alpha-coin-sym">{coin.symbol?.toUpperCase()}</div>
          <div className="alpha-coin-name muted">{coin.name}</div>
        </div>
      </div>
      <div className="alpha-coin-right">
        <span className="alpha-badge" style={{ background: badgeColor + '18', color: badgeColor, borderColor: badgeColor + '33' }}>{badge}</span>
        {reason && <div className="alpha-coin-reason muted">{reason}</div>}
        {sub && <div className="alpha-coin-sub" style={{ color: badgeColor }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Animated pulse dot ────────────────────────────────────────────────────
function PulseDot({ color = '#34d399' }) {
  return <span className="alpha-pulse-dot" style={{ '--pulse-color': color }} />
}

// ── Section header ────────────────────────────────────────────────────────
function SectionHead({ icon, title, sub, live }) {
  return (
    <div className="alpha-section-head">
      <div className="alpha-section-icon">{icon}</div>
      <div>
        <div className="alpha-section-title">
          {title}
          {live && <PulseDot />}
        </div>
        {sub && <div className="alpha-section-sub muted">{sub}</div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Alpha() {
  const [enriched, setEnriched]     = useState([])
  const [prices, setPrices]         = useState({})
  const [trending, setTrending]     = useState([])
  const [topGainers, setTopGainers] = useState([])
  const [topLosers, setTopLosers]   = useState([])
  const [gems, setGems]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const refreshRef = useRef(null)

  useEffect(() => {
    loadAll()
    refreshRef.current = setInterval(loadAll, CACHE_TTL)
    track('alpha_view')
    return () => clearInterval(refreshRef.current)
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      await Promise.all([loadPortfolio(), loadMarketSignals()])
    } finally {
      setLoading(false)
      setLastUpdate(new Date())
    }
  }

  async function loadPortfolio() {
    try {
      const [portfolio, , , ] = await Promise.all([
        api.getPortfolio(),
        api.getTransactions(),
        api.getWallets(),
        Promise.resolve(),
      ])

      if (!portfolio?.length) return

      const ids = [...new Set(portfolio.map(h => h.coin_id).filter(id =>
        !id.startsWith('metal:') && !id.startsWith('stock:') && !id.startsWith('fiat:')
      ))]

      if (!ids.length) return

      const idsStr = ids.join(',')
      const [priceData, imageData] = await Promise.all([
        api.getPrices(idsStr).catch(() => ({})),
        api.getCoinImages(idsStr).catch(() => ({})),
      ])

      setPrices(priceData)

      const enrichedData = portfolio.map(h => {
        const p = priceData[h.coin_id]
        const currentPrice = p?.usd ?? 0
        if (!currentPrice) return null  // skip holdings where price data is unavailable
        const value = h.amount * currentPrice
        const invested = h.total_invested ?? (h.amount * (h.avg_price ?? 0))
        const pnl = value - invested
        const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
        return { ...h, value, invested, pnl, pnlPct, coin_image: imageData[h.coin_id] || h.coin_image }
      }).filter(Boolean)

      setEnriched(enrichedData)
    } catch {}
  }

  async function loadMarketSignals() {
    const cache = loadCache()
    if (cache.ts && Date.now() - cache.ts < CACHE_TTL && cache.data) {
      const d = cache.data
      setTrending(d.trending || [])
      setTopGainers(d.topGainers || [])
      setTopLosers(d.topLosers || [])
      setGems(d.gems || [])
      return
    }

    const [trendRes, marketsRes] = await Promise.all([
      fetchJSON(`${CG}/search/trending`),
      fetchJSON(`${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&price_change_percentage=24h`),
    ])

    const trendCoins = (trendRes?.coins || []).map(c => c.item)
    setTrending(trendCoins.slice(0, 7))

    if (marketsRes) {
      const sorted = [...marketsRes].sort((a, b) =>
        (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)
      )
      const gainers = sorted.filter(c => (c.price_change_percentage_24h ?? 0) > 5).slice(0, 5)
      const losers  = sorted.filter(c => (c.price_change_percentage_24h ?? 0) < -5).reverse().slice(0, 5)

      // Hidden gems: coins with rank 100-500, positive momentum, high volume/mcap ratio
      const hiddenGems = marketsRes
        .filter(c =>
          c.market_cap_rank > 50 &&
          c.market_cap_rank <= 300 &&
          (c.price_change_percentage_24h ?? 0) > 3 &&
          c.market_cap > 0 &&
          (c.total_volume / c.market_cap) > 0.08
        )
        .sort((a, b) => (b.total_volume / b.market_cap) - (a.total_volume / a.market_cap))
        .slice(0, 5)

      setTopGainers(gainers)
      setTopLosers(losers)
      setGems(hiddenGems)

      saveCache({ trending: trendCoins.slice(0, 7), topGainers: gainers, topLosers: losers, gems: hiddenGems })
    }
  }

  const alphaScore = calcAlphaScore(enriched, prices)

  // My portfolio signals — only crypto holdings with confirmed live price
  const cryptoHoldings = enriched.filter(h =>
    !h.coin_id.startsWith('metal:') && !h.coin_id.startsWith('stock:') && !h.coin_id.startsWith('fiat:') &&
    (prices[h.coin_id]?.usd ?? 0) > 0
  )

  const warnings = cryptoHoldings.filter(h => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    const pnl = h.pnlPct || 0
    // Skip if pnlPct is suspiciously at exactly -100 (no real price loaded)
    if (pnl <= -99 && (prices[h.coin_id]?.usd ?? 0) <= 0) return false
    return chg < -8 || pnl < -30
  })

  const opportunities = cryptoHoldings.filter(h => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return chg > 5 && (h.pnlPct || 0) > 0
  })

  const strongHoldings = cryptoHoldings.filter(h => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return chg > 2 && (h.pnlPct || 0) > 20
  })

  return (
    <div className="alpha-root">
      {/* ── Header ── */}
      <div className="alpha-header">
        <div className="alpha-header-left">
          <div className="alpha-logo">α</div>
          <div>
            <div className="alpha-title">WalletLens Alpha</div>
            <div className="alpha-subtitle muted">
              {lastUpdate
                ? `Updated ${lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Loading signals…'}
            </div>
          </div>
        </div>
        <button className="alpha-refresh-btn" onClick={() => { track('alpha_refresh'); loadAll() }} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      {/* ── Portfolio Alpha Score ── */}
      {alphaScore ? (
        <div className="glass-card alpha-score-card">
          <div className="alpha-score-label">YOUR PORTFOLIO ALPHA</div>
          <div className="alpha-score-body">
            <AlphaRing score={alphaScore.total} color={alphaScore.color} />
            <div className="alpha-score-meta">
              <div className="alpha-score-grade" style={{ color: alphaScore.color }}>{alphaScore.grade}</div>
              <div className="alpha-score-breakdown">
                <div className="alpha-breakdown-row">
                  <span className="muted">Momentum</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.momentumScore / 30) * 100}%`, background: alphaScore.momentum >= 0 ? '#34d399' : '#f87171' }} />
                  </div>
                  <span style={{ color: alphaScore.momentum >= 0 ? '#34d399' : '#f87171' }}>
                    {alphaScore.momentum >= 0 ? '+' : ''}{alphaScore.momentum.toFixed(1)}%
                  </span>
                </div>
                <div className="alpha-breakdown-row">
                  <span className="muted">P&L Health</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.pnlScore / 30) * 100}%`, background: '#60a5fa' }} />
                  </div>
                  <span style={{ color: '#60a5fa' }}>{alphaScore.pnlScore}/30</span>
                </div>
                <div className="alpha-breakdown-row">
                  <span className="muted">Diversification</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.divScore / 20) * 100}%`, background: '#a78bfa' }} />
                  </div>
                  <span style={{ color: '#a78bfa' }}>{alphaScore.divScore}/20</span>
                </div>
                <div className="alpha-breakdown-row">
                  <span className="muted">Opportunity</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.oppScore / 20) * 100}%`, background: '#fbbf24' }} />
                  </div>
                  <span style={{ color: '#fbbf24' }}>{alphaScore.oppScore}/20</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card alpha-score-card alpha-score-empty">
          <div className="alpha-score-label">YOUR PORTFOLIO ALPHA</div>
          <div className="alpha-empty-hint muted">Add crypto holdings to unlock your Alpha Score</div>
        </div>
      )}

      {/* ── My Holdings Signals ── */}
      {cryptoHoldings.length > 0 && (warnings.length > 0 || opportunities.length > 0 || strongHoldings.length > 0) && (
        <div className="glass-card alpha-section-card">
          <SectionHead icon="📊" title="Your Portfolio Signals" sub="Based on your actual holdings" />
          <div className="alpha-signal-list">
            {warnings.map(h => {
              const chg = prices[h.coin_id]?.usd_24h_change ?? 0
              return (
                <SignalRow key={h.coin_id}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                  color="#f87171"
                  title={h.coin_symbol?.toUpperCase()}
                  value={chg < -8 ? `${chg.toFixed(1)}% today` : undefined}
                  sub={(h.pnlPct || 0) < -30 ? `Down ${Math.abs(h.pnlPct).toFixed(0)}% from entry — watch support` : 'Heavy daily loss — consider reducing'}
                  badge="WARNING"
                />
              )
            })}
            {opportunities.map(h => {
              const chg = prices[h.coin_id]?.usd_24h_change ?? 0
              return (
                <SignalRow key={h.coin_id}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
                  color="#34d399"
                  title={h.coin_symbol?.toUpperCase()}
                  value={`+${chg.toFixed(1)}% today`}
                  sub={`Up ${(h.pnlPct || 0).toFixed(0)}% from entry — momentum building`}
                  badge="BULLISH"
                />
              )
            })}
            {strongHoldings.length > 0 && warnings.length === 0 && opportunities.length === 0 && (
              <SignalRow
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                color="#34d399"
                title="All positions healthy"
                sub="No warnings detected across your crypto holdings"
                badge="CLEAR"
              />
            )}
          </div>
        </div>
      )}

      {/* ── Smart Money / Trending ── */}
      <div className="glass-card alpha-section-card">
        <SectionHead icon="🐋" title="Smart Money" sub="What's trending with large volume right now" live />
        {loading && trending.length === 0 ? (
          <div className="alpha-loading-row muted">Fetching signals…</div>
        ) : (
          <div className="alpha-coin-list">
            {trending.slice(0, 7).map((c, i) => (
              <CoinCard key={c.id || i}
                coin={{ ...c, symbol: c.symbol, name: c.name, thumb: c.thumb }}
                badge={`#${c.market_cap_rank || '?'}`}
                badgeColor="#a78bfa"
                reason={c.data?.price_change_percentage_24h?.usd !== undefined
                  ? `${c.data.price_change_percentage_24h.usd >= 0 ? '+' : ''}${Number(c.data.price_change_percentage_24h.usd).toFixed(1)}% (24h)`
                  : 'Trending now'}
                sub="Trending"
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Top Gainers ── */}
      <div className="glass-card alpha-section-card">
        <SectionHead icon="🚀" title="Top Gainers" sub="Coins up 5%+ in the last 24 hours" live />
        {loading && topGainers.length === 0 ? (
          <div className="alpha-loading-row muted">Fetching…</div>
        ) : topGainers.length === 0 ? (
          <div className="alpha-loading-row muted">No significant gainers right now</div>
        ) : (
          <div className="alpha-coin-list">
            {topGainers.map(c => (
              <CoinCard key={c.id}
                coin={{ symbol: c.symbol, name: c.name, thumb: c.image }}
                badge={`+${(c.price_change_percentage_24h || 0).toFixed(1)}%`}
                badgeColor="#34d399"
                reason={`$${c.current_price?.toLocaleString(undefined, { maximumFractionDigits: 6 })} · Rank #${c.market_cap_rank}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Hidden Gems ── */}
      <div className="glass-card alpha-section-card">
        <SectionHead icon="💎" title="Hidden Gems" sub="Rank 50–300 coins with high volume momentum" live />
        {loading && gems.length === 0 ? (
          <div className="alpha-loading-row muted">Scanning…</div>
        ) : gems.length === 0 ? (
          <div className="alpha-loading-row muted">No gems matching criteria right now</div>
        ) : (
          <div className="alpha-coin-list">
            {gems.map(c => {
              const liqRatio = c.market_cap > 0 ? ((c.total_volume / c.market_cap) * 100).toFixed(0) : '?'
              return (
                <CoinCard key={c.id}
                  coin={{ symbol: c.symbol, name: c.name, thumb: c.image }}
                  badge={`+${(c.price_change_percentage_24h || 0).toFixed(1)}%`}
                  badgeColor="#fbbf24"
                  reason={`${liqRatio}% vol/mcap · Rank #${c.market_cap_rank}`}
                  sub="High liquidity signal"
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ── Bearish Watch ── */}
      {topLosers.length > 0 && (
        <div className="glass-card alpha-section-card">
          <SectionHead icon="⚠️" title="Bearish Watch" sub="Coins down 5%+ today — possible oversold bounces" />
          <div className="alpha-coin-list">
            {topLosers.map(c => (
              <CoinCard key={c.id}
                coin={{ symbol: c.symbol, name: c.name, thumb: c.image }}
                badge={`${(c.price_change_percentage_24h || 0).toFixed(1)}%`}
                badgeColor="#f87171"
                reason={`$${c.current_price?.toLocaleString(undefined, { maximumFractionDigits: 6 })} · Rank #${c.market_cap_rank}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p className="alpha-disclaimer muted">
        Alpha signals are generated from public market data (CoinGecko) and your own portfolio. Not financial advice. Always DYOR.
      </p>
    </div>
  )
}
