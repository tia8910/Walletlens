import { useState, useEffect, useCallback } from 'react'

// The one place the app records this. Settings writes it and Dashboard reads
// it; this hook used to read a key of its own, 'crypto_tracker_hide_values',
// which nothing has ever written — so any page wired up to it would have read
// false forever while the eye on the Dashboard said otherwise. Nothing imported
// it yet, which is the only reason that never shipped as a bug.
const SETTINGS_KEY = 'wl_settings'
const MASK = '••••'

function readHide() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').hideValues === true }
  catch { return false }
}

function writeHide(next) {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, hideValues: next }))
  } catch { /* private mode */ }
}

// Subscribe to "hideValues" changes across the app via a custom storage
// event — toggling the eye on Dashboard updates Transactions / AssetDetail
// in the same tab without prop drilling.
const listeners = new Set()
function emit() { for (const fn of listeners) fn() }
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === SETTINGS_KEY) emit() })
}

export default function usePrivateFmt() {
  const [hideValues, setHide] = useState(readHide)

  useEffect(() => {
    const fn = () => setHide(readHide())
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  const toggle = useCallback(() => {
    const next = !readHide()
    writeHide(next)
    setHide(next)
    emit()
  }, [])

  // Wrap any string for display: when hidden, replaces with dots.
  const priv = useCallback((s) => hideValues ? MASK : s, [hideValues])

  return { hideValues, toggle, priv, mask: MASK }
}
