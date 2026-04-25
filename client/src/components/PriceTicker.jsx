import { useEffect, useState } from 'react'
import { api } from '../api'

// Top-of-page auto-scrolling live price strip — pulls top market caps
// from CoinGecko, refreshes every 60s, animates with CSS marquee.
const TICKER_REFRESH_MS = 60_000

function fmtPrice(n) {
  if (n == null) return '–'
  if (n >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 0 })
  if (n >= 1) return n.toLocaleString('en', { maximumFractionDigits: 2 })
  return n.toLocaleString('en', { maximumFractionDigits: 4 })
}

export default function PriceTicker() {
  const [items, setItems] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const data = await api.getMarketData()
      if (cancelled || !Array.isArray(data) || data.length === 0) return
      // Pick top 12 by market cap, skip obvious stables for visual variety
      const skip = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd', 'true-usd', 'binance-usd'])
      const picks = data
        .filter(c => !skip.has(c.id))
        .slice(0, 12)
        .map(c => ({
          name: (c.symbol || c.id || '').toUpperCase(),
          price: c.current_price,
          change: c.price_change_percentage_24h,
        }))
      setItems(picks)
    }
    load()
    const id = setInterval(load, TICKER_REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (items.length === 0) return null

  // Duplicate the list so the marquee loops seamlessly
  const doubled = [...items, ...items]

  return (
    <div className="ticker-strip" aria-hidden="true">
      <div className="ticker-inner">
        {doubled.map((t, i) => {
          const up = (t.change ?? 0) >= 0
          return (
            <div key={`${t.name}-${i}`} className="tick">
              <span className="tick-name">{t.name}</span>
              <span className="tick-val">${fmtPrice(t.price)}</span>
              <span className={up ? 'tick-up' : 'tick-dn'}>
                {up ? '▲' : '▼'} {Math.abs(t.change ?? 0).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
