import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import { api } from '../api'
import { track } from '../analytics'
import CoinLogo from './CoinLogo'
import { useSmartFlows, fmtFlow } from './SmartMoneyTicker'

// Every price, from the new look's ticker "All". Two tabs: the prices (the
// strip's own picks first, then the rest of the market ranking) and the smart
// money flows that used to have a strip of their own.
const fmt = (n) => n == null ? '–' : '$' + Number(n).toLocaleString('en', { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 4, minimumFractionDigits: n >= 1000 ? 0 : 2 })
const pct = (v) => v == null ? '·' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`

export default function PricesSheet({ items = [], onClose }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [tab, setTab] = useState('prices')
  const [q, setQ] = useState('')
  const [market, setMarket] = useState([])
  const flows = useSmartFlows(50)

  useEffect(() => {
    track('nl_prices_open')
    let alive = true
    Promise.resolve(api.getMarketData()).then(d => { if (alive && Array.isArray(d)) setMarket(d) }).catch(() => {})
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { alive = false; window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const rows = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const it of items) {
      if (it.type !== 'price' || seen.has(it.name)) continue
      seen.add(it.name); out.push(it)
    }
    for (const c of market) {
      const name = (c.symbol || c.id || '').toUpperCase()
      if (!name || seen.has(name) || c.current_price == null) continue
      seen.add(name)
      out.push({ id: c.id, image: c.image, name, full: c.name, price: c.current_price, change: c.price_change_percentage_24h })
    }
    const f = q.trim().toLowerCase()
    return f ? out.filter(r => r.name.toLowerCase().includes(f) || r.full?.toLowerCase().includes(f) || r.id?.includes(f)) : out
  }, [items, market, q])

  const open = (id) => { if (!id) return; onClose(); navigate(`/asset/${encodeURIComponent(id)}`) }

  return createPortal(
    <div className="nl-sheet-bg" onClick={onClose}>
      <div className="nl-sheet" role="dialog" aria-modal="true" aria-label={t('tickerPrices')} onClick={e => e.stopPropagation()}>
        <i className="nl-sheet-grip" aria-hidden="true" />
        <div className="nl-sheet-h">
          <h2>{t('tickerPrices')}</h2>
          <button type="button" className="nl-tool" onClick={onClose} aria-label={t('airClose')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="nl-seg2" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'prices'} className={tab === 'prices' ? 'on' : ''} onClick={() => setTab('prices')}>{t('nlTabPrices')}</button>
          {flows.length > 0 && <button type="button" role="tab" aria-selected={tab === 'smart'} className={tab === 'smart' ? 'on' : ''} onClick={() => setTab('smart')}>{t('tickerSmartMoney')}</button>}
        </div>

        {tab === 'prices' ? (
          <>
            <input className="nl-search" type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={t('phSearchAssets')} />
            <div className="nl-sheet-list">
              {rows.map(r => (
                <button type="button" key={r.name} className="nl-row" onClick={() => open(r.id)} disabled={!r.id}>
                  <CoinLogo coinId={r.id} symbol={r.name} image={r.image} size={34} />
                  <div className="nl-row-n"><b>{r.name}</b>{r.full && <small>{r.full}</small>}</div>
                  <div className="nl-row-v"><b>{fmt(r.price)}</b><small className={r.change == null ? '' : r.change >= 0 ? 'up' : 'down'}>{pct(r.change)}</small></div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="nl-sheet-note">{t('nlSmartHint')}</p>
            <div className="nl-sheet-list">
              {flows.map(f => (
                <div key={f.symbol} className="nl-row">
                  <CoinLogo symbol={f.symbol} size={34} />
                  <div className="nl-row-n"><b>{f.symbol}</b><small>{f.netflow >= 0 ? t('nlAccumulated') : t('nlDistributed')}</small></div>
                  <div className="nl-row-v"><b className={f.netflow >= 0 ? 'up' : 'down'}>{f.netflow >= 0 ? '▲' : '▼'} {fmtFlow(f.netflow)}</b></div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
