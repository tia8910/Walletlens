import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ASSET_CATEGORIES, POPULAR_TICKERS, STOCK_PREFIX, GOLD_ID, SILVER_ID } from '../api'
import CoinLogo from '../components/CoinLogo'

function fmt(n) { return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const TABS = [
  { key: 'crypto', label: 'Crypto', icon: '◆' },
  { key: 'metals', label: 'Metals', icon: '🥇' },
  { key: 'stocks', label: 'Stocks', icon: '📈' },
]

export default function Market() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('crypto')
  const [coins, setCoins] = useState([])
  const [metals, setMetals] = useState({})
  const [stocks, setStocks] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)

  }, [tab])

  async function load() {
    // Don't block the UI on a fresh fetch — the helpers paint from
    // localStorage cache instantly and only spin when nothing exists yet.
    const haveCache =
      (tab === 'crypto' && coins.length > 0) ||
      (tab === 'metals' && Object.keys(metals).length > 0) ||
      (tab === 'stocks' && Object.keys(stocks).length > 0)
    if (!haveCache) setLoading(true)
    try {
      if (tab === 'crypto') {
        const data = await api.getMarketData()
        if (Array.isArray(data)) setCoins(data)
      } else if (tab === 'metals') {
        const res = await api.getPrices([GOLD_ID, SILVER_ID].join(','))
        setMetals(res || {})
      } else if (tab === 'stocks') {
        const ids = POPULAR_TICKERS.map(t => `${STOCK_PREFIX}${t.ticker.toLowerCase()}`).join(',')
        const res = await api.getPrices(ids)
        setStocks(res || {})
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const openAsset = (id) => navigate(`/asset/${encodeURIComponent(id)}`)

  return (
    <div className="page">
      <div className="market-hero">
        <div className="market-hero-content">
          <h2 className="market-title">
            <span className="market-title-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
              </svg>
            </span>
            Market
          </h2>
          <p className="muted">Live prices · auto-refresh every 60s</p>
        </div>
      </div>

      <div className="market-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`market-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="market-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? <div className="card"><p className="muted">Loading...</p></div> : (
        <>
          {tab === 'crypto' && coins.length === 0 && (
            <div className="card"><p className="muted">Couldn't reach the market data source. The cached values will show on the next refresh — try again in a moment.</p></div>
          )}
          {tab === 'crypto' && (
            <div className="market-list">
              {coins.map((coin, i) => (
                <div key={coin.id} className="market-card" onClick={() => openAsset(coin.id)}>
                  <div className="market-rank">{i + 1}</div>
                  <CoinLogo image={coin.image} symbol={coin.symbol} size={32} className="market-img" />
                  <div className="market-info">
                    <strong>{coin.symbol.toUpperCase()}</strong>
                    <span className="muted market-name">{coin.name}</span>
                  </div>
                  <div className="market-price">
                    <strong>${fmt(coin.current_price)}</strong>
                    <span className={coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}>
                      {coin.price_change_percentage_24h >= 0 ? '+' : ''}{coin.price_change_percentage_24h?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="market-cap muted">${(coin.market_cap / 1e9).toFixed(1)}B</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'metals' && (
            <div className="market-list">
              {[
                { id: GOLD_ID, symbol: 'XAU', name: 'Gold (1 oz)', icon: ASSET_CATEGORIES.gold.icon, color: ASSET_CATEGORIES.gold.color },
                { id: SILVER_ID, symbol: 'XAG', name: 'Silver (1 oz)', icon: ASSET_CATEGORIES.silver.icon, color: ASSET_CATEGORIES.silver.color },
              ].map((m, i) => {
                const p = metals[m.id]
                const price = p?.usd
                const ch = p?.usd_24h_change ?? 0
                return (
                  <div key={m.id} className="market-card" onClick={() => openAsset(m.id)}>
                    <div className="market-rank">{i + 1}</div>
                    <div className="market-img metal-icon" style={{ background: `${m.color}22`, color: m.color }}>{m.icon}</div>
                    <div className="market-info">
                      <strong>{m.symbol}</strong>
                      <span className="muted market-name">{m.name}</span>
                    </div>
                    <div className="market-price">
                      <strong>{price ? `$${fmt(price)}` : '—'}</strong>
                      {ch !== 0 && (
                        <span className={ch >= 0 ? 'positive' : 'negative'}>
                          {ch >= 0 ? '+' : ''}{ch.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="market-cap muted">per oz</div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'stocks' && (
            <div className="market-list">
              {POPULAR_TICKERS.map((t, i) => {
                const id = `${STOCK_PREFIX}${t.ticker.toLowerCase()}`
                const p = stocks[id]
                const price = p?.usd
                const ch = p?.usd_24h_change ?? 0
                return (
                  <div key={t.ticker} className="market-card" onClick={() => openAsset(id)}>
                    <div className="market-rank">{i + 1}</div>
                    <div className="market-img stock-icon" style={{ background: `${ASSET_CATEGORIES.stock.color}22`, color: ASSET_CATEGORIES.stock.color }}>
                      {t.ticker.substring(0, 2)}
                    </div>
                    <div className="market-info">
                      <strong>{t.ticker}</strong>
                      <span className="muted market-name">{t.name}</span>
                    </div>
                    <div className="market-price">
                      <strong>{price ? `$${fmt(price)}` : '—'}</strong>
                      <span className={ch >= 0 ? 'positive' : 'negative'}>
                        {ch >= 0 ? '+' : ''}{ch.toFixed(2)}%
                      </span>
                    </div>
                    <div className="market-cap muted">per share</div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

