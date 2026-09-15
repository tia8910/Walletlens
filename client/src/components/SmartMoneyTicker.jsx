import { useEffect, useState } from 'react'
import { dataUrl } from '../apiHosts'
import { useLanguage } from '../LanguageContext'

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

  useEffect(() => {
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
    const id = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // Nothing to say is better than an empty bar taking up a row of a phone
  // screen. This also covers the upstream changing shape.
  if (!flows.length) return null

  return (
    <div className="ticker-strip" role="list" aria-label={t('tickerSmartMoney')}>
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
