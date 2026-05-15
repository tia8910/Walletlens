import { useEffect, useRef, useState } from 'react'
import { api, FIAT_PREFIX, GOLD_ID, SILVER_ID, STOCK_PREFIX, POPULAR_FIAT, POPULAR_TICKERS } from '../api'
import CoinLogo from './CoinLogo'
import { track } from '../analytics'

const IcoClose  = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IcoSearch = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

const CATEGORIES = [
  { key: 'crypto', label: 'Crypto',  icon: '◆', color: '#6366f1' },
  { key: 'stock',  label: 'Stocks',  icon: '📈', color: '#10b981' },
  { key: 'gold',   label: 'Gold',    icon: '🥇', color: '#f59e0b' },
  { key: 'silver', label: 'Silver',  icon: '🥈', color: '#94a3b8' },
  { key: 'fiat',   label: 'Fiat',    icon: '💵', color: '#0ea5e9' },
  { key: 'bond',   label: 'Bonds',   icon: '📜', color: '#0284c7' },
  { key: 'other',  label: 'Other',   icon: '◈', color: '#a78bfa' },
]

// ── Preset asset for each non-crypto category ─────────────────────────────
function presetForCategory(cat, stockTicker, fiatCode, otherInput) {
  if (cat === 'gold')   return { id: GOLD_ID,   symbol: 'XAU', name: 'Gold (1 oz)',   category: 'gold',   image: '' }
  if (cat === 'silver') return { id: SILVER_ID, symbol: 'XAG', name: 'Silver (1 oz)', category: 'silver', image: '' }
  if (cat === 'stock' && stockTicker) {
    const info = POPULAR_TICKERS.find(t => t.ticker === stockTicker.toUpperCase())
    return { id: `${STOCK_PREFIX}${stockTicker.toLowerCase()}`, symbol: stockTicker.toUpperCase(), name: info?.name || stockTicker.toUpperCase(), category: 'stock', image: '' }
  }
  if (cat === 'fiat' && fiatCode)
    return { id: `${FIAT_PREFIX}${fiatCode.toLowerCase()}`, symbol: fiatCode.toUpperCase(), name: fiatCode.toUpperCase(), category: 'fiat', image: '' }
  if (cat === 'bond' && otherInput)
    return { id: `bond:${otherInput.toLowerCase()}`, symbol: otherInput.toUpperCase(), name: otherInput, category: 'bond', image: '' }
  if (cat === 'other' && otherInput)
    return { id: `other:${otherInput.toLowerCase()}`, symbol: otherInput.toUpperCase(), name: otherInput, category: 'other', image: '' }
  return null
}

// ── Leg resolvers ─────────────────────────────────────────────────────────
async function buildReceiveLeg(target, proceedsUsd) {
  const T = (target || '').toUpperCase()
  if (!T) return null
  if (T === 'USD')  return { coin_id: `${FIAT_PREFIX}usd`, symbol: 'USD',  name: 'US Dollar', category: 'fiat',   amount: proceedsUsd, pricePerUnit: 1 }
  if (T === 'USDT') return { coin_id: 'tether',            symbol: 'USDT', name: 'Tether',    category: 'crypto', amount: proceedsUsd, pricePerUnit: 1 }
  if (T === 'USDC') return { coin_id: 'usd-coin',          symbol: 'USDC', name: 'USD Coin',  category: 'crypto', amount: proceedsUsd, pricePerUnit: 1 }
  if (T === 'BTC') {
    const px = await api.getPrices('bitcoin'); const usd = px?.bitcoin?.usd || 0
    if (!usd) return null
    return { coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'crypto', amount: proceedsUsd / usd, pricePerUnit: usd }
  }
  if (T === 'EUR') {
    let eurUsd = null
    try { const r = await api.getPrices(`${FIAT_PREFIX}eur`); eurUsd = r?.[`${FIAT_PREFIX}eur`]?.usd || null } catch {}
    if (!eurUsd) eurUsd = 1.08
    return { coin_id: `${FIAT_PREFIX}eur`, symbol: 'EUR', name: 'Euro', category: 'fiat', amount: proceedsUsd / eurUsd, pricePerUnit: eurUsd }
  }
  const lower = T.toLowerCase()
  try {
    const search = await api.searchCoins?.(lower)
    const hit = Array.isArray(search) ? search.find(c => (c.symbol || '').toLowerCase() === lower) : null
    if (hit) {
      const px = await api.getPrices(hit.id); const usd = px?.[hit.id]?.usd || 0
      if (usd > 0) return { coin_id: hit.id, symbol: T, name: hit.name || T, category: 'crypto', amount: proceedsUsd / usd, pricePerUnit: usd }
    }
  } catch {}
  return { coin_id: `other:${lower}`, symbol: T, name: T, category: 'other', amount: proceedsUsd, pricePerUnit: 1 }
}

