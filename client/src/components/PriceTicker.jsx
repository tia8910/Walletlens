import { useEffect, useState, useMemo, memo } from 'react'
import { api } from '../api'
import { useLanguage } from '../LanguageContext'
import { tickerIdsFor, tickerLabel } from '../data/tickerPicks'

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
  const { t } = useLanguage()
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    let cancelled = false
    let intervalId = null

    // Read on every load rather than once: the picker can be reopened from
    // Settings, and a strip that keeps showing the old classes until a reload
    // reads as broken.
    function chosenIds() {
      try {
        const v = JSON.parse(localStorage.getItem('wl_interests') || 'null')
        return tickerIdsFor(Array.isArray(v) ? v : [])
      } catch { return [] }
    }

    // What someone said they track, when they said anything. getPrices batches
    // per asset class and dedupes in-flight identical fan-outs, so the whole
    // strip is a handful of requests however many symbols are on it.
    async function loadChosen(ids) {
      const quotes = await api.getPrices(ids.join(','))
      if (cancelled || !quotes) return false
      const picks = ids
        .map(id => [id, quotes[id]])
        .filter(([, q]) => q && q.usd != null)
        .map(([id, q]) => ({
          type: 'price',
          name: tickerLabel(id, q),
          price: q.usd,
          change: q.usd_24h_change,
        }))
      // A class whose feed is down should not blank the strip — keep whatever
      // is already on screen and try again on the next tick.
      if (!picks.length) return false
      setItems(picks)
      return true
    }

    // Top crypto by market cap. Still the default, because it is what someone
    // who skipped the picker gets, and skipping is allowed.
    async function loadDefault() {
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

    async function load() {
      const ids = chosenIds()
      if (ids.length && await loadChosen(ids)) return
      await loadDefault()
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

  // NOTE: must run before any early return — hooks cannot be called
  // conditionally (React: "Rendered more hooks than during the previous render").
  // Fallback: always show the strip even if the API hasn't loaded yet.
  const priceItems = items.length > 0 ? items : [
    { type: 'price', name: 'BTC', price: 0, change: 0 },
    { type: 'price', name: 'ETH', price: 0, change: 0 },
    { type: 'price', name: 'SOL', price: 0, change: 0 },
    { type: 'price', name: 'XRP', price: 0, change: 0 },
    { type: 'price', name: 'ADA', price: 0, change: 0 },
    { type: 'price', name: 'DOGE', price: 0, change: 0 },
  ]
  // Macro events ride behind the prices. They are the browse half of the strip
  // and the prices are the check half, so the prices come first.
  const displayItems = useMemo(() => [...priceItems, ...events], [priceItems, events])

  // A row, not a marquee.
  //
  // Once the strip shows what someone chose at onboarding, a 26-second scroll
  // cycle is the wrong shape: a person who picked gold wants gold, not gold in
  // fifteen seconds. Everything is present at once and the row scrolls
  // sideways under a finger.
  //
  // It also fixes an accessibility bug the marquee had. Under
  // prefers-reduced-motion the animation was paused, which left those users
  // looking at the first two items frozen, with no way to reach the rest.
  //
  // No longer aria-hidden for the same reason: the content is now static and
  // readable, so hiding it from a screen reader would be hiding real data
  // rather than sparing someone an animation.
  return (
    <div className="ticker-strip" role="list" aria-label={t('tickerPrices')}>
      {displayItems.map((t, i) => {
        if (t.type === 'event') {
          return (
            <div key={`ev-${t.title}-${i}`} className="tick tick-cal" role="listitem">
              <span className="tick-cal-dot" style={{ background: IMPACT_COLOR[t.impact] || '#eab308' }} />
              <span className="tick-name">{t.title}</span>
              <span className="tick-cal-day">{t.day}</span>
            </div>
          )
        }
        const up = (t.change ?? 0) >= 0
        return (
          <div key={`${t.name}-${i}`} className="tick" role="listitem">
            <span className="tick-name">{t.name}</span>
            <span className="tick-val">${fmtPrice(t.price)}</span>
            <span className={up ? 'tick-up' : 'tick-dn'}>
              {up ? '▲' : '▼'} {Math.abs(t.change ?? 0).toFixed(2)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default memo(PriceTicker)
