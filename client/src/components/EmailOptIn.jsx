import { useState } from 'react'
import { track } from '../analytics'

const ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'

// Reusable newsletter / waitlist opt-in form.
// Posts to the Deno endpoint (mode: "email") which stores the address in Deno KV.
// `source` tags where the signup came from so campaigns can be measured in GA.
export default function EmailOptIn({ source = 'landing', compact = false }) {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | ok | error
  const [msg, setMsg]       = useState('')

  async function submit(e) {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error'); setMsg('Please enter a valid email address.')
      return
    }
    setStatus('sending'); setMsg('')
    track('email_signup_submit', { source })
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'email', email: value, source }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setStatus('ok')
        setMsg(data.duplicate ? "You're already on the list — thanks!" : "You're in! Watch your inbox. 🎉")
        track('email_signup_success', { source, duplicate: data.duplicate ? 'yes' : 'no' })
      } else {
        setStatus('error')
        setMsg(data.error === 'invalid_email' ? 'Please enter a valid email address.' : 'Something went wrong — please try again.')
        track('email_signup_error', { source, error_code: data.error || 'unknown' })
      }
    } catch {
      setStatus('error')
      setMsg('Network error — please try again.')
      track('email_signup_error', { source, error_code: 'network' })
    }
  }

  if (status === 'ok') {
    return (
      <p style={{ textAlign: 'center', color: 'var(--g-ink)', fontWeight: 700, fontWeight: 600, margin: compact ? '0.5rem 0' : '1rem 0' }}>
        {msg}
      </p>
    )
  }

  return (
    <form onSubmit={submit} style={{ width: '100%', maxWidth: 440, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="your@email.com"
          value={email}
          onChange={e => { setEmail(e.target.value); if (status === 'error') { setStatus('idle'); setMsg('') } }}
          aria-label="Email address"
          style={{
            flex: '1 1 200px', minWidth: 0, borderRadius: '12px',
            padding: '0.7rem 0.9rem', fontSize: '0.92rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
            color: '#fff', outline: 'none',
          }}
        />
        <button
          type="submit"
          className="lp-cta-primary"
          disabled={status === 'sending'}
          style={{ flexShrink: 0, opacity: status === 'sending' ? 0.7 : 1 }}
        >
          {status === 'sending' ? 'Joining…' : 'Get early access'}
        </button>
      </div>
      {status === 'error' && (
        <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'center' }}>{msg}</p>
      )}
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', marginTop: '0.6rem', textAlign: 'center' }}>
        No spam. Unsubscribe anytime. We only store your email — never your portfolio.
      </p>
    </form>
  )
}
