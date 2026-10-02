import { useState } from 'react'

const ENDPOINT = '/api/push/reports'
const TOKEN_KEY = 'wl_admin_reports_token'

// Review queue for AI answers people reported from the app. Gated by the push
// worker's REPORTS_TOKEN, entered once and remembered on this device.
// Reachable at /admin/reports (unlinked).
const wrap = { maxWidth: 860, margin: '0 auto', padding: '2rem 1.25rem 4rem', color: '#e6e9ee', fontFamily: 'inherit' }
const input = { flex: 1, padding: '0.7rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', font: 'inherit' }
const btn = { padding: '0.7rem 1rem', borderRadius: 10, border: 0, background: 'rgba(255,255,255,0.1)', color: '#fff', font: 'inherit', fontWeight: 700, cursor: 'pointer' }
const REASON = { inaccurate: 'Inaccurate or misleading', harmful: 'Harmful or offensive', risky: 'Risky financial advice', other: 'Something else' }

export default function AdminReports() {
  const [token, setToken] = useState(() => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } })
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showDone, setShowDone] = useState(false)

  function saveToken(v) { setToken(v); try { localStorage.setItem(TOKEN_KEY, v) } catch {} }

  async function load() {
    setBusy(true); setError('')
    try {
      const r = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.ok) setReports(d.reports)
      else setError(d.error === 'unauthorized' ? 'Wrong token.' : d.error === 'not_configured' ? 'REPORTS_TOKEN is not set on the push worker.' : (d.error || `Failed (${r.status}).`))
    } catch { setError('Could not reach the push worker.') }
    setBusy(false)
  }

  async function mark(id, status) {
    await fetch(`${ENDPOINT}/review`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }).catch(() => {})
    setReports(rs => rs.map(r => r.id === id ? { ...r, status } : r))
  }

  const shown = (reports || []).filter(r => showDone || r.status !== 'reviewed')
  return (
    <div style={{ minHeight: '100vh', background: '#0b0f14' }}>
      <div style={wrap}>
        <h1 style={{ fontSize: '1.6rem', margin: '0 0 0.3rem', color: '#fff' }}>WalletLens · AI reports</h1>
        <p style={{ color: '#7d8794', fontSize: '0.85rem', margin: '0 0 1.2rem' }}>AI answers people flagged from the app. Read each one and mark it reviewed.</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input style={input} type="password" placeholder="REPORTS_TOKEN" value={token} onChange={e => saveToken(e.target.value)} />
          <button style={btn} onClick={load} disabled={busy || !token}>{busy ? 'Loading…' : 'Load'}</button>
        </div>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {reports && (
          <>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', margin: '1rem 0', fontSize: '0.85rem', color: '#9aa5b1' }}>
              <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show reviewed ({reports.filter(r => r.status === 'reviewed').length})
            </label>
            {shown.length === 0 && <p style={{ color: '#7d8794' }}>Nothing waiting for review.</p>}
            {shown.map(r => (
              <div key={r.id} style={{ padding: '1rem', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '0.8rem' }}>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#9aa5b1' }}>
                  <b style={{ color: '#fca5a5' }}>{REASON[r.reason] || r.reason}</b>
                  <span>{r.surface}</span><span>{r.lang}</span><span>{new Date(r.at).toLocaleString()}</span>
                  <button style={{ ...btn, marginLeft: 'auto', padding: '0.35rem 0.7rem', fontSize: '0.78rem' }} onClick={() => mark(r.id, r.status === 'reviewed' ? 'new' : 'reviewed')}>
                    {r.status === 'reviewed' ? 'Reopen' : 'Mark reviewed'}
                  </button>
                </div>
                {r.note && <p style={{ margin: '0.6rem 0 0', color: '#fff' }}>“{r.note}”</p>}
                <pre style={{ margin: '0.6rem 0 0', whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#c8ced6', fontFamily: 'inherit' }}>{r.output}</pre>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
