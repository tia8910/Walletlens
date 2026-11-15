import { useEffect, useState } from 'react'

// Defer mounting a lazy, initially-hidden component until the browser is idle
// (or until it is needed, whichever comes first).
//
// A `lazy()` component rendered closed still downloads and parses its chunk
// the moment its parent mounts, right when the page is fetching prices and
// painting its first real frame. Waiting for idle keeps that work off the
// critical path, while still mounting long before a user usually taps
// anything, so the component's open transition plays as normal.
export function useIdleMount(needed, timeout = 4000) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready) return
    const ric = typeof window !== 'undefined' && window.requestIdleCallback
    const id = ric ? ric(() => setReady(true), { timeout }) : setTimeout(() => setReady(true), Math.min(timeout, 2000))
    return () => (ric ? window.cancelIdleCallback(id) : clearTimeout(id))
  }, [ready, timeout])
  return ready || !!needed
}
