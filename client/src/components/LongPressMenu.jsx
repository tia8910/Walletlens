import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Hook version — attach long-press to any element without wrapping DOM nodes.
// Returns { onPointerDown, onPointerUp, onContextMenu } event handlers.
export function useLongPress(onTrigger, { holdMs = 500 } = {}) {
  const timerRef = useRef(null)
  const movedRef = useRef(false)

  const clear = useCallback(() => { clearTimeout(timerRef.current); timerRef.current = null }, [])

  const onPointerDown = useCallback((e) => {
    movedRef.current = false
    const startX = e.clientX, startY = e.clientY
    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) {
        movedRef.current = true
        clear()
        window.removeEventListener('pointermove', onMove)
      }
    }
    window.addEventListener('pointermove', onMove)
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) {
        onTrigger(e.clientX, e.clientY)
      }
      window.removeEventListener('pointermove', onMove)
    }, holdMs)
  }, [onTrigger, holdMs, clear])

  const onPointerUp = useCallback(() => { clear() }, [clear])

  const onContextMenu = useCallback((e) => {
    e.preventDefault()
    onTrigger(e.clientX, e.clientY)
  }, [onTrigger])

  useEffect(() => () => clear(), [clear])

  return { onPointerDown, onPointerUp, onContextMenu }
}

// Portal-rendered floating menu. Use with useLongPress.
export function LongPressMenu({ items, pos, onClose }) {
  useEffect(() => {
    if (!pos) return
    const close = () => onClose()
    window.addEventListener('pointerdown', close, { once: true, capture: true })
    window.addEventListener('scroll', close, { once: true })
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('scroll', close) }
  }, [pos, onClose])

  if (!pos) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuW = 200
  const menuH = items.length * 44 + 16
  let x = pos.x, y = pos.y
  if (x + menuW > vw - 8) x = vw - menuW - 8
  if (y + menuH > vh - 8) y = y - menuH
  if (x < 8) x = 8
  if (y < 8) y = 8

  return createPortal(
    <div className="lp-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }} onPointerDown={e => e.stopPropagation()}>
      <div className="lp-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 100000 }}>
        {items.map((item, i) =>
          item.divider
            ? <div key={i} className="lp-divider" />
            : <button key={i} className="lp-item" onClick={() => { onClose(); item.onClick?.() }} disabled={item.disabled}>
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
