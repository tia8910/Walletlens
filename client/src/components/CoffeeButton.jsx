import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'

/**
 * The "buy me a coffee" button: the filled amber disc in the header, opening
 * the support page in a panel over the app rather than sending people away.
 *
 * The disc is the design. Everything else in that row is a transparent line
 * icon, so the one control that asks for something rather than doing something
 * is the one that is filled.
 *
 * WHY THE PANEL HAS A FALLBACK INSTEAD OF JUST AN IFRAME
 *
 * Embedding the support page is the whole point of a panel, and embedding it
 * is also the thing that has already failed once here: the vendor's own widget
 * loaded its payment form in an iframe and Chrome refused it with
 * ERR_BLOCKED_BY_CSP, on a build whose frame-src named both buymeacoffee
 * origins. The user saw a blank white sheet with an Android error page in it.
 *
 * WAITING FOR THE FRAME TO FAIL DOES NOT WORK, SO IT IS CHECKED FIRST.
 * A frame that cannot load renders the browser's own error page inside itself
 * and FIRES load — measured, not assumed: a five second timeout was cancelled
 * by that event and the fallback never appeared. That is exactly the white
 * sheet with an Android error page in it. onError does not fire either.
 *
 * So the host is probed before the frame is rendered. mode:'no-cors' makes the
 * response opaque and unreadable, which is all that is needed: it resolves if
 * anything answered and rejects if nothing did, the same probe /diag uses. A
 * rejection means the panel never shows a frame at all. A securitypolicyviolation
 * naming a frame directive covers the other case, where the host is reachable
 * and the policy refuses the embed.
 *
 * Either way the panel shows a sentence and a plain link, which is a top-level
 * navigation and cannot be refused by frame-src. The failure being replaced is
 * not "the form did not open" — it is a white rectangle with no explanation.
 */

const SUPPORT_URL = 'https://buymeacoffee.com/Walletlens'
// The vendor's embeddable view. The plain page sets frame-ancestors and cannot
// be embedded; this one is what their own widget uses.
const EMBED_URL = 'https://www.buymeacoffee.com/widget/page/Walletlens'
const PROBE_TIMEOUT = 5000

export default function CoffeeButton() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  // null while the probe runs, true once the host answered, false once it did
  // not. The frame is only ever rendered in the true case.
  const [reachable, setReachable] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Hardware and browser Back. Without this, Back while the panel is open
  // navigates the WebView away or exits the app instead of closing the panel —
  // the same problem the assistant panel solves the same way. Closing from the
  // UI consumes the pushed entry so it cannot swallow a later Back press.
  useEffect(() => {
    if (!open) return
    window.history.pushState({ wlCoffee: true }, '')
    const onPop = () => setOpen(false)
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      if (window.history.state?.wlCoffee) window.history.back()
    }
  }, [open])

  // A frame the policy refuses fires no load and, in some browsers, no error
  // either. This is the signal that actually arrives.
  useEffect(() => {
    if (!open) return
    const onViolation = (e) => {
      if (String(e.effectiveDirective || e.violatedDirective || '').startsWith('frame')) setBlocked(true)
    }
    document.addEventListener('securitypolicyviolation', onViolation)
    return () => document.removeEventListener('securitypolicyviolation', onViolation)
  }, [open])

  // Ask whether the host answers at all, before a frame is put on screen.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReachable(null)
    setBlocked(false)
    setLoaded(false)
    ;(async () => {
      try {
        await fetch(EMBED_URL, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT) })
        if (!cancelled) setReachable(true)
      } catch {
        if (!cancelled) setReachable(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  function onFrameLoad() { setLoaded(true) }

  function openPanel() {
    setOpen(true)
    track('coffee_support_click', { source: 'topbar' })
  }

  const label = t('coffeeSupport')

  return (
    <>
      <button
        type="button"
        className="wl-coffee-btn"
        onClick={openPanel}
        title={label}
        aria-label={label}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
          <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
          <path d="M7.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
          <path d="M12.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
        </svg>
      </button>

      {open && (
        <div className="wl-coffee-overlay" onClick={() => setOpen(false)}>
          <div className="wl-coffee-panel" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
            <div className="wl-coffee-head">
              <span className="wl-coffee-title">{label}</span>
              <button className="wl-coffee-close" onClick={() => setOpen(false)} aria-label={t('close')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {blocked || reachable === false ? (
              <div className="wl-coffee-fallback">
                <p>{t('coffeeOpenOutside')}</p>
                <a
                  className="wl-coffee-go"
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { track('coffee_support_fallback', { source: 'topbar' }); setOpen(false) }}
                >
                  {t('coffeeContinue')}
                </a>
              </div>
            ) : (
              <>
                {!loaded && <div className="wl-coffee-loading" aria-hidden="true" />}
                {reachable && (
                  <iframe
                    className="wl-coffee-frame"
                    src={EMBED_URL}
                    title={label}
                    onLoad={onFrameLoad}
                    onError={() => setBlocked(true)}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export { SUPPORT_URL, EMBED_URL }
