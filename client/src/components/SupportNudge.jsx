import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'
import { SUPPORT_URL } from './CoffeeButton'
import { shouldShowSupport, noteSupported, noteSupportDismissed } from '../supportNudge'

/**
 * The "loved the app?" card. Appears on the dashboard once someone has used
 * WalletLens enough for the question to be fair, and never again once they
 * have either supported or said no three times.
 *
 * supportNudge.js owns every rule about whether this is a reasonable moment.
 * This component owns only what the card looks like and what the two buttons
 * record. Keeping the split means the timing can be argued about, and tested,
 * without touching any markup.
 *
 * The URL is imported from CoffeeButton rather than repeated. Two copies of a
 * payment link is how one of them ends up stale, and the wrong one is the one
 * that quietly stops earning anything.
 *
 * Polls rather than deciding once on mount, because the main gate this card
 * waits on is a dwell timer. Deciding at mount would mean the answer is always
 * "not yet" and the card would never appear in the session it was meant for.
 */
export default function SupportNudge({ holdingsCount = 0, busy = false }) {
  const { t } = useLanguage()
  const [show, setShow] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (show) return
    const check = () => { if (shouldShowSupport({ holdingsCount, busy })) setShow(true) }
    let iv = setInterval(check, 15000)
    check()

    // Pause polling while the tab is hidden — this gate can run for days of
    // a session (it waits on a multi-open, multi-day dwell rule), so an
    // ungated timer meant it kept firing in backgrounded tabs indefinitely.
    function handleVisibility() {
      if (document.hidden) {
        clearInterval(iv); iv = null
      } else {
        check()
        if (!iv) iv = setInterval(check, 15000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [show, holdingsCount, busy])

  // Track the impression once, when it actually reaches the screen. Firing on
  // the decision instead would count every session where the rules passed,
  // including ones where a sheet opened over it a frame later, and the
  // click-through rate computed from that would be wrong in our favour.
  useEffect(() => {
    if (show) track('support_nudge_shown', { source: 'dashboard' })
  }, [show])

  if (!show) return null

  const dismiss = () => {
    noteSupportDismissed()
    setClosing(true)
    track('support_nudge_dismissed', { source: 'dashboard' })
    setTimeout(() => setShow(false), 220)
  }

  return (
    <div className={`glass-card wl-support-nudge${closing ? ' wl-support-nudge-out' : ''}`}>
      <span className="wl-support-cup" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
          <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
          <path className="wl-coffee-steam" d="M7.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
          <path className="wl-coffee-steam wl-coffee-steam-b" d="M12.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
        </svg>
      </span>

      <div className="wl-support-text">
        <strong className="wl-support-title">{t('supportNudgeTitle')}</strong>
        <span className="wl-support-sub">{t('supportNudgeBody')}</span>
      </div>

      <div className="wl-support-actions">
        <a
          className="wl-support-go"
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => { noteSupported(); track('coffee_support_click', { source: 'nudge' }) }}
        >
          {t('supportNudgeCta')}
        </a>
        <button type="button" className="wl-support-later" onClick={dismiss}>
          {t('supportNudgeLater')}
        </button>
      </div>
    </div>
  )
}
