import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CoinLogo from './CoinLogo'
import IndicatorChart from './IndicatorChart'
import { api, assetClass } from '../api'
import { GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID, STOCK_PREFIX, POPULAR_TICKERS } from '../data/assets'
import { isStablecoin } from '../stablecoins'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { MoneyFlowCard } from './MoneyFlow'
import { BybitCard, BybitStockCard } from './BybitOffer'

// Technicals: the asset page's indicator chart for any holding, picked from
// a row of chips (largest holding first), or for any other asset found with
// the search above them: crypto (CoinGecko, with the local catalogue as its
// fallback), US stocks and ETFs, and the metals. With nothing held yet it
// offers the majors so the tool still shows what it does.

const MAJORS = [
  { coin_id: 'bitcoin', coin_symbol: 'BTC', coin_name: 'Bitcoin' },
  { coin_id: 'ethereum', coin_symbol: 'ETH', coin_name: 'Ethereum' },
  { coin_id: 'solana', coin_symbol: 'SOL', coin_name: 'Solana' },
]

const METALS = [
  { coin_id: GOLD_ID, coin_symbol: 'XAU', coin_name: 'Gold' },
  { coin_id: SILVER_ID, coin_symbol: 'XAG', coin_name: 'Silver' },
  { coin_id: COPPER_ID, coin_symbol: 'XCU', coin_name: 'Copper' },
  { coin_id: PLATINUM_ID, coin_symbol: 'XPT', coin_name: 'Platinum' },
]

// Stablecoins and cash have no chart worth reading.
const chartable = (h) => h.coin_id && !isStablecoin(h.coin_id, h.coin_symbol) && !/^(fiat:|cash:|real:|bond:|other:)/.test(h.coin_id)

const stockAsset = (ticker, name) => ({ coin_id: `${STOCK_PREFIX}${ticker.toLowerCase()}`, coin_symbol: ticker.toUpperCase(), coin_name: name || ticker.toUpperCase(), kind: 'stock' })

/**
 * Local matches for a query: metals and the popular stock list by symbol or
 * name, plus the query itself as a ticker when it looks like one and is not
 * in the list (any US ticker charts through /api/candles).
 */
export function localMatches(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hit = (sym, name) => sym.toLowerCase().startsWith(q) || name.toLowerCase().includes(q)
  const metals = METALS.filter(m => hit(m.coin_symbol, m.coin_name)).map(m => ({ ...m, kind: 'metal' }))
  const stocks = POPULAR_TICKERS.filter(s => hit(s.ticker, s.name)).slice(0, 6).map(s => stockAsset(s.ticker, s.name))
  const up = query.trim().toUpperCase()
  if (/^[A-Z]{1,5}([.-][A-Z])?$/.test(up) && !stocks.some(s => s.coin_symbol === up)) stocks.push({ ...stockAsset(up), guess: true })
  return [...metals, ...stocks]
}

export default function TechChartPanel({ enriched }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const assets = useMemo(() => {
    const own = (enriched || []).filter(chartable).slice().sort((a, b) => (b.value || 0) - (a.value || 0))
    return own.length ? own : MAJORS
  }, [enriched])
  const [picked, setPicked] = useState(null)
  // An asset found by search, charted even though it is not held.
  const [found, setFound] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    const q = query.trim()
    if (!q) { setResults([]); setSearching(false); return }
    const local = localMatches(q)
    setResults(local)
    setSearching(true)
    let alive = true
    timer.current = setTimeout(async () => {
      const coins = await api.searchCoins(q).catch(() => [])
      if (!alive) return
      const crypto = (coins || []).filter(c => c?.id && !isStablecoin(c.id, c.symbol)).slice(0, 6).map(c => ({
        coin_id: c.id, coin_symbol: String(c.symbol || '').toUpperCase(), coin_name: c.name, image: c.large || c.thumb, kind: 'crypto',
      }))
      // A bare ticker guess ("SOL" as a stock) gives way to a coin with that symbol.
      const syms = new Set(crypto.map(c => c.coin_symbol))
      setResults([...crypto, ...local.filter(l => !(l.guess && syms.has(l.coin_symbol)))])
      setSearching(false)
    }, 250)
    return () => { alive = false; clearTimeout(timer.current) }
  }, [query])

  const choose = (a) => {
    setFound(a); setPicked(a.coin_id); setQuery(''); setResults([])
    track('technicals_search_pick', { coin_id: a.coin_id, kind: a.kind })
  }

  const held = assets.find(a => a.coin_id === picked)
  const cur = held || (found && found.coin_id === picked ? found : null) || assets[0]
  // The searched asset gets a chip of its own at the front while it is shown.
  const chips = found && !assets.some(a => a.coin_id === found.coin_id) ? [found, ...assets] : assets

  return (
    <div className="tc-panel">
      <div className="tc-search">
        <svg className="tc-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t('acSearchAsset')} aria-label={t('acSearchAsset')} autoComplete="off" spellCheck={false} />
        {query && (
          <div className="tc-results" role="listbox">
            {results.map(r => (
              <button key={r.coin_id} role="option" aria-selected="false" className="tc-result" onClick={() => choose(r)}>
                <CoinLogo image={r.image} symbol={r.coin_symbol} coinId={r.coin_id} size={24} />
                <span className="tc-result-name"><b>{r.coin_symbol}</b><small>{r.coin_name}</small></span>
                <span className="tc-result-kind">{r.kind === 'crypto' ? t('catCrypto') : r.kind === 'metal' ? t('catCommodities') : t('catStocks')}</span>
              </button>
            ))}
            {!results.length && <div className="tc-result-empty">{searching ? t('tkFetching') : t('acSearchNoMatch')}</div>}
          </div>
        )}
      </div>
      <div className="tc-assets" role="tablist" aria-label={t('acPickAsset')}>
        {chips.map(a => (
          <button key={a.coin_id} role="tab" aria-selected={a.coin_id === cur.coin_id}
            className={`tc-asset${a.coin_id === cur.coin_id ? ' on' : ''}`} onClick={() => setPicked(a.coin_id)}>
            <CoinLogo image={a.image} symbol={a.coin_symbol} coinId={a.coin_id} size={20} />
            <span>{a.coin_symbol}</span>
          </button>
        ))}
      </div>
      <div className="tc-head">
        <CoinLogo image={cur.image} symbol={cur.coin_symbol} coinId={cur.coin_id} size={32} />
        <div className="tc-name"><b>{cur.coin_name || cur.coin_symbol}</b><small>{cur.coin_symbol}</small></div>
        <button className="tc-open" onClick={() => navigate(`/asset/${encodeURIComponent(cur.coin_id)}`)}>{t('acOpenAsset')} ›</button>
      </div>
      <IndicatorChart key={cur.coin_id} coinId={cur.coin_id} symbol={cur.coin_symbol} name={cur.coin_name}
        price={cur.price || 0} source="technicals" />
      {assetClass(cur.coin_id) === 'crypto' && <>
        <MoneyFlowCard symbol={cur.coin_symbol} />
        <BybitCard symbol={cur.coin_symbol} placement="technicals" />
      </>}
      {assetClass(cur.coin_id) === 'stock' && <BybitStockCard symbol={cur.coin_symbol} placement="technicals_stock" />}
      {['gold', 'silver', 'copper', 'platinum'].includes(assetClass(cur.coin_id)) &&
        <BybitStockCard symbol={cur.coin_symbol} kind="metals" placement="technicals_metal" />}
    </div>
  )
}