async function buildSpendLeg(source, costUsd) {
  const T = (source || '').toUpperCase()
  if (!T || T === 'NONE') return null
  if (T === 'USD')  return { coin_id: `${FIAT_PREFIX}usd`, symbol: 'USD',  name: 'US Dollar', category: 'fiat',   amount: costUsd, pricePerUnit: 1 }
  if (T === 'USDT') return { coin_id: 'tether',            symbol: 'USDT', name: 'Tether',    category: 'crypto', amount: costUsd, pricePerUnit: 1 }
  if (T === 'USDC') return { coin_id: 'usd-coin',          symbol: 'USDC', name: 'USD Coin',  category: 'crypto', amount: costUsd, pricePerUnit: 1 }
  if (T === 'BTC') {
    const px = await api.getPrices('bitcoin'); const usd = px?.bitcoin?.usd || 0
    if (!usd) return null
    return { coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'crypto', amount: costUsd / usd, pricePerUnit: usd }
  }
  if (T === 'EUR') {
    let eurUsd = null
    try { const r = await api.getPrices(`${FIAT_PREFIX}eur`); eurUsd = r?.[`${FIAT_PREFIX}eur`]?.usd || null } catch {}
    if (!eurUsd) eurUsd = 1.08
    return { coin_id: `${FIAT_PREFIX}eur`, symbol: 'EUR', name: 'Euro', category: 'fiat', amount: costUsd / eurUsd, pricePerUnit: eurUsd }
  }
  const lower = T.toLowerCase()
  try {
    const search = await api.searchCoins?.(lower)
    const hit = Array.isArray(search) ? search.find(c => (c.symbol || '').toLowerCase() === lower) : null
    if (hit) {
      const px = await api.getPrices(hit.id); const usd = px?.[hit.id]?.usd || 0
      if (usd > 0) return { coin_id: hit.id, symbol: T, name: hit.name || T, category: 'crypto', amount: costUsd / usd, pricePerUnit: usd }
    }
  } catch {}
  return { coin_id: `other:${lower}`, symbol: T, name: T, category: 'other', amount: costUsd, pricePerUnit: 1 }
}

