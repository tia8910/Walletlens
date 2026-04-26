import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, ASSET_CATEGORIES, STOCK_PREFIX, GOLD_ID, SILVER_ID } from '../api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function isNonCryptoId(id) {
  if (!id) return false
  return id.startsWith(STOCK_PREFIX) || id === GOLD_ID || id === SILVER_ID || id.startsWith('bond:') || id.startsWith('other:')
}

function categoryFor(id) {
  if (!id) return 'crypto'
  if (id === GOLD_ID) return 'gold'
  if (id === SILVER_ID) return 'silver'
  if (id.startsWith(STOCK_PREFIX)) return 'stock'
  if (id.startsWith('bond:')) return 'bond'
  if (id.startsWith('other:')) return 'other'
  return 'crypto'
}

function fmt(n) {
  return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AssetDetail() {
  const { coinId } = useParams()
  const navigate = useNavigate()
  const [chartData, setChartData] = useState([])
  const [chartDays, setChartDays] = useState(7)
  const [coin, setCoin] = useState(null)
  const [holdings, setHoldings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState([])
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [tInputPrice, setTInputPrice] = useState('')
  const [tInputQty, setTInputQty] = useState('')
  const [signals, setSignals] = useState(null)

  useEffect(() => { loadData() }, [coinId])
  useEffect(() => { loadChart() }, [coinId, chartDays])
  useEffect(() => {
    setSignals(null)
    if (!coinId || isNonCryptoId(coinId)) return
    api.getCoinSmartSignals(coinId, 30).then(setSignals).catch(() => {})
  }, [coinId])

  async function loadData() {
    setLoading(true)
    try {
      const nonCrypto = isNonCryptoId(coinId)
      const cat = categoryFor(coinId)
      const catMeta = ASSET_CATEGORIES[cat]

      // Phase 1 — fast path. Only blocks on data we need to render the page
      // shell: portfolio (for holdings), prices (for the headline number)
      // and target plan. Detail + image fill in async.
      const [portfolio, prices, allTargets] = await Promise.all([
        api.getPortfolio(),
        api.getPrices(coinId),
        api.getCoinTargets(),
      ])
      const h = portfolio.find(p => p.coin_id === coinId)
      setHoldings(h || null)
      setTargets(allTargets[coinId]?.targets || [])

      const price = prices[coinId]?.usd || 0
      const change24 = prices[coinId]?.usd_24h_change || 0
      const fallbackName = prices[coinId]?.name || h?.coin_name || (h?.coin_symbol || coinId).toUpperCase()
      setCoin({
        id: coinId,
        name: fallbackName,
        symbol: (h?.coin_symbol || coinId.replace(STOCK_PREFIX, '').replace('metal:', '')).toUpperCase(),
        price, change24,
        image: h?.coin_image || '',
        category: cat,
        categoryLabel: catMeta?.label,
        categoryIcon: catMeta?.icon,
        categoryColor: catMeta?.color,
      })
      setLoading(false)

      // Phase 2 — slow path. Detail + image enrich the card once they arrive.
      if (!nonCrypto) {
        Promise.all([api.getCoinImages(coinId), api.getCoinDetail(coinId)])
          .then(([images, detail]) => {
            const image = images?.[coinId] || h?.coin_image || ''
            const md = detail?.market_data
            setCoin(prev => ({
              ...(prev || {}),
              name: detail?.name || prev?.name || fallbackName,
              symbol: (detail?.symbol || prev?.symbol || coinId).toUpperCase(),
              image: image || prev?.image,
              ath: md?.ath?.usd, atl: md?.atl?.usd,
              high24: md?.high_24h?.usd, low24: md?.low_24h?.usd,
              marketCap: md?.market_cap?.usd,
              volume: md?.total_volume?.usd,
              change7d: md?.price_change_percentage_7d,
              change30d: md?.price_change_percentage_30d,
            }))
          })
          .catch(() => {})
      }
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  async function loadChart() {
    try {
      const data = await api.getChartData(coinId, chartDays)
      setChartData(data)
    } catch (e) { console.error(e) }
  }

  async function handleAddTarget(e) {
    e.preventDefault()
    const price = parseFloat(tInputPrice)
    if (!price || price <= 0) return
    const qty = tInputQty === '' ? null : parseFloat(tInputQty)
    await api.addCoinTarget(coinId, { price, quantity: qty })
    setTInputPrice(''); setTInputQty(''); setShowAddTarget(false)
    loadData()
  }

  async function handleRemoveTarget(targetId) {
    await api.removeCoinTargetItem(coinId, targetId)
    loadData()
  }

  const price = coin?.price || 0
  const amount = holdings?.amount || 0
  const invested = holdings?.total_invested || 0
  const value = amount * price
  const pnl = value - invested
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0
  const avgBuy = amount > 0 ? invested / amount : 0
  const isUp = chartData.length > 1 && chartData[chartData.length - 1]?.price >= chartData[0]?.price
  const chartColor = isUp ? '#10b981' : '#ef4444'

  if (loading) return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div className="card"><p className="muted">Loading...</p></div>
    </div>
  )

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>

      {/* Asset header */}
      <div className="detail-hero">
        <div className="detail-hero-left">
          <DetailLogo coin={coin} />
          <div>
            <h2 className="detail-name">{coin?.name}</h2>
            <div className="detail-sub">
              <span className="muted">{coin?.symbol}</span>
              {coin?.categoryLabel && coin.category !== 'crypto' && (
                <span className="category-badge" style={{ background: `${coin.categoryColor}22`, color: coin.categoryColor }}>
                  {coin.categoryIcon} {coin.categoryLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="detail-hero-right">
          <div className="detail-price-big">${fmt(price)}</div>
          <span className={`detail-change ${(coin?.change24 || 0) >= 0 ? 'positive' : 'negative'}`}>
            {(coin?.change24 || 0) >= 0 ? '▲' : '▼'} {Math.abs(coin?.change24 || 0).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-card">
        <div className="chart-tabs">
          {[{ d: 1, l: '24H' }, { d: 7, l: '7D' }, { d: 30, l: '1M' }, { d: 90, l: '3M' }, { d: 365, l: '1Y' }].map(({ d, l }) => (
            <button key={d} className={`chart-tab ${chartDays === d ? 'active' : ''}`} onClick={() => setChartDays(d)}>{l}</button>
          ))}
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e0e0ea', borderRadius: 10, fontSize: '0.82rem' }}
                formatter={(val) => ['$' + fmt(val), 'Price']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.time || ''}
              />
              <Area type="monotone" dataKey="price" stroke={chartColor} fill="url(#cGrad)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text2)' }}>No chart data available</div>
        )}
      </div>

      {/* Market stats */}
      <div className="detail-stats-grid">
        {coin?.high24 != null && <div className="dstat"><span className="dstat-label">24h High</span><span>${fmt(coin.high24)}</span></div>}
        {coin?.low24 != null && <div className="dstat"><span className="dstat-label">24h Low</span><span>${fmt(coin.low24)}</span></div>}
        {coin?.change7d != null && <div className="dstat"><span className="dstat-label">7d Change</span><span className={coin.change7d >= 0 ? 'positive' : 'negative'}>{coin.change7d >= 0 ? '+' : ''}{coin.change7d.toFixed(2)}%</span></div>}
        {coin?.change30d != null && <div className="dstat"><span className="dstat-label">30d Change</span><span className={coin.change30d >= 0 ? 'positive' : 'negative'}>{coin.change30d >= 0 ? '+' : ''}{coin.change30d.toFixed(2)}%</span></div>}
        {coin?.ath != null && <div className="dstat"><span className="dstat-label">All-Time High</span><span>${fmt(coin.ath)}</span></div>}
        {coin?.marketCap != null && <div className="dstat"><span className="dstat-label">Market Cap</span><span>${(coin.marketCap / 1e9).toFixed(2)}B</span></div>}
        {coin?.volume != null && <div className="dstat"><span className="dstat-label">24h Volume</span><span>${(coin.volume / 1e9).toFixed(2)}B</span></div>}
      </div>

      {/* Holdings */}
      {holdings && (
        <div className="detail-holdings">
          <h3>Your Holdings</h3>
          <div className="detail-holdings-grid">
            <div className="dh-item">
              <span className="dh-label">Balance</span>
              <span className="dh-value">{amount.toFixed(6)} {coin?.symbol}</span>
            </div>
            <div className="dh-item">
              <span className="dh-label">Value</span>
              <span className="dh-value">${fmt(value)}</span>
            </div>
            <div className="dh-item">
              <span className="dh-label">Avg Buy Price</span>
              <span className="dh-value">${fmt(avgBuy)}</span>
            </div>
            <div className="dh-item">
              <span className="dh-label">Profit / Loss</span>
              <span className={`dh-value ${pnl >= 0 ? 'positive' : 'negative'}`}>
                {pnl >= 0 ? '+' : ''}{fmt(pnl)} ({pnlPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Whale activity / smart signals */}
      {signals && <WhalePanel s={signals} symbol={coin?.symbol} />}

      {/* Sell plan / targets */}
      <div className="sell-plan-card">
        <div className="sell-plan-head">
          <h3>Sell Plan</h3>
          <button className="sp-add-btn" onClick={() => setShowAddTarget(s => !s)}>
            {showAddTarget ? 'Cancel' : '+ Add Target'}
          </button>
        </div>
        {showAddTarget && (
          <form className="sp-form" onSubmit={handleAddTarget}>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Target price ($)"
              value={tInputPrice}
              onChange={e => setTInputPrice(e.target.value)}
              required
            />
            <input
              type="number"
              step="any"
              min="0"
              placeholder={`Qty to sell (${coin?.symbol || ''}) — blank = all`}
              value={tInputQty}
              onChange={e => setTInputQty(e.target.value)}
            />
            <button type="submit" className="sp-save-btn">Save</button>
          </form>
        )}
        {targets.length === 0 && !showAddTarget && (
          <p className="muted sp-empty">No targets set. Add price levels to plan your exits.</p>
        )}
        {targets.length > 0 && (
          <div className="sp-list">
            {targets.map(t => {
              const pct = price > 0 && t.price > 0 ? (price / t.price) * 100 : 0
              const reached = price >= t.price
              const sellQty = t.quantity == null ? amount : Math.min(t.quantity, amount)
              const proceeds = sellQty * t.price
              return (
                <div key={t.id} className={`sp-row ${reached ? 'sp-reached' : ''}`}>
                  <div className="sp-row-top">
                    <div className="sp-price">
                      <span className="sp-label">Sell at</span>
                      <span className="sp-val">${fmt(t.price)}</span>
                    </div>
                    <div className="sp-qty">
                      <span className="sp-label">Quantity</span>
                      <span className="sp-val">
                        {t.quantity == null ? `All (${amount.toFixed(4)})` : `${t.quantity} ${coin?.symbol || ''}`}
                      </span>
                    </div>
                    <div className="sp-proceeds">
                      <span className="sp-label">Proceeds</span>
                      <span className="sp-val">${fmt(proceeds)}</span>
                    </div>
                    <button className="sp-remove" onClick={() => handleRemoveTarget(t.id)} aria-label="Remove target">×</button>
                  </div>
                  <div className="sp-progress">
                    <div className="sp-bar-bg">
                      <div className="sp-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: reached ? '#10b981' : '#6366f1' }} />
                    </div>
                    <span className={`sp-pct ${reached ? 'positive' : ''}`}>
                      {reached ? '✓ Reached' : `${pct.toFixed(1)}% of target`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Buy/Sell actions */}
      <div className="detail-actions">
        <button className="action-btn buy-btn detail-act" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'buy', prefillCoin: coinId, prefillSymbol: coin?.symbol, prefillName: coin?.name, prefillImage: coin?.image } })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Buy {coin?.symbol}
        </button>
        {holdings && (
          <button className="action-btn sell-btn detail-act" onClick={() => navigate('/transactions', { state: { openAdd: true, type: 'sell', prefillCoin: coinId, prefillSymbol: coin?.symbol, prefillName: coin?.name, prefillImage: coin?.image, holdings: amount } })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Sell {coin?.symbol}
          </button>
        )}
      </div>
    </div>
  )
}

function WhalePanel({ s, symbol }) {
  const score = s.whaleScore
  const scoreLabel =
    score >= 50 ? 'Strong Accumulation' :
    score >= 20 ? 'Mild Accumulation' :
    score >= -20 ? 'Neutral' :
    score >= -50 ? 'Mild Distribution' :
    'Strong Distribution'
  const scoreColor =
    score >= 50 ? '#10b981' :
    score >= 20 ? '#22c55e' :
    score >= -20 ? '#94a3b8' :
    score >= -50 ? '#f59e0b' :
    '#ef4444'

  const pulsePct = Math.min(100, Math.round(s.volPulse * 50))
  const pulseColor = s.volPulse > 1.5 ? '#ef4444' : s.volPulse > 1 ? '#f59e0b' : '#6366f1'

  return (
    <div className="whale-panel">
      <div className="whale-panel-head">
        <h3>🐋 Whale Activity & Smart Signals</h3>
        <span className="whale-panel-window">Last {s.windowDays}d</span>
      </div>

      <div className="whale-score-row">
        <div className="whale-score-circle" style={{ borderColor: scoreColor, color: scoreColor }}>
          <div className="whale-score-num">{score > 0 ? '+' : ''}{score}</div>
          <div className="whale-score-lbl">Whale Score</div>
        </div>
        <div className="whale-score-info">
          <div className="whale-score-tag" style={{ background: scoreColor + '22', color: scoreColor }}>
            {scoreLabel}
          </div>
          <p className="whale-score-desc">
            Composite of accumulation/distribution flow, momentum, and volume pressure.
            +100 = whales loading up, -100 = whales unloading.
          </p>
        </div>
      </div>

      <div className="whale-indicators">
        <Indicator
          label="Volume Pulse"
          value={`${s.volPulse.toFixed(2)}×`}
          help="Last-24h volume vs daily avg. >1.5× = unusual activity."
          barPct={pulsePct}
          color={pulseColor}
        />
        <Indicator
          label="Accum/Dist"
          value={(s.adNormalized * 100).toFixed(0) + '%'}
          help="Volume-weighted price direction. Positive = buying pressure."
          barPct={(s.adNormalized + 1) * 50}
          color={s.adNormalized >= 0 ? '#10b981' : '#ef4444'}
        />
        <Indicator
          label="Momentum"
          value={(s.momentum * 100).toFixed(1) + '%'}
          help="Fast vs slow MA. Positive = uptrend."
          barPct={Math.max(0, Math.min(100, 50 + s.momentum * 200))}
          color={s.momentum >= 0 ? '#10b981' : '#ef4444'}
        />
        <Indicator
          label="Range Position"
          value={(s.rangePos * 100).toFixed(0) + '%'}
          help="Where price sits in recent high-low range. 100% = at the top."
          barPct={s.rangePos * 100}
          color="#6366f1"
        />
        <Indicator
          label="Volatility"
          value={(s.volatility * 100).toFixed(0) + '%'}
          help="Annualised. <50% calm, >100% wild."
          barPct={Math.min(100, s.volatility * 50)}
          color="#a78bfa"
        />
      </div>
    </div>
  )
}

function Indicator({ label, value, help, barPct, color }) {
  return (
    <div className="wp-ind" title={help}>
      <div className="wp-ind-row">
        <span className="wp-ind-label">{label}</span>
        <span className="wp-ind-value" style={{ color }}>{value}</span>
      </div>
      <div className="wp-ind-bar-bg">
        <div className="wp-ind-bar-fill" style={{ width: `${barPct}%`, background: color }} />
      </div>
    </div>
  )
}

function DetailLogo({ coin }) {
  const [stage, setStage] = useState(0) // 0:gecko 1:coincap 2:badge
  const sym = (coin?.symbol || "").toLowerCase()
  const isCrypto = !coin?.category || coin.category === "crypto"

  if (stage === 0 && coin?.image) {
    return (
      <img
        src={coin.image}
        alt=""
        width={48}
        height={48}
        className="coin-logo"
        onError={() => setStage(isCrypto && sym ? 1 : 2)}
      />
    )
  }
  if (stage <= 1 && isCrypto && sym) {
    return (
      <img
        src={`https://assets.coincap.io/assets/icons/${sym}@2x.png`}
        alt=""
        width={48}
        height={48}
        className="coin-logo"
        onError={() => setStage(2)}
      />
    )
  }
  return (
    <div className="coin-icon" style={{ width: 48, height: 48, fontSize: "1.2rem", background: `${coin?.categoryColor || "#6366f1"}22`, color: coin?.categoryColor || "#6366f1" }}>
      {coin?.categoryIcon || coin?.symbol?.substring(0, 2) || "\u25C6"}
    </div>
  )
}
