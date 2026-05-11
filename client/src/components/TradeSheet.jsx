import { useEffect, useRef, useState } from 'react'
import { api, FIAT_PREFIX } from '../api'
import CoinLogo from './CoinLogo'

const IcoClose  = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IcoSearch = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

// ── Leg resolvers (same logic as Transactions.jsx) ────────────────────────
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
// Props:
//   open        – boolean
//   type        – 'buy' | 'sell'
//   onClose     – fn()
//   wallets     – array of wallet objects
//   onDone      – fn() called after successful submit
//   holdings    – array of holding objects (for sell balance display)
//   prefillCoin – { id, symbol, name, thumb? } — locks the asset field
export default function TradeSheet({ open, type, onClose, wallets, onDone, holdings, prefillCoin }) {
  const [coinSearch, setCoinSearch]     = useState('')
  const [coinResults, setCoinResults]   = useState([])
  const [selectedCoin, setSelectedCoin] = useState(null)
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

  // Reset form when sheet opens
  useEffect(() => {
    if (!open) return
    setCoinSearch(''); setCoinResults([]); setMsg(''); setSuccess(false)
    setAmount(''); setPrice(''); setBuyWith('NONE'); setBuyWithCustom('')
    setSellFor('USD'); setSellForCustom('')
    setDate(new Date().toISOString().split('T')[0])
    if (wallets.length) setWalletId(String(wallets[0].id))
    if (prefillCoin) {
      setSelectedCoin(prefillCoin)
    } else {
      setSelectedCoin(null)
    }
  }, [open]) // eslint-disable-line

  // Auto-fill price when coin selected
  useEffect(() => {
    if (!selectedCoin) return
    api.getPrices(selectedCoin.id).then(px => {
      const p = px?.[selectedCoin.id]?.usd ?? px?.[selectedCoin.id]?.price
      if (p) setPrice(String(p))
    }).catch(() => {})
  }, [selectedCoin])

  // Debounced coin search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!coinSearch || selectedCoin) return
    searchTimer.current = setTimeout(async () => {
      const res = await api.searchCoins(coinSearch).catch(() => [])
      setCoinResults(res.slice(0, 8))
    }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [coinSearch, selectedCoin])

  const holdingForCoin = holdings?.find(h => h.coin_id === selectedCoin?.id)
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
    if (!selectedCoin || !amount || !price) { setMsg('Fill all fields.'); return }
    setBusy(true); setMsg('')
    try {
      const wid = walletId || (wallets[0]?.id ?? '1')
      const amt = parseFloat(amount)
      const ppu = parseFloat(price)

      await api.addTransaction({
        wallet_id: wid, type,
        coin_id: selectedCoin.id,
        coin_symbol: selectedCoin.symbol?.toUpperCase(),
        coin_name: selectedCoin.name,
        coin_image: selectedCoin.thumb || selectedCoin.image || '',
        amount: amt, price_per_unit: ppu,
        date, category: 'crypto',
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
            notes: `Spent on buying ${selectedCoin.symbol?.toUpperCase() || selectedCoin.id}`,
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
            notes: `Proceeds from selling ${selectedCoin.symbol?.toUpperCase() || selectedCoin.id}`,
          })
        }
      }

      setSuccess(true)
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
              {isBuy ? 'Bought' : 'Sold'} {amount} {selectedCoin?.symbol?.toUpperCase()}
            </p>
          </div>
        ) : (
          <div className="bs-body">
            <div className="bs-type-row">
              <div className="bs-type-pill" style={{ background: isBuy ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: accent, borderColor: accent + '55' }}>
                {isBuy ? 'Buy Order' : 'Sell Order'}
              </div>
            </div>

            {/* Asset field */}
            <div className="bs-field">
              <label className="bs-label">Asset</label>
              {selectedCoin ? (
                <div className="bs-coin-selected">
                  {(selectedCoin.thumb || selectedCoin.image) && (
                    <img src={selectedCoin.thumb || selectedCoin.image} alt="" className="bs-coin-thumb" />
                  )}
                  <div className="bs-coin-info">
                    <strong>{selectedCoin.name}</strong>
                    <span className="muted">{selectedCoin.symbol?.toUpperCase()}</span>
                  </div>
                  {!prefillCoin && (
                    <button className="bs-coin-clear" onClick={() => { setSelectedCoin(null); setCoinSearch(''); setPrice('') }}>
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
                <label className="bs-label">Amount</label>
                <input className="bs-input" type="number" placeholder="0.00" min="0" step="any"
                  value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="bs-field">
                <label className="bs-label">Price ($)</label>
                <input className="bs-input" type="number" placeholder="0.00" min="0" step="any"
                  value={price} onChange={e => setPrice(e.target.value)} />
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
                    ? <>Deducted from holdings only — no other balance credited.</>
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
              disabled={busy || !selectedCoin || !amount || !price}>
              {busy ? 'Recording…' : isBuy ? 'Confirm Buy' : 'Confirm Sell'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
