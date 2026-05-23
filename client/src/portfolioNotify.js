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
  if (!value || value <= 0) return
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify({ value, ts: Date.now() })) } catch {}
}

export function checkPortfolioMove(currentValue) {
  if (!currentValue || currentValue <= 0) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  // Enforce cooldown
  try {
    const last = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10)
    if (Date.now() - last < COOLDOWN_MS) return
  } catch {}

  // Load baseline
  let baseline = null
  try { baseline = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null') } catch {}
  if (!baseline?.value || baseline.value <= 0) {
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
