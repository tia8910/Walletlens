import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { POPULAR_TICKERS, PRESET_ASSETS, assetClass } from '../data/assets'
import CoinLogo from './CoinLogo'
import Icon from './Icon'
import { track } from '../analytics'
import { syncAlerts } from '../push'

const WATCHLIST_KEY = 'wl_watchlist'
const WL_ALERTS_KEY = 'wl_watchlist_alerts'

const TOP_CRYPTO = [
  { coin_id: 'bitcoin',            symbol: 'BTC',    name: 'Bitcoin' },
  { coin_id: 'ethereum',           symbol: 'ETH',    name: 'Ethereum' },
  { coin_id: 'solana',             symbol: 'SOL',    name: 'Solana' },
  { coin_id: 'binancecoin',        symbol: 'BNB',    name: 'BNB' },
  { coin_id: 'ripple',             symbol: 'XRP',    name: 'XRP' },
  { coin_id: 'cardano',            symbol: 'ADA',    name: 'Cardano' },
  { coin_id: 'avalanche-2',        symbol: 'AVAX',   name: 'Avalanche' },
  { coin_id: 'dogecoin',           symbol: 'DOGE',   name: 'Dogecoin' },
  { coin_id: 'polkadot',           symbol: 'DOT',    name: 'Polkadot' },
  { coin_id: 'chainlink',          symbol: 'LINK',   name: 'Chainlink' },
  { coin_id: 'uniswap',            symbol: 'UNI',    name: 'Uniswap' },
  { coin_id: 'aave',               symbol: 'AAVE',   name: 'Aave' },
  { coin_id: 'shiba-inu',          symbol: 'SHIB',   name: 'Shiba Inu' },
  { coin_id: 'litecoin',           symbol: 'LTC',    name: 'Litecoin' },
  { coin_id: 'tron',               symbol: 'TRX',    name: 'TRON' },
  { coin_id: 'near',               symbol: 'NEAR',   name: 'NEAR Protocol' },
  { coin_id: 'aptos',              symbol: 'APT',    name: 'Aptos' },
  { coin_id: 'sui',                symbol: 'SUI',    name: 'Sui' },
  { coin_id: 'pepe',               symbol: 'PEPE',   name: 'Pepe' },
  { coin_id: 'the-open-network',   symbol: 'TON',    name: 'Toncoin' },
  { coin_id: 'stellar',            symbol: 'XLM',    name: 'Stellar' },
  { coin_id: 'hedera-hashgraph',   symbol: 'HBAR',   name: 'Hedera' },
  { coin_id: 'render-token',       symbol: 'RENDER', name: 'Render' },
  { coin_id: 'injective-protocol', symbol: 'INJ',    name: 'Injective' },
  { coin_id: 'kaspa',              symbol: 'KAS',    name: 'Kaspa' },
  { coin_id: 'sei-network',        symbol: 'SEI',    name: 'Sei' },
  { coin_id: 'optimism',           symbol: 'OP',     name: 'Optimism' },
  { coin_id: 'arbitrum',           symbol: 'ARB',    name: 'Arbitrum' },
  { coin_id: 'mantle',             symbol: 'MNT',    name: 'Mantle' },
  { coin_id: 'worldcoin-wld',      symbol: 'WLD',    name: 'Worldcoin' },
]

const SEARCH_CANDIDATES = [
  ...TOP_CRYPTO,
  ...POPULAR_TICKERS.map(t => ({
    coin_id: `stock:${t.ticker}`,
    symbol: t.ticker,
    name: t.name,
    badge: t.sector,
  })),
  { coin_id: PRESET_ASSETS.gold.coin_id,     symbol: 'XAU', name: 'Gold (1 troy oz)',     badge: 'Metal' },
  { coin_id: PRESET_ASSETS.silver.coin_id,   symbol: 'XAG', name: 'Silver (1 troy oz)',   badge: 'Metal' },
  { coin_id: PRESET_ASSETS.copper.coin_id,   symbol: 'XCU', name: 'Copper (1 lb)',        badge: 'Metal' },
  { coin_id: PRESET_ASSETS.platinum.coin_id, symbol: 'XPT', name: 'Platinum (1 troy oz)', badge: 'Metal' },
]

