import { useState, useEffect, useRef, useCallback } from 'react'
import { track } from '../analytics'

/**
 * AddAssetTour — an interactive, coached walkthrough that points a live animated
 * arrow at the real on-screen control for each step of adding an asset, and
 * advances as the user goes: the + button → category → asset → amount → Confirm.
 *
 * It finds each target by a `data-tour` attribute and tracks its position every
 * frame (so it stays glued through scrolls and the sheet's open animation). If a
 * target isn't on screen yet it shows the same instruction as a centered card,
 * so the walkthrough never dead-ends.
 */

const STEPS = [
  { sel: '[data-tour="add-asset"]',   title: 'Open the add sheet', text: 'Tap “+ Add trade” to open the add sheet.', opensSheet: true },
  { sel: '[data-tour="ts-category"]', title: 'Pick what you own',  text: 'Choose a category — Crypto, Stocks, Tokenized, Gold, Cash or Fiat.' },
  { sel: '[data-tour="ts-asset"]',    title: 'Find your asset',    text: 'Search by name or ticker and tap your asset. The live price fills in for you.' },
  { sel: '[data-tour="ts-amount"]',   title: 'Enter your amount',  text: 'Type how much you hold — coins, shares or ounces.' },
  { sel: '[data-tour="ts-confirm"]',  title: 'Confirm',            text: 'Tap Confirm — your asset is added and your net worth updates instantly.' },
]

const PAD = 8

export default function AddAssetTour({ open, onClose, onNavigate }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const rafRef = useRef(0)

  const finish = useCallback(() => { track('add_asset_tour_done'); onClose() }, [onClose])

  // Start: reset to step 0 and make sure we're on the dashboard where the
  // "+ Add trade" button lives.
  useEffect(() => {
    if (!open) return
    setStep(0); setRect(null)
    track('add_asset_tour_open')
    onNavigate?.('/dashboard')
  }, [open, onNavigate])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') finish() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, finish])

  // Track the current step's target rect every frame so the spotlight/arrow
  // stay aligned through scrolling and the sheet's slide-in animation.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let scrolled = false
    const sel = STEPS[step].sel
    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(sel)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          if (!scrolled) { scrolled = true; try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {} }
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        }
      } else {
        setRect(null)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current) }
  }, [open, step])

  // On the first step, the user may either tap "Next" or tap the real button —
  // either way, advance to step 2 as soon as the sheet's category grid appears.
  useEffect(() => {
    if (!open || step !== 0) return
    const id = setInterval(() => {
      if (document.querySelector('[data-tour="ts-category"]')) { clearInterval(id); setStep(1) }
    }, 200)
    return () => clearInterval(id)
  }, [open, step])

  const next = () => {
    if (step === 0) { window.dispatchEvent(new Event('wl:open-buy')); return } // advance handled by detector
    if (step >= STEPS.length - 1) { finish(); return }
    setStep(s => s + 1)
  }
  const back = () => setStep(s => Math.max(0, s - 1))

  if (!open) return null

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  // Decide where the tooltip sits: opposite the target so it never covers it.
  const targetLow = rect ? rect.top + rect.height / 2 > vh * 0.5 : false
  const tooltipPos = rect
    ? (targetLow ? { top: 84 } : { bottom: 24 })
    : { top: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="wl-tour" role="dialog" aria-label={`Add asset — step ${step + 1}`}>
      {/* Spotlight ring over the live target (paint-only, so the real control
          underneath stays tappable). */}
      {rect && (
        <div
          className="wl-tour-spot"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}

      {/* Animated arrow pointing at the target. */}
      {rect && (
        targetLow ? (
          <div className="wl-tour-arrow down" style={{ top: rect.top - 46, left: Math.min(Math.max(rect.left + rect.width / 2, 30), (typeof window !== 'undefined' ? window.innerWidth : 400) - 30) }}>
            <svg width="34" height="40" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v19"/><path d="M5 15l7 7 7-7"/></svg>
          </div>
        ) : (
          <div className="wl-tour-arrow up" style={{ top: rect.top + rect.height + 8, left: Math.min(Math.max(rect.left + rect.width / 2, 30), (typeof window !== 'undefined' ? window.innerWidth : 400) - 30) }}>
            <svg width="34" height="40" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 25V6"/><path d="M5 13l7-7 7 7"/></svg>
          </div>
        )
      )}

      {/* Instruction card */}
      <div className="wl-tour-card" style={tooltipPos}>
        <div className="wl-tour-card-top">
          <span className="wl-tour-step">Step {step + 1} of {STEPS.length}</span>
          <button className="wl-tour-skip" onClick={finish}>Skip</button>
        </div>
        <h3 className="wl-tour-title">{s.title}</h3>
        <p className="wl-tour-text">{s.text}</p>
        <div className="wl-tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => <span key={i} className={`wl-tour-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`} />)}
        </div>
        <div className="wl-tour-actions">
          {step > 0 ? <button className="wl-tour-back" onClick={back}>Back</button> : <span />}
          <button className="wl-tour-next" onClick={next}>
            {isLast ? 'Done' : step === 0 ? 'Open it' : 'Next'}
            {!isLast && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>}
          </button>
        </div>
      </div>
    </div>
  )
}
