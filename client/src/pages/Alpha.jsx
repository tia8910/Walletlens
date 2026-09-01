import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { track } from '../analytics'
import { calcAlphaScore, assetClass } from '../alphaScore'
import CoinLogo from '../components/CoinLogo'
import Icon from '../components/Icon'
import { useLanguage } from '../LanguageContext'

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
        fontSize="10" fontWeight="700" fill="var(--text-muted)" fontFamily="Inter,sans-serif">/ 100</text>
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
function PulseDot({ color = 'var(--g)' }) {
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
  const { t } = useLanguage()
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
    let lastLoad = Date.now()
    loadAll()
    refreshRef.current = setInterval(() => { lastLoad = Date.now(); loadAll() }, CACHE_TTL)
    track('alpha_view')

    // Pause polling while the tab is hidden — this page hits CoinGecko for
    // trending/gainers/losers/gems on every tick, no point doing that in
    // the background.
    function handleVisibility() {
      if (document.hidden) {
        clearInterval(refreshRef.current); refreshRef.current = null
      } else {
        if (Date.now() - lastLoad > CACHE_TTL) { lastLoad = Date.now(); loadAll() }
        if (!refreshRef.current) refreshRef.current = setInterval(() => { lastLoad = Date.now(); loadAll() }, CACHE_TTL)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(refreshRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
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

      // Every id, including stock:, metal: and fiat:. This filter used to
      // strip them, and that one line was the whole reason the Alpha score
      // was crypto-only: unfiltered ids never got a price, holdings without a
      // price were dropped below, and what reached the score was the crypto
      // slice of the portfolio wearing the name of the whole thing.
      // api.getPrices() routes stock: to Stooq and metal: to a spot feed — the
      // support was already there and was simply not being asked for.
      const ids = [...new Set(portfolio.map(h => h.coin_id).filter(Boolean))]

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

    // Direct CoinGecko first (freshest), then the resilient api layer which
    // falls back through CORS proxies and the same-origin /market.json
    // snapshot — so signals load even on networks that block crypto APIs.
    const [trendRes, marketsDirect] = await Promise.all([
      fetchJSON(`${CG}/search/trending`),
      fetchJSON(`${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&price_change_percentage=24h`),
    ])
    let marketsRes = marketsDirect
    if (!Array.isArray(marketsRes) || marketsRes.length === 0) {
      const snap = await api.getWhaleMarketSnapshot().catch(() => [])
      if (Array.isArray(snap) && snap.length > 0) {
        marketsRes = [...snap].sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0)).slice(0, 100)
      }
    }

    let trendCoins = (trendRes?.coins || []).map(c => c.item)
    if (!trendCoins.length && Array.isArray(marketsRes) && marketsRes.length > 0) {
      // Trending endpoint unreachable — approximate with the highest
      // volume-to-market-cap movers from the market snapshot.
      trendCoins = [...marketsRes]
        .filter(c => c.market_cap > 0 && c.total_volume > 0)
        .sort((a, b) => (b.total_volume / b.market_cap) - (a.total_volume / a.market_cap))
        .slice(0, 7)
        .map(c => ({ id: c.id, name: c.name, symbol: c.symbol, thumb: c.image, market_cap_rank: c.market_cap_rank }))
    }
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

  // My portfolio signals — every holding with a confirmed live price, of any
  // asset class. A stock down 9% on the day is exactly the thing this panel
  // exists to surface, and it was silently excluded.
  const pricedHoldings = enriched.filter(h => (prices[h.coin_id]?.usd ?? 0) > 0)

  // Thresholds scale with the asset class. -8% in a day is a routine crypto
  // wobble and a serious event for a share, so one number for both would
  // either spam crypto warnings or never fire on a stock at all.
  const DAILY_ALARM = { crypto: -8, equity: -4, metal: -3, realestate: -3, bond: -2, other: -4, cash: -2 }

  const warnings = pricedHoldings.filter(h => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    const pnl = h.pnlPct || 0
    // Skip if pnlPct is suspiciously at exactly -100 (no real price loaded)
    if (pnl <= -99 && (prices[h.coin_id]?.usd ?? 0) <= 0) return false
    return chg < (DAILY_ALARM[assetClass(h.coin_id)] ?? -8) || pnl < -30
  })

  const DAILY_POP  = { crypto: 5, equity: 2.5, metal: 2, realestate: 2, bond: 1, other: 2.5, cash: 1 }
  const DAILY_TREND = { crypto: 2, equity: 1, metal: 0.8, realestate: 0.8, bond: 0.5, other: 1, cash: 0.5 }

  const opportunities = pricedHoldings.filter(h => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return chg > (DAILY_POP[assetClass(h.coin_id)] ?? 5) && (h.pnlPct || 0) > 0
  })

  const strongHoldings = pricedHoldings.filter(h => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return chg > (DAILY_TREND[assetClass(h.coin_id)] ?? 2) && (h.pnlPct || 0) > 20
  })

  return (
    <div className="alpha-root">
      {/* ── Header ── */}
      <div className="alpha-header">
        <div className="alpha-header-left">
          <div className="alpha-logo">α</div>
          <div>
            <div className="alpha-title">{t('axTitle')}</div>
            <div className="alpha-subtitle muted">
              {lastUpdate
                ? t('axUpdated')(lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
                : t('axLoadingSignals')}
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
          <div className="alpha-score-label">{t('axScoreLabel')}</div>
          <div className="alpha-score-body">
            <AlphaRing score={alphaScore.total} color={alphaScore.color} />
            <div className="alpha-score-meta">
              <div className="alpha-score-grade" style={{ color: alphaScore.color }}>{t(alphaScore.gradeKey)}</div>
              <div className="alpha-score-breakdown">
                <div className="alpha-breakdown-row">
                  <span className="muted">{t('momentum')}</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.momentumScore / 30) * 100}%`, background: alphaScore.momentum >= 0 ? 'var(--g)' : '#f87171' }} />
                  </div>
                  <span style={{ color: alphaScore.momentum >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                    {alphaScore.momentum >= 0 ? '+' : ''}{alphaScore.momentum.toFixed(1)}%
                  </span>
                </div>
                <div className="alpha-breakdown-row">
                  <span className="muted">{t('axPnlHealth')}</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.pnlScore / 30) * 100}%`, background: '#60a5fa' }} />
                  </div>
                  <span style={{ color: '#60a5fa' }}>{alphaScore.pnlScore}/30</span>
                </div>
                <div className="alpha-breakdown-row">
                  <span className="muted">{t('diversification')}</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.divScore / 20) * 100}%`, background: '#a78bfa' }} />
                  </div>
                  <span style={{ color: '#a78bfa' }}>{alphaScore.divScore}/20</span>
                </div>
                <div className="alpha-breakdown-row">
                  <span className="muted">{t('axOpportunity')}</span>
                  <div className="alpha-breakdown-bar-wrap">
                    <div className="alpha-breakdown-bar" style={{ width: `${(alphaScore.oppScore / 20) * 100}%`, background: '#fbbf24' }} />
                  </div>
                  <span style={{ color: '#fbbf24' }}>{alphaScore.oppScore}/20</span>
                </div>
              </div>
              {/* What was actually scored. Shown because this number spent a
                  long time claiming to cover a portfolio while reading only
                  the crypto in it — a reader deserves to see the classes it
                  weighed rather than having to trust the label. */}
              <div className="alpha-score-mix">
                {alphaScore.mix.map(m => (
                  <span key={m.name} className="alpha-mix-chip">
                    {t(`axClass_${m.name}`)} {Math.round(m.weight * 100)}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card alpha-score-card alpha-score-empty">
          <div className="alpha-score-label">{t('axScoreLabel')}</div>
          <div className="alpha-empty-hint muted">{t('axEmptyHint')}</div>
        </div>
      )}

      {/* ── My Holdings Signals ── */}
      {pricedHoldings.length > 0 && (warnings.length > 0 || opportunities.length > 0 || strongHoldings.length > 0) && (
        <div className="glass-card alpha-section-card">
          <SectionHead icon={<Icon name="bar-chart" size={20} />} title={t('axYourSignals')} sub={t('axYourSignalsSub')} />
          <div className="alpha-signal-list">
            {warnings.map(h => {
              const chg = prices[h.coin_id]?.usd_24h_change ?? 0
              return (
                <SignalRow key={h.coin_id}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                  color="#f87171"
                  title={h.coin_symbol?.toUpperCase()}
                  value={chg < -8 ? t('axTodayPct')(chg.toFixed(1)) : undefined}
                  sub={(h.pnlPct || 0) < -30 ? t('axDownFromEntry')(Math.abs(h.pnlPct).toFixed(0)) : t('axHeavyLoss')}
                  badge={t('axWarning')}
                />
              )
            })}
            {opportunities.map(h => {
              const chg = prices[h.coin_id]?.usd_24h_change ?? 0
              return (
                <SignalRow key={h.coin_id}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
                  color="var(--g)"
                  title={h.coin_symbol?.toUpperCase()}
                  value={t('axTodayPct')('+' + chg.toFixed(1))}
                  sub={t('axUpFromEntry')((h.pnlPct || 0).toFixed(0))}
                  badge={t('axBullish')}
                />
              )
            })}
            {strongHoldings.length > 0 && warnings.length === 0 && opportunities.length === 0 && (
              <SignalRow
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
                color="var(--g)"
                title={t('axAllHealthy')}
                sub={t('axNoWarnings')}
                badge={t('axClear')}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Smart Money / Trending ── */}
      <div className="glass-card alpha-section-card">
        <SectionHead icon={<Icon name="flow" size={20} />} title={t('axSmartMoney')} sub={t('axSmartMoneySub')} live />
        {loading && trending.length === 0 ? (
          <div className="alpha-loading-row muted">{t('axFetchingSignals')}</div>
        ) : trending.length === 0 ? (
          <div className="alpha-loading-row muted">{t('axMarketUnavailable')}</div>
        ) : (
          <div className="alpha-coin-list">
            {trending.slice(0, 7).map((c, i) => (
              <CoinCard key={c.id || i}
                coin={{ ...c, symbol: c.symbol, name: c.name, thumb: c.thumb }}
                badge={`#${c.market_cap_rank || '?'}`}
                badgeColor="#a78bfa"
                reason={c.data?.price_change_percentage_24h?.usd !== undefined
                  ? `${c.data.price_change_percentage_24h.usd >= 0 ? '+' : ''}${Number(c.data.price_change_percentage_24h.usd).toFixed(1)}% (24h)`
                  : t('axTrendingNow')}
                sub={t('axTrending')}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Top Gainers ── */}
      <div className="glass-card alpha-section-card">
        <SectionHead icon={<Icon name="arrow-ne" size={20} />} title={t('axTopGainers')} sub={t('axTopGainersSub')} live />
        {loading && topGainers.length === 0 ? (
          <div className="alpha-loading-row muted">{t('axFetching')}</div>
        ) : topGainers.length === 0 ? (
          <div className="alpha-loading-row muted">{t('axNoGainers')}</div>
        ) : (
          <div className="alpha-coin-list">
            {topGainers.map(c => (
              <CoinCard key={c.id}
                coin={{ symbol: c.symbol, name: c.name, thumb: c.image }}
                badge={`+${(c.price_change_percentage_24h || 0).toFixed(1)}%`}
                badgeColor="var(--g)"
                reason={`$${c.current_price?.toLocaleString(undefined, { maximumFractionDigits: 6 })} · ${t('axRank')(c.market_cap_rank)}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Hidden Gems ── */}
      <div className="glass-card alpha-section-card">
        <SectionHead icon={<Icon name="diamond" size={20} />} title={t('axHiddenGems')} sub={t('axHiddenGemsSub')} live />
        {loading && gems.length === 0 ? (
          <div className="alpha-loading-row muted">{t('axScanning')}</div>
        ) : gems.length === 0 ? (
          <div className="alpha-loading-row muted">{t('axNoGems')}</div>
        ) : (
          <div className="alpha-coin-list">
            {gems.map(c => {
              const liqRatio = c.market_cap > 0 ? ((c.total_volume / c.market_cap) * 100).toFixed(0) : '?'
              return (
                <CoinCard key={c.id}
                  coin={{ symbol: c.symbol, name: c.name, thumb: c.image }}
                  badge={`+${(c.price_change_percentage_24h || 0).toFixed(1)}%`}
                  badgeColor="#fbbf24"
                  reason={`${t('axVolMcap')(liqRatio)} · ${t('axRank')(c.market_cap_rank)}`}
                  sub={t('axHighLiquidity')}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ── Bearish Watch ── */}
      {topLosers.length > 0 && (
        <div className="glass-card alpha-section-card">
          <SectionHead icon={<Icon name="warning" size={20} />} title={t('axBearish')} sub={t('axBearishSub')} />
          <div className="alpha-coin-list">
            {topLosers.map(c => (
              <CoinCard key={c.id}
                coin={{ symbol: c.symbol, name: c.name, thumb: c.image }}
                badge={`${(c.price_change_percentage_24h || 0).toFixed(1)}%`}
                badgeColor="#f87171"
                reason={`$${c.current_price?.toLocaleString(undefined, { maximumFractionDigits: 6 })} · ${t('axRank')(c.market_cap_rank)}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p className="alpha-disclaimer muted">
        {t('axDisclaimer')}
      </p>
    </div>
  )
}
