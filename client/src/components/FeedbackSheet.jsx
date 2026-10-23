import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { REPORT_ENDPOINT, REPORT_EMAIL, buildReport } from './AiReport'
import '../pages/Settings.css'

// "Send feedback" from Settings: a direct line to us, so a problem can be told
// to the people who can fix it rather than left as a one-star rating nobody
// can answer. It goes to the same report table as AI answer reports
// (/admin/reports), with reason 'feedback'.
//
// What leaves the device: the topic, the message, the email if they chose to
// give one, the app language and the platform. Never the portfolio.
//
// It is opened by the person, from Settings or from the Home rate card's own
// "Report a problem" button. It is never a step before the Play rating card:
// Play forbids asking how someone feels first, so the rate card offers both
// side by side and asks nothing.

export const TOPICS = ['idea', 'bug', 'price', 'other']
const TOPIC_KEY = { idea: 'fbIdea', bug: 'fbBug', price: 'fbPrice', other: 'fbOther' }

const platform = () => {
  try {
    const ua = navigator.userAgent || ''
    return /android/i.test(ua) ? 'android' : /iphone|ipad/i.test(ua) ? 'ios' : /windows/i.test(ua) ? 'windows' : 'web'
  } catch { return 'web' }
}

/** The report this sheet sends, kept pure for the test. */
export function feedbackReport({ topic, message, email, lang, where = platform() }) {
  const contact = String(email || '').trim()
  return buildReport({
    surface: `feedback:${TOPICS.includes(topic) ? topic : 'other'}`,
    reason: 'feedback',
    note: [`platform: ${where}`, contact && `reply to: ${contact}`].filter(Boolean).join('\n'),
    output: String(message || '').trim(),
    lang,
  })
}

export default function FeedbackSheet({ onClose, initialTopic = 'idea', source = 'settings' }) {
  const { t, lang } = useLanguage()
  const [topic, setTopic] = useState(TOPICS.includes(initialTopic) ? initialTopic : 'idea')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | failed

  const report = feedbackReport({ topic, message, email, lang })
  const mailto = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent('WalletLens feedback')}&body=${encodeURIComponent(`${t(TOPIC_KEY[topic])}\n\n${report.output}`)}`

  async function send() {
    if (!report.output) return
    setState('sending')
    try {
      const r = await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) throw new Error(String(r.status))
      setState('sent')
      track('feedback_sent', { topic, source })
    } catch {
      setState('failed')
      track('feedback_failed', { topic, source })
    }
  }

  // Portalled inside an .sx layer so the sheet carries the Settings tokens
  // wherever it is opened from.
  return createPortal(
    <div className="sx sx-layer">
      <div className="sx-scrim" onClick={onClose} />
      <div className="sx-sheet fb" role="dialog" aria-modal="true" aria-label={t('fbTitle')}>
        <div className="sx-grab" />
        <h3 className="sx-sheet-t">{t('fbTitle')}</h3>
        {state === 'sent' ? (
          <div className="fb-done">
            <span aria-hidden="true">✓</span>
            <p>{t('fbThanks')}</p>
            <button className="bk-btn bk-pri" onClick={onClose}>{t('fbDone')}</button>
          </div>
        ) : (
          <>
            <div className="fb-topics" role="radiogroup" aria-label={t('fbTitle')}>
              {TOPICS.map(k => (
                <button key={k} role="radio" aria-checked={topic === k} className={topic === k ? 'on' : ''} onClick={() => setTopic(k)}>{t(TOPIC_KEY[k])}</button>
              ))}
            </div>
            <textarea className="bk-paste fb-msg" rows={5} maxLength={4000} placeholder={t('fbPlaceholder')}
              value={message} onChange={e => setMessage(e.target.value)} autoFocus />
            <input className="bk-paste fb-email" type="email" inputMode="email" autoComplete="email" placeholder={t('fbEmail')}
              value={email} onChange={e => setEmail(e.target.value)} />
            <p className="fb-note">{t('fbPrivacy')}</p>
            {state === 'failed' && <p className="bk-msg" role="alert">{t('fbFailed')} <a href={mailto}>{REPORT_EMAIL}</a></p>}
            <button className="bk-btn bk-pri" onClick={send} disabled={state === 'sending' || !report.output}>
              {state === 'sending' ? '…' : t('fbSend')}
            </button>
            <a className="fb-mail" href={mailto}>{t('fbOrEmail')} {REPORT_EMAIL}</a>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
