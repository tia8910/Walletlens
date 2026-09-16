import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../LanguageContext'

/**
 * The "buy me a coffee" launcher: a small draggable circle that opens the
 * project's support page.
 *
 * Modelled on the assistant launcher — same drag mechanic, same remembered
 * position — because that is the control users on this app already know how
 * to move. Two differences are deliberate:
 *
 *  - It is an <a>, not a <button>. The whole thing it does is go to a URL, so
 *    it should behave like a link: keyboard-focusable, middle-clickable,
 *    "open in new tab" from the context menu. Drag is layered on top and
 *    cancels the navigation only when the pointer actually moved.
 *
 *  - It is smaller and starts in the opposite corner. The assistant is a
 *    feature, this is an ask: it should read as the quieter of the two, and
 *    the two are otherwise unrelated — neither component knows about the
 *    other, and neither can cover the other where they start.
 */

const SUPPORT_URL = 'https://buymeacoffee.com/Walletlens'
const FAB_SIZE = 46
const POS_KEY = 'wl_coffee_fab_pos'
const DRAG_THRESHOLD = 6

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p
  } catch {}
  return null
}

function clampPos(x, y) {
  const maxX = window.innerWidth - FAB_SIZE - 8
  const maxY = window.innerHeight - FAB_SIZE - 8
  return { x: Math.max(8, Math.min(maxX, x)), y: Math.max(8, Math.min(maxY, y)) }
}

export default function CoffeeButton() {
  const { t } = useLanguage()
  const [pos, setPos] = useState(loadPos)
  const [dragging, setDragging] = useState(false)
  const ref = useRef(null)
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, baseX: 0, baseY: 0 })

  // A remembered position is in viewport pixels, so it survives a rotation or
  // a resized window only if it is re-clamped. Without this the button parks
  // itself off-screen the first time a phone is turned sideways.
  useEffect(() => {
    if (!pos) return
    const onResize = () => setPos(p => (p ? clampPos(p.x, p.y) : p))
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [pos])

  function onPointerDown(e) {
    // Left button / touch / pen only: a right-click is the context menu, and
    // swallowing it would take away "open link in new tab".
    if (e.button !== 0) return
    const r = ref.current?.getBoundingClientRect()
    drag.current = {
      active: true, moved: false,
      startX: e.clientX, startY: e.clientY,
      baseX: r ? r.left : 0, baseY: r ? r.top : 0,
    }
    try { ref.current?.setPointerCapture(e.pointerId) } catch {}
  }

  function onPointerMove(e) {
    const d = drag.current
    if (!d.active) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    if (!d.moved) { d.moved = true; setDragging(true) }
    setPos(clampPos(d.baseX + dx, d.baseY + dy))
  }

  function onPointerUp(e) {
    const d = drag.current
    if (!d.active) return
    d.active = false
    try { ref.current?.releasePointerCapture(e.pointerId) } catch {}
    if (!d.moved) return
    setDragging(false)
    const r = ref.current?.getBoundingClientRect()
    if (r) {
      const p = clampPos(r.left, r.top)
      setPos(p)
      try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch {}
    }
  }

  // click fires after pointerup, so `moved` is still set from the drag that
  // just ended. Dropping the button is not a request to leave the app.
  function onClick(e) {
    if (drag.current.moved) { e.preventDefault(); drag.current.moved = false }
  }

  const label = t('coffeeSupport')

  return (
    <a
      ref={ref}
      className={`wlbmc-fab${dragging ? ' wlbmc-fab-dragging' : ''}`}
      style={pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : undefined}
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      onDragStart={(e) => e.preventDefault()}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
        <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
        <path d="M7.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
        <path d="M12.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
      </svg>
    </a>
  )
}

export { SUPPORT_URL, POS_KEY, clampPos }
