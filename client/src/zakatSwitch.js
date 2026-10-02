import { useState, useEffect } from 'react'

// Zakat is opt-in. Most people who track a portfolio do not pay zakat, and a
// crescent in every menu reads as an app that is not for them. So the feature
// stays out of sight until someone turns it on in Settings.
//
// Someone who already uses it must not lose it to this change. The calculator
// is the only thing that writes zakat state, so any of its keys means this
// person has opened it and set something up: they count as on until they say
// otherwise. An explicit choice, either way, always wins.

const ON_KEY = 'wl_zakat_on'
const DATA_KEYS = ['wl_zakat_hawl', 'wl_zakat_settings', 'wl_zakat_intents']
const EVENT = 'wl-zakat-switch'

export function isZakatOn() {
  try {
    const v = localStorage.getItem(ON_KEY)
    if (v === '1') return true
    if (v === '0') return false
    return DATA_KEYS.some(k => localStorage.getItem(k) != null)
  } catch {
    return false
  }
}

export function setZakatOn(on) {
  try { localStorage.setItem(ON_KEY, on ? '1' : '0') } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* no window */ }
}

/** Live value: menus and the dashboard follow the switch without a reload. */
export function useZakatOn() {
  const [on, setOn] = useState(isZakatOn)
  useEffect(() => {
    const sync = () => setOn(isZakatOn())
    window.addEventListener(EVENT, sync)
    // Another tab flipping the switch.
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return on
}
