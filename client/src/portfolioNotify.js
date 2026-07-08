/**
 * Smart portfolio & engagement notification system.
 *
 * <p>Fully client-side, privacy-first. All data stays in localStorage.
 *
 * <h3>What it tracks:</h3>
 * <ul>
 *   <li>5% portfolio moves → instant alert</li>
 *   <li>Price target reached → one-time alert</li>
 *   <li>Daily welcome / streak tracking</li>
 *   <li>Weekly portfolio summary</li>
 *   <li>Smart re-engagement when idle</li>
 * </ul>
 */

// ── Constants ─────────────────────────────────────────────────────────────

const BASELINE_KEY         = 'wl_portfolio_baseline'
const COOLDOWN_KEY         = 'wl_portfolio_notify_ts'
const STREAK_KEY           = 'wl_streak'
const LAST_VISIT_KEY       = 'wl_last_visit'
const DAILY_NOTIF_KEY      = 'wl_daily_notif_date'
const WEEKLY_SUMMARY_KEY   = 'wl_weekly_summary_week'
const ENGAGEMENT_KEY       = 'wl_engagement_ts'

const THRESHOLD    = 0.05           // 5% portfolio move
const COOLDOWN_MS  = 30 * 60 * 1000 // 30 min between portfolio alerts
const IDLE_DAYS    = 3              // Re-engage after 3 days idle

// ── Formatting ────────────────────────────────────────────────────────────

function fmtUsd(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getWeekNumber() {
  const d = new Date()
  d.setHours(0,0,0,0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return d.getFullYear() + '-W' + String(1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0')
}

function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted'
}

function fireNotification(title, body, tag) {
  if (!canNotify()) return false
  try {
    new Notification(title, { body, icon: '/icon-192.svg', badge: '/icon-192.svg', tag: tag || 'walletlens' })
    return true
  } catch { return false }
}

// ── Streak tracking ───────────────────────────────────────────────────────

export function trackVisit() {
  const today = todayStr()
  let streak = 0
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}')
    streak = data.count || 0
    const lastDate = data.lastDate || ''

    if (lastDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      if (lastDate === yesterday) {
        streak += 1  // Consecutive day
      } else {
        streak = 1   // Reset streak
      }
      localStorage.setItem(STREAK_KEY, JSON.stringify({ count: streak, lastDate: today }))
    }
  } catch {}

  localStorage.setItem(LAST_VISIT_KEY, String(Date.now()))
  return streak
}

// ── 1. Portfolio 5% move alerts ─────────────────────────────────────────

export function setPortfolioBaseline(value) {
  if (value == null || value <= 0) return
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify({ value, ts: Date.now() })) } catch {}
}

export function checkPortfolioMove(currentValue) {
  if (currentValue == null || currentValue <= 0) return
  if (!canNotify()) return

  // Cooldown
  try {
    const last = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10)
    if (Date.now() - last < COOLDOWN_MS) return
  } catch {}

  // Baseline
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

  if (fireNotification(title, body, 'portfolio-move')) {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
    setPortfolioBaseline(currentValue)
  }
}

// ── 2. Price target alerts ─────────────────────────────────────────────

const TARGET_FIRED_KEY = 'wl_target_reached_fired'

function loadFiredTargets() {
  try { return JSON.parse(localStorage.getItem(TARGET_FIRED_KEY) || '{}') } catch { return {} }
}
function saveFiredTargets(map) {
  try { localStorage.setItem(TARGET_FIRED_KEY, JSON.stringify(map)) } catch {}
}

export function notifyTargetsReached(reached, activeIds = []) {
  if (!Array.isArray(reached) || !canNotify()) return
  const fired = loadFiredTargets()

  // Prune stale ids
  let pruned = false
  for (const id of Object.keys(fired)) {
    if (!activeIds.includes(id)) { delete fired[id]; pruned = true }
  }

  let changed = pruned
  for (const t of reached) {
    if (fired[t.id]) continue
    fired[t.id] = Date.now()
    changed = true
    const sym = (t.symbol || 'asset').toUpperCase()
    const priceStr = t.price >= 1
      ? '$' + t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : '$' + t.price.toPrecision(2)
    fireNotification(`🎯 Target reached — ${sym}`, `You reached your target for ${sym} at ${priceStr}.`, `target-${t.id}`)
  }
  if (changed) saveFiredTargets(fired)
}

