import { track } from '../analytics'

const ROUND_MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]
const STORAGE_KEY = 'wl_milestones_seen'

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')) } catch { return new Set() }
}
function markSeen(key) {
  try {
    const s = loadSeen(); s.add(key)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
  } catch {}
}

export function detectMilestone({ totalValue, totalPnL, prevTotalPnL, dayChangePct }) {
  const seen = loadSeen()

  // Pre-seed milestones already exceeded so they don't retroactively fire
  let seenUpdated = false
  // If portfolio is already in profit on first load, mark first_profit as seen
  if (totalPnL > 0 && prevTotalPnL === null && !seen.has('first_profit')) {
    seen.add('first_profit')
    seenUpdated = true
  }
  for (const m of ROUND_MILESTONES) {
    const key = `round_${m}`
    if (totalValue > m * 1.01 && !seen.has(key)) {
      seen.add(key)
      seenUpdated = true
    }
  }
  if (seenUpdated) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen])) } catch {}
  }

  // First time P&L turns positive — only if we had a real previous reading (not first load)
  if (prevTotalPnL !== null && prevTotalPnL <= 0 && totalPnL > 0) {
    const key = 'first_profit'
    if (!seen.has(key)) return { key, type: 'first_profit', emoji: '🎉', title: 'First profit!', sub: `Your portfolio just turned green — congrats!` }
  }

  // Round number milestone
  for (const m of ROUND_MILESTONES) {
    const key = `round_${m}`
    if (totalValue >= m && !seen.has(key)) {
      const label = m >= 1_000_000 ? `$${m / 1_000_000}M` : m >= 1_000 ? `$${m / 1_000}k` : `$${m}`
      return { key, type: 'round_number', emoji: '🏆', title: `Portfolio hit ${label}!`, sub: `You just crossed the ${label} mark. Time to celebrate!` }
    }
  }

  // Big green day (>5% up)
  if (dayChangePct >= 5) {
    const today = new Date().toDateString()
    const key = `green_day_${today}`
    if (!seen.has(key)) return { key, type: 'green_day', emoji: '🚀', title: `Up ${dayChangePct.toFixed(1)}% today!`, sub: `That's a great day. Share the win?` }
  }

  return null
}

export function dismissMilestone(key) {
  markSeen(key)
}

export default function MilestonePopup({ milestone, totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL, onShare, onDismiss, onCta }) {
  if (!milestone) return null

  function handleShare() {
    track('milestone_share_click', { milestone_type: milestone.type, milestone_key: milestone.key })
    dismissMilestone(milestone.key)
    onShare()
  }

  function handleDismiss() {
    track('milestone_dismissed', { milestone_type: milestone.type })
    dismissMilestone(milestone.key)
    onDismiss()
  }

  function handleCta() {
    track('milestone_cta_click', { milestone_type: milestone.type, cta: milestone.ctaLabel })
    dismissMilestone(milestone.key)
    onDismiss()
    if (onCta) onCta()
  }

  const hasCta = milestone.ctaLabel && onCta
  // Real celebration for wins — a quick confetti burst, skipped for nudge CTAs.
  const celebrate = ['first_profit', 'round_number', 'green_day'].includes(milestone.type)
  const CONFETTI = ['#10b981', '#fbbf24', '#60a5fa', '#f472b6', '#34d399', '#a78bfa']

  return (
    <div className="ms-overlay" onClick={e => e.target === e.currentTarget && handleDismiss()}>
      <div className="ms-modal">
        {celebrate && (
          <div className="ms-confetti" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => (
              <span
                key={i}
                className="ms-confetti-bit"
                style={{
                  left: `${(i / 18) * 100}%`,
                  background: CONFETTI[i % CONFETTI.length],
                  animationDelay: `${(i % 6) * 0.08}s`,
                  transform: `rotate(${i * 40}deg)`,
                }}
              />
            ))}
          </div>
        )}
        <button className="ms-close" onClick={handleDismiss} aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>
        <div className="ms-emoji">{milestone.emoji}</div>
        <h3 className="ms-title">{milestone.title}</h3>
        <p className="ms-sub">{milestone.sub}</p>
        <div className="ms-actions">
          {hasCta ? (
            <button className="ms-btn ms-btn-share" onClick={handleCta}>
              {milestone.ctaLabel}
            </button>
          ) : (
            <button className="ms-btn ms-btn-share" onClick={handleShare}>
              📤 Share this win
            </button>
          )}
          <button className="ms-btn ms-btn-skip" onClick={handleDismiss}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
