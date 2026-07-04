import { useState, useEffect } from 'react'
import { track } from '../analytics'

/**
 * AddAssetGuide — a step-by-step walkthrough that shows a new user exactly how
 * to add an asset, one step at a time (Back / Next with progress dots). The
 * final step drops them straight into the Buy sheet so they can do it for real.
 * Opened from the Help guide or by dispatching the `wl:add-asset-guide` event.
 */

const STEPS = [
  {
    icon: '➕',
    title: 'Open the add sheet',
    desc: 'Tap the green “Start your first trade” button (or the + on your dashboard) to open the add sheet.',
  },
  {
    icon: '🗂️',
    title: 'Pick what you own',
    desc: 'Choose a category — Crypto, Stocks, Tokenized stocks, Gold & Silver, Cash or any fiat currency.',
  },
  {
    icon: '🔎',
    title: 'Find your asset',
    desc: 'Search by name or ticker (e.g. “BTC”, “Apple”) and tap it. The live price fills in automatically.',
  },
  {
    icon: '🔢',
    title: 'Enter your amount',
    desc: 'Type how much you hold — the number of coins, shares or ounces. WalletLens works out the value for you.',
  },
  {
    icon: '✅',
    title: 'Confirm',
    desc: 'Tap Confirm. Your asset is added and your net worth updates instantly. Repeat for everything you own.',
  },
]

export default function AddAssetGuide({ open, onClose, onNavigate }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (open) { setStep(0); track('add_asset_guide_open') }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isLast = step === STEPS.length - 1
  const s = STEPS[step]

  const finish = () => {
    onClose()
    track('add_asset_guide_start_buy')
    onNavigate?.('/dashboard')
    // Give the dashboard a beat to mount, then open the Buy sheet for real.
    setTimeout(() => window.dispatchEvent(new Event('wl:open-buy')), 350)
  }

  return (
    <div className="wl-aag-overlay" onClick={onClose}>
      <div className="wl-aag-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="How to add an asset">
        <div className="wl-aag-head">
          <span className="wl-aag-step-count">Step {step + 1} of {STEPS.length}</span>
          <button className="wl-aag-x" onClick={onClose} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="wl-aag-body">
          <div className="wl-aag-badge" aria-hidden="true">
            <span className="wl-aag-badge-num">{step + 1}</span>
            <span className="wl-aag-badge-ico">{s.icon}</span>
          </div>
          <h2 className="wl-aag-title">{s.title}</h2>
          <p className="wl-aag-desc">{s.desc}</p>
        </div>

        <div className="wl-aag-dots" role="tablist" aria-label="Progress">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`wl-aag-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
              aria-selected={i === step}
            />
          ))}
        </div>

        <div className="wl-aag-foot">
          {step > 0 ? (
            <button className="wl-aag-back" onClick={() => setStep(s => s - 1)}>Back</button>
          ) : <span />}
          {isLast ? (
            <button className="wl-aag-next" onClick={finish}>
              Add my first asset
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          ) : (
            <button className="wl-aag-next" onClick={() => setStep(s => s + 1)}>
              Next
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
