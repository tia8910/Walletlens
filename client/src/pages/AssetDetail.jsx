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
  const [target, setTarget] = useState(null)

  useEffect(() => { loadData() }, [coinId])
  useEffect(() => { loadChart() }, [coinId, chartDays])

  async function loadData() {
    setLoading(true)
    try {
      const nonCrypto = isNonCryptoId(coinId)
      const tasks = [
        api.getPortfolio(),
        api.getPrices(coinId),
        nonCrypto ? Promise.resolve({}) : api.getCoinImages(coinId),
        nonCrypto ? Promise.resolve(null) : api.getCoinDetail(coinId),
        api.getCoinTargets(),
      ]
      const [portfolio, prices, images, detail, targets] = await Promise.all(tasks)
      const h = portfolio.find(p => p.coin_id === coinId)
      setHoldings(h || null)
      setTarget(targets[coinId] || null)

      const price = prices[coinId]?.usd || 0
      const change24 = prices[coinId]?.usd_24h_change || 0
      const image = (!nonCrypto ? images[coinId] : null) || h?.coin_image || ''
      const md = detail?.market_data
      const cat = categoryFor(coinId)
      const catMeta = ASSET_CATEGORIES[cat]
      const fallbackName = prices[coinId]?.name || h?.coin_name || (h?.coin_symbol || coinId).toUpperCase()
      setCoin({
        id: coinId,
        name: detail?.name || fallbackName,
        symbol: (detail?.symbol || h?.coin_symbol || coinId.replace(STOCK_PREFIX, '').replace('metal:', '')).toUpperCase(),
        price, change24, image,
        category: cat,
        categoryLabel: catMeta?.label,
        categoryIcon: catMeta?.icon,
        categoryColor: catMeta?.color,
        ath: md?.ath?.usd, atl: md?.atl?.usd,
        high24: md?.high_24h?.usd, low24: md?.low_24h?.usd,
        marketCap: md?.market_cap?.usd,
        volume: md?.total_volume?.usd,
        change7d: md?.price_change_percentage_7d,
        change30d: md?.price_change_percentage_30d,
      })
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function loadChart() {
    try {
      const data = await api.getChartData(coinId, chartDays)
      setChartData(data)
    } catch (e) { console.error(e) }
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
          {coin?.image ? (
            <img src={coin.image} alt="" width={48} height={48} className="coin-logo" />
          ) : (
            <div className="coin-icon" style={{ width: 48, height: 48, fontSize: '1.2rem', background: `${coin?.categoryColor || '#6366f1'}22`, color: coin?.categoryColor || '#6366f1' }}>
              {coin?.categoryIcon || coin?.symbol?.substring(0, 2) || '◆'}
            </div>
          )}
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
          {target && (
            <div className="dh-target">
              <span className="dh-label">Target Price</span>
              <span className="dh-value">${fmt(target.amount)} ({price > 0 ? ((price / target.amount) * 100).toFixed(1) : 0}%)</span>
            </div>
          )}
        </div>
      )}

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
