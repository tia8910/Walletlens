import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'

export default function Transactions({ showAdd, onCloseAdd }) {
  const location = useLocation()
  const [transactions, setTransactions] = useState([])
  const [wallets, setWallets] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [filterWallet, setFilterWallet] = useState('')
  const [coinSearch, setCoinSearch] = useState('')
  const [coinResults, setCoinResults] = useState([])
  const [form, setForm] = useState({
    wallet_id: '', type: 'buy', coin_id: '', coin_symbol: '', amount: '', price_per_unit: '', exchange: '', notes: '', date: new Date().toISOString().split('T')[0],
  })
  const searchTimeout = useRef(null)

  useEffect(() => { loadData() }, [filterWallet])

  useEffect(() => {
    if (location.state?.openAdd) {
      setShowForm(true)
      if (location.state?.type) setForm(f => ({ ...f, type: location.state.type }))
      window.history.replaceState({}, '')
    }
  }, [location.state])

  async function loadData() {
    const [t, w] = await Promise.all([
      api.getTransactions(filterWallet || undefined),
      api.getWallets(),
    ])
    setTransactions(t)
    setWallets(w)
    if (w.length > 0 && !form.wallet_id) setForm(f => ({ ...f, wallet_id: w[0].id }))
  }

  function handleCoinSearch(value) {
    setCoinSearch(value)
    clearTimeout(searchTimeout.current)
    if (value.length < 2) { setCoinResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      const results = await api.searchCoins(value)
      setCoinResults(results)
    }, 300)
  }

  function selectCoin(coin) {
    setForm(f => ({ ...f, coin_id: coin.id, coin_symbol: coin.symbol, coin_image: coin.thumb || '' }))
    setCoinSearch(`${coin.name} (${coin.symbol.toUpperCase()})`)
    setCoinResults([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.coin_id || !form.amount || !form.price_per_unit) return
    await api.addTransaction({
      ...form,
      amount: parseFloat(form.amount),
      price_per_unit: parseFloat(form.price_per_unit),
    })
    setForm({ wallet_id: form.wallet_id, type: 'buy', coin_id: '', coin_symbol: '', coin_image: '', amount: '', price_per_unit: '', exchange: '', notes: '', date: new Date().toISOString().split('T')[0] })
    setCoinSearch('')
    setShowForm(false)
    loadData()
  }

  async function handleDelete(id) {
    await api.deleteTransaction(id)
    loadData()
  }

  const totalCalc = form.amount && form.price_per_unit
    ? (parseFloat(form.amount) * parseFloat(form.price_per_unit))
    : 0

  return (
    <div className="page">
      <div className="page-header">
        <h2>Transactions</h2>
        <button className="fab" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'X' : '+'}
        </button>
      </div>

      {/* Add transaction modal/sheet */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Add Transaction</h3>

            {/* Buy/Sell toggle */}
            <div className="type-toggle">
              <button className={`toggle-btn ${form.type === 'buy' ? 'active buy' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'buy' }))}>Buy</button>
              <button className={`toggle-btn ${form.type === 'sell' ? 'active sell' : ''}`} onClick={() => setForm(f => ({ ...f, type: 'sell' }))}>Sell</button>
            </div>

            <form onSubmit={handleSubmit}>
              {wallets.length > 1 && (
                <div className="form-field">
                  <label>Wallet</label>
                  <select value={form.wallet_id} onChange={e => setForm(f => ({ ...f, wallet_id: e.target.value }))}>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-field" style={{ position: 'relative' }}>
                <label>Coin</label>
                <input type="text" value={coinSearch} onChange={e => handleCoinSearch(e.target.value)} placeholder="Search Bitcoin, Ethereum..." autoFocus />
                {coinResults.length > 0 && (
                  <div className="dropdown">
                    {coinResults.map(c => (
                      <div key={c.id} className="dropdown-item" onClick={() => selectCoin(c)}>
                        {c.thumb && <img src={c.thumb} alt="" width={24} height={24} style={{ borderRadius: '50%' }} />}
                        <span>{c.name}</span>
                        <small>{c.symbol.toUpperCase()}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label>Amount</label>
                  <input type="number" step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
                </div>
                <div className="form-field">
                  <label>Price per unit ($)</label>
                  <input type="number" step="any" value={form.price_per_unit} onChange={e => setForm(f => ({ ...f, price_per_unit: e.target.value }))} placeholder="0.00" required />
                </div>
              </div>

              {totalCalc > 0 && (
                <div className="total-preview">
                  <span>Total</span>
                  <span className="total-amount">${totalCalc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="form-row-2">
                <div className="form-field">
                  <label>Exchange</label>
                  <select value={form.exchange} onChange={e => setForm(f => ({ ...f, exchange: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="Binance">Binance</option>
                    <option value="Coinbase">Coinbase</option>
                    <option value="Kraken">Kraken</option>
                    <option value="KuCoin">KuCoin</option>
                    <option value="Bybit">Bybit</option>
                    <option value="OKX">OKX</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <div className="form-field">
                <label>Notes (optional)</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="DCA, dip buy, etc." />
              </div>

              <button type="submit" className={`submit-btn ${form.type}`}>
                {form.type === 'buy' ? 'Record Buy' : 'Record Sell'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Filter */}
      {wallets.length > 1 && (
        <div className="filter-pills">
          <button className={`pill ${!filterWallet ? 'active' : ''}`} onClick={() => setFilterWallet('')}>All</button>
          {wallets.map(w => (
            <button key={w.id} className={`pill ${filterWallet === String(w.id) ? 'active' : ''}`} onClick={() => setFilterWallet(String(w.id))}>{w.name}</button>
          ))}
        </div>
      )}

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#9670;</div>
          <p>No transactions yet</p>
          <p className="muted">Tap + to add your first trade</p>
        </div>
      ) : (
        <div className="tx-list">
          {transactions.map(t => (
            <div key={t.id} className="tx-card">
              <div className="tx-left">
                {t.coin_image ? (
                  <img src={t.coin_image} alt="" width={36} height={36} className="tx-coin-img" />
                ) : (
                  <div className={`tx-type-icon ${t.type}`}>
                    {t.type === 'buy' ? '+' : '-'}
                  </div>
                )}
                <div className="tx-info">
                  <div className="tx-title">
                    <strong>{t.coin_symbol.toUpperCase()}</strong>
                    <span className={`tx-badge ${t.type}`}>{t.type.toUpperCase()}</span>
                  </div>
                  <div className="tx-meta">
                    {t.date} {t.exchange && `\u00B7 ${t.exchange}`}
                  </div>
                </div>
              </div>
              <div className="tx-right">
                <div className="tx-amount">{t.amount} {t.coin_symbol.toUpperCase()}</div>
                <div className="tx-cost muted">
                  ${parseFloat(t.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  <span> @ ${parseFloat(t.price_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <button className="tx-delete" onClick={() => handleDelete(t.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
