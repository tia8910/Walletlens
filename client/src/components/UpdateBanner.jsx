import { useState, useEffect } from 'react'
import { track } from '../analytics'

/**
 * UpdateBanner — shows a "New version available" bar when a fresh service worker
 * is installed and waiting (see main.jsx, which fires `wl:sw-update`). Tapping
 * Refresh tells the waiting worker to take over; the page then reloads onto the
 * new build. Fixes the "I refreshed but nothing changed" trap where a stale
 * worker keeps serving the old app shell.
 */
export default function UpdateBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onUpdate = () => { setShow(true); track('update_banner_shown') }
    window.addEventListener('wl:sw-update', onUpdate)
    return () => window.removeEventListener('wl:sw-update', onUpdate)
  }, [])

  const refresh = () => {
    track('update_banner_refresh')
    const reg = window.__wlUpdateReg
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      // controllerchange (in main.jsx) reloads once the new worker takes over;
      // reload directly as a fallback if that doesn't fire promptly.
      setTimeout(() => window.location.reload(), 1500)
    } else {
      window.location.reload()
    }
  }

  if (!show) return null

  return (
    <div className="wl-update-bar" role="alert">
      <span className="wl-update-dot" aria-hidden="true" />
      <span className="wl-update-txt">A new version is available.</span>
      <button className="wl-update-btn" onClick={refresh}>Refresh</button>
      <button className="wl-update-x" onClick={() => setShow(false)} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}
