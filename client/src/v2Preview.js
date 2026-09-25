import { useEffect } from 'react'

// The v2 redesign, previewed at /v2test before it replaces /dashboard.
//
// Opening /v2test marks this browser tab as previewing, so the new look
// follows the user to /coach, /settings and every other app page instead of
// dropping back to the classic design the moment they leave the dashboard.
// sessionStorage keeps the preview to this one tab: a second tab, or the next
// visit, opens the classic app as before. "Back to classic design" in the v2
// menu clears it.
//
// Going live later is a matter of making isV2Active() return true and pointing
// V2_PATH at /dashboard; nothing else keys off the path.

export const V2_PATH = '/v2test'
const KEY = 'wl_v2_preview'

const norm = (p) => (p || '').replace(/\/+$/, '') || '/'

export const isV2Path = (pathname) => norm(pathname) === V2_PATH

/** True on /v2test, and anywhere else in a tab that has opened it. */
export function isV2Active(pathname) {
  if (isV2Path(pathname)) {
    try { sessionStorage.setItem(KEY, '1') } catch {}
    return true
  }
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function exitV2() {
  try { sessionStorage.removeItem(KEY) } catch {}
  document.documentElement.classList.remove('wl-v2')
}

/** Where "Dashboard" goes: the preview keeps the user on its own URL. */
export const homePath = (v2) => (v2 ? V2_PATH : '/dashboard')

/** Scopes every v2 style rule: they are all written under html.wl-v2. */
export function useV2Class(active) {
  useEffect(() => {
    document.documentElement.classList.toggle('wl-v2', active)
  }, [active])
}
