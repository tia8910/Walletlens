import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './LongPressMenu.css'

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

// ── Icons ───────────────────────────────────────────────────────────────────
// Line icons by name, so every menu reads as one set instead of a row of
// emoji that render differently on every phone. An item's `icon` may be one
// of these names, any React node, or (for older callers) an emoji string.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
export const LP_ICONS = {
  plus: <svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>,
  minus: <svg viewBox="0 0 24 24" {...P}><path d="M5 12h14" /></svg>,
  share: <svg viewBox="0 0 24 24" {...P}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>,
  refresh: <svg viewBox="0 0 24 24" {...P}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></svg>,
  pie: <svg viewBox="0 0 24 24" {...P}><path d="M21 12A9 9 0 1 1 12 3v9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></svg>,
  flag: <svg viewBox="0 0 24 24" {...P}><path d="M5 21V4h11l-2 4 2 4H5" /></svg>,
  download: <svg viewBox="0 0 24 24" {...P}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></svg>,
  eye: <svg viewBox="0 0 24 24" {...P}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: <svg viewBox="0 0 24 24" {...P}><path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2" /><path d="M1 1l22 22" /></svg>,
  chart: <svg viewBox="0 0 24 24" {...P}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>,
  candles: <svg viewBox="0 0 24 24" {...P}><path d="M8 3v4M8 17v4M16 3v6M16 17v4" /><rect x="5" y="7" width="6" height="10" rx="1" /><rect x="13" y="9" width="6" height="8" rx="1" /></svg>,
  target: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>,
  bell: <svg viewBox="0 0 24 24" {...P}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
  sparkle: <svg viewBox="0 0 24 24" {...P}><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.5l-.8-2-1.9-.8 1.9-.8z" /></svg>,
  copy: <svg viewBox="0 0 24 24" {...P}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  import: <svg viewBox="0 0 24 24" {...P}><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>,
  settings: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  zap: <svg viewBox="0 0 24 24" {...P}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
}

function renderIcon(icon) {
  if (!icon) return null
  if (typeof icon === 'string') return LP_ICONS[icon] || <span className="lpx-emoji">{icon}</span>
  return icon
}

// ── Portal-rendered floating menu ──────────────────────────────────────────
//
// items: [{ icon, label, hint?, tone?, onClick, disabled? } | { divider: true }]
//   tone — 'green' | 'blue' | 'violet' | 'amber' | 'rose' | 'slate' tints the
//          icon tile, so the most-used action reads first.
// title / subtitle — an optional header naming what was pressed.
export function LongPressMenu({ items = [], pos, onClose, title, subtitle }) {
  const openedAtRef = useRef(0)
  const menuRef = useRef(null)
  const [place, setPlace] = useState(null)
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

  // Clamp against the menu's MEASURED size, not an estimate: headers, hints
  // and dividers made the old per-row guess wrong, and a menu opened near the
  // bottom of the screen hung off it.
  useLayoutEffect(() => {
    if (!pos || !menuRef.current) { setPlace(null); return }
    // offset* rather than getBoundingClientRect: the menu opens scaled to
    // 0.86 for its entrance, and the scaled box is too small to clamp with.
    const width = menuRef.current.offsetWidth
    const height = menuRef.current.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight, pad = 10
    let x = pos.x - width / 2
    let y = pos.y + 12
    if (y + height > vh - pad) y = pos.y - height - 12
    x = Math.min(Math.max(pad, x), vw - width - pad)
    y = Math.min(Math.max(pad, y), vh - height - pad)
    const ox = Math.min(Math.max(0, pos.x - x), width)
    const oy = pos.y < y ? 0 : height
    setPlace({ x, y, origin: `${ox}px ${oy}px` })
  }, [pos, items, title])

  if (!pos) return null

  // Close on the overlay's OWN click, not on a global pointerdown. This keeps
  // the overlay mounted through the whole tap so an outside tap is absorbed
  // here instead of falling through to (and navigating) the content behind.
  // Releasing the long-press finger over the overlay fires no click (its
  // pointerdown happened on the content, before the overlay existed), so the
  // menu stays open until the user actually taps.
  return createPortal(
    <div className="lp-overlay lpx-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}
      onClick={onClose}
      onContextMenu={(e) => {
        // Always swallow the native menu. Only CLOSE on a deliberate right-click
        // well after opening — never on the native long-press contextmenu that
        // Android fires ~100ms after our pointer timer already opened the menu.
        e.preventDefault()
        if (Date.now() - openedAtRef.current > 700) onClose()
      }}>
      <div ref={menuRef} role="menu" aria-label={title || undefined}
        className={`lp-menu lpx-menu${place ? ' is-in' : ''}`}
        style={{
          position: 'fixed', zIndex: 100000,
          left: place ? place.x : -9999, top: place ? place.y : -9999,
          transformOrigin: place?.origin,
        }}
        onClick={(e) => e.stopPropagation()}>
        {(title || subtitle) && (
          <div className="lpx-head">
            {title && <b>{title}</b>}
            {subtitle && <small>{subtitle}</small>}
          </div>
        )}
        {items.map((item, i) =>
          item.divider
            ? <div key={i} className="lp-divider lpx-divider" role="separator" />
            : <button key={i} type="button" role="menuitem"
                className={`lp-item lpx-item tone-${item.tone || 'slate'}`}
                style={{ '--i': i }}
                disabled={item.disabled}
                onClick={() => {
                  onClose()
                  // After the close, so a handler that opens a sheet or
                  // navigates is never undone by the menu unmounting.
                  try { item.onClick?.() } catch { /* one broken action must not take the page down */ }
                }}>
                <span className="lp-icon lpx-icon" aria-hidden="true">{renderIcon(item.icon)}</span>
                <span className="lpx-text">
                  <span className="lp-label">{item.label}</span>
                  {item.hint && <small>{item.hint}</small>}
                </span>
                {item.badge && <span className="lp-badge">{item.badge}</span>}
              </button>
        )}
      </div>
    </div>,
    document.body
  )
}
