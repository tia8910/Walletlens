import { useState, useRef, useEffect } from 'react'

/**
 * Tip — a small ⓘ info affordance for on-screen tips. Tap to reveal a short
 * one/two-line explanation of the thing it sits next to; tap again or tap away
 * to dismiss. Theme-aware, keyboard-accessible, and self-contained so it can be
 * dropped next to any label or section title.
 *
 * Usage:  <Tip text="What this is and how to use it." />
 */
export default function Tip({ text, label = 'What is this?' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <span className="wl-tip" ref={wrapRef}>
      <button
        type="button"
        className={`wl-tip-btn${open ? ' open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(v => !v) }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <span className="wl-tip-pop" role="tooltip">{text}</span>
      )}
    </span>
  )
}
