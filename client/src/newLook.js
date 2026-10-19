import { useState, useEffect } from 'react'

// The light card redesign ("new look") is the only look now. It is a layer on top of v2: html.wl-v3 scopes every rule
// in v3.css and switches on the new Home sections.
//
// The Settings switch is gone, so a classic choice saved before it was
// removed no longer applies; ?look=classic still works for a one-off check.

const KEY = 'wl_look'
const EVENT = 'wl-look-change'

export function isNewLook() {
  try { return sessionStorage.getItem(KEY) !== 'classic' } catch { return true }
}

export function setNewLook(on) {
  try { sessionStorage.setItem(KEY, on ? 'new' : 'classic') } catch { /* private mode */ }
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* no window */ }
}

/** Reads ?look= once, so a shared preview link switches the look on. */
export function applyLookParam(search) {
  const v = new URLSearchParams(search || '').get('look')
  if (v === 'new') setNewLook(true)
  else if (v === 'classic') setNewLook(false)
}

export function useNewLook() {
  const [on, setOn] = useState(isNewLook)
  useEffect(() => {
    const sync = () => setOn(isNewLook())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    // A ?look= link may have flipped it before this listener existed.
    sync()
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return on
}

/** Puts html.wl-v3 on while the new look is on, inside the app only. */
export function useNewLookClass(active) {
  useEffect(() => {
    document.documentElement.classList.toggle('wl-v3', !!active)
    return () => document.documentElement.classList.remove('wl-v3')
  }, [active])
}