// ── 3. Daily welcome / streak ──────────────────────────────────────────

export function checkDailyWelcome(streak) {
  const today = todayStr()
  const lastNotif = localStorage.getItem(DAILY_NOTIF_KEY)
  if (lastNotif === today) return // Already shown today

  localStorage.setItem(DAILY_NOTIF_KEY, today)

  if (streak >= 7) {
    fireNotification(`🔥 ${streak}-day streak!`, `You've checked your portfolio ${streak} days in a row. Consistency pays off!`, 'daily-streak')
  } else if (streak >= 3) {
    fireNotification(`👋 Welcome back — ${streak} day streak!`, 'Keep tracking your financial journey.', 'daily-streak')
  } else {
    // Time-based greeting
    const hour = new Date().getHours()
    let greeting = hour < 12 ? '☀️ Good morning' : hour < 17 ? '🌤️ Good afternoon' : '🌙 Good evening'
    fireNotification(`${greeting}!`, 'Your portfolio is ready — see what\'s moved.', 'daily-welcome')
  }
}

// ── 4. Weekly summary ──────────────────────────────────────────────────

export function checkWeeklySummary(currentValue) {
  const currentWeek = getWeekNumber()
  const lastSummary = localStorage.getItem(WEEKLY_SUMMARY_KEY)
  if (lastSummary === currentWeek || !canNotify()) return

  // Only on weekends
  const day = new Date().getDay()
  if (day !== 0 && day !== 6) return

  // Only if we have a baseline to compare
  let baseline = null
  try { baseline = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null') } catch {}
  if (!baseline?.value || baseline.value <= 0) return

  localStorage.setItem(WEEKLY_SUMMARY_KEY, currentWeek)

  const change = currentValue ? ((currentValue - baseline.value) / baseline.value * 100).toFixed(1) : null
  const valueStr = currentValue ? fmtUsd(currentValue) : ''
  const changeStr = change ? (change > 0 ? `+${change}%` : `${change}%`) : ''

  if (changeStr && valueStr) {
    fireNotification('📊 Weekly Portfolio', `Your portfolio is at ${valueStr} (${changeStr} this week).`, 'weekly-summary')
  } else {
    fireNotification('📊 Weekly Check-In', 'Review your portfolio and set goals for the week ahead.', 'weekly-summary')
  }
}

// ── 5. Smart re-engagement ─────────────────────────────────────────────

export function checkReEngagement() {
  const lastVisit = parseInt(localStorage.getItem(LAST_VISIT_KEY) || '0', 10)
  const idleDays = (Date.now() - lastVisit) / 86400000
  if (idleDays < IDLE_DAYS) return

  // Check cooldown
  const lastEngage = parseInt(localStorage.getItem(ENGAGEMENT_KEY) || '0', 10)
  if (Date.now() - lastEngage < 7 * 86400000) return // Once per week max

  localStorage.setItem(ENGAGEMENT_KEY, String(Date.now()))

  const messages = [
    'Your portfolio might have moved — check in and stay on top.',
    'Markets keep moving. Quick check-in?',
    'See what\'s changed in your portfolio since your last visit.',
  ]
  const msg = messages[Math.floor(Math.random() * messages.length)]
  fireNotification('👀 We miss you!', msg, 're-engage')
}

// ── Permission ─────────────────────────────────────────────────────────

export async function requestPortfolioNotifPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

// ── Full initialization – call once per app load ───────────────────────

export function initNotifications(currentPortfolioValue) {
  if (!('Notification' in window)) return

  // 1. Track the visit & get streak
  const streak = trackVisit()

  // 2. Daily welcome (once per day)
  checkDailyWelcome(streak)

  // 3. Portfolio move check
  if (currentPortfolioValue != null) {
    checkPortfolioMove(currentPortfolioValue)
  }

  // 4. Weekly summary (weekends only)
  checkWeeklySummary(currentPortfolioValue)

  // 5. Re-engagement if idle >3 days
  checkReEngagement()

  // 6. Set baseline if first time
  if (currentPortfolioValue != null) {
    setPortfolioBaseline(currentPortfolioValue)
  }
}
