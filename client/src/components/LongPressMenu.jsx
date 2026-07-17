import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// ── Imperative long-press binding ──────────────────────────────────────────
// Only one touch gesture can be in flight at a time, so a single module-level
// record of the active press is safe and avoids a per-row hook. Spread the
// returned handlers onto any element, and pair that element's onClick with
// consumeLongPress() to swallow the click a touch long-press synthesizes.
let _timer = null
let _move = null
let _firedAt = 0

function _cancel() {
  if (_timer) { clearTimeout(_timer); _timer = null }
  if (_move) { window.removeEventListener('pointermove', _move); _move = null }
}

export function bindLongPress(onLongPress, { holdMs = 400, moveTolerance = 10 } = {}) {
  return {
    onPointerDown: (e) => {
      // Desktop uses right-click (onContextMenu); only touch/pen long-press.
      if (e.pointerType === 'mouse') return
      _cancel()
      const sx = e.clientX, sy = e.clientY
      _move = (ev) => {
        // Any real drag (scroll/swipe) cancels the press.
        if (Math.abs(ev.clientX - sx) > moveTolerance || Math.abs(ev.clientY - sy) > moveTolerance) _cancel()
      }
      window.addEventListener('pointermove', _move, { passive: true })
      _timer = setTimeout(() => {
        _cancel()
        _firedAt = Date.now()
        try { navigator.vibrate?.(12) } catch { /* haptics optional */ }
        onLongPress(sx, sy)
      }, holdMs)
    },
    // Releasing / cancelling before the hold completes aborts the press and,
    // crucially, always removes the pointermove listener (no leak on tap).
    onPointerUp: _cancel,
    onPointerCancel: _cancel,
    onContextMenu: (e) => {
      // Fires on desktop right-click and on some browsers' native long-press.
      // Suppress the native menu; cancel any pending timer and don't double-open
      // if our pointer long-press just fired.
      e.preventDefault()
      e.stopPropagation()
      _cancel()
      if (Date.now() - _firedAt < 700) return
      _firedAt = Date.now()
      onLongPress(e.clientX, e.clientY)
    },
  }
}

// True if a long-press fired in the last 700ms — call from an element's onClick
// to skip the tap action that follows a touch long-press.
export function consumeLongPress() {
  if (Date.now() - _firedAt < 700) { _firedAt = 0; return true }
  return false
}

// ── Portal-rendered floating menu ──────────────────────────────────────────
export function LongPressMenu({ items = [], pos, onClose }) {
  const openedAtRef = useRef(0)
  useEffect(() => { if (pos) openedAtRef.current = Date.now() }, [pos])

  useEffect(() => {
    if (!pos) return
    let cleanup = null
    // Defer one frame so the opening gesture's trailing events don't close it.
    const raf = requestAnimationFrame(() => {
      const onScroll = () => onClose()
      const onKey = (e) => { if (e.key === 'Escape') onClose() }
      window.addEventListener('wheel', onScroll, { passive: true })
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('keydown', onKey)
      cleanup = () => {
        window.removeEventListener('wheel', onScroll)
        window.removeEventListener('scroll', onScroll, true)
        window.removeEventListener('keydown', onKey)
      }
    })
    return () => { cancelAnimationFrame(raf); if (cleanup) cleanup() }
  }, [pos, onClose])

  if (!pos) return null

  // Single source of truth for clamping — keep the menu fully on screen.
  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuW = 210
  const menuH = items.reduce((h, it) => h + (it.divider ? 11 : 44), 0) + 12
  let x = pos.x, y = pos.y
  if (x + menuW > vw - 8) x = vw - menuW - 8
  if (y + menuH > vh - 8) y = Math.max(8, vh - menuH - 8)
  if (x < 8) x = 8
  if (y < 8) y = 8

  // Close on the overlay's OWN click, not on a global pointerdown. This keeps
  // the overlay mounted through the whole tap so an outside tap is absorbed
  // here instead of falling through to (and navigating) the content behind.
  // Releasing the long-press finger over the overlay fires no click (its
  // pointerdown happened on the content, before the overlay existed), so the
  // menu stays open until the user actually taps.
  return createPortal(
    <div className="lp-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}
      onClick={onClose}
      onContextMenu={(e) => {
        // Always swallow the native menu. Only CLOSE on a deliberate right-click
        // well after opening — never on the native long-press contextmenu that
        // Android fires ~100ms after our pointer timer already opened the menu.
        e.preventDefault()
        if (Date.now() - openedAtRef.current > 700) onClose()
      }}>
      <div className="lp-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 100000 }}
        onClick={(e) => e.stopPropagation()}>
        {items.map((item, i) =>
          item.divider
            ? <div key={i} className="lp-divider" />
            : <button key={i} className="lp-item" disabled={item.disabled}
                onClick={() => { onClose(); item.onClick?.() }}>
                {item.icon && <span className="lp-icon">{item.icon}</span>}
                <span className="lp-label">{item.label}</span>
                {item.badge && <span className="lp-badge">{item.badge}</span>}
              </button>
        )}
      </div>
    </div>,
    document.body
  )
}
