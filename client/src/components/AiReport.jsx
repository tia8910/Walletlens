import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import './AiReport.css'

// "Report an issue" for anything a model wrote. Store policy (Microsoft, and
// the same spirit on Google Play) asks that generative output can be flagged
// by the person reading it, and that a human looks at what is flagged.
//
// What leaves the device is the answer being reported, the reason and the
// note: nothing else from the portfolio. If the report server cannot be
// reached the sheet offers the same report by email, so the button is never a
// dead end.

export const REPORT_ENDPOINT = '/api/push/report'
export const REPORT_EMAIL = 'contact@walletlens.live'
export const REASONS = ['inaccurate', 'harmful', 'risky', 'other']
const MAX_OUTPUT = 4000

export function buildReport({ surface, reason, note, output, lang }) {
  return {
    surface: String(surface || 'unknown').slice(0, 40),
    reason: REASONS.includes(reason) ? reason : 'other',
    note: String(note || '').slice(0, 1000),
    output: String(output || '').slice(0, MAX_OUTPUT),
    lang: String(lang || 'en').slice(0, 8),
  }
}

export function mailtoFor(report) {
  const body = `Reason: ${report.reason}\nWhere: ${report.surface}\n\n${report.note}\n\n--- AI answer ---\n${report.output.slice(0, 1500)}`
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent('AI answer report')}&body=${encodeURIComponent(body)}`
}

// `trigger`, when given, draws the opener instead of the label and button: the
// top bar uses it for a round button that reports from any screen.
export default function AiReport({ surface, output, compact = false, trigger, general = false }) {
  const { t, lang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('inaccurate')
  const [note, setNote] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | failed

  const text = typeof output === 'function' ? output() : output

  async function send() {
    const report = buildReport({ surface, reason, note, output: text, lang })
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
      track('ai_report_sent', { surface, reason })
    } catch {
      setState('failed')
      track('ai_report_failed', { surface, reason })
    }
  }

  function close() { setOpen(false); setState('idle'); setNote(''); setReason('inaccurate') }

  const openSheet = () => { setOpen(true); track('ai_report_open', { surface }) }

  return (
    <>
      {trigger ? trigger(openSheet) : <div className={`air-row${compact ? ' air-compact' : ''}`}>
        <span className="air-label">{t('airLabel')}</span>
        <button type="button" className="air-btn" onClick={openSheet}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg>
          {t('airReport')}
        </button>
      </div>}
      {open && createPortal(
        <div className="air-overlay" onClick={close} role="dialog" aria-modal="true" aria-labelledby="air-title">
          <div className="air-sheet" onClick={e => e.stopPropagation()}>
            <div className="air-grab" />
            {state === 'sent' ? (
              <div className="air-done">
                <div className="air-check">✓</div>
                <b id="air-title">{t('airThanks')}</b>
                <p>{t('airThanksSub')}</p>
                <button type="button" className="air-send" onClick={close}>{t('airClose')}</button>
              </div>
            ) : (
              <>
                <b id="air-title" className="air-title">{t(general ? 'airTitleApp' : 'airTitle')}</b>
                <p className="air-sub">{t(general ? 'airSubApp' : 'airSub')}</p>
                <div className="air-opts" role="radiogroup">
                  {REASONS.map(r => (
                    <button key={r} type="button" role="radio" aria-checked={reason === r}
                      className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>{t(`airR_${r}`)}</button>
                  ))}
                </div>
                <textarea className="air-note" value={note} maxLength={1000} rows={3}
                  placeholder={t('airNote')} onChange={e => setNote(e.target.value)} />
                <p className="air-privacy">{t(general ? 'airPrivacyApp' : 'airPrivacy')}</p>
                {state === 'failed' && (
                  <p className="air-fail">{t('airFail')} <a href={mailtoFor(buildReport({ surface, reason, note, output: text, lang }))}>{t('airEmail')}</a></p>
                )}
                <button type="button" className="air-send" onClick={send} disabled={state === 'sending'}>
                  {state === 'sending' ? t('airSending') : t('airSend')}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
