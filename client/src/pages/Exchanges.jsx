import { useState, useEffect } from 'react'
import { api } from '../api'
import { track } from '../analytics'

const PARTNER_EXCHANGES = [
  {
    name: 'Binance',
    desc: 'World\'s largest crypto exchange. Low fees, 350+ coins.',
    bonus: 'Earn USDC rewards on sign-up',
    color: '#f0b90b',
    url: 'https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_SYKM0&utm_source=referral_entrance&utm_medium=web_share_copy',
    logo: 'B',
  },
  {
    name: 'OKX',
    desc: 'Top-tier exchange with advanced trading tools & Web3 wallet.',
    bonus: 'Mystery box rewards for new users',
    color: '#fff',
    url: 'https://okx.com/join/85929296',
    logo: 'O',
  },
  {
    name: 'Bybit',
    desc: 'Fast derivatives & spot trading, deep liquidity.',
    bonus: 'Up to $30,000 welcome bonus',
    color: '#f7a600',
    url: 'https://www.bybit.com/invite?ref=3ORQD9',
    logo: 'By',
  },
]

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

      {/* ── Partner Exchanges ── */}
      <div className="partner-exchanges-section">
        <p className="partner-exchanges-label">Recommended Exchanges</p>
        <div className="partner-exchanges-grid">
          {PARTNER_EXCHANGES.map(ex => (
            <a
              key={ex.name}
              href={ex.url}
              target="_blank"
              rel="noopener noreferrer"
              className="partner-exchange-card"
              onClick={() => track('exchange_referral_click', { exchange: ex.name })}
            >
              <div className="partner-ex-logo" style={{ color: ex.color, borderColor: ex.color + '44' }}>
                {ex.logo}
              </div>
              <div className="partner-ex-body">
                <div className="partner-ex-name">{ex.name}</div>
                <div className="partner-ex-desc">{ex.desc}</div>
                <div className="partner-ex-bonus">🎁 {ex.bonus}</div>
              </div>
              <div className="partner-ex-cta" style={{ color: ex.color }}>
                Sign Up →
              </div>
            </a>
          ))}
        </div>
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
