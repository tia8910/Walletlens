import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'

function fmt(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function generateAnalysis(detail, type) {
  if (!detail || !detail.market_data) return null

  const md = detail.market_data
  const price = md.current_price?.usd || 0
  const ath = md.ath?.usd || 0
  const atl = md.atl?.usd || 0
  const high24 = md.high_24h?.usd || 0
  const low24 = md.low_24h?.usd || 0
  const change24 = md.price_change_percentage_24h || 0
  const change7d = md.price_change_percentage_7d || 0
  const change30d = md.price_change_percentage_30d || 0
  const athDrop = ath > 0 ? ((price - ath) / ath) * 100 : 0
  const atlRise = atl > 0 ? ((price - atl) / atl) * 100 : 0
  const marketCap = md.market_cap?.usd || 0
  const vol24 = md.total_volume?.usd || 0
  const volToMcap = marketCap > 0 ? (vol24 / marketCap) * 100 : 0

  // Sentiment scoring
  let score = 50
  // Trend momentum
  if (change24 > 5) score += 12; else if (change24 > 2) score += 6; else if (change24 < -5) score -= 12; else if (change24 < -2) score -= 6
  if (change7d > 10) score += 10; else if (change7d > 3) score += 5; else if (change7d < -10) score -= 10; else if (change7d < -3) score -= 5
  if (change30d > 20) score += 8; else if (change30d < -20) score -= 8
  // Volume activity
  if (volToMcap > 15) score += 5; else if (volToMcap < 2) score -= 3
  // ATH proximity
  if (athDrop > -10) score += 5
  if (athDrop < -70) score -= 5

  score = Math.max(0, Math.min(100, score))

  let sentiment, sentimentColor, sentimentEmoji
  if (score >= 75) { sentiment = 'Strong Bullish'; sentimentColor = '#10b981'; sentimentEmoji = '🚀' }
  else if (score >= 60) { sentiment = 'Bullish'; sentimentColor = '#34d399'; sentimentEmoji = '📈' }
  else if (score >= 45) { sentiment = 'Neutral'; sentimentColor = '#f59e0b'; sentimentEmoji = '⚖️' }
  else if (score >= 30) { sentiment = 'Bearish'; sentimentColor = '#f97316'; sentimentEmoji = '📉' }
  else { sentiment = 'Strong Bearish'; sentimentColor = '#ef4444'; sentimentEmoji = '🔻' }

  // Generate insights
  const insights = []
  if (type === 'buy') {
    if (change24 < -5) insights.push({ icon: '💡', text: `Dip opportunity — down ${Math.abs(change24).toFixed(1)}% today` })
    if (athDrop < -50) insights.push({ icon: '📊', text: `${Math.abs(athDrop).toFixed(0)}% below ATH ($${fmt(ath)}) — potential recovery play` })
    if (change7d > 10 && change24 > 0) insights.push({ icon: '⚠️', text: 'Strong rally this week — consider DCA instead of lump sum' })
    if (volToMcap > 10) insights.push({ icon: '🔥', text: 'High volume activity — strong market interest' })
    if (change30d < -30) insights.push({ icon: '🎯', text: 'Significant monthly drop — could be accumulation zone' })
  } else {
    if (change24 > 5) insights.push({ icon: '💰', text: `Up ${change24.toFixed(1)}% today — good exit momentum` })
    if (athDrop > -5) insights.push({ icon: '🏔️', text: 'Near all-time high — consider taking profits' })
    if (change7d > 15) insights.push({ icon: '📈', text: `+${change7d.toFixed(1)}% this week — extended rally` })
    if (change30d > 50) insights.push({ icon: '🎉', text: `+${change30d.toFixed(0)}% this month — strong gains to lock in` })
  }
  if (insights.length === 0) {
    insights.push({ icon: '📌', text: 'Market conditions are relatively stable' })
  }

  // Range position (where price is between 24h low and high)
  const range24 = high24 - low24
  const rangePos = range24 > 0 ? ((price - low24) / range24) * 100 : 50

  return {
    price, ath, atl, high24, low24, change24, change7d, change30d,
    athDrop, score, sentiment, sentimentColor, sentimentEmoji,
    insights: insights.slice(0, 3), rangePos, marketCap, vol24, volToMcap,
    name: detail.name, symbol: detail.symbol, image: detail.image?.large || detail.image?.small,
  }
}

export default function Transactions({ showAdd, onCloseAdd }) {
  const location = useLocation()
  const [transactions, setTransactions] = useState([])
  const [wallets, setWallets] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [filterWallet, setFilterWallet] = useState('')
  const [coinSearch, setCoinSearch] = useState('')
  const [coinResults, setCoinResults] = useState([])
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [coinAnalysis, setCoinAnalysis] = useState(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [form, setForm] = useState({
    wallet_id: '', type: 'buy', coin_id: '', coin_symbol: '', amount: '', price_per_unit: '', exchange: '', notes: '', date: new Date().toISOString().split('T')[0],
  })
  const searchTimeout = useRef(null)

  useEffect(() => { loadData() }, [filterWallet])

  useEffect(() => {
    if (location.state?.openAdd) {
      setShowForm(true)
      if (location.state?.type) setForm(f => ({ ...f, type: location.state.type }))
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadData() {
    const [t, w] = await Promise.all([
      api.getTransactions(filterWallet || undefined),
      api.getWallets(),
    ])
    setTransactions(t)
    setWallets(w)
    if (w.length > 0 && !form.wallet_id) setForm(f => ({ ...f, wallet_id: w[0].id }))
  }

  function handleCoinSearch(value) {
    setCoinSearch(value)
    clearTimeout(searchTimeout.current)
    if (value.length < 2) { setCoinResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      const results = await api.searchCoins(value)
      setCoinResults(results)
    }, 300)
  }

  async function selectCoin(coin) {
    setForm(f => ({ ...f, coin_id: coin.id, coin_symbol: coin.symbol, coin_image: coin.large || coin.thumb || '' }))
    setCoinSearch(`${coin.name} (${coin.symbol.toUpperCase()})`)
    setCoinResults([])
    setCoinAnalysis(null)

    // Auto-fetch market price and analysis
    setFetchingPrice(true)
    setLoadingAnalysis(true)
    try {
      const [priceData, detail] = await Promise.all([
        api.getPrices(coin.id),
        api.getCoinDetail(coin.id),
      ])
      const livePrice = priceData[coin.id]?.usd
      if (livePrice) {
        setForm(f => ({ ...f, price_per_unit: String(livePrice) }))
      }
      if (detail) {
        setCoinAnalysis(generateAnalysis(detail, form.type))
      }
    } catch (err) { console.error(err) }
    setFetchingPrice(false)
    setLoadingAnalysis(false)
  }

  async function fetchMarketPrice() {
    if (!form.coin_id) return
    setFetchingPrice(true)
    try {
      const data = await api.getPrices(form.coin_id)
      const price = data[form.coin_id]?.usd
      if (price) setForm(f => ({ ...f, price_per_unit: String(price) }))
    } catch (err) { console.error(err) }
    setFetchingPrice(false)
  }

  // Re-analyze when buy/sell toggle changes
  function handleTypeChange(type) {
    setForm(f => ({ ...f, type }))
    if (coinAnalysis) {
      setCoinAnalysis(prev => prev ? { ...prev, ...(() => {
        // Quick re-score insights for the new type
        // We'll refetch for accuracy
        return {}
      })() } : null)
      if (form.coin_id) {
        setLoadingAnalysis(true)
        api.getCoinDetail(form.coin_id).then(detail => {
          if (detail) setCoinAnalysis(generateAnalysis(detail, type))
          setLoadingAnalysis(false)
        })
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.coin_id || !form.amount || !form.price_per_unit) return
    await api.addTransaction({
      ...form,
      amount: parseFloat(form.amount),
      price_per_unit: parseFloat(form.price_per_unit),
    })
    setForm({ wallet_id: form.wallet_id, type: 'buy', coin_id: '', coin_symbol: '', coin_image: '', amount: '', price_per_unit: '', exchange: '', notes: '', date: new Date().toISOString().split('T')[0] })
    setCoinSearch('')
    setCoinAnalysis(null)
    setShowForm(false)
    loadData()
  }

  async function handleDelete(id) {
    await api.deleteTransaction(id)
    loadData()
  }

  const totalCalc = form.amount && form.price_per_unit
    ? (parseFloat(form.amount) * parseFloat(form.price_per_unit))
    : 0

  return (
    <div className="page">
      <div className="page-header">
        <h2>Transactions</h2>
        <button className="fab" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'X' : '+'}
        </button>
      </div>

      {/* Add transaction modal/sheet */}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setCoinAnalysis(null) }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Add Transaction</h3>

            {/* Buy/Sell toggle */}
            <div className="type-toggle">
              <button className={`toggle-btn ${form.type === 'buy' ? 'active buy' : ''}`} onClick={() => handleTypeChange('buy')}>Buy</button>
              <button className={`toggle-btn ${form.type === 'sell' ? 'active sell' : ''}`} onClick={() => handleTypeChange('sell')}>Sell</button>
            </div>

            <form onSubmit={handleSubmit}>
              {wallets.length > 1 && (
                <div className="form-field">
                  <label>Wallet</label>
                  <select value={form.wallet_id} onChange={e => setForm(f => ({ ...f, wallet_id: e.target.value }))}>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-field" style={{ position: 'relative' }}>
                <label>Coin</label>
                <input type="text" value={coinSearch} onChange={e => handleCoinSearch(e.target.value)} placeholder="Search Bitcoin, Ethereum..." autoFocus />
                {coinResults.length > 0 && (
                  <div className="dropdown">
                    {coinResults.map(c => (
                      <div key={c.id} className="dropdown-item" onClick={() => selectCoin(c)}>
                        {c.thumb && <img src={c.thumb} alt="" width={24} height={24} style={{ borderRadius: '50%' }} />}
                        <span>{c.name}</span>
                        <small>{c.symbol.toUpperCase()}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Analysis Panel */}
              {loadingAnalysis && form.coin_id && (
                <div className="ai-panel">
                  <div className="ai-header">
                    <span className="ai-badge">AI</span>
                    <span>Analyzing market data...</span>
                  </div>
                  <div className="ai-loading">
                    <div className="ai-pulse" />
                  </div>
                </div>
              )}
              {coinAnalysis && !loadingAnalysis && (
                <div className="ai-panel">
                  <div className="ai-header">
                    <span className="ai-badge">AI</span>
                    <span className="ai-title">Market Analysis</span>
                    <span className="ai-sentiment" style={{ color: coinAnalysis.sentimentColor }}>
                      {coinAnalysis.sentimentEmoji} {coinAnalysis.sentiment}
                    </span>
                  </div>

                  {/* Sentiment meter */}
                  <div className="ai-meter">
                    <div className="ai-meter-labels">
                      <span>Bearish</span>
                      <span>Score: {coinAnalysis.score}</span>
                      <span>Bullish</span>
                    </div>
                    <div className="ai-meter-track">
                      <div className="ai-meter-fill" style={{
                        width: `${coinAnalysis.score}%`,
                        background: coinAnalysis.score >= 60 ? 'linear-gradient(90deg, #f59e0b, #10b981)' :
                          coinAnalysis.score >= 40 ? 'linear-gradient(90deg, #f97316, #f59e0b)' :
                          'linear-gradient(90deg, #ef4444, #f97316)'
                      }} />
                    </div>
                  </div>

                  {/* 24h price range */}
                  <div className="ai-range">
                    <span className="ai-range-label">24h Range</span>
                    <div className="ai-range-bar">
                      <div className="ai-range-marker" style={{ left: `${coinAnalysis.rangePos}%` }} />
                    </div>
                    <div className="ai-range-values">
                      <span>${fmt(coinAnalysis.low24)}</span>
                      <span>${fmt(coinAnalysis.high24)}</span>
                    </div>
                  </div>

                  {/* Key stats */}
                  <div className="ai-stats">
                    <div className="ai-stat">
                      <span className="ai-stat-label">24h</span>
                      <span className={coinAnalysis.change24 >= 0 ? 'positive' : 'negative'}>
                        {coinAnalysis.change24 >= 0 ? '+' : ''}{coinAnalysis.change24.toFixed(2)}%
                      </span>
                    </div>
                    <div className="ai-stat">
                      <span className="ai-stat-label">7d</span>
                      <span className={coinAnalysis.change7d >= 0 ? 'positive' : 'negative'}>
                        {coinAnalysis.change7d >= 0 ? '+' : ''}{coinAnalysis.change7d.toFixed(2)}%
                      </span>
                    </div>
                    <div className="ai-stat">
                      <span className="ai-stat-label">30d</span>
                      <span className={coinAnalysis.change30d >= 0 ? 'positive' : 'negative'}>
                        {coinAnalysis.change30d >= 0 ? '+' : ''}{coinAnalysis.change30d.toFixed(2)}%
                      </span>
                    </div>
                    <div className="ai-stat">
                      <span className="ai-stat-label">ATH</span>
                      <span className="negative">{coinAnalysis.athDrop.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Insights */}
                  <div className="ai-insights">
                    {coinAnalysis.insights.map((ins, i) => (
                      <div key={i} className="ai-insight">
                        <span className="ai-insight-icon">{ins.icon}</span>
                        <span>{ins.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-row-2">
                <div className="form-field">
                  <label>Amount</label>
                  <input type="number" step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
                </div>
                <div className="form-field">
                  <label>Price per unit ($)</label>
                  <div className="price-input-wrap">
                    <input type="number" step="any" value={form.price_per_unit} onChange={e => setForm(f => ({ ...f, price_per_unit: e.target.value }))} placeholder="0.00" required />
                    {form.coin_id && (
                      <button
                        type="button"
                        className="market-price-btn"
                        onClick={fetchMarketPrice}
                        disabled={fetchingPrice}
                        title="Use current market price"
                      >
                        {fetchingPrice ? (
                          <span className="price-spinner" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                          </svg>
                        )}
                        <span>Live</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {totalCalc > 0 && (
                <div className="total-preview">
                  <span>Total</span>
                  <span className="total-amount">${totalCalc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="form-row-2">
                <div className="form-field">
                  <label>Exchange</label>
                  <select value={form.exchange} onChange={e => setForm(f => ({ ...f, exchange: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Binance">Binance</option>
                    <option value="Coinbase">Coinbase</option>
                    <option value="Kraken">Kraken</option>
                    <option value="KuCoin">KuCoin</option>
                    <option value="Bybit">Bybit</option>
                    <option value="OKX">OKX</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <div className="form-field">
                <label>Notes (optional)</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="DCA, dip buy, etc." />
              </div>

              <button type="submit" className={`submit-btn ${form.type}`}>
                {form.type === 'buy' ? 'Record Buy' : 'Record Sell'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Filter */}
      {wallets.length > 1 && (
        <div className="filter-pills">
          <button className={`pill ${!filterWallet ? 'active' : ''}`} onClick={() => setFilterWallet('')}>All</button>
          {wallets.map(w => (
            <button key={w.id} className={`pill ${filterWallet === String(w.id) ? 'active' : ''}`} onClick={() => setFilterWallet(String(w.id))}>{w.name}</button>
          ))}
        </div>
      )}

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#9670;</div>
          <p>No transactions yet</p>
          <p className="muted">Tap + to add your first trade</p>
        </div>
      ) : (
        <div className="tx-list">
          {transactions.map(t => (
            <div key={t.id} className="tx-card">
              <div className="tx-left">
                {t.coin_image ? (
                  <img src={t.coin_image} alt="" width={36} height={36} className="tx-coin-img" />
                ) : (
                  <div className={`tx-type-icon ${t.type}`}>
                    {t.type === 'buy' ? '+' : '-'}
                  </div>
                )}
                <div className="tx-info">
                  <div className="tx-title">
                    <strong>{t.coin_symbol.toUpperCase()}</strong>
                    <span className={`tx-badge ${t.type}`}>{t.type.toUpperCase()}</span>
                  </div>
                  <div className="tx-meta">
                    {t.date} {t.exchange && `\u00B7 ${t.exchange}`}
                  </div>
                </div>
              </div>
              <div className="tx-right">
                <div className="tx-amount">{t.amount} {t.coin_symbol.toUpperCase()}</div>
                <div className="tx-cost muted">
                  ${parseFloat(t.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  <span> @ ${parseFloat(t.price_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <button className="tx-delete" onClick={() => handleDelete(t.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
