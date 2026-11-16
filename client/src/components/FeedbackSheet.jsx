import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import useKeyboardDock from '../hooks/useKeyboardDock'
import { shrinkShot } from '../shrinkShot'
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

// 'ai' keeps what the old top bar sheet offered: an AI answer can be flagged
// from any screen, not only under the answer (store policy).
export const TOPICS = ['idea', 'bug', 'price', 'ai', 'other']
const TOPIC_KEY = { idea: 'fbIdea', bug: 'fbBug', price: 'fbPrice', ai: 'fbAi', other: 'fbOther' }

const platform = () => {
  try {
    const ua = navigator.userAgent || ''
    return /android/i.test(ua) ? 'android' : /iphone|ipad/i.test(ua) ? 'ios' : /windows/i.test(ua) ? 'windows' : 'web'
  } catch { return 'web' }
}

/** The report this sheet sends, kept pure for the test. */
export function feedbackReport({ topic, message, email, lang, page, where = platform() }) {
  const contact = String(email || '').trim()
  return buildReport({
    surface: `feedback:${TOPICS.includes(topic) ? topic : 'other'}`,
    reason: 'feedback',
    note: [`platform: ${where}`, page && `page: ${String(page).slice(0, 120)}`, contact && `reply to: ${contact}`].filter(Boolean).join('\n'),
    output: String(message || '').trim(),
    lang,
  })
}

/**
 * Where the window goes while dragged: the pointer's travel added to where it
 * started, kept so the whole window stays on screen (8px in from each edge).
 * `d` holds the pointer start (x, y), the offset then (off) and the window's
 * rectangle then (r). Pure, for the test.
 */
export function dragOffset(d, px, py, vw, vh, pad = 8) {
  const left = Math.min(Math.max(d.r.left + (px - d.x), pad), Math.max(pad, vw - d.r.width - pad))
  const top = Math.min(Math.max(d.r.top + (py - d.y), pad), Math.max(pad, vh - d.r.height - pad))
  return { x: Math.round(d.off.x + left - d.r.left), y: Math.round(d.off.y + top - d.r.top) }
}

export default function FeedbackSheet({ onClose, initialTopic = 'idea', source = 'settings', page }) {
  const { t, lang } = useLanguage()
  const [topic, setTopic] = useState(TOPICS.includes(initialTopic) ? initialTopic : 'idea')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | failed
  // An optional screenshot, shrunk on the device before it is ever sent.
  const [shot, setShot] = useState(null)
  const [shotState, setShotState] = useState('idle') // idle | reading | failed
  const fileRef = useRef(null)
  async function pickShot(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setShotState('reading')
    try { setShot(await shrinkShot(file)); setShotState('idle'); track('feedback_shot_added', { source }) }
    catch { setShotState('failed') }
  }
  // Above the keyboard while typing: in the Android app the sheet sat behind
  // it and what was typed could not be seen.
  const dock = useKeyboardDock()

  // A window, not a sheet: it opens in the middle of the screen and its title
  // bar drags it anywhere on screen (never off it), so what it covers can be
  // looked at while writing about it. The ✕, Escape, or a tap outside when
  // nothing has been typed yet closes it.
  const [off, setOff] = useState({ x: 0, y: 0 })
  const drag = useRef(null)
  const onDragStart = (e) => {
    if (e.button > 0 || e.target.closest('button')) return
    const r = dock.ref.current?.getBoundingClientRect()
    if (!r) return
    drag.current = { x: e.clientX, y: e.clientY, off, r }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
  }
  const onDragMove = (e) => {
    const d = drag.current
    if (!d) return
    setOff(dragOffset(d, e.clientX, e.clientY, window.innerWidth, window.innerHeight))
  }
  const onDragEnd = () => { drag.current = null }
  const typed = !!(message.trim() || email.trim() || shot)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const report = feedbackReport({ topic, message, email, lang, page })
  const mailto = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent('WalletLens feedback')}&body=${encodeURIComponent(`${t(TOPIC_KEY[topic])}\n\n${report.output}`)}`

  async function send() {
    if (!report.output) return
    setState('sending')
    try {
      const post = (body, ms) => fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ms),
      })
      // Longer with an image on a slow connection.
      let r = await post(shot ? { ...report, shot } : report, shot ? 30000 : 8000)
      // A report server too old to take an image refuses the whole body as
      // too large: the words still go, without the screenshot.
      if (shot && r.status === 413) r = await post(report, 8000)
      if (!r.ok) throw new Error(String(r.status))
      setState('sent')
      track('feedback_sent', { topic, source, shot: !!shot })
    } catch {
      setState('failed')
      track('feedback_failed', { topic, source })
    }
  }

  // Portalled inside an .sx layer so the sheet carries the Settings tokens
  // wherever it is opened from.
  return createPortal(
    <div className="sx sx-layer">
      <div className="sx-scrim" onClick={() => { if (!typed || state === 'sent') onClose?.() }} />
      <div className="sx-sheet fb fb-win" ref={dock.ref} onFocus={dock.onFocus} onBlur={dock.onBlur} role="dialog" aria-modal="true" aria-label={t('fbTitle')}
        style={{ '--fb-dx': `${off.x}px`, '--fb-dy': `${off.y}px` }}>
        <div className="fb-head" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <svg className="fb-grip" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>
          <h3 className="sx-sheet-t">{t('fbTitle')}</h3>
          <button type="button" className="fb-close" onClick={onClose} aria-label={t('close')} title={t('close')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
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
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickShot} />
            {shot ? (
              <div className="fb-shot">
                <img src={shot} alt={t('fbShotAlt')} />
                <button type="button" className="fb-shot-x" onClick={() => setShot(null)} aria-label={t('fbShotRemove')}>✕</button>
              </div>
            ) : (
              <button type="button" className="fb-shot-add" onClick={() => fileRef.current?.click()} disabled={shotState === 'reading'}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 8" /></svg>
                {shotState === 'reading' ? '…' : t('fbShotAdd')}
              </button>
            )}
            {shotState === 'failed' && <p className="bk-msg" role="alert">{t('fbShotFail')}</p>}
            <p className="fb-note">{shot ? t('fbShotPrivacy') : t('fbPrivacy')}</p>
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
