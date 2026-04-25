import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { api, ASSET_CATEGORIES, PRESET_ASSETS, POPULAR_TICKERS, POPULAR_FIAT, STOCK_PREFIX, FIAT_PREFIX, GOLD_ID, SILVER_ID } from '../api'

// ─── Receive-leg resolver for sell proceeds ───
// Given the USD proceeds of a sell and a target asset (BTC/USDT/USDC/USD/EUR/custom),
// returns a leg payload {coin_id, symbol, name, category, amount, pricePerUnit}
// that can be recorded as an automatic buy so balances stay consistent.
async function buildReceiveLeg(target, proceedsUsd) {
  const T = (target || '').toUpperCase()
  if (!T) return null
  // Stablecoins & USD → 1:1 with USD
  if (T === 'USD') {
    return { coin_id: `${FIAT_PREFIX}usd`, symbol: 'USD', name: 'US Dollar', category: 'fiat', amount: proceedsUsd, pricePerUnit: 1 }
  }
  if (T === 'USDT') {
    return { coin_id: 'tether', symbol: 'USDT', name: 'Tether', category: 'crypto', amount: proceedsUsd, pricePerUnit: 1 }
  }
  if (T === 'USDC') {
    return { coin_id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', category: 'crypto', amount: proceedsUsd, pricePerUnit: 1 }
  }
  if (T === 'BTC') {
    const prices = await api.getPrices('bitcoin')
    const btcUsd = prices?.bitcoin?.usd || 0
    if (!btcUsd) return null
    return { coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'crypto', amount: proceedsUsd / btcUsd, pricePerUnit: btcUsd }
  }
  if (T === 'EUR') {
    // EUR is a fiat — price_per_unit is USD per 1 EUR
    // Use a generic FX lookup via EUR/USD pair (api.getPrices handles fiat prefix)
    let eurUsd = null
    try {
      const r = await api.getPrices(`${FIAT_PREFIX}eur`)
      eurUsd = r?.[`${FIAT_PREFIX}eur`]?.usd || null
    } catch {}
    if (!eurUsd) eurUsd = 1.08 // sensible fallback
    return { coin_id: `${FIAT_PREFIX}eur`, symbol: 'EUR', name: 'Euro', category: 'fiat', amount: proceedsUsd / eurUsd, pricePerUnit: eurUsd }
  }
  // Custom ticker — best-effort crypto lookup, else record as "other"
  const lower = T.toLowerCase()
  try {
    const search = await api.searchCoins?.(lower)
    const hit = Array.isArray(search) ? search.find(c => (c.symbol || '').toLowerCase() === lower) : null
    if (hit) {
      const prices = await api.getPrices(hit.id)
      const usd = prices?.[hit.id]?.usd || 0
      if (usd > 0) {
        return { coin_id: hit.id, symbol: T, name: hit.name || T, category: 'crypto', amount: proceedsUsd / usd, pricePerUnit: usd }
      }
    }
  } catch {}
  // Fallback: record as generic asset at $1 with the user's symbol
  return { coin_id: `other:${lower}`, symbol: T, name: T, category: 'other', amount: proceedsUsd, pricePerUnit: 1 }
}

const CATEGORY_ORDER = ['crypto', 'fiat', 'gold', 'silver', 'stock', 'bond', 'other']

const CATEGORY_UNITS = {
  gold: 'oz', silver: 'oz', stock: 'shares', bond: 'units', fiat: 'units', other: 'units', crypto: '',
}

function slugifyAsset(category, symbol, name) {
  const base = (symbol || name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const prefix = category === 'bond' ? 'bond:' : category === 'other' ? 'other:' : category === 'fiat' ? 'fiat:' : `${category}:`
  return `${prefix}${base || Date.now()}`
}

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
  const [sellHoldings, setSellHoldings] = useState(null)
  const [form, setForm] = useState({
    wallet_id: '', type: 'buy', category: 'crypto',
    coin_id: '', coin_symbol: '', coin_name: '', coin_image: '',
    amount: '', price_per_unit: '', exchange: '', notes: '', date: new Date().toISOString().split('T')[0],
    // Sell-for receive leg: which asset the proceeds are credited in
    sell_for: 'USD',       // BTC | USDT | USDC | USD | EUR | CUSTOM
    sell_for_custom: '',   // ticker when sell_for === 'CUSTOM'
  })
  const [manualAsset, setManualAsset] = useState({ symbol: '', name: '' })
  const searchTimeout = useRef(null)

  useEffect(() => { loadData() }, [filterWallet])

  useEffect(() => {
    if (location.state?.openAdd) {
      setShowForm(true)
      if (location.state?.type) setForm(f => ({ ...f, type: location.state.type }))
      if (location.state?.prefillCoin) {
        const { prefillCoin, prefillSymbol, prefillName, prefillImage } = location.state
        setForm(f => ({ ...f, coin_id: prefillCoin, coin_symbol: prefillSymbol || '', coin_image: prefillImage || '' }))
        setCoinSearch(`${prefillName || prefillSymbol || prefillCoin} (${(prefillSymbol || '').toUpperCase()})`)
        Promise.all([
          api.getPrices(prefillCoin),
          api.getCoinDetail(prefillCoin),
          api.getHoldingsForCoin(prefillCoin),
        ]).then(([priceData, detail, holdings]) => {
          const price = priceData[prefillCoin]?.usd
          if (price) setForm(f => ({ ...f, price_per_unit: String(price) }))
          if (detail) setCoinAnalysis(generateAnalysis(detail, location.state?.type || 'buy'))
          if (holdings) setSellHoldings(holdings)
        })
      }
      if (location.state?.holdings) {
        setSellHoldings({ amount: location.state.holdings, coin_symbol: location.state.prefillSymbol || '' })
      }
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadData() {
    // Ensure at least one wallet exists
    await api.ensureWallet()
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
    setSellHoldings(null)

    setFetchingPrice(true)
    setLoadingAnalysis(true)
    try {
      const [priceData, detail, holdings] = await Promise.all([
        api.getPrices(coin.id),
        api.getCoinDetail(coin.id),
        api.getHoldingsForCoin(coin.id),
      ])
      const livePrice = priceData[coin.id]?.usd
      if (livePrice) {
        setForm(f => ({ ...f, price_per_unit: String(livePrice) }))
      }
      if (detail) {
        setCoinAnalysis(generateAnalysis(detail, form.type))
      }
      if (holdings) {
        setSellHoldings(holdings)
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

  function handleCategoryChange(category) {
    setCoinSearch('')
    setCoinResults([])
    setCoinAnalysis(null)
    setSellHoldings(null)

    // Gold / Silver — use global preset IDs and auto-fetch live spot price
    if (category === 'gold' || category === 'silver') {
      const preset = PRESET_ASSETS[category]
      setManualAsset({ symbol: preset.symbol, name: preset.name })
      setForm(f => ({
        ...f,
        category,
        coin_id: preset.coin_id,
        coin_symbol: preset.symbol,
        coin_name: preset.name,
        coin_image: '',
      }))
      setFetchingPrice(true)
      api.getPrices(preset.coin_id).then(data => {
        const p = data[preset.coin_id]?.usd
        if (p) setForm(f => ({ ...f, price_per_unit: String(p.toFixed(2)) }))
      }).finally(() => setFetchingPrice(false))
      return
    }

    // Stocks / Bonds / Other — manual input (ticker + name)
    setManualAsset({ symbol: '', name: '' })
    setForm(f => ({
      ...f,
      category,
      coin_id: '',
      coin_symbol: '',
      coin_name: '',
      coin_image: '',
    }))
  }

  async function handleManualAssetChange(field, value) {
    const next = { ...manualAsset, [field]: value }
    setManualAsset(next)
    setForm(f => ({
      ...f,
      coin_symbol: next.symbol,
      coin_name: next.name,
      coin_id: slugifyAsset(f.category, next.symbol, next.name),
    }))
  }

  // Fetch live stock quote via Stooq for the current ticker
  async function fetchStockLivePrice() {
    if (form.category !== 'stock' || !manualAsset.symbol) return
    const coinId = `${STOCK_PREFIX}${manualAsset.symbol.toLowerCase()}`
    setFetchingPrice(true)
    try {
      const data = await api.getPrices(coinId)
      const quote = data[coinId]
      if (quote?.usd) {
        setForm(f => ({
          ...f,
          coin_id: coinId,
          price_per_unit: String(quote.usd.toFixed(2)),
          coin_name: manualAsset.name || quote.name || manualAsset.symbol,
        }))
      }
    } catch (err) { console.error(err) }
    setFetchingPrice(false)
  }

  function selectPopularTicker(t) {
    setManualAsset({ symbol: t.ticker, name: t.name })
    const coinId = `${STOCK_PREFIX}${t.ticker.toLowerCase()}`
    setForm(f => ({
      ...f,
      coin_id: coinId,
      coin_symbol: t.ticker,
      coin_name: t.name,
    }))
    setFetchingPrice(true)
    api.getPrices(coinId).then(data => {
      const p = data[coinId]?.usd
      if (p) setForm(f => ({ ...f, price_per_unit: String(p.toFixed(2)) }))
    }).finally(() => setFetchingPrice(false))
  }

  function selectPopularFiat(f) {
    setManualAsset({ symbol: f.code, name: f.name })
    const coinId = `${FIAT_PREFIX}${f.code.toLowerCase()}`
    setForm(prev => ({
      ...prev,
      coin_id: coinId,
      coin_symbol: f.code,
      coin_name: f.name,
    }))
    setFetchingPrice(true)
    api.getPrices(coinId).then(data => {
      const p = data[coinId]?.usd
      if (p) setForm(prev => ({ ...prev, price_per_unit: String(p.toFixed(6)) }))
    }).finally(() => setFetchingPrice(false))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.coin_id || !form.amount || !form.price_per_unit || !form.wallet_id) return
    if (form.category !== 'crypto' && !form.coin_symbol && !form.coin_name) return

    const amount = parseFloat(form.amount)
    const pricePerUnit = parseFloat(form.price_per_unit)

    // Record the primary transaction (sell/buy)
    await api.addTransaction({
      ...form,
      amount,
      price_per_unit: pricePerUnit,
    })

    // Sell leg: if user chose a target asset (BTC/USDT/USDC/USD/EUR/custom),
    // auto-credit their holdings with the proceeds converted into that asset.
    // "REMOVE" means don't credit anything — purely deduct from holdings
    // (covers transfers out, gifts, burns, untracked spends, etc.).
    if (form.type === 'sell' && form.sell_for !== 'REMOVE') {
      const proceedsUsd = amount * pricePerUnit
      const target = form.sell_for === 'CUSTOM'
        ? form.sell_for_custom.trim().toUpperCase()
        : form.sell_for
      if (target && proceedsUsd > 0) {
        const legBase = await buildReceiveLeg(target, proceedsUsd)
        if (legBase) {
          await api.addTransaction({
            wallet_id: form.wallet_id,
            type: 'buy',
            category: legBase.category,
            coin_id: legBase.coin_id,
            coin_symbol: legBase.symbol,
            coin_name: legBase.name,
            coin_image: '',
            amount: legBase.amount,
            price_per_unit: legBase.pricePerUnit,
            exchange: form.exchange,
            notes: `Proceeds from selling ${form.coin_symbol?.toUpperCase?.() || form.coin_id}`,
            date: form.date,
          })
        }
      }
    }

    setForm({ wallet_id: form.wallet_id, type: 'buy', category: 'crypto', coin_id: '', coin_symbol: '', coin_name: '', coin_image: '', amount: '', price_per_unit: '', exchange: '', notes: '', date: new Date().toISOString().split('T')[0], sell_for: 'USD', sell_for_custom: '' })
    setCoinSearch('')
    setCoinAnalysis(null)
    setSellHoldings(null)
    setManualAsset({ symbol: '', name: '' })
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

            {/* Asset category selector */}
            <div className="category-tabs">
              {CATEGORY_ORDER.map(key => {
                const c = ASSET_CATEGORIES[key]
                const active = form.category === key
                return (
                  <button
                    key={key}
                    type="button"
                    className={`category-tab ${active ? 'active' : ''}`}
                    style={active ? { borderColor: c.color, color: c.color, background: `${c.color}15` } : undefined}
                    onClick={() => handleCategoryChange(key)}
                  >
                    <span className="category-tab-icon">{c.icon}</span>
                    <span>{c.label}</span>
                  </button>
                )
              })}
            </div>

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

              {form.category === 'crypto' ? (
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
              ) : (
                <>
                  {form.category === 'stock' && (
                    <div className="ticker-chips">
                      <div className="ticker-chips-label">Popular</div>
                      <div className="ticker-chips-row">
                        {POPULAR_TICKERS.map(t => (
                          <button
                            key={t.ticker}
                            type="button"
                            className={`ticker-chip ${manualAsset.symbol === t.ticker ? 'active' : ''}`}
                            onClick={() => selectPopularTicker(t)}
                            title={t.name}
                          >
                            {t.ticker}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {form.category === 'fiat' && (
                    <div className="ticker-chips">
                      <div className="ticker-chips-label">Currency</div>
                      <div className="ticker-chips-row">
                        {POPULAR_FIAT.map(f => (
                          <button
                            key={f.code}
                            type="button"
                            className={`ticker-chip ${manualAsset.symbol === f.code ? 'active' : ''}`}
                            onClick={() => selectPopularFiat(f)}
                            title={f.name}
                          >
                            {f.symbol} {f.code}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="form-row-2">
                    <div className="form-field">
                      <label>
                        {form.category === 'stock' ? 'Ticker' : form.category === 'bond' ? 'Bond Code' : form.category === 'fiat' ? 'Currency' : 'Symbol'}
                      </label>
                      <div className="price-input-wrap">
                        <input
                          type="text"
                          value={manualAsset.symbol}
                          onChange={e => handleManualAssetChange('symbol', e.target.value.toUpperCase())}
                          placeholder={form.category === 'stock' ? 'AAPL' : form.category === 'gold' ? 'XAU' : form.category === 'silver' ? 'XAG' : form.category === 'fiat' ? 'EUR' : 'SYMB'}
                          autoFocus
                        />
                        {form.category === 'stock' && manualAsset.symbol && (
                          <button
                            type="button"
                            className="market-price-btn"
                            onClick={fetchStockLivePrice}
                            disabled={fetchingPrice}
                            title="Fetch live price from Stooq"
                          >
                            {fetchingPrice ? <span className="price-spinner" /> : <span>Live</span>}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="form-field">
                      <label>
                        {form.category === 'stock' ? 'Company Name' : form.category === 'bond' ? 'Bond Name' : form.category === 'fiat' ? 'Currency Name' : 'Asset Name'}
                      </label>
                      <input
                        type="text"
                        value={manualAsset.name}
                        onChange={e => handleManualAssetChange('name', e.target.value)}
                        placeholder={form.category === 'stock' ? 'Apple Inc.' : form.category === 'bond' ? 'US 10Y Treasury' : form.category === 'gold' ? 'Gold (1 oz)' : form.category === 'fiat' ? 'Euro' : 'Asset name'}
                      />
                    </div>
                  </div>
                  {(form.category === 'gold' || form.category === 'silver') && (
                    <div className="live-price-badge">
                      {fetchingPrice ? (
                        <><span className="price-spinner" /> Fetching live spot price…</>
                      ) : form.price_per_unit ? (
                        <><span className="live-dot" /> Live spot price from gold-api.com — ${fmt(parseFloat(form.price_per_unit))} / oz</>
                      ) : (
                        <>Waiting for live price…</>
                      )}
                    </div>
                  )}
                  {form.category === 'stock' && form.price_per_unit && form.coin_id && (
                    <div className="live-price-badge">
                      <span className="live-dot" /> Live from Stooq — {manualAsset.symbol} @ ${fmt(parseFloat(form.price_per_unit))}
                    </div>
                  )}
                  {form.category === 'fiat' && form.price_per_unit && form.coin_id && (
                    <div className="live-price-badge">
                      <span className="live-dot" /> Live FX — 1 {manualAsset.symbol} ≈ ${parseFloat(form.price_per_unit).toFixed(4)}
                    </div>
                  )}
                </>
              )}

              {/* AI Analysis Panel — crypto only */}
              {form.category === 'crypto' && loadingAnalysis && form.coin_id && (
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
              {form.category === 'crypto' && coinAnalysis && !loadingAnalysis && (
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

              {form.type === 'sell' && form.coin_id && sellHoldings && (
                <div className="sell-picker">
                  <div className="sell-balance-row">
                    <span className="sell-balance-label">Available Balance</span>
                    <span className="sell-balance-value">{sellHoldings.amount.toFixed(6)} {(form.coin_symbol || '').toUpperCase()}</span>
                  </div>
                  <div className="sell-pct-btns">
                    {[25, 50, 75, 100].map(pct => (
                      <button key={pct} type="button" className="sell-pct-btn" onClick={() => {
                        const amt = sellHoldings.amount * pct / 100
                        setForm(f => ({ ...f, amount: String(amt) }))
                      }}>
                        {pct}%
                      </button>
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
                    {form.coin_id && form.category === 'crypto' && (
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

              {form.type === 'sell' && (
                <div className="form-field">
                  <label>Sell for (proceeds credited to this asset)</label>
                  <div className="sell-for-row">
                    <select
                      value={form.sell_for}
                      onChange={e => setForm(f => ({ ...f, sell_for: e.target.value }))}
                    >
                      <option value="USD">USD</option>
                      <option value="USDT">USDT</option>
                      <option value="USDC">USDC</option>
                      <option value="BTC">BTC</option>
                      <option value="EUR">EUR</option>
                      <option value="CUSTOM">Other…</option>
                      <option value="REMOVE">Remove (don't credit anywhere)</option>
                    </select>
                    {form.sell_for === 'CUSTOM' && (
                      <input
                        type="text"
                        value={form.sell_for_custom}
                        onChange={e => setForm(f => ({ ...f, sell_for_custom: e.target.value }))}
                        placeholder="Ticker (e.g. SOL, DAI)"
                      />
                    )}
                  </div>
                  <p className="form-hint">
                    {form.sell_for === 'REMOVE'
                      ? <>The amount will be deducted from your <strong>{form.coin_symbol?.toUpperCase?.() || 'asset'}</strong> holdings only — no other balance is credited.</>
                      : <>Total proceeds{totalCalc ? ` $${totalCalc.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''} will be credited to your{' '}
                        <strong>{form.sell_for === 'CUSTOM' ? (form.sell_for_custom.trim().toUpperCase() || '…') : form.sell_for}</strong> balance automatically.</>}
                  </p>
                </div>
              )}

              <button type="submit" className={`submit-btn ${form.type === 'sell' ? 'sell' : 'buy'}`}>
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
          {transactions.map(t => {
            const sym = (t.coin_symbol || t.coin_id || '??').toUpperCase()
            const txType = t.type || 'buy'
            const isPositive = txType === 'buy'
            const badgeClass = isPositive ? 'buy' : 'sell'
            return (
              <div key={t.id} className="tx-card">
                <div className="tx-left">
                  {t.coin_image ? (
                    <img src={t.coin_image} alt="" width={36} height={36} className="tx-coin-img" />
                  ) : (
                    <div className={`tx-type-icon ${badgeClass}`}>
                      {isPositive ? '+' : '-'}
                    </div>
                  )}
                  <div className="tx-info">
                    <div className="tx-title">
                      <strong>{sym}</strong>
                      <span className={`tx-badge ${badgeClass}`}>{txType.toUpperCase()}</span>
                    </div>
                    <div className="tx-meta">
                      {t.date || ''} {t.exchange && `\u00B7 ${t.exchange}`}
                    </div>
                  </div>
                </div>
                <div className="tx-right">
                  <div className="tx-amount">{t.amount || 0} {sym}</div>
                  <div className="tx-cost muted">
                    ${parseFloat(t.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    <span> @ ${parseFloat(t.price_per_unit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <button className="tx-delete" onClick={() => handleDelete(t.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
