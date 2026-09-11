import { useEffect, useState, useMemo, memo } from 'react'
import { api } from '../api'
import { useLanguage } from '../LanguageContext'
import {
  tickerIdsFor, tickerLabel, tickerPlaceholders, MAX_TICKER_IDS, MAX_LIVE_CRYPTO,
} from '../data/tickerPicks'

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

// What was chosen at onboarding. Read on every load rather than once: the
// picker can be reopened from Settings, and a strip that keeps showing the old
// classes until a reload reads as broken.
function chosenInterests() {
  try {
    const v = JSON.parse(localStorage.getItem('wl_interests') || 'null')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

function PriceTicker() {
  const { t } = useLanguage()
  // Seeded, not empty. The names someone picked are known offline and cost
  // nothing to draw, so the strip opens on their own assets in the first frame
  // and the quotes fill in underneath. It used to mount empty and fall back to
  // a hardcoded row of six coins, which is what a stocks user saw first.
  const [items, setItems] = useState(() => tickerPlaceholders(chosenInterests()))
  const [events, setEvents] = useState([])

  useEffect(() => {
    let cancelled = false
    let intervalId = null

    const chosenIds = () => tickerIdsFor(chosenInterests())

    // Crypto follows the market instead of a list. getMarketData is the
    // top-of-market ranking the dashboard already loads, so this costs nothing
    // extra and the strip reorders itself as the ranking does — which a
    // hardcoded five cannot, and goes quietly wrong the week it changes.
    // Stables are dropped: a row of dollars pegged to a dollar is not a price.
    async function liveCrypto() {
      const data = await api.getMarketData()
      if (!Array.isArray(data)) return []
      const skip = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd',
                            'true-usd', 'binance-usd'])
      return data
        .filter(c => !skip.has(c.id) && c.current_price != null)
        .slice(0, MAX_LIVE_CRYPTO)
        .map(c => ({
          type: 'price',
          name: (c.symbol || c.id || '').toUpperCase(),
          price: c.current_price,
          change: c.price_change_percentage_24h,
        }))
    }

    // What someone said they track, when they said anything. getPrices batches
    // per asset class and dedupes in-flight identical fan-outs, so the whole
    // strip is a handful of requests however many symbols are on it.
    async function loadChosen(interests, ids) {
      const wantsCrypto = interests.includes('crypto')
      // Everything except crypto, which has its own live source above.
      const fixed = wantsCrypto
        ? ids.filter(id => !tickerIdsFor(['crypto']).includes(id))
        : ids

      // Interleaved head, then whatever is left. Someone who picked crypto and
      // gold sees gold in the first handful rather than after twenty coins,
      // and still gets the twenty coins.
      const compose = (live, others) => {
        const head = []
        for (let i = 0; head.length < others.length * 2 && i < 40; i++) {
          if (live[i]) head.push(live[i])
          if (others[i]) head.push(others[i])
        }
        const seen = new Set(head.map(x => x.name))
        const tail = [...live, ...others].filter(x => !seen.has(x.name))
        return [...head, ...tail].slice(0, MAX_TICKER_IDS)
      }

      // Paint each source as it lands rather than waiting for both.
      //
      // These two have wildly different costs. Crypto is one getMarketData
      // call. Stocks go out as a batch and then one request per ticker the
      // batch missed, against a feed that rate-limits and closes at the
      // weekend — so a Promise.all held the whole strip, crypto included,
      // hostage to the slowest quote, and the header sat empty for seconds.
      let live = []
      let others = []
      const paint = () => {
        const picks = compose(live, others)
        // A feed being down should not blank the strip — keep whatever is
        // already on screen, placeholders included, and try again next tick.
        if (cancelled || !picks.length) return
        setItems(picks)
      }

      const cryptoTask = wantsCrypto
        ? liveCrypto().then(r => { live = r; paint() }).catch(() => {})
        : Promise.resolve()

      const othersTask = fixed.length
        ? api.getPrices(fixed.join(','))
            .then(quotes => {
              others = fixed
                .map(id => [id, quotes?.[id]])
                .filter(([, q]) => q && q.usd != null)
                .map(([id, q]) => ({
                  type: 'price',
                  name: tickerLabel(id, q),
                  price: q.usd,
                  change: q.usd_24h_change,
                }))
              paint()
            })
            .catch(() => {})
        : Promise.resolve()

      await Promise.all([cryptoTask, othersTask])
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
      const interests = chosenInterests()
      const ids = chosenIds()
      // Their choices, or nothing. This used to fall through to loadDefault()
      // whenever loadChosen painted nothing — a slow or rate-limited stock
      // feed, a closed market — and loadDefault is the top crypto ranking. So
      // the one case where a stocks user most needed to see stocks was the
      // case that replaced them with coins. A strip of their own names with no
      // prices yet is honest; a strip of somebody else's asset class is not.
      if (ids.length) { await loadChosen(interests, ids); return }
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
  //
  // No fallback list here any more. `items` is seeded from the chosen classes
  // at mount, so it is never empty and the six hardcoded coins that used to
  // stand in for everyone are gone. Placeholder rows carry change: null, not 0
  // — zero read as "not negative", so every one of them drew a green up-arrow
  // and the strip claimed six coins were up before a single price had loaded.
  //
  // Macro events ride behind the prices. They are the browse half of the strip
  // and the prices are the check half, so the prices come first.
  const displayItems = useMemo(() => [...items, ...events], [items, events])

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
        // Three states: up, down, and not knowing yet.
        const pending = t.change == null
        const up = !pending && t.change >= 0
        return (
          <div key={`${t.name}-${i}`} className="tick" role="listitem">
            <span className="tick-name">{t.name}</span>
            <span className="tick-val">{t.price == null ? '–' : `$${fmtPrice(t.price)}`}</span>
            <span className={pending ? 'tick-val' : up ? 'tick-up' : 'tick-dn'}>
              {pending ? '·' : `${up ? '▲' : '▼'} ${Math.abs(t.change).toFixed(2)}%`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default memo(PriceTicker)
