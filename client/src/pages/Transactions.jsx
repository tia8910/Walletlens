import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

export default function Transactions() {
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

  useEffect(() => {
    loadData()
  }, [filterWallet])

  async function loadData() {
    const [t, w] = await Promise.all([
      api.getTransactions(filterWallet || undefined),
      api.getWallets(),
    ])
    setTransactions(t)
    setWallets(w)
    if (w.length > 0 && !form.wallet_id) {
      setForm(f => ({ ...f, wallet_id: w[0].id }))
    }
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
    setForm(f => ({ ...f, coin_id: coin.id, coin_symbol: coin.symbol }))
    setCoinSearch(`${coin.name} (${coin.symbol.toUpperCase()})`)
    setCoinResults([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await api.addTransaction({
      ...form,
      amount: parseFloat(form.amount),
      price_per_unit: parseFloat(form.price_per_unit),
    })
    setForm({ wallet_id: form.wallet_id, type: 'buy', coin_id: '', coin_symbol: '', amount: '', price_per_unit: '', exchange: '', notes: '', date: new Date().toISOString().split('T')[0] })
    setCoinSearch('')
    setShowForm(false)
    loadData()
  }

  async function handleDelete(id) {
    await api.deleteTransaction(id)
    loadData()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Transactions</h2>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Transaction'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3>New Transaction</h3>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-group">
              <label>Wallet</label>
              <select value={form.wallet_id} onChange={e => setForm(f => ({ ...f, wallet_id: e.target.value }))}>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div className="form-group" style={{ position: 'relative' }}>
              <label>Coin</label>
              <input type="text" value={coinSearch} onChange={e => handleCoinSearch(e.target.value)} placeholder="Search coin..." required />
              {coinResults.length > 0 && (
                <div className="dropdown">
                  {coinResults.map(c => (
                    <div key={c.id} className="dropdown-item" onClick={() => selectCoin(c)}>
                      {c.thumb && <img src={c.thumb} alt="" width={20} height={20} />}
                      <span>{c.name}</span>
                      <small>{c.symbol.toUpperCase()}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input type="number" step="any" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="form-group">
              <label>Price per unit (USD)</label>
              <input type="number" step="any" value={form.price_per_unit} onChange={e => setForm(f => ({ ...f, price_per_unit: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="form-group">
              <label>Total Cost</label>
              <input type="text" value={form.amount && form.price_per_unit ? `$${(parseFloat(form.amount) * parseFloat(form.price_per_unit)).toFixed(2)}` : ''} readOnly className="readonly" />
            </div>
            <div className="form-group">
              <label>Exchange</label>
              <input type="text" value={form.exchange} onChange={e => setForm(f => ({ ...f, exchange: e.target.value }))} placeholder="e.g. Binance" />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
            <div className="form-group full-width">
              <button type="submit">Add Transaction</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="filter-row">
          <label>Filter by wallet:</label>
          <select value={filterWallet} onChange={e => setFilterWallet(e.target.value)}>
            <option value="">All wallets</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        {transactions.length === 0 ? <p className="muted">No transactions recorded yet.</p> : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Coin</th>
                <th>Amount</th>
                <th>Price</th>
                <th>Total</th>
                <th>Exchange</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td><span className={`badge ${t.type}`}>{t.type.toUpperCase()}</span></td>
                  <td><strong>{t.coin_symbol.toUpperCase()}</strong></td>
                  <td>{t.amount}</td>
                  <td>${parseFloat(t.price_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${parseFloat(t.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>{t.exchange || '-'}</td>
                  <td><button className="btn-danger btn-sm" onClick={() => handleDelete(t.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
