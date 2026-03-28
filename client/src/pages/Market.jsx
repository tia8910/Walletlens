import { useState, useEffect } from 'react'
import { api } from '../api'

function fmt(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function Market() {
  const [coins, setCoins] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMarket()
    const interval = setInterval(loadMarket, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function loadMarket() {
    try {
      const data = await api.getMarketData()
      if (Array.isArray(data)) setCoins(data)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  return (
    <div className="page">
      <h2>Market</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>Top 50 by market cap. Auto-refreshes every minute.</p>

      {loading ? <div className="card"><p className="muted">Loading...</p></div> : (
        <div className="market-list">
          {coins.map((coin, i) => (
            <div key={coin.id} className="market-card">
              <div className="market-rank">{i + 1}</div>
              <img src={coin.image} alt="" width={32} height={32} className="market-img" />
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
    </div>
  )
}