// ── TradeSheet ────────────────────────────────────────────────────────────
export default function TradeSheet({ open, type, onClose, wallets, onDone, holdings, prefillCoin }) {
  const [category, setCategory]         = useState('crypto')
  const [coinSearch, setCoinSearch]     = useState('')
  const [coinResults, setCoinResults]   = useState([])
  const [selectedCoin, setSelectedCoin] = useState(null)
  // Stock / fiat / other sub-fields
  const [stockTicker, setStockTicker]   = useState('')
  const [stockInput, setStockInput]     = useState('')
  const [stockSector, setStockSector]   = useState('All')
  const [fiatCode, setFiatCode]         = useState('USD')
  const [otherName, setOtherName]       = useState('')
  // Common fields
  const [walletId, setWalletId]         = useState('')
  const [amount, setAmount]             = useState('')
  const [price, setPrice]               = useState('')
  const [date, setDate]                 = useState(new Date().toISOString().split('T')[0])
  const [buyWith, setBuyWith]           = useState('NONE')
  const [buyWithCustom, setBuyWithCustom] = useState('')
  const [sellFor, setSellFor]           = useState('USD')
  const [sellForCustom, setSellForCustom] = useState('')
  const [busy, setBusy]                 = useState(false)
  const [msg, setMsg]                   = useState('')
  const [success, setSuccess]           = useState(false)
  const searchTimer                     = useRef(null)
  const dragStartY                      = useRef(null)

  const isBuy  = type === 'buy'
  const accent = isBuy ? '#34d399' : '#f87171'
  const catInfo = CATEGORIES.find(c => c.key === category) || CATEGORIES[0]

  // Reset form when sheet opens
  useEffect(() => {
    if (!open) return
    setCoinSearch(''); setCoinResults([]); setMsg(''); setSuccess(false)
    setAmount(''); setPrice(''); setBuyWith('NONE'); setBuyWithCustom('')
    setSellFor('USD'); setSellForCustom('')
    setStockTicker(''); setStockInput(''); setFiatCode('USD'); setOtherName('')
    setDate(new Date().toISOString().split('T')[0])
    if (wallets.length) setWalletId(String(wallets[0].id))
    if (prefillCoin) {
      setSelectedCoin(prefillCoin)
      setCategory('crypto')
    } else {
      setSelectedCoin(null)
      setCategory('crypto')
    }
  }, [open]) // eslint-disable-line

  const [priceFetchFailed, setPriceFetchFailed] = useState(false)

  // Auto-fill price when coin / non-crypto asset selected
  useEffect(() => {
    const resolvedId = resolveAssetId()
    if (!resolvedId) { setPrice(''); setPriceFetchFailed(false); return }
    setPrice('…'); setPriceFetchFailed(false)
    api.getPrices(resolvedId).then(px => {
      const p = px?.[resolvedId]?.usd ?? px?.[resolvedId]?.price
      if (p) { setPrice(String(p)); setPriceFetchFailed(false) }
      else { setPrice(''); setPriceFetchFailed(true) }
    }).catch(() => { setPrice(''); setPriceFetchFailed(true) })
  }, [selectedCoin, category, stockTicker, fiatCode]) // eslint-disable-line

  // Debounced crypto coin search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (category !== 'crypto' || !coinSearch || selectedCoin) return
    searchTimer.current = setTimeout(async () => {
      const res = await api.searchCoins(coinSearch).catch(() => [])
      setCoinResults(res.slice(0, 8))
    }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [coinSearch, selectedCoin, category])

  function resolveAssetId() {
    if (category === 'crypto') return selectedCoin?.id || null
    if (category === 'gold')   return GOLD_ID
    if (category === 'silver') return SILVER_ID
    if (category === 'stock' && stockTicker) return `${STOCK_PREFIX}${stockTicker.toLowerCase()}`
    if (category === 'fiat' && fiatCode)    return `${FIAT_PREFIX}${fiatCode.toLowerCase()}`
    if (category === 'bond' && otherName)   return `bond:${otherName.toLowerCase()}`
    if (category === 'other' && otherName)  return `other:${otherName.toLowerCase()}`
    return null
  }

  function resolveAssetMeta() {
    if (category === 'crypto') return selectedCoin ? { id: selectedCoin.id, symbol: selectedCoin.symbol?.toUpperCase(), name: selectedCoin.name, image: selectedCoin.thumb || selectedCoin.image || '', category: 'crypto' } : null
    return presetForCategory(category, stockTicker, fiatCode, otherName)
  }

  const asset = resolveAssetMeta()
  const holdingForCoin = holdings?.find(h => h.coin_id === asset?.id)
  const total = amount && price ? parseFloat(amount) * parseFloat(price) : 0

  // Swipe-down to close
  function onTouchStart(e) { dragStartY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (dragStartY.current !== null) {
      if (e.changedTouches[0].clientY - dragStartY.current > 80) onClose()
      dragStartY.current = null
    }
  }

  async function submit() {
    if (!asset || !amount || !price || price === '…') { setMsg('Fill all fields.'); return }
    setBusy(true); setMsg('')
    try {
      const wid = walletId || (wallets[0]?.id ?? '1')
      const amt = parseFloat(amount)
      const ppu = parseFloat(price)

      await api.addTransaction({
        wallet_id: wid, type,
        coin_id: asset.id,
        coin_symbol: asset.symbol,
        coin_name: asset.name,
        coin_image: asset.image || '',
        amount: amt, price_per_unit: ppu,
        date, category: asset.category || category,
      })

      // Buy-with spend leg
      if (isBuy && buyWith !== 'NONE') {
        const src = buyWith === 'CUSTOM' ? buyWithCustom.trim().toUpperCase() : buyWith
        if (src) {
          const leg = await buildSpendLeg(src, amt * ppu)
          if (leg) await api.addTransaction({
            wallet_id: wid, type: 'sell',
            category: leg.category, coin_id: leg.coin_id,
            coin_symbol: leg.symbol, coin_name: leg.name, coin_image: '',
            amount: leg.amount, price_per_unit: leg.pricePerUnit, date,
            notes: `Spent on buying ${asset.symbol}`,
          })
        }
      }

      // Sell-for receive leg
      if (!isBuy && sellFor !== 'REMOVE') {
        const tgt = sellFor === 'CUSTOM' ? sellForCustom.trim().toUpperCase() : sellFor
        if (tgt) {
          const leg = await buildReceiveLeg(tgt, amt * ppu)
          if (leg) await api.addTransaction({
            wallet_id: wid, type: 'buy',
            category: leg.category, coin_id: leg.coin_id,
            coin_symbol: leg.symbol, coin_name: leg.name, coin_image: '',
            amount: leg.amount, price_per_unit: leg.pricePerUnit, date,
            notes: `Proceeds from selling ${asset.symbol}`,
          })
        }
      }

      setSuccess(true)
      track('trade_submitted', {
        trade_type: type,
        asset_symbol: asset.symbol,
        asset_category: asset.category || category,
        trade_value_usd: Math.round(amt * ppu),
      })
      setTimeout(() => { onClose(); onDone() }, 1200)
    } catch { setMsg('Failed. Try again.') }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className={`bs-backdrop ${open ? 'bs-backdrop-open' : ''}`} onClick={onClose} />
      <div className={`bs-sheet ${open ? 'bs-sheet-open' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="bs-handle" />

        <div className="bs-header">
          <div className="bs-header-left">
            <div className="bs-type-dot" style={{ background: accent }} />
            <h3 className="bs-title" style={{ color: accent }}>{isBuy ? 'Buy Asset' : 'Sell Asset'}</h3>
          </div>
          <button className="bs-close" onClick={onClose}>{IcoClose}</button>
        </div>

        {success ? (
          <div className="bs-success">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 17 9"/>
            </svg>
            <p style={{ color:'#fff', fontWeight:700, fontSize:'1.05rem', margin:0 }}>Trade Recorded!</p>
            <p className="muted" style={{ fontSize:'0.82rem', margin:'0.3rem 0 0' }}>
              {isBuy ? 'Bought' : 'Sold'} {amount} {asset?.symbol}
            </p>
          </div>
        ) : (
          <div className="bs-body">
            <div className="bs-type-row">
              <div className="bs-type-pill" style={{ background: isBuy ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: accent, borderColor: accent + '55' }}>
                {isBuy ? 'Buy Order' : 'Sell Order'}
              </div>
            </div>

            {/* ── Category selector ── */}
            {!prefillCoin && (
              <div className="bs-field">
                <label className="bs-label">Asset Category</label>
                <div className="bs-cat-grid">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.key}
                      className={`bs-cat-btn ${category === c.key ? 'active' : ''}`}
                      style={category === c.key ? { borderColor: c.color, background: c.color + '18', color: c.color } : {}}
                      onClick={() => { track('trade_category_select', { category: c.key, trade_type: type }); setCategory(c.key); setSelectedCoin(null); setCoinSearch(''); setStockTicker(''); setStockInput(''); setFiatCode('USD'); setOtherName('') }}
                    >
                      <span>{c.icon}</span> {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Asset selector by category ── */}
            <div className="bs-field">
              <label className="bs-label">Asset</label>

              {/* Crypto: search */}
              {category === 'crypto' && (
                selectedCoin ? (
                  <div className="bs-coin-selected">
                    {(selectedCoin.thumb || selectedCoin.image) && (
                      <img src={selectedCoin.thumb || selectedCoin.image} alt="" className="bs-coin-thumb" />
                    )}
                    <div className="bs-coin-info">
                      <strong>{selectedCoin.name}</strong>
                      <span className="muted">{selectedCoin.symbol?.toUpperCase()}</span>
                    </div>
                    {!prefillCoin && (
                      <button className="bs-coin-clear" onClick={() => { setSelectedCoin(null); setCoinSearch('') }}>
                        {IcoClose}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bs-search-wrap">
                    <span className="bs-search-icon">{IcoSearch}</span>
                    <input className="bs-input bs-search-input" placeholder="Search Bitcoin, Ethereum…"
                      value={coinSearch} onChange={e => setCoinSearch(e.target.value)} />
                    {coinResults.length > 0 && (
                      <div className="bs-dropdown">
                        {coinResults.map(c => (
                          <button key={c.id} className="bs-dropdown-item"
                            onClick={() => { setSelectedCoin(c); setCoinSearch(c.name); setCoinResults([]) }}>
                            <CoinLogo image={c.thumb || c.image} symbol={c.symbol} size={22} className="bs-dropdown-logo" />
                            <span>{c.name}</span>
                            <span className="muted bs-sym">{c.symbol?.toUpperCase()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}

              {/* Gold / Silver: preset, no search needed */}
              {(category === 'gold' || category === 'silver') && (
                <div className="bs-coin-selected">
                  <span style={{ fontSize: '1.6rem' }}>{category === 'gold' ? '🥇' : '🥈'}</span>
                  <div className="bs-coin-info">
                    <strong>{category === 'gold' ? 'Gold (1 troy oz)' : 'Silver (1 troy oz)'}</strong>
                    <span className="muted">{category === 'gold' ? 'XAU' : 'XAG'} · live spot price</span>
                  </div>
                </div>
              )}

              {/* Stock: sector filter + searchable ticker list */}
              {category === 'stock' && (() => {
                const sectors = ['All', ...Array.from(new Set(POPULAR_TICKERS.map(t => t.sector)))]
                const query = stockInput.toUpperCase()
                const filtered = POPULAR_TICKERS.filter(t =>
                  (stockSector === 'All' || t.sector === stockSector) &&
                  (!query || t.ticker.includes(query) || t.name.toUpperCase().includes(query))
                )
                const selectedInfo = POPULAR_TICKERS.find(t => t.ticker === stockTicker)
                return (
                  <div className="bs-stock-wrap">
                    {/* Sector filter pills */}
                    <div className="bs-sector-row">
                      {sectors.map(s => (
                        <button key={s} className={`bs-sector-btn ${stockSector === s ? 'active' : ''}`}
                          onClick={() => setStockSector(s)}>{s}</button>
                      ))}
                    </div>
                    {/* Search input */}
                    <div className="bs-search-wrap" style={{marginBottom:'0.4rem'}}>
                      <span className="bs-search-icon">{IcoSearch}</span>
                      <input className="bs-input bs-search-input"
                        placeholder="Search ticker or company…"
                        value={stockInput}
                        onChange={e => { setStockInput(e.target.value); const v = e.target.value.trim().toUpperCase(); if (!POPULAR_TICKERS.find(t=>t.ticker===v)) setStockTicker(v); }}
                      />
                    </div>
                    {/* Ticker grid */}
                    <div className="bs-ticker-grid">
                      {filtered.slice(0, 30).map(t => (
                        <button key={t.ticker}
                          className={`bs-ticker-btn ${stockTicker === t.ticker ? 'active' : ''}`}
                          title={t.name}
                          onClick={() => { setStockTicker(t.ticker); setStockInput(t.ticker) }}>
                          <span className="bs-ticker-sym">{t.ticker}</span>
                          <span className="bs-ticker-name">{t.name.length > 12 ? t.name.slice(0,11)+'…' : t.name}</span>
                        </button>
                      ))}
                    </div>
                    {stockTicker && (
                      <div className="bs-stock-selected">
                        <span style={{color: catInfo.color, fontWeight:700}}>{stockTicker}</span>
                        {selectedInfo && <span className="muted"> — {selectedInfo.name}</span>}
                        <span className="bs-hint" style={{marginLeft:'auto', color:catInfo.color}}>Live price via Yahoo Finance / Stooq</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Fiat: popular list + custom */}
              {category === 'fiat' && (
                <div className="bs-stock-wrap">
                  <div className="bs-popular-chips">
                    {POPULAR_FIAT.map(f => (
                      <button key={f.code}
                        className={`bs-chip ${fiatCode === f.code ? 'active' : ''}`}
                        onClick={() => { setFiatCode(f.code) }}>
                        {f.symbol} {f.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bond / Other: name input */}
              {(category === 'bond' || category === 'other') && (
                <input className="bs-input"
                  placeholder={category === 'bond' ? 'e.g. US Treasury 10Y, I-Bond' : 'e.g. Real estate, Art, Watch'}
                  value={otherName}
                  onChange={e => setOtherName(e.target.value)}
                />
              )}
            </div>

            {/* Available balance for sells */}
            {!isBuy && holdingForCoin && (
              <div className="bs-balance-row">
                <span className="muted">Available</span>
                <button className="bs-balance-max" onClick={() => setAmount(String(holdingForCoin.amount))}>
                  {holdingForCoin.amount} {holdingForCoin.coin_symbol?.toUpperCase()}
                  <span className="bs-max-tag">MAX</span>
                </button>
              </div>
            )}

            {/* Amount + Price */}
            <div className="bs-row-2">
              <div className="bs-field">
                <label className="bs-label">
                  {category === 'gold' || category === 'silver' ? 'Quantity (oz)' :
                   category === 'stock' ? 'Shares' :
                   category === 'fiat' ? 'Amount' : 'Amount'}
                </label>
                <input className="bs-input" type="number" placeholder="0.00" min="0" step="any"
                  value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="bs-field">
                <label className="bs-label">
                  Price (USD)
                  {price === '…' && <span style={{marginLeft:6,fontSize:'0.75rem',color:'#34d399'}}>fetching…</span>}
                  {priceFetchFailed && <span style={{marginLeft:6,fontSize:'0.75rem',color:'#f87171'}}>couldn't fetch — enter manually</span>}
                </label>
                <input className="bs-input" type={price === '…' ? 'text' : 'number'} placeholder="Enter price" min="0" step="any"
                  value={price === '…' ? '' : price} onChange={e => { setPrice(e.target.value); setPriceFetchFailed(false) }}
                  disabled={price === '…'} />
              </div>
            </div>

            {/* Date + Wallet */}
            <div className="bs-row-2">
              <div className="bs-field">
                <label className="bs-label">Date</label>
                <input className="bs-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              {wallets.length > 1 && (
                <div className="bs-field">
                  <label className="bs-label">Wallet</label>
                  <select className="bs-input" value={walletId} onChange={e => setWalletId(e.target.value)}>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Buy with */}
            {isBuy && (
              <div className="bs-field">
                <label className="bs-label">Buy with</label>
                <div className="bs-leg-row">
                  <select className="bs-input" value={buyWith} onChange={e => setBuyWith(e.target.value)}>
                    <option value="NONE">None (don't deduct)</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="BTC">BTC</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CUSTOM">Other…</option>
                  </select>
                  {buyWith === 'CUSTOM' && (
                    <input className="bs-input bs-leg-custom" type="text"
                      placeholder="e.g. SOL, DAI"
                      value={buyWithCustom} onChange={e => setBuyWithCustom(e.target.value)} />
                  )}
                </div>
                <p className="bs-hint">
                  {buyWith === 'NONE'
                    ? 'Only adds to holdings — no balance deducted.'
                    : <>Cost{total > 0 ? ` $${total.toLocaleString(undefined,{maximumFractionDigits:2})}` : ''} deducted from <strong>{buyWith === 'CUSTOM' ? (buyWithCustom.trim().toUpperCase() || '…') : buyWith}</strong>.</>}
                </p>
              </div>
            )}

            {/* Sell for */}
            {!isBuy && (
              <div className="bs-field">
                <label className="bs-label">Sell for</label>
                <div className="bs-leg-row">
                  <select className="bs-input" value={sellFor} onChange={e => setSellFor(e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="BTC">BTC</option>
                    <option value="EUR">EUR</option>
                    <option value="CUSTOM">Other…</option>
                    <option value="REMOVE">Remove (don't credit)</option>
                  </select>
                  {sellFor === 'CUSTOM' && (
                    <input className="bs-input bs-leg-custom" type="text"
                      placeholder="e.g. SOL, DAI"
                      value={sellForCustom} onChange={e => setSellForCustom(e.target.value)} />
                  )}
                </div>
                <p className="bs-hint">
                  {sellFor === 'REMOVE'
                    ? 'Deducted from holdings only — no other balance credited.'
                    : <>Proceeds{total > 0 ? ` $${total.toLocaleString(undefined,{maximumFractionDigits:2})}` : ''} credited to <strong>{sellFor === 'CUSTOM' ? (sellForCustom.trim().toUpperCase() || '…') : sellFor}</strong>.</>}
                </p>
              </div>
            )}

            {/* Total */}
            {total > 0 && (
              <div className="bs-total">
                <span className="muted">Total</span>
                <strong style={{ color: accent, fontSize:'1.2rem' }}>
                  ${total.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}
                </strong>
              </div>
            )}

            {msg && <p style={{ color:'#f87171', fontSize:'0.8rem', margin:'0.25rem 0' }}>{msg}</p>}

            <button className="bs-submit"
              style={{ background: isBuy ? 'linear-gradient(135deg,#34d399,#10b981)' : 'linear-gradient(135deg,#f87171,#ef4444)', color: isBuy ? '#000' : '#fff' }}
              onClick={submit}
              disabled={busy || !asset || !amount || !price}>
              {busy ? 'Recording…' : isBuy ? 'Confirm Buy' : 'Confirm Sell'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
