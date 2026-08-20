import { useState, useEffect } from 'react'
import Icon from './Icon'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { shouldAskPush, noteAskShown, enablePush, watchFromStorage } from '../push'

/**
 * Asks permission to send notifications — in the app's own words first.
 *
 * The browser's dialog is only raised after the user taps Enable here. That
 * ordering is the whole point: a browser "Block" is permanent and cannot be
 * re-prompted, so the one-shot question is spent only on people who have
 * already said yes to a reversible one. "Not now" costs nothing and we can ask
 * again in a week.
 *
 * Shown only to someone with holdings. "We'll tell you when your assets move"
 * is a promise about a portfolio; to an empty one it is noise, and asking there
 * spends the single browser prompt on the users least likely to accept it.
 */
export default function NotificationPrimer() {
  const { t } = useLanguage()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!shouldAskPush()) return
    // Nothing to promise without holdings.
    if (watchFromStorage().length === 0) return

    // Let the app settle before interrupting: a card that animates in over a
    // half-drawn dashboard reads as an ad, not as a feature.
    const timer = setTimeout(() => {
      if (!shouldAskPush()) return
      setShow(true)
      track('push_primer_shown')
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  function dismiss(reason) {
    noteAskShown()
    setShow(false)
    track('push_primer_dismissed', { reason })
  }

  async function accept() {
    if (busy) return
    setBusy(true)
    track('push_primer_accepted')
    try {
      await enablePush()
      track('push_enabled', { source: 'primer' })
    } catch {
      // Denied at the browser level, or the server was unreachable. Either way
      // there is nothing useful to say here — Settings carries the real state
      // and its own error text.
      track('push_primer_failed')
    }
    noteAskShown()
    setShow(false)
    setBusy(false)
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wl-np-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={() => dismiss('backdrop')}
    >
      <div
        className="glass-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '460px', margin: '0 0.75rem 0.75rem',
          padding: '1.25rem', borderRadius: '18px', textAlign: 'center',
        }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: '50%', margin: '0 auto 0.75rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(var(--g-rgb),0.14)', color: 'var(--g-ink)',
        }}>
          <Icon name="bell" size={26} />
        </div>

        <h3 id="wl-np-title" style={{ margin: '0 0 0.4rem', fontSize: '1.1rem' }}>
          {t('npAskTitle')}
        </h3>
        <p style={{ margin: '0 0 0.4rem', fontSize: '0.9rem', color: 'var(--text-sub)', lineHeight: 1.5 }}>
          {t('npAskBody')}
        </p>
        <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: 'var(--text-sub)', opacity: 0.8 }}>
          {t('npAskPrivacy')}
        </p>

        <button
          onClick={accept}
          disabled={busy}
          style={{
            width: '100%', padding: '0.8rem', borderRadius: '12px', border: 'none',
            background: 'var(--g)', color: '#04150c', fontWeight: 800, fontSize: '0.95rem',
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {t('npAskYes')}
        </button>
        <button
          onClick={() => dismiss('not-now')}
          style={{
            width: '100%', marginTop: '0.5rem', padding: '0.6rem', borderRadius: '12px',
            border: 'none', background: 'transparent', color: 'var(--text-sub)',
            fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('npAskNo')}
        </button>
      </div>
    </div>
  )
}
