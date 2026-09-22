import { useEffect, useState } from 'react'
import { dataUrl } from '../apiHosts'
import { useLanguage } from '../LanguageContext'
import { INTERESTS_EVENT } from '../data/interestsEvent'

// Smart money flow, as a strip.
//
// The existing ticker already carries price, so repeating it here would spend
// a row on something the user can already see. Netflow is the thing only this
// source knows: positive means the wallets Nansen labels as smart money
// accumulated over the window, negative means they distributed.
//
// It reads a file the cron publishes, never Nansen directly. Nansen bills by
// credit and this renders on every page load, so a browser-initiated call
// would tie the bill to traffic — one good day and the quota is gone.

const REFRESH_MS = 15 * 60_000
const MAX_ROWS = 12

/**
 * Whether crypto is among the asset classes this person sees.
 *
 * Smart money flow is a crypto-only signal — there is no on-chain wallet
 * labelling for a gold bar or a share of Apple — so someone who picked stocks
 * and metals should not be handed a strip of token tickers, and should not pay
 * for the request either. The fetch is skipped rather than hidden.
 *
 * AN EMPTY LIST MEANS YES, and getting that wrong is what hid this strip on a
 * screen that was showing crypto prices at the time. tickerPlaceholders() ends
 * `ids.length ? ids : INTEREST_TICKER_IDS.crypto`: anyone who has not picked —
 * skipped onboarding, cleared storage, arrived today — gets the crypto price
 * ticker by default. Requiring an explicit choice here made this strip
 * stricter than the strip directly above it, so the two disagreed about the
 * same person. Hide it only when someone has chosen, and chosen without crypto.
 */
function hasCrypto() {
  try {
    const v = JSON.parse(localStorage.getItem('wl_interests') || 'null')
    if (!Array.isArray(v) || v.length === 0) return true
    return v.includes('crypto')
  } catch { return true }
}

/** $12.4M, $840K, $1.2B — a ticker has no room for grouped digits. */
export function fmtFlow(n) {
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `$${Math.round(a / 1e3)}K`
  return `$${Math.round(a)}`
}

export default function SmartMoneyTicker() {
  const { t } = useLanguage()
  const [flows, setFlows] = useState([])
  const [show, setShow] = useState(hasCrypto)

  // The picker can be reopened from Settings, and a strip that only appears
  // after a reload reads as broken — the same reason PriceTicker listens.
  useEffect(() => {
    const sync = () => setShow(hasCrypto())
    window.addEventListener(INTERESTS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(INTERESTS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    if (!show) { setFlows([]); return }
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(dataUrl('smartmoney.json'), { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return
        const data = await res.json()
        if (alive && Array.isArray(data?.flows)) setFlows(data.flows.slice(0, MAX_ROWS))
      } catch { /* the strip stays hidden rather than showing an error */ }
    }
    load()
    let id = setInterval(load, REFRESH_MS)

    // Pause polling while the tab is hidden — this strip is mounted at the
    // App shell level for the whole session, so an ungated 15-minute timer
    // kept firing an outbound fetch from backgrounded tabs indefinitely.
    // Mirrors the same handleVisibility pattern in PriceTicker.
    function handleVisibility() {
      if (document.hidden) {
        clearInterval(id); id = null
      } else {
        load()
        if (!id) id = setInterval(load, REFRESH_MS)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [show])

  // Nothing to say is better than an empty bar taking up a row of a phone
  // screen. This covers both "not a crypto user" and the upstream changing
  // shape.
  if (!show || !flows.length) return null

  return (
    <div className="ticker-strip" role="list" aria-label={t('tickerSmartMoney')}>
      {/* Self-identifying, because without it this reads as a second price
          strip that disagrees with the first: the same token can be down on
          the day and accumulated by smart money, so ETH shows red above and
          green here. The label is what makes that a fact rather than a bug.
          No pulsing dot — the news strip earns one by being live, this is
          an hourly snapshot and should not claim otherwise. */}
      <span className="news-ticker-label">{t('tickerSmartMoney')}</span>
      {flows.map((f) => {
        const inflow = f.netflow >= 0
        const mag = Math.abs(f.netflow)
        // Same idea as the price ticker: direction picks the colour, size
        // picks how loudly. A $40M move and a $40K move are not the same news.
        const tier = mag >= 1e7 ? 'strong' : mag >= 1e6 ? 'mid' : 'soft'
        return (
          <div
            key={f.symbol}
            className={`tick tick--${inflow ? 'up' : 'down'} tick--${tier}`}
            role="listitem"
            title={`${f.symbol}: smart money ${inflow ? 'accumulated' : 'distributed'} ${fmtFlow(f.netflow)}`}
          >
            <span className="tick-name">{f.symbol}</span>
            <span className={inflow ? 'tick-up' : 'tick-dn'}>
              {inflow ? '▲' : '▼'} {fmtFlow(f.netflow)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
