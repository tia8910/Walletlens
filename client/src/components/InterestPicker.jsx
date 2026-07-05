import { useState, useEffect } from 'react'
import { track } from '../analytics'
import sfx from '../sfx'
import { ASSET_CATEGORIES } from '../data/assets'
import { THEMES } from '../ThemeContext'

// Metal bar logos ("Au" / "Ag") so gold & silver match the trade category.
const GOLD_LOGO = THEMES.find(t => t.id === 'gold')?.logo || ''
const SILVER_LOGO = THEMES.find(t => t.id === 'silver')?.logo || ''
// Tether ₮ coin for stablecoins (self-contained, matches the balances step).
const USDT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%2326a17b'/%3E%3Crect x='9' y='11' width='22' height='4.2' rx='1' fill='white'/%3E%3Crect x='17.4' y='11' width='5.2' height='20' rx='1.2' fill='white'/%3E%3Crect x='12.5' y='16.4' width='15' height='3.4' rx='1' fill='white'/%3E%3C/svg%3E"

// ── First-run "what do you track?" ──────────────────────────────────────────
// A friendly chip-cloud where a new user taps the asset classes they care
// about. The choice is stored in `wl_interests` and used to tailor the
// dashboard quick-add chips. Fully skippable.

const INTERESTS_KEY = 'wl_interests'
const DONE_KEY = 'wl_interests_done'

// Icons mirror the dashboard / trade "asset category" icons (ASSET_CATEGORIES)
// so the app feels consistent. Glyph icons (₿, $) carry their category colour.
const C = ASSET_CATEGORIES
// id must line up with INTEREST_TO_CAT in the dashboard quick-add ordering.
const OPTIONS = [
  { id: 'crypto',      emoji: C.crypto.icon, color: C.crypto.color, label: 'Crypto' },
  { id: 'stablecoins', img: USDT_LOGO, label: 'Stablecoins' },
  { id: 'stocks',      emoji: C.stock.icon, label: 'Stocks' },
  { id: 'etfs',        emoji: '🧺', label: 'ETFs' },
  { id: 'gold',        img: GOLD_LOGO, emoji: C.gold.icon, label: 'Gold' },
  { id: 'silver',      img: SILVER_LOGO, emoji: C.silver.icon, label: 'Silver' },
  { id: 'cash',        emoji: C.fiat.icon, color: C.fiat.color, label: 'Cash' },
  { id: 'realestate',  emoji: '🏠', label: 'Real estate' },
  { id: 'bonds',       emoji: C.bond.icon, label: 'Bonds' },
  { id: 'commodities', emoji: '🛢️', label: 'Commodities' },
]

export default function InterestPicker({ onDone }) {
  const [selected, setSelected] = useState(() => new Set())
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [canSkip, setCanSkip] = useState(false)

  // Delay the Skip link so users see the step before they can bail on it.
  useEffect(() => {
    const t = setTimeout(() => setCanSkip(true), 4000)
    return () => clearTimeout(t)
  }, [])

  function toggle(id) {
    sfx.haptic(6)
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function finish(list) {
    try {
      localStorage.setItem(INTERESTS_KEY, JSON.stringify(list))
      localStorage.setItem(DONE_KEY, '1')
    } catch {}
    onDone?.(list)
  }

  function getStarted() {
    sfx.haptic(9)
    const list = OPTIONS.filter(o => selected.has(o.id)).map(o => o.id)
    track('interests_selected', { count: list.length, interests: list.join(',') })
    finish(list)
  }

  function skip() {
    track('interests_skip')
    finish([])
  }
  function askSkip() { track('interests_skip_prompt'); setConfirmSkip(true) }

  const count = selected.size

  return (
    <div className="ip-overlay" role="dialog" aria-modal="true" aria-label="Select what you track">
      <div className="ip-card">
        <button className="wlm-close" onClick={skip} aria-label="Close" title="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>

        <h2 className="ip-title">What do you want to track?</h2>
        <p className="ip-sub">Pick the assets you care about and we'll tailor WalletLens to you. You can change this anytime.</p>

        <div className="ip-chips">
          {OPTIONS.map(o => {
            const on = selected.has(o.id)
            return (
              <button
                key={o.id}
                type="button"
                className={`ip-chip${on ? ' ip-chip-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(o.id)}
              >
                {o.img
                  ? <img className="ip-chip-img" src={o.img} alt="" aria-hidden="true" />
                  : <span
                      className={`ip-chip-emoji${o.color ? ' ip-chip-glyph' : ''}`}
                      style={o.color ? { color: o.color } : undefined}
                      aria-hidden="true"
                    >{o.emoji}</span>}
                {o.label}
                {on && (
                  <span className="ip-chip-check" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <button className="ip-cta" onClick={getStarted}>
          {count > 0 ? `Get started · ${count} selected` : 'Get started'}
        </button>
        <button
          className="ip-skip"
          onClick={askSkip}
          style={{ opacity: canSkip ? 0.6 : 0, pointerEvents: canSkip ? 'auto' : 'none', transition: 'opacity .4s ease' }}
        >Skip for now</button>

        {confirmSkip && (
          <div className="bs-confirm-overlay" onClick={() => setConfirmSkip(false)}>
            <div className="bs-confirm-card" onClick={e => e.stopPropagation()}>
              <h4 className="bs-confirm-title">Skip personalizing?</h4>
              <p className="bs-confirm-text">
                It takes about <strong>20 seconds</strong> and tailors WalletLens to what you
                actually hold — quick-add shortcuts, the right asset types, and a dashboard that
                feels like yours. You can still change everything later.
              </p>
              <div className="bs-confirm-actions">
                <button className="bs-confirm-go" style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                  onClick={() => setConfirmSkip(false)}>
                  Keep setting up
                </button>
                <button className="bs-confirm-switch" onClick={skip}>Skip anyway</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function interestsDone() {
  try { return localStorage.getItem(DONE_KEY) === '1' } catch { return false }
}
