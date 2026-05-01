import { useState, useEffect, useCallback } from 'react'

const HIDE_KEY = 'crypto_tracker_hide_values'
const MASK = '••••'

function readHide() {
  try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
}

// Subscribe to "hideValues" changes across the app via a custom storage
// event — toggling the eye on Dashboard updates Transactions / AssetDetail
// in the same tab without prop drilling.
const listeners = new Set()
function emit() { for (const fn of listeners) fn() }
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === HIDE_KEY) emit() })
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
    try { localStorage.setItem(HIDE_KEY, next ? '1' : '0') } catch {}
    setHide(next)
    emit()
  }, [])

  // Wrap any string for display: when hidden, replaces with dots.
  const priv = useCallback((s) => hideValues ? MASK : s, [hideValues])

  return { hideValues, toggle, priv, mask: MASK }
}
