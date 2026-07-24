import { useState } from 'react'
import Icon from './Icon'
import { track } from '../analytics'
import { subscribeWeekly, unsubscribeWeekly, buildWeeklyPayload, getWeeklySub } from '../weeklyEmail'

// Reusable weekly-report email signup. Shows an email form when not subscribed,
// and on success a confirmation that explains how the weekly report works.
export default function WeeklyEmailSignup({ enriched, source = 'settings' }) {
  const existing = getWeeklySub()
  const [email, setEmail] = useState('')
  const [state, setState] = useState(existing?.email ? 'subscribed' : 'idle') // idle | sending | subscribed | error
  const [msg, setMsg] = useState('')
  const [subbed, setSubbed] = useState(existing?.email || '')
  const [firstSent, setFirstSent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const val = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setState('error'); setMsg('Please enter a valid email address.'); return }
    setState('sending'); setMsg('')
    track('weekly_email_subscribe', { source })
    try {
      const payload = buildWeeklyPayload({ enriched, currency: 'USD' })
      const data = await subscribeWeekly(val, payload)
      setSubbed(val); setFirstSent(!!data?.sent); setState('subscribed')
      track('weekly_email_subscribe_ok', { source, sent: data?.sent ? 'yes' : 'no' })
    } catch (err) {
      setState('error'); setMsg('Something went wrong — please try again.')
      track('weekly_email_subscribe_error', { source, error_code: String(err?.message || 'unknown') })
    }
  }

  async function off() {
    setState('sending')
    track('weekly_email_unsubscribe', { source })
    await unsubscribeWeekly()
    setSubbed(''); setEmail(''); setFirstSent(false); setState('idle'); setMsg('')
  }

  if (state === 'subscribed') {
    return (
      <div className="wk-signup wk-signup--done">
        <p className="wk-done-title">
          <Icon name="check" size={15} /> You’re subscribed{subbed ? <> · <span className="wk-done-email">{subbed}</span></> : ''}
        </p>
        <p className="wk-done-lead">
          {firstSent ? 'Your first report is on its way now.' : 'Your first report will arrive with the next weekly send.'}
        </p>
        <p className="wk-how-title">How it works</p>
        <ul className="wk-how">
          <li><Icon name="calendar" size={13} /> A fresh portfolio report lands in your inbox <strong>every week</strong>.</li>
          <li><Icon name="mail" size={13} /> It’s sent from <strong>noreply@walletlens.live</strong> — add it to your contacts so it never lands in spam.</li>
          <li><Icon name="lock" size={13} /> <strong>Privacy-first:</strong> only a rounded summary is stored — never your exact holdings or transactions.</li>
          <li><Icon name="phone" size={13} /> Open the app now and then so your report always shows current numbers.</li>
        </ul>
        <button type="button" className="wk-off" onClick={off} disabled={state === 'sending'}>Turn off weekly emails</button>
      </div>
    )
  }

  return (
    <form className="wk-signup" onSubmit={submit}>
      <p className="wk-lead">
        Get a branded weekly portfolio report in your inbox — no exact amounts shared, privacy-first.
      </p>
      <div className="wk-row">
        <input
          type="email" inputMode="email" autoComplete="email" placeholder="your@email.com"
          value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') { setState('idle'); setMsg('') } }}
          aria-label="Email address" className="wk-input"
        />
        <button type="submit" className="wk-btn" disabled={state === 'sending'}>
          {state === 'sending' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </div>
      {state === 'error' && <p className="wk-err">{msg}</p>}
      <p className="wk-note">Unsubscribe anytime · sent from noreply@walletlens.live</p>
    </form>
  )
}
