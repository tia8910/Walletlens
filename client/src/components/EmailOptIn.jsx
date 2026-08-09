import { useState } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import { track } from '../analytics'

const ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'

// Reusable newsletter / waitlist opt-in form.
// Posts to the Deno endpoint (mode: "email") which stores the address in Deno KV.
// `source` tags where the signup came from so campaigns can be measured in GA.
export default function EmailOptIn({ source = 'landing', compact = false, label = 'Subscribe' }) {
  const { t } = useLanguage()
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | ok | error
  const [msg, setMsg]       = useState('')

  async function submit(e) {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error'); setMsg(t('errValidEmail'))
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
        setMsg(data.duplicate ? "You're already on the list — thanks!" : "You're in! Watch your inbox.")
        track('email_signup_success', { source, duplicate: data.duplicate ? 'yes' : 'no' })
      } else {
        setStatus('error')
        setMsg(data.error === 'invalid_email' ? 'Please enter a valid email address.' : 'Something went wrong — please try again.')
        track('email_signup_error', { source, error_code: data.error || 'unknown' })
      }
    } catch {
      setStatus('error')
      setMsg(t('errNetwork'))
      track('email_signup_error', { source, error_code: 'network' })
    }
  }

  if (status === 'ok') {
    return <p className={`wl-optin-ok${compact ? ' wl-optin-ok-compact' : ''}`}>{msg}</p>
  }

  return (
    <form className="wl-optin" onSubmit={submit}>
      <div className="wl-optin-row">
        <input
          className="wl-optin-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="your@email.com"
          value={email}
          onChange={e => { setEmail(e.target.value); if (status === 'error') { setStatus('idle'); setMsg('') } }}
          aria-label={t('phEmail')}
        />
        <button
          type="submit"
          className="lp-cta-primary wl-optin-btn"
          disabled={status === 'sending'}
        >
          {status === 'sending' ? 'Subscribing…' : label}
        </button>
      </div>
      {status === 'error' && <p className="wl-optin-error">{msg}</p>}
      <p className="wl-optin-note">
        No spam. Unsubscribe anytime. We only store your email — never your portfolio.
      </p>
    </form>
  )
}
