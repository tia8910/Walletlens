import { useState } from 'react'
import { track } from '../analytics'
import { ASSET_CATEGORIES } from '../data/assets'

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
  { id: 'stablecoins', emoji: '💠', label: 'Stablecoins' },
  { id: 'stocks',      emoji: C.stock.icon, label: 'Stocks' },
  { id: 'etfs',        emoji: '🧺', label: 'ETFs' },
  { id: 'gold',        emoji: C.gold.icon, label: 'Gold' },
  { id: 'silver',      emoji: C.silver.icon, label: 'Silver' },
  { id: 'cash',        emoji: C.fiat.icon, color: C.fiat.color, label: 'Cash' },
  { id: 'realestate',  emoji: '🏠', label: 'Real estate' },
  { id: 'bonds',       emoji: C.bond.icon, label: 'Bonds' },
  { id: 'commodities', emoji: '🛢️', label: 'Commodities' },
]

export default function InterestPicker({ onDone }) {
  const [selected, setSelected] = useState(() => new Set())

  function toggle(id) {
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
    const list = OPTIONS.filter(o => selected.has(o.id)).map(o => o.id)
    track('interests_selected', { count: list.length, interests: list.join(',') })
    finish(list)
  }

  function skip() {
    track('interests_skip')
    finish([])
  }

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
                <span
                  className={`ip-chip-emoji${o.color ? ' ip-chip-glyph' : ''}`}
                  style={o.color ? { color: o.color } : undefined}
                  aria-hidden="true"
                >{o.emoji}</span>
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
        <button className="ip-skip" onClick={skip}>Skip</button>
      </div>
    </div>
  )
}

export function interestsDone() {
  try { return localStorage.getItem(DONE_KEY) === '1' } catch { return false }
}
