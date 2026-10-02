import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import { api } from '../api'
import { track } from '../analytics'
import CoinLogo from './CoinLogo'
import { useSmartFlows, fmtFlow } from './SmartMoneyTicker'
import { PRESET_ASSETS, POPULAR_FIAT, POPULAR_TICKERS, POPULAR_XSTOCKS, STOCK_PREFIX, XSTOCK_PREFIX, FIAT_PREFIX } from '../data/assets'

// Every priced class the trade sheet sells, in its order. Bonds and "other"
// are typed in by hand there and have no market price to list.
const CLASSES = [
  { key: 'stock', labelKey: 'catStocks', list: () => POPULAR_TICKERS.map(t => ({ id: `${STOCK_PREFIX}${t.ticker.toLowerCase()}`, name: t.ticker, full: t.name })) },
  { key: 'tstock', labelKey: 'tcTokenized', list: () => POPULAR_XSTOCKS.map(t => ({ id: `${XSTOCK_PREFIX}${t.ticker.toLowerCase()}`, name: `${t.ticker}x`, full: t.name })) },
  { key: 'metal', labelKey: 'nlMetals', list: () => Object.values(PRESET_ASSETS).map(a => ({ id: a.coin_id, name: a.symbol, full: a.name })) },
  { key: 'fiat', labelKey: 'tcFiat', list: () => POPULAR_FIAT.filter(f => f.code !== 'USD').map(f => ({ id: `${FIAT_PREFIX}${f.code.toLowerCase()}`, name: f.code, full: f.name })) },
]

// Every price, from the new look's ticker "All". Two tabs: the prices — every
// class the trade sheet sells, filtered by the chips: the strip's own picks
// and the crypto ranking, stocks, tokenized stocks, metals and currencies —
// and the smart money flows that used to have a strip of their own.
const fmt = (n) => n == null ? '–' : '$' + Number(n).toLocaleString('en', { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 4, minimumFractionDigits: n >= 1000 ? 0 : 2 })
const pct = (v) => v == null ? '·' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`

export default function PricesSheet({ items = [], onClose }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [tab, setTab] = useState('prices')
  const [q, setQ] = useState('')
  const [market, setMarket] = useState([])
  const [cls, setCls] = useState('all')
  const [quotes, setQuotes] = useState({})
  const flows = useSmartFlows(50)

  // Typing searches every coin, the way the trade sheet's crypto search
  // does (the same call), not just the ranking already loaded; the matches
  // are then priced in one batch.
  const [found, setFound] = useState([])
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2 || !(cls === 'all' || cls === 'crypto')) { setFound([]); setSearching(false); return }
    let alive = true
    setSearching(true)
    const timer = setTimeout(async () => {
      const res = await Promise.resolve(api.searchCoins(term)).catch(() => [])
      if (!alive) return
      setSearching(false)
      if (!Array.isArray(res)) return
      setFound(res)
      const ids = res.map(c => c.id).filter(Boolean)
      if (ids.length) Promise.resolve(api.getPrices(ids.join(','))).then(px => { if (alive && px) setQuotes(qq => ({ ...qq, ...px })) }).catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [q, cls])

  // Stocks, tokenized stocks, metals and currencies: last-known prices at
  // once from the cache, then fresh ones in one batched request per class.
  useEffect(() => {
    let alive = true
    for (const c of CLASSES) {
      const ids = c.list().map(r => r.id).join(',')
      const cached = api.getCachedPrices?.(ids) || {}
      if (Object.keys(cached).length) setQuotes(q => ({ ...cached, ...q }))
      Promise.resolve(api.getPrices(ids)).then(px => { if (alive && px) setQuotes(q => ({ ...q, ...px })) }).catch(() => {})
    }
    return () => { alive = false }
  }, [])

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
    const push = (r, k) => { if (seen.has(r.id || r.name)) return; seen.add(r.id || r.name); out.push({ ...r, cls: k }) }
    if (cls === 'all' || cls === 'crypto') {
      // The strip's own picks first (they may be stocks or metals too).
      if (cls === 'all') for (const it of items) if (it.type === 'price') push(it, 'strip')
      for (const c of market) {
        if (c.current_price == null) continue
        push({ id: c.id, image: c.image, name: (c.symbol || c.id || '').toUpperCase(), full: c.name, price: c.current_price, change: c.price_change_percentage_24h }, 'crypto')
      }
    }
    for (const c of CLASSES) {
      if (cls !== 'all' && cls !== c.key) continue
      for (const r of c.list()) push({ ...r, price: quotes[r.id]?.usd ?? null, change: quotes[r.id]?.usd_24h_change ?? null }, c.key)
    }
    const f = q.trim().toLowerCase()
    if (!f) return out
    const hits = out.filter(r => r.name.toLowerCase().includes(f) || r.full?.toLowerCase().includes(f) || r.id?.includes(f))
    for (const c of found) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      hits.push({ id: c.id, image: c.large || c.thumb, name: (c.symbol || '').toUpperCase(), full: c.name, price: quotes[c.id]?.usd ?? null, change: quotes[c.id]?.usd_24h_change ?? null, cls: 'crypto' })
    }
    return hits
  }, [items, market, quotes, cls, q, found])

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
        {flows.length > 0 && <div className="nl-seg2" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'prices'} className={tab === 'prices' ? 'on' : ''} onClick={() => setTab('prices')}>{t('nlTabPrices')}</button>
          <button type="button" role="tab" aria-selected={tab === 'smart'} className={tab === 'smart' ? 'on' : ''} onClick={() => setTab('smart')}>{t('tickerSmartMoney')}</button>
        </div>}

        {tab === 'prices' ? (
          <>
            <input className="nl-search" type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={t('phSearchAssets')} />
            <div className="nl-chips">
              {[{ key: 'all', labelKey: 'nlAllPrices' }, { key: 'crypto', labelKey: 'catCrypto' }, ...CLASSES].map(c => (
                <button key={c.key} type="button" className={cls === c.key ? 'on' : ''} onClick={() => setCls(c.key)}>{t(c.labelKey)}</button>
              ))}
            </div>
            <div className="nl-sheet-list">
              {rows.map(r => (
                <button type="button" key={r.id || r.name} className="nl-row" onClick={() => open(r.id)} disabled={!r.id}>
                  <CoinLogo coinId={r.id} symbol={r.name} image={r.image} size={34} />
                  <div className="nl-row-n"><b>{r.name}</b>{r.full && <small>{r.full}</small>}</div>
                  <div className="nl-row-v"><b>{fmt(r.price)}</b><small className={r.change == null ? '' : r.change >= 0 ? 'up' : 'down'}>{pct(r.change)}</small></div>
                </button>
              ))}
              {rows.length === 0 && <p className="nl-sheet-note">{searching ? t('nlSearching') : t('nlNoMatches')}</p>}
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
