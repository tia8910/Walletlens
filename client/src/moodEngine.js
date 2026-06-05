// ── Generative brand reactivity ──────────────────────────────────────────
// Drives a subtle, app-wide ambient "mood" from the day's portfolio P&L.
// Emerald energy when up, calm muted slate when down, near-silent when flat.
// Pure CSS-variable side effects — never touches functional colors (text,
// red/green P&L figures, buttons), only the decorative aura behind content.

const KEY = 'wl_mood_v1'

const GAIN = '16, 185, 129'   // emerald — alive, optimistic
const LOSS = '71, 85, 105'    // calm slate — muted, never alarming
const FLAT = '100, 116, 139'  // neutral hush

// ±5% day move maps to full intensity; gains glow brighter than losses dim.
function compute(changePct) {
  const pct = Number.isFinite(changePct) ? changePct : 0
  const t = Math.max(-1, Math.min(1, pct / 5))
  if (t >= 0.04)  return { color: GAIN, opacity: 0.04 + t * 0.10, t }       // → ~0.14
  if (t <= -0.04) return { color: LOSS, opacity: 0.03 + (-t) * 0.05, t }    // → ~0.08
  return { color: FLAT, opacity: 0.02, t }
}

function paint({ color, opacity, t }) {
  const root = document.documentElement
  root.style.setProperty('--mood-aura-color', color)
  root.style.setProperty('--mood-aura-opacity', opacity.toFixed(3))
  root.style.setProperty('--mood', t.toFixed(3))
}

export function applyMood(changePct) {
  if (typeof document === 'undefined') return
  const m = compute(changePct)
  paint(m)
  try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* private mode */ }
}

// Apply the last-known mood instantly on load so there's no flash of neutral
// before the dashboard recomputes the live P&L.
export function initMood() {
  if (typeof document === 'undefined') return
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved && typeof saved.opacity === 'number') paint(saved)
  } catch { /* ignore */ }
}
