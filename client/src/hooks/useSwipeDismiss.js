import { useRef, useState, useCallback } from 'react'

/**
 * useSwipeDismiss — makes an in-app toast/notification draggable so it can be
 * flicked away (to the side by default, or up). Returns pointer handlers to
 * spread onto the element plus a style with the live drag transform. When the
 * drag passes `threshold` px the element animates out and `onDismiss` fires.
 *
 * Works with touch and mouse via Pointer Events. For a horizontally-centred
 * toast (translateX(-50%)) pass `centered` so the base transform is preserved.
 */
export function useSwipeDismiss(onDismiss, { axis = 'x', threshold = 70, centered = false } = {}) {
  const [offset, setOffset] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const start = useRef(null)
  const dragging = useRef(false)

  const onPointerDown = useCallback((e) => {
    // Don't hijack taps on buttons/links inside the toast.
    if (e.target.closest('button, a, input, textarea, select')) return
    start.current = { x: e.clientX, y: e.clientY }
    dragging.current = true
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }, [])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current || !start.current) return
    const d = axis === 'x' ? e.clientX - start.current.x : e.clientY - start.current.y
    // For vertical dismiss only allow swiping up (negative).
    setOffset(axis === 'y' ? Math.min(0, d) : d)
  }, [axis])

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    start.current = null
    setOffset(prev => {
      if (Math.abs(prev) > threshold) {
        setLeaving(true)
        // Let the exit transition play, then remove.
        setTimeout(() => onDismiss?.(), 180)
        return prev
      }
      return 0
    })
  }, [threshold, onDismiss])

  const translate = axis === 'x'
    ? `translateX(${centered ? `calc(-50% + ${offset}px)` : `${offset}px`})`
    : `translateY(${offset}px)`
  const exit = leaving
    ? (axis === 'x'
        ? `translateX(${centered ? `calc(-50% + ${offset > 0 ? 120 : -120}%)` : `${offset > 0 ? 120 : -120}%`})`
        : 'translateY(-140%)')
    : translate

  const swipeStyle = {
    transform: exit,
    opacity: leaving ? 0 : 1 - Math.min(0.85, Math.abs(offset) / 240),
    transition: dragging.current ? 'none' : 'transform 0.18s ease, opacity 0.18s ease',
    touchAction: axis === 'x' ? 'pan-y' : 'pan-x',
  }

  return {
    swipeHandlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
    swipeStyle,
  }
}