function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]') } catch { return [] }
}
function saveWatchlist(list) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)) } catch {}
}
function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(WL_ALERTS_KEY) || '[]') } catch { return [] }
}
function saveAlerts(list) {
  try { localStorage.setItem(WL_ALERTS_KEY, JSON.stringify(list)) } catch {}
}

function bumpAlertId() {
  const n = (parseInt(localStorage.getItem('wl_wl_alert_seq') || '0', 10) + 1)
  localStorage.setItem('wl_wl_alert_seq', String(n))
  return n
}

function fmtPrice(p) {
  if (!p || !isFinite(p)) return '—'
  if (p >= 1000) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (p >= 1)    return '$' + p.toFixed(2)
  if (p >= 0.01) return '$' + p.toFixed(4)
  return '$' + p.toPrecision(3)
}

function clsLabel(coin_id) {
  const cls = assetClass(coin_id)
  if (cls === 'stock')  return 'Stock'
  if (cls === 'crypto') return 'Crypto'
  return cls.charAt(0).toUpperCase() + cls.slice(1)
}

export default function Watchlist({ portfolioPrices = {} }) {
  const [items, setItems]       = useState(loadWatchlist)
  const [prices, setPrices]     = useState({})
  const [alerts, setAlerts]     = useState(loadAlerts)
  const [search, setSearch]     = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [alertFormId, setAlertFormId] = useState(null)
  const [alertCond, setAlertCond]     = useState('above')
  const [alertPrice, setAlertPrice]   = useState('')
  const [notifPerm, setNotifPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'))
  const alertsRef  = useRef(alerts)
  const searchRef  = useRef(null)
  const portfolioPricesRef = useRef(portfolioPrices)
  alertsRef.current = alerts
  portfolioPricesRef.current = portfolioPrices

  // Persist locally and mirror rules to the push server (no-op if push is off)
  // so price targets can fire even when the app is closed.
  useEffect(() => { saveAlerts(alerts); syncAlerts() }, [alerts])

  const fetchPrices = useCallback(async () => {
    if (!items.length) return
    // Skip coins the dashboard already polled for the portfolio — avoids
    // duplicate, unsynced requests for the same coin ids.
    const missing = items
      .map(i => i.coin_id)
      .filter(id => portfolioPricesRef.current[id]?.usd == null && portfolioPricesRef.current[id]?.price == null)
    if (!missing.length) return
    const ids = missing.join(',')
    try {
      const px = await api.getPrices(ids)
      if (px) setPrices(prev => ({ ...prev, ...px }))
    } catch {}
  }, [items])

  useEffect(() => {
    fetchPrices()
    const iv = setInterval(fetchPrices, 60_000)
    return () => clearInterval(iv)
  }, [fetchPrices])

  // Alert checking — fires browser notifications when a target is crossed
  const prevPricesRef = useRef({})
  useEffect(() => {
    const merged = { ...portfolioPrices, ...prices }
    const updated = [...alertsRef.current]
    let changed = false
    const canNotify = 'Notification' in window && Notification.permission === 'granted'
    for (let i = 0; i < updated.length; i++) {
      const a = updated[i]
      if (a.triggered) continue
      const p = merged[a.coin_id]?.usd ?? merged[a.coin_id]?.price ?? 0
      if (!p) continue
      const hit = a.condition === 'above' ? p >= a.targetPrice : p <= a.targetPrice
      if (hit) {
        updated[i] = { ...a, triggered: true, triggeredAt: new Date().toISOString(), triggeredPrice: p }
        changed = true
        if (canNotify) {
          const dir = a.condition === 'above' ? '↑' : '↓'
          try {
            new Notification(`${dir} ${a.coin_symbol} watchlist alert`, {
              body: `${a.coin_symbol} hit your target of ${fmtPrice(a.targetPrice)} — now ${fmtPrice(p)}`,
              icon: '/icon-192.svg', badge: '/icon-192.svg',
              tag: `wl-alert-${a.id}`,
            })
          } catch {}
        }
      }
    }
    if (changed) setAlerts(updated)
    prevPricesRef.current = merged
  }, [prices, portfolioPrices])

  // Build search suggestions from all candidates minus already-watched
  useEffect(() => {
    if (!search.trim()) { setSuggestions([]); return }
    const q = search.toLowerCase()
    const watched = new Set(items.map(i => i.coin_id))
    const hits = SEARCH_CANDIDATES
      .filter(c =>
        !watched.has(c.coin_id) &&
        (c.symbol.toLowerCase().includes(q) ||
         c.name.toLowerCase().includes(q) ||
         c.coin_id.toLowerCase().includes(q))
      )
      .slice(0, 7)
    setSuggestions(hits)
  }, [search, items])

  function addItem(candidate) {
    const item = { coin_id: candidate.coin_id, symbol: candidate.symbol, name: candidate.name, added_at: Date.now() }
    const next = [item, ...items]
    setItems(next)
    saveWatchlist(next)
    setSearch(''); setShowSearch(false); setSuggestions([])
    track('watchlist_add', { coin_id: candidate.coin_id })
  }

  function removeItem(coin_id) {
    const next = items.filter(i => i.coin_id !== coin_id)
    setItems(next)
    saveWatchlist(next)
    setAlerts(prev => {
      const updated = prev.filter(a => a.coin_id !== coin_id)
      saveAlerts(updated)
      return updated
    })
    if (alertFormId === coin_id) setAlertFormId(null)
    track('watchlist_remove', { coin_id })
  }

  function submitAlert(e) {
    e.preventDefault()
    const price = parseFloat(alertPrice)
    if (!alertFormId || isNaN(price) || price <= 0) return
    const item = items.find(i => i.coin_id === alertFormId)
    const newAlert = {
      id: bumpAlertId(),
      coin_id: alertFormId,
      coin_symbol: item?.symbol || alertFormId,
      condition: alertCond,
      targetPrice: price,
      triggered: false,
      createdAt: new Date().toISOString(),
    }
    setAlerts(prev => [newAlert, ...prev])
    setAlertFormId(null)
    setAlertPrice('')
    track('watchlist_alert_create', { coin_id: alertFormId, condition: alertCond, target: price })
  }

  function removeAlert(id) {
    setAlerts(prev => {
      const updated = prev.filter(a => a.id !== id)
      saveAlerts(updated)
      return updated
    })
  }

  function resetAlert(id) {
    setAlerts(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, triggered: false, triggeredAt: null, triggeredPrice: null } : a)
      saveAlerts(updated)
      return updated
    })
  }

  async function requestPerm() {
    if (!('Notification' in window)) return
    const r = await Notification.requestPermission()
    setNotifPerm(r)
  }

  function toggleSearch() {
    const next = !showSearch
    setShowSearch(next)
    if (next) setTimeout(() => searchRef.current?.focus(), 60)
    else { setSearch(''); setSuggestions([]) }
  }

  function openAlertForm(coin_id) {
    if (alertFormId === coin_id) { setAlertFormId(null); return }
    setAlertFormId(coin_id)
    setAlertPrice('')
    setAlertCond('above')
  }

  const getPrice  = (id) => prices[id]?.usd ?? prices[id]?.price ?? portfolioPrices[id]?.usd ?? portfolioPrices[id]?.price ?? 0
  const getChange = (id) => prices[id]?.usd_24h_change ?? portfolioPrices[id]?.usd_24h_change ?? null

  return (
    <div className="wlw-root">
      {/* Notification permission banner */}
      {notifPerm !== 'granted' && items.length > 0 && (
        <div className="wlw-notif-banner glass-card">
          <span className="wlw-notif-icon"><Icon name="bell" size={16} /></span>
          <div>
            <strong>Enable notifications</strong> — get alerted the moment a price target is hit.
          </div>
          <button className="dvx-btn dvx-btn-primary wlw-notif-btn" onClick={requestPerm}>Enable</button>
        </div>
      )}

      {/* Header */}
      <div className="wlw-header">
        <div>
          <div className="wlw-title">Watchlist</div>
          <div className="wlw-sub muted">{items.length} asset{items.length !== 1 ? 's' : ''} tracked</div>
        </div>
        <button className="dvx-btn dvx-btn-primary wlw-add-btn" onClick={toggleSearch}>
          {showSearch ? '✕ Cancel' : '+ Add Asset'}
        </button>
      </div>

      {/* Search / add */}
      {showSearch && (
        <div className="wlw-search-card glass-card">
          <div className="wlw-search-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="wlw-search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              ref={searchRef}
              className="wlw-search-input"
              placeholder="Search crypto, stock ticker, or metal…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="wlw-search-clear" onClick={() => { setSearch(''); setSuggestions([]) }}>✕</button>
            )}
          </div>
          {suggestions.length > 0 && (
            <div className="wlw-suggestions">
              {suggestions.map(s => (
                <button key={s.coin_id} className="wlw-suggestion" onClick={() => addItem(s)}>
                  <CoinLogo coinId={s.coin_id} symbol={s.symbol} size={26} />
                  <div className="wlw-sug-info">
                    <span className="wlw-sug-sym">{s.symbol}</span>
                    <span className="wlw-sug-name muted">{s.name}</span>
                  </div>
                  {s.badge && <span className="wlw-sug-badge">{s.badge}</span>}
                </button>
              ))}
            </div>
          )}
          {search.trim() !== '' && suggestions.length === 0 && (
            <p className="muted wlw-no-results">No matches — try the full ticker (e.g. AAPL) or coin name.</p>
          )}
          {!search && (
            <div className="wlw-search-hint muted">
              Try: BTC, ETH, SOL, AAPL, NVDA, MSFT, Gold, Silver…
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !showSearch && (
        <div className="glass-card wlw-empty">
          <div className="wlw-empty-icon"><Icon name="eye" size={30} /></div>
          <p className="wlw-empty-title">Nothing in your watchlist yet</p>
          <p className="muted wlw-empty-sub">
            Track any crypto, stock, ETF, or precious metal without holding it.
            Set price alerts and get notified the moment they hit.
          </p>
          <button className="dvx-btn dvx-btn-primary" onClick={toggleSearch}>
            Add Your First Asset
          </button>
        </div>
      )}

      {/* Watchlist items */}
      {items.length > 0 && (
        <div className="wlw-list">
          {items.map(item => {
            const price     = getPrice(item.coin_id)
            const change24h = getChange(item.coin_id)
            const itemAlerts  = alerts.filter(a => a.coin_id === item.coin_id)
            const activeAlerts    = itemAlerts.filter(a => !a.triggered)
            const triggeredAlerts = itemAlerts.filter(a => a.triggered)
            const isAlertOpen  = alertFormId === item.coin_id

            return (
              <div key={item.coin_id} className="glass-card wlw-item">
                {/* Main row */}
                <div className="wlw-item-main">
                  <CoinLogo coinId={item.coin_id} symbol={item.symbol} size={38} />
                  <div className="wlw-item-info">
                    <div className="wlw-item-sym">
                      {item.symbol}
                      <span className="wlw-item-cls">{clsLabel(item.coin_id)}</span>
                    </div>
                    <div className="wlw-item-name muted">{item.name}</div>
                  </div>
                  <div className="wlw-item-price">
                    <div className="wlw-price-usd">{price > 0 ? fmtPrice(price) : <span className="muted">—</span>}</div>
                    {change24h != null && (
                      <div className="wlw-price-chg" style={{ color: change24h >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                        {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="wlw-item-btns">
                    <button
                      className={`wlw-bell ${isAlertOpen ? 'wlw-bell-open' : ''} ${activeAlerts.length > 0 ? 'wlw-bell-set' : ''}`}
                      title="Set price alert"
                      onClick={() => openAlertForm(item.coin_id)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill={activeAlerts.length > 0 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                      {activeAlerts.length > 0 && <span className="wlw-bell-count">{activeAlerts.length}</span>}
                    </button>
                    <button className="wlw-remove" title="Remove" onClick={() => removeItem(item.coin_id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>

                {/* Alert creation form */}
                {isAlertOpen && (
                  <form className="wlw-alert-form" onSubmit={submitAlert}>
                    <div className="wlw-alert-form-title">New Price Alert — {item.symbol}</div>
                    <div className="wlw-cond-row">
                      <button type="button" className={`wlw-cond-btn ${alertCond === 'above' ? 'active' : ''}`} onClick={() => setAlertCond('above')}>
                        ↑ Rises above
                      </button>
                      <button type="button" className={`wlw-cond-btn ${alertCond === 'below' ? 'active' : ''}`} onClick={() => setAlertCond('below')}>
                        ↓ Falls below
                      </button>
                    </div>
                    <div className="wlw-alert-price-row">
                      <span className="wlw-dollar">$</span>
                      <input
                        type="number"
                        className="wlw-price-input"
                        placeholder={price > 0 ? price.toFixed(price >= 1 ? 2 : 4) : '0.00'}
                        value={alertPrice}
                        onChange={e => setAlertPrice(e.target.value)}
                        min="0"
                        step="any"
                        required
                        autoFocus
                      />
                      <button type="submit" className="dvx-btn dvx-btn-primary wlw-alert-set">Notify me</button>
                    </div>
                    {price > 0 && alertPrice && (() => {
                      const t = parseFloat(alertPrice)
                      if (!t || t <= 0) return null
                      const dist = ((t - price) / price * 100)
                      return (
                        <p className="muted wlw-alert-hint">
                          {Math.abs(dist).toFixed(1)}% {dist >= 0 ? 'above' : 'below'} current price ({fmtPrice(price)})
                        </p>
                      )
                    })()}
                  </form>
                )}

                {/* Active + triggered alert chips */}
                {(activeAlerts.length > 0 || triggeredAlerts.length > 0) && (
                  <div className="wlw-alert-chips">
                    {activeAlerts.map(a => (
                      <div key={a.id} className="wlw-chip">
                        <span className="wlw-chip-cond" style={{ color: a.condition === 'above' ? 'var(--g-ink)' : '#f87171' }}>
                          {a.condition === 'above' ? '↑' : '↓'} {fmtPrice(a.targetPrice)}
                        </span>
                        {price > 0 && (
                          <span className="wlw-chip-dist muted">
                            {Math.abs(((a.targetPrice - price) / price) * 100).toFixed(1)}% away
                          </span>
                        )}
                        <button className="wlw-chip-del" onClick={() => removeAlert(a.id)} title="Remove alert">✕</button>
                      </div>
                    ))}
                    {triggeredAlerts.map(a => (
                      <div key={a.id} className="wlw-chip wlw-chip-triggered">
                        <span style={{ color: 'var(--g-ink)' }}>
                          ✓ {a.condition === 'above' ? '↑' : '↓'} {fmtPrice(a.targetPrice)} reached
                        </span>
                        <button className="wlw-chip-reset" onClick={() => resetAlert(a.id)} title="Reset alert">↺</button>
                        <button className="wlw-chip-del" onClick={() => removeAlert(a.id)} title="Remove">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
