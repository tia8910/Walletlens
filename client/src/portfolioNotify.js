const BASELINE_KEY  = 'wl_portfolio_baseline'
const COOLDOWN_KEY  = 'wl_portfolio_notify_ts'
const THRESHOLD     = 0.05          // 5%
const COOLDOWN_MS   = 30 * 60 * 1000 // minimum 30 min between alerts

function fmtUsd(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

export function setPortfolioBaseline(value) {
  if (value == null || value <= 0) return
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify({ value, ts: Date.now() })) } catch {}
}

export function checkPortfolioMove(currentValue) {
  if (currentValue == null || currentValue <= 0) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  // Enforce cooldown
  try {
    const last = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10)
    if (Date.now() - last < COOLDOWN_MS) return
  } catch {}

  // Load baseline
  let baseline = null
  try { baseline = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null') } catch {}
  if (baseline?.value == null || baseline.value <= 0) {
    setPortfolioBaseline(currentValue)
    return
  }

  const change = (currentValue - baseline.value) / baseline.value
  if (Math.abs(change) < THRESHOLD) return

  const up  = change > 0
  const pct = Math.abs(change * 100).toFixed(1)
  const title = up ? `📈 Portfolio up ${pct}%` : `📉 Portfolio down ${pct}%`
  const body  = up
    ? `Your portfolio gained ${pct}% — now worth ${fmtUsd(currentValue)}.`
    : `Your portfolio dropped ${pct}% — now worth ${fmtUsd(currentValue)}.`

  try {
    new Notification(title, { body, icon: '/icon-192.svg', badge: '/icon-192.svg', tag: 'portfolio-move' })
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
    setPortfolioBaseline(currentValue) // reset baseline after alert fires
  } catch {}
}

export async function requestPortfolioNotifPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

// ── Price-target reached alerts ────────────────────────────────────────────
const TARGET_FIRED_KEY = 'wl_target_reached_fired'

function loadFiredTargets() {
  try { return JSON.parse(localStorage.getItem(TARGET_FIRED_KEY) || '{}') } catch { return {} }
}
function saveFiredTargets(map) {
  try { localStorage.setItem(TARGET_FIRED_KEY, JSON.stringify(map)) } catch {}
}

// Fire a one-time notification for each newly-reached target. `reached` is a
// list of { id, symbol, price }. We dedupe by target id in localStorage so the
// same target never alerts twice, and clear stale ids so re-armed targets work.
export function notifyTargetsReached(reached, activeIds = []) {
  if (!Array.isArray(reached)) return
  const fired = loadFiredTargets()

  // Prune ids no longer active (target deleted) so they can re-fire if recreated
  let pruned = false
  for (const id of Object.keys(fired)) {
    if (!activeIds.includes(id)) { delete fired[id]; pruned = true }
  }

  const canNotify = ('Notification' in window) && Notification.permission === 'granted'
  let changed = pruned
  for (const t of reached) {
    if (fired[t.id]) continue
    fired[t.id] = Date.now()
    changed = true
    if (canNotify) {
      const sym = (t.symbol || 'asset').toUpperCase()
      const priceStr = t.price >= 1
        ? '$' + t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : '$' + t.price.toPrecision(2)
      try {
        new Notification(`Target reached — ${sym}`, {
          body: `You reached your target for ${sym} at ${priceStr}. Time to take profits?`,
          icon: '/icon-192.svg', badge: '/icon-192.svg', tag: `target-${t.id}`,
        })
      } catch {}
    }
  }
  if (changed) saveFiredTargets(fired)
}
