import { useState, useRef, useCallback, useEffect } from 'react'

const THRESHOLD = 80
const MAX_PULL = 120

export default function PullToRefresh({ children }) {
  const [pulling, setPulling] = useState(false)
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef(null)

  const isAtTop = useCallback(() => {
    const el = containerRef.current
    return el ? el.scrollTop <= 0 : true
  }, [])

  const onTouchStart = useCallback((e) => {
    if (refreshing || !isAtTop()) return
    startY.current = e.touches[0].clientY
    setPulling(true)
  }, [refreshing, isAtTop])

  const onTouchMove = useCallback((e) => {
    if (!pulling || refreshing) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) {
      const dist = Math.min(delta * 0.5, MAX_PULL)
      setDistance(dist)
      if (dist > 5) e.preventDefault()
    }
  }, [pulling, refreshing])

  const onTouchEnd = useCallback(() => {
    if (!pulling) return
    if (distance >= THRESHOLD) {
      setRefreshing(true)
      setDistance(36)
      window.location.reload()
    } else {
      setDistance(0)
    }
    setPulling(false)
  }, [pulling, distance])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onTouchStart, onTouchMove, onTouchEnd])

  const progress = Math.min(distance / THRESHOLD, 1)

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: distance > 0 || refreshing ? Math.max(distance, refreshing ? 36 : 0) : 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: refreshing ? 'height 0.2s' : 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            border: '2.5px solid var(--border)',
            borderTopColor: refreshing ? 'var(--g)' : `rgba(16, 185, 129, ${progress})`,
            borderRadius: '50%',
            transition: refreshing ? 'none' : 'none',
            animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
            transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
            opacity: distance > 0 || refreshing ? 1 : 0,
          }}
        />
      </div>
      <div ref={containerRef} style={{ transform: distance > 0 ? `translateY(${distance}px)` : undefined, transition: pulling ? 'none' : 'transform 0.2s' }}>
        {children}
      </div>
    </>
  )
}
