import { useState } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import { track } from '../analytics'
import { subscribeWeekly, unsubscribeWeekly, buildWeeklyPayload, getWeeklySub } from '../weeklyEmail'

// The "how it works" bullets — each row is an icon + a single text span so the
// text wraps as one block (wrapping <strong> directly in a flex row splits it
// into separate flex items and breaks the layout).
function HowItWorks() {
  const { t } = useLanguage()
  return (
    <>
      <p className="wk-how-title">{t('weHowItWorks')}</p>
      <ul className="wk-how">
        <li>
          <Icon name="calendar" size={13} />
          <span>{t('weReportLands')} <strong>{t('weEveryWeek')}</strong>.</span>
        </li>
        <li>
          <Icon name="mail" size={13} />
          <span>Sent from <strong>noreply@walletlens.live</strong> {t('weAddContact')}</span>
        </li>
        <li>
          <Icon name="lock" size={13} />
          {/* Says what is actually sent. weeklyEmail.js transmits the exact
              total and the top six holdings with their values; only the
              transaction history stays behind. Claiming "rounded" here was
              never true of the payload. */}
          <span><strong>{t('weWhatWeStore')}</strong> your email, your portfolio total and your largest holdings — enough to write the report. Your transaction history never leaves the device.</span>
        </li>
        <li>
          <Icon name="refresh" size={13} />
          <span>{t('weOpenNowAndThen')}</span>
        </li>
      </ul>
    </>
  )
}

// Reusable weekly-report email signup. Shows an email form when not subscribed,
// an inline confirmation once subscribed, and a celebratory popup right after a
// fresh subscribe that explains how the weekly report works.
export default function WeeklyEmailSignup({ enriched, source = 'settings' }) {
  const { t } = useLanguage()
  const existing = getWeeklySub()
  const [email, setEmail] = useState('')
  const [state, setState] = useState(existing?.email ? 'subscribed' : 'idle') // idle | sending | subscribed | error
  const [msg, setMsg] = useState('')
  const [subbed, setSubbed] = useState(existing?.email || '')
  const [firstSent, setFirstSent] = useState(false)
  const [popup, setPopup] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const val = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setState('error'); setMsg('Please enter a valid email address.'); return }
    setState('sending'); setMsg('')
    track('weekly_email_subscribe', { source })
    try {
      const payload = buildWeeklyPayload({ enriched, currency: 'USD' })
      const data = await subscribeWeekly(val, payload)
      setSubbed(val); setFirstSent(!!data?.sent); setState('subscribed'); setPopup(true)
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

  return (
    <>
      {state === 'subscribed' ? (
        <div className="wk-signup wk-signup--done">
          <p className="wk-done-title">
            <Icon name="check" size={15} /> You’re subscribed{subbed ? <> · <span className="wk-done-email">{subbed}</span></> : ''}
          </p>
          <p className="wk-done-lead">
            {firstSent ? 'Your first report is on its way now.' : 'Your first report will arrive with the next weekly send.'}
          </p>
          <HowItWorks />
          <button type="button" className="wk-off" onClick={off} disabled={state === 'sending'}>{t('weTurnOff')}</button>
        </div>
      ) : (
        <form className="wk-signup" onSubmit={submit}>
          <p className="wk-lead">
            {t('wePitch')}
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
          <p className="wk-note">{t('weUnsubAnytime')}</p>
        </form>
      )}

      {popup && (
        <div className="wk-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPopup(false) }}>
          <div className="wk-modal" role="dialog" aria-modal="true" aria-label="Subscribed to weekly report">
            <div className="wk-modal-badge"><Icon name="check" size={26} /></div>
            <h3 className="wk-modal-title">{t('weSubscribed')}</h3>
            <p className="wk-modal-sub">
              {firstSent ? 'Your first report is on its way' : 'Your first report will arrive with the next weekly send'}
              {subbed ? <> to <strong>{subbed}</strong>.</> : '.'}
            </p>
            <div className="wk-modal-how"><HowItWorks /></div>
            <button type="button" className="wk-modal-btn" onClick={() => setPopup(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
