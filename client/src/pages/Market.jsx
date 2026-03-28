import { useState, useEffect } from 'react'
import { api } from '../api'

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
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  return (
    <div className="page">
      <h2>Market Overview</h2>
      <p className="muted">Top 50 cryptocurrencies by market cap. Prices refresh every minute.</p>

      <div className="card">
        {loading ? <p className="muted">Loading market data...</p> : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Coin</th>
                <th>Price</th>
                <th>24h Change</th>
                <th>Market Cap</th>
                <th>Volume (24h)</th>
              </tr>
            </thead>
            <tbody>
              {coins.map((coin, i) => (
                <tr key={coin.id}>
                  <td>{i + 1}</td>
                  <td className="coin-cell">
                    <img src={coin.image} alt="" width={24} height={24} />
                    <strong>{coin.name}</strong>
                    <small className="muted">{coin.symbol.toUpperCase()}</small>
                  </td>
                  <td>${coin.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}>
                    {coin.price_change_percentage_24h?.toFixed(2)}%
                  </td>
                  <td>${(coin.market_cap / 1e9).toFixed(2)}B</td>
                  <td>${(coin.total_volume / 1e9).toFixed(2)}B</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
