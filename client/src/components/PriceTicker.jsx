import { useEffect, useState, useMemo, memo } from 'react'
import { api } from '../api'

const TICKER_REFRESH_MS = 60_000
const CAL_REFRESH_MS = 30 * 60_000

const IMPACT_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#eab308', holiday: '#64748b' }

function fmtPrice(n) {
  if (n == null) return '–'
  if (n >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 0 })
  if (n >= 1) return n.toLocaleString('en', { maximumFractionDigits: 2 })
  return n.toLocaleString('en', { maximumFractionDigits: 4 })
}

// Short relative day label for an upcoming event ("Today", "Tue", "Mon 28").
function eventDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Tmrw'
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

function PriceTicker() {
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    let cancelled = false
    let intervalId = null

    async function load() {
      const data = await api.getMarketData()
      if (cancelled || !Array.isArray(data) || data.length === 0) return
      // Pick top 12 by market cap, skip obvious stables for visual variety
      const skip = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd', 'true-usd', 'binance-usd'])
      const picks = data
        .filter(c => !skip.has(c.id))
        .slice(0, 12)
        .map(c => ({
          type: 'price',
          name: (c.symbol || c.id || '').toUpperCase(),
          price: c.current_price,
          change: c.price_change_percentage_24h,
        }))
      setItems(picks)
    }

    async function loadEvents() {
      try {
        const res = await api.getEconomicCalendar()
        if (cancelled) return
        const todayStr = new Date().toISOString().slice(0, 10)
        // Next few market-moving (high/medium) macro prints.
        const upcoming = (res?.events || [])
          .filter(e => e.date >= todayStr && (e.impact === 'high' || e.impact === 'medium'))
          .slice(0, 6)
          .map(e => ({
            type: 'event',
            title: e.title,
            impact: e.impact,
            day: eventDayLabel(e.date),
          }))
        setEvents(upcoming)
      } catch { /* ticker still shows prices */ }
    }

    function startPolling() {
      if (intervalId) return
      intervalId = setInterval(load, TICKER_REFRESH_MS)
    }

    function stopPolling() {
      clearInterval(intervalId)
      intervalId = null
    }

    function handleVisibility() {
      if (document.hidden) {
        stopPolling()
      } else {
        load()
        startPolling()
      }
    }

    load()
    loadEvents()
    const calId = setInterval(loadEvents, CAL_REFRESH_MS)
    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      stopPolling()
      clearInterval(calId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Duplicate the list so the marquee loops seamlessly.
  // NOTE: must run before any early return — hooks cannot be called
  // conditionally (React: "Rendered more hooks than during the previous render").
    // Fallback: always show the ticker even if the API hasn't loaded yet
  const priceItems = items.length > 0 ? items : [
    { type: 'price', name: 'BTC', price: 0, change: 0 },
    { type: 'price', name: 'ETH', price: 0, change: 0 },
    { type: 'price', name: 'SOL', price: 0, change: 0 },
    { type: 'price', name: 'XRP', price: 0, change: 0 },
    { type: 'price', name: 'ADA', price: 0, change: 0 },
    { type: 'price', name: 'DOGE', price: 0, change: 0 },
  ]
  // Interleave macro events into the price stream so the calendar rides the
  // same marquee as the markets ticker.
  const displayItems = useMemo(() => [...events, ...priceItems], [events, priceItems])
  const doubled = useMemo(() => [...displayItems, ...displayItems], [displayItems])

  return (
    <div className="ticker-strip" aria-hidden="true">
      <div className="ticker-inner">
        {doubled.map((t, i) => {
          if (t.type === 'event') {
            return (
              <div key={`ev-${t.title}-${i}`} className="tick tick-cal">
                <span className="tick-cal-dot" style={{ background: IMPACT_COLOR[t.impact] || '#eab308' }} />
                <span className="tick-name">{t.title}</span>
                <span className="tick-cal-day">{t.day}</span>
              </div>
            )
          }
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

export default memo(PriceTicker)
