import { useState, useRef, useCallback, useEffect } from 'react'

// Smart, smooth pull-to-refresh.
// • Only arms at the true top of the page (window scroll), so mid-page pulls
//   never trigger it, and portaled modals/sheets (rendered outside this
//   wrapper) don't reach these listeners at all.
// • Rubber-band resistance while pulling + a springy release.
// • Refreshes DATA IN PLACE via a `wl:pull-refresh` event (no full page
//   reload / white flash); a page that handles it fires `wl:pull-refresh-done`.
//   A minimum spin keeps the motion smooth even when the refresh is instant.
const THRESHOLD = 72
const MAX_PULL = 108
const SPRING = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)'

export default function PullToRefresh({ children }) {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [settling, setSettling] = useState(false) // brief window so spring-back animates, then transform clears
  const pulling = useRef(false)
  const startY = useRef(0)
  const armed = useRef(false)
  const distanceRef = useRef(0) // mirror of `distance` so handlers never read a stale closure
  const containerRef = useRef(null)
  const settleTimer = useRef(null)

  const setDist = useCallback((d) => { distanceRef.current = d; setDistance(d) }, [])

  const springBack = useCallback(() => {
    setDist(0)
    setSettling(true)
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => setSettling(false), 430)
  }, [setDist])

  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0

  const onTouchStart = useCallback((e) => {
    if (refreshing || e.touches.length !== 1 || !atTop()) { pulling.current = false; return }
    startY.current = e.touches[0].clientY
    pulling.current = true
    armed.current = false
  }, [refreshing])

  const onTouchMove = useCallback((e) => {
    if (!pulling.current || refreshing) return
    if (!atTop()) { pulling.current = false; setDist(0); return }
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) { setDist(0); return }
    // Rubber-band: eases toward MAX_PULL, so the further you pull the harder it gets.
    const dist = MAX_PULL * (1 - Math.exp(-delta / (MAX_PULL * 1.15)))
    setDist(dist)
    if (dist > 6) e.preventDefault()
    const crossed = dist >= THRESHOLD
    if (crossed !== armed.current) {
      armed.current = crossed
      if (crossed) { try { navigator.vibrate?.(8) } catch { /* no haptics */ } }
    }
  }, [refreshing, setDist])

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return
    pulling.current = false
    if (distanceRef.current < THRESHOLD || refreshing) { springBack(); return }

    setRefreshing(true)
    setDist(THRESHOLD)
    try { navigator.vibrate?.(12) } catch { /* no haptics */ }

    const started = Date.now()
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      // Keep the spinner up for a beat so a fast refresh still feels deliberate.
      const wait = Math.max(0, 600 - (Date.now() - started))
      setTimeout(() => { setRefreshing(false); springBack() }, wait)
    }
    const onDone = () => { window.removeEventListener('wl:pull-refresh-done', onDone); finish() }
    window.addEventListener('wl:pull-refresh-done', onDone)
    window.dispatchEvent(new Event('wl:pull-refresh'))
    // Fallback if no page handled it (static pages) — never hang.
    setTimeout(() => { window.removeEventListener('wl:pull-refresh-done', onDone); finish() }, 2500)
  }, [refreshing, springBack, setDist])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onTouchStart, onTouchMove, onTouchEnd])

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  const progress = Math.min(distance / THRESHOLD, 1)
  const active = distance > 0 || refreshing
  const offset = refreshing ? THRESHOLD : distance
  // Keep the transform present through the spring-back, then drop it so no
  // persistent containing block is left for any position:fixed descendant.
  const transformed = active || settling

  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: offset,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, overflow: 'hidden', pointerEvents: 'none',
        transition: pulling.current ? 'none' : 'height 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--card-bg, #fff)', boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: active ? 1 : 0,
          transform: `scale(${active ? 0.6 + progress * 0.4 : 0.6})`,
          transition: pulling.current ? 'none' : 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s',
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2.5px solid var(--border)', borderTopColor: 'var(--g)',
            animation: refreshing ? 'ptr-spin 0.6s linear infinite' : 'none',
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            opacity: refreshing ? 1 : 0.35 + progress * 0.65,
          }} />
        </div>
      </div>
      <div ref={containerRef} style={{
        transform: transformed ? `translateY(${offset}px)` : undefined,
        transition: pulling.current ? 'none' : SPRING,
        willChange: transformed ? 'transform' : 'auto',
      }}>
        {children}
      </div>
    </>
  )
}
