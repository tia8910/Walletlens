import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Exchanges() {
  const [exchanges, setExchanges] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [form, setForm] = useState({ name: 'Binance', api_key: '', api_secret: '' })

  useEffect(() => { loadExchanges() }, [])

  async function loadExchanges() {
    const data = await api.getExchanges()
    setExchanges(data)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await api.addExchange(form)
    setForm({ name: 'Binance', api_key: '', api_secret: '' })
    setShowForm(false)
    loadExchanges()
  }

  async function handleDelete(id) {
    await api.deleteExchange(id)
    loadExchanges()
  }

  async function handleSync(id) {
    setSyncResult(null)
    try {
      const result = await api.syncExchange(id)
      setSyncResult(result)
    } catch (err) {
      setSyncResult({ error: 'Sync failed' })
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Exchange Connections</h2>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Connect Exchange'}
        </button>
      </div>

      <p className="muted">Connect your exchange accounts to sync balances and import transactions. API keys are stored locally.</p>

      {showForm && (
        <div className="card">
          <h3>Connect Exchange</h3>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-group">
              <label>Exchange</label>
              <select value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}>
                <option value="Binance">Binance</option>
                <option value="Coinbase">Coinbase</option>
                <option value="Kraken">Kraken</option>
                <option value="KuCoin">KuCoin</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input type="text" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder="Your API key" />
            </div>
            <div className="form-group full-width">
              <label>API Secret</label>
              <input type="password" value={form.api_secret} onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))} placeholder="Your API secret" />
            </div>
            <div className="form-group full-width">
              <button type="submit">Connect</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {exchanges.length === 0 ? <p className="muted">No exchanges connected yet.</p> : (
          <div className="exchange-list">
            {exchanges.map(ex => (
              <div key={ex.id} className="exchange-item">
                <div className="exchange-info">
                  <strong>{ex.name}</strong>
                  <span className={`status ${ex.is_connected ? 'connected' : 'disconnected'}`}>
                    {ex.is_connected ? 'Connected' : 'No API key'}
                  </span>
                </div>
                <div className="exchange-actions">
                  {ex.is_connected && (
                    <button className="btn-secondary btn-sm" onClick={() => handleSync(ex.id)}>Sync</button>
                  )}
                  <button className="btn-danger btn-sm" onClick={() => handleDelete(ex.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {syncResult && (
        <div className="card">
          <h3>Sync Result</h3>
          {syncResult.error ? (
            <p className="negative">{syncResult.error}</p>
          ) : (
            <>
              <p className="positive">{syncResult.message}</p>
              {syncResult.balances?.length > 0 && (
                <table>
                  <thead>
                    <tr><th>Asset</th><th>Balance</th></tr>
                  </thead>
                  <tbody>
                    {syncResult.balances.map(b => (
                      <tr key={b.symbol}>
                        <td>{b.symbol.toUpperCase()}</td>
                        <td>{b.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
