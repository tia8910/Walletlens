import { useState } from 'react'
import Icon from '../components/Icon'

const ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'
const TOKEN_KEY = 'wl_admin_mail_token'

// Lightweight admin console for sending newsletter campaigns from
// contact@walletlens.live. Gated by the SIGNUP_EXPORT_TOKEN — entered once
// and remembered in localStorage. Reachable at /admin/mail (unlinked).
export default function AdminMail() {
  const [token, setToken]     = useState(() => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } })
  const [subject, setSubject] = useState('')
  const [html, setHtml]       = useState('')
  const [testTo, setTestTo]   = useState('contact@walletlens.live')
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState(null)
  const [stats, setStats]     = useState(null)
  const [guardians, setGuardians] = useState(null)

  function saveToken(v) {
    setToken(v)
    try { localStorage.setItem(TOKEN_KEY, v) } catch {}
  }

  async function post(payload) {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await resp.json().catch(() => ({}))
    return { ok: resp.ok, data }
  }

  async function loadStats() {
    setBusy(true); setResult(null)
    const { ok, data } = await post({ mode: 'email_export', token })
    setBusy(false)
    if (ok && data.ok) setStats({ count: data.count })
    else setResult({ type: 'error', msg: data.error === 'unauthorized' ? 'Wrong token.' : (data.error || 'Failed to load.') })
  }

  async function loadGuardians() {
    setBusy(true); setResult(null)
    const { ok, data } = await post({ mode: 'guardian_export', token })
    setBusy(false)
    if (ok && data.ok) setGuardians({ count: data.count, active: data.active, rows: data.guardians || [] })
    else setResult({ type: 'error', msg: data.error === 'unauthorized' ? 'Wrong token.' : (data.error || 'Failed to load.') })
  }

  function downloadGuardianCsv() {
    if (!guardians?.rows?.length) return
    const cols = ['ownerEmail', 'ownerName', 'active', 'intervalDays', 'heirCount', 'createdAt', 'lastCheckin', 'warnedAt', 'notifiedAt']
    // Quote every field and double internal quotes: a name containing a comma
    // would otherwise shift every later column by one.
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cols.join(','), ...guardians.rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `guardian-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function sendTest() {
    if (!subject.trim() || !html.trim()) { setResult({ type: 'error', msg: 'Subject and message are required.' }); return }
    if (!testTo.trim()) { setResult({ type: 'error', msg: 'Enter a test address.' }); return }
    setBusy(true); setResult(null)
    const { ok, data } = await post({ mode: 'send_campaign', token, subject, html, test: testTo.trim() })
    setBusy(false)
    if (ok && data.ok) setResult({ type: 'ok', msg: `Test sent to ${testTo}. Check your inbox.` })
    else setResult({ type: 'error', msg: errText(data) })
  }

  async function sendAll() {
    if (!subject.trim() || !html.trim()) { setResult({ type: 'error', msg: 'Subject and message are required.' }); return }
    const n = stats?.count ?? 'all'
    if (!confirm(`Send "${subject}" to ${n} subscriber(s)? This cannot be undone.`)) return
    setBusy(true); setResult(null)
    const { ok, data } = await post({ mode: 'send_campaign', token, subject, html })
    setBusy(false)
    if (ok && data.ok) setResult({ type: 'ok', msg: `Done — sent ${data.sent}/${data.total}${data.failed ? `, ${data.failed} failed` : ''}.` })
    else setResult({ type: 'error', msg: errText(data) })
  }

  function errText(data) {
    if (data.error === 'unauthorized') return 'Wrong token.'
    if (data.error === 'mail_not_configured') return 'RESEND_API_KEY not set in Deno Deploy yet.'
    if (data.error === 'missing_subject_or_html') return 'Subject and message are required.'
    return data.error || 'Send failed.'
  }

  const wrap   = { maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#e6edf3' }
  const label  = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#9aa4b2', margin: '1.1rem 0 0.4rem', letterSpacing: '0.02em' }
  const input  = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '10px', padding: '0.6rem 0.8rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }
  const btn    = (bg, fg = '#04210f') => ({ background: bg, color: fg, border: 'none', borderRadius: '11px', padding: '0.7rem 1.3rem', fontWeight: 800, fontSize: '0.9rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 })

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f14' }}>
      <div style={wrap}>
        <h1 style={{ fontSize: '1.6rem', margin: '0 0 0.3rem', color: '#fff' }}>
          <span style={{ color: 'var(--g-ink)' }}>WalletLens</span> · Mail
        </h1>
        <p style={{ color: '#7d8794', fontSize: '0.85rem', margin: 0 }}>Send campaigns from contact@walletlens.live to your newsletter list.</p>

        <label style={label}>Admin token</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input style={input} type="password" placeholder="SIGNUP_EXPORT_TOKEN" value={token} onChange={e => saveToken(e.target.value)} />
          <button style={btn('rgba(255,255,255,0.1)', '#fff')} onClick={loadStats} disabled={busy || !token}>Check</button>
        </div>
        {stats && <p style={{ color: 'var(--g-ink)', fontSize: '0.82rem', marginTop: '0.5rem' }}>✓ {stats.count} subscriber(s) on the list</p>}

        <div style={{ marginTop: '1.6rem', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.9rem', color: '#fff' }}>Portfolio Guardian subscribers</strong>
            <button style={btn('rgba(255,255,255,0.1)', '#fff')} onClick={loadGuardians} disabled={busy || !token}>Load</button>
            {guardians && (
              <button style={btn('rgba(255,255,255,0.1)', '#fff')} onClick={downloadGuardianCsv} disabled={!guardians.rows.length}>CSV</button>
            )}
          </div>
          {guardians && (
            <p style={{ color: 'var(--g-ink)', fontSize: '0.82rem', margin: '0.6rem 0 0' }}>
              {guardians.count} subscriber(s) · {guardians.active} active
            </p>
          )}
          {guardians?.rows?.length > 0 && (
            <div style={{ maxHeight: 260, overflow: 'auto', marginTop: '0.7rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ color: '#7d8794', textAlign: 'left' }}>
                    <th style={{ padding: '0.3rem 0.4rem' }}>Email</th>
                    <th style={{ padding: '0.3rem 0.4rem' }}>Heirs</th>
                    <th style={{ padding: '0.3rem 0.4rem' }}>Every</th>
                    <th style={{ padding: '0.3rem 0.4rem' }}>Last seen</th>
                    <th style={{ padding: '0.3rem 0.4rem' }}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {guardians.rows.map(r => (
                    <tr key={r.deviceId || r.ownerEmail} style={{ borderTop: '1px solid rgba(255,255,255,0.07)', color: '#c9d1d9' }}>
                      <td style={{ padding: '0.35rem 0.4rem' }}>{r.ownerEmail}</td>
                      <td style={{ padding: '0.35rem 0.4rem' }}>{r.heirCount}</td>
                      <td style={{ padding: '0.35rem 0.4rem' }}>{r.intervalDays}d</td>
                      <td style={{ padding: '0.35rem 0.4rem' }}>{(r.lastCheckin || '').slice(0, 10)}</td>
                      <td style={{ padding: '0.35rem 0.4rem', color: r.active ? 'var(--g-ink)' : '#7d8794' }}>
                        {r.notifiedAt ? 'notified' : r.warnedAt ? 'warned' : r.active ? 'active' : 'cancelled'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ color: '#7d8794', fontSize: '0.74rem', margin: '0.7rem 0 0', lineHeight: 1.5 }}>
            These addresses were given so Guardian can warn the owner before contacting their heirs.
            The campaign sender below goes to the newsletter list only — it does not reach this list.
          </p>
        </div>

        <label style={label}>Subject</label>
        <input style={input} placeholder="This week's market sentiment" value={subject} onChange={e => setSubject(e.target.value)} />

        <label style={label}>Message (HTML allowed — wrapped in the WalletLens template automatically)</label>
        <textarea style={{ ...input, minHeight: 220, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem', lineHeight: 1.5 }}
          placeholder={'<h1>Hello!</h1>\n<p>Markets moved this week...</p>\n<a href="https://walletlens.live/dashboard">Check your portfolio →</a>'}
          value={html} onChange={e => setHtml(e.target.value)} />

        <label style={label}>Send a test to</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: '1 1 220px' }} value={testTo} onChange={e => setTestTo(e.target.value)} />
          <button style={btn('#3b82f6', '#fff')} onClick={sendTest} disabled={busy || !token}>Send test</button>
        </div>

        <div style={{ marginTop: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
          <button style={btn('#4ade80')} onClick={sendAll} disabled={busy || !token}>
            {busy ? 'Sending…' : `Send to all${stats ? ` (${stats.count})` : ''}`}
          </button>
          <span style={{ color: '#6b7480', fontSize: '0.78rem' }}>Always send a test first.</span>
        </div>

        {result && (
          <p style={{ marginTop: '1.2rem', padding: '0.7rem 1rem', borderRadius: '10px', fontSize: '0.86rem',
            background: result.type === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
            border: `1px solid ${result.type === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
            color: result.type === 'ok' ? 'var(--g-ink)' : '#f87171' }}>
            {result.msg}
          </p>
        )}
      </div>
    </div>
  )
}
