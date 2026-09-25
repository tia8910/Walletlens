import { useState, useEffect } from 'react'
import Icon from './Icon'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { shouldAskPush, noteAskShown, enablePush, watchFromStorage } from '../push'
import { hasStarted } from './WelcomeStart'

/**
 * Asks permission to send notifications — in the app's own words first.
 *
 * The browser's dialog is only raised after the user taps Enable here. That
 * ordering is the whole point: a browser "Block" is permanent and cannot be
 * re-prompted, so the one-shot question is spent only on people who have
 * already said yes to a reversible one. "Not now" costs nothing and we can ask
 * again in a week.
 *
 * Shown to everyone whose browser has not yet been asked, with or without
 * holdings — the same treatment the Android shell gives, which asks at first
 * launch and does not inspect the portfolio first.
 *
 * It used to require holdings, on the argument that "we'll tell you when your
 * assets move" is a promise about a portfolio and noise to an empty one. That
 * reasoning was sound about the COPY and wrong about the GATE: a browser user
 * who had not added anything yet was never asked at all, so the web had no
 * equivalent of the native prompt and the whole channel started off. The fix
 * is to change what the card says when the portfolio is empty, not to stay
 * silent.
 */
/** Whether the user is on the dashboard, where an interruption is bearable. */
function onDashboard() {
  try {
    const path = (window.location.pathname || '').replace(/\/+$/, '')
    return path === '' || path === '/dashboard' || path.endsWith('/dashboard')
  } catch { return false }
}

/**
 * Whether the dashboard's own onboarding has finished.
 *
 * Being ON the dashboard route is not the same as the dashboard being what is
 * on screen, and that gap is the whole bug this fixes. The interest picker
 * ("What do you want to track?") and the opening-balances step are overlays
 * rendered BY the dashboard, at the dashboard's own URL — so the route check
 * above passes while the first-run flow is still in front of the user, and the
 * card arrived on top of it. Which is exactly the placement the route check
 * was added to prevent, one layer further in.
 *
 * Both overlays end at hasStarted(), which the dashboard's own step machine
 * uses to decide the flow is 'done'. A portfolio is the other way out: the
 * dashboard only draws either overlay while there are no transactions, so a
 * device with holdings is past them however it got there.
 */
function onboardingSettled() {
  try { return hasStarted() || watchFromStorage().length > 0 } catch { return false }
}

export default function NotificationPrimer() {
  const { t } = useLanguage()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    if (!shouldAskPush()) return

    let settle = null
    let poll = null
    let deadline = 0

    const stop = () => { clearTimeout(settle); clearInterval(poll); settle = null; poll = null }

    const offer = () => {
      if (!shouldAskPush()) { stop(); return }
      // On the dashboard, not wherever the user happens to be. This card is
      // mounted at the app root, so without this it can arrive over a trade
      // sheet, an import, or the last frame of onboarding — which is what it
      // did, and the welcome flow does not survive a system dialog landing on
      // top of it. The dashboard is where someone has arrived and is looking
      // around, which is the only moment this question is welcome.
      //
      // WAITED FOR, not merely required. The first version of this gate asked
      // the question once, four seconds after mount, and gave up for the rest
      // of the session if the answer was no — and the answer is no at exactly
      // the moment this component mounts, because it mounts as onboarding
      // finishes and the router has not landed on the dashboard yet. So the
      // gate that was added to move the card ONTO the dashboard stopped it
      // appearing there at all. It keeps looking now.
      if (!onDashboard() || !onboardingSettled()) return
      // Nor over the partner starter pack, which follows onboarding once.
      if (document.querySelector('[data-wl-starter-pack]')) return
      stop()
      // Read at show time, not at mount: someone who adds their first holding
      // while this is waiting should get the promise about it.
      const noHoldings = watchFromStorage().length === 0
      setEmpty(noHoldings)
      setShow(true)
      track('push_primer_shown', { empty: noHoldings })
    }

    // Let the app settle before interrupting: a card that animates in over a
    // half-drawn dashboard reads as an ad, not as a feature. Then keep asking,
    // because arriving at the dashboard is a navigation this component is not
    // told about — it is not inside the router's tree.
    //
    // Bounded. If two minutes of app use never reach the dashboard, the person
    // is doing something else and the question can wait for the next launch;
    // an interval that never ends would sit there for the life of the session
    // waiting to interrupt whatever they eventually do.
    const arm = () => {
      stop()
      deadline = Date.now() + 120_000
      settle = setTimeout(() => {
        offer()
        poll = setInterval(() => {
          if (Date.now() > deadline) { stop(); return }
          offer()
        }, 1500)
      }, 4000)
    }
    arm()

    // Re-armed when the app comes back to the foreground, and that is a fix
    // rather than a flourish. This was a single timer set on mount, so anything
    // that unmounted the component inside those four seconds — a tap through to
    // another tab, which is exactly what someone does on landing — cancelled
    // the only offer of the session. It read as the app asking sometimes and
    // not others.
    const onVisible = () => { if (document.visibilityState === 'visible') arm() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
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
          {empty ? t('npAskTitleEmpty') : t('npAskTitle')}
        </h3>
        <p style={{ margin: '0 0 0.4rem', fontSize: '0.9rem', color: 'var(--text-sub)', lineHeight: 1.5 }}>
          {empty ? t('npAskBodyEmpty') : t('npAskBody')}
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
