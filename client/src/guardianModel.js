// Portfolio Guardian, the decisions: when the deadline falls, what the steps
// are, how ready the legacy plan is, and whether a note looks like a secret
// that must never be written into it. Pure, so the screens, the reminders and
// the tests all read the same answers.

export const DAY_MS = 86_400_000
export const INTERVALS = [30, 60, 90, 180]
export const MAX_PAUSE_DAYS = 60
export const TRUSTED_AFTER_DAYS = 7
export const GRACE_DAYS = 14
export const REMINDER_DAYS = 7
export const PLAN_KINDS = ['exchange', 'hardware', 'bank', 'broker', 'paper', 'other']

const ms = (iso) => { const t = iso ? new Date(iso).getTime() : 0; return Number.isFinite(t) ? t : 0 }

/** Paused for travel right now. */
export const isPaused = (cfg, now = Date.now()) => ms(cfg?.pausedUntil) > now

/** When heirs would first be at risk: the owner email goes out at this moment. */
export function deadlineMs(cfg) {
  if (!cfg?.active) return 0
  const from = Math.max(ms(cfg.lastCheckin), ms(cfg.pausedUntil))
  return from + (Number(cfg.intervalDays) || 90) * DAY_MS
}

/** Whole days left before the first step, never negative. */
export function daysLeft(cfg, now = Date.now()) {
  const d = deadlineMs(cfg)
  return d ? Math.max(0, Math.ceil((d - now) / DAY_MS)) : 0
}

/** The countdown ring: how much of the interval is still ahead, 0..100. */
export function ringPct(cfg, now = Date.now()) {
  const n = Number(cfg?.intervalDays) || 90
  return Math.round(Math.min(1, daysLeft(cfg, now) / n) * 100)
}

/** The deadline as a local 'YYYY-MM-DD', for the push reminder; null when off. */
export function guardianDueDay(cfg) {
  const d = deadlineMs(cfg)
  if (!d) return null
  const x = new Date(d)
  const p = (v) => String(v).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}

/**
 * The steps, in order, with the day each happens counted from the last open.
 * The trusted-person step is there only when one is set; heirs come at the
 * end of the grace either way.
 */
export function stepsFor(intervalDays, { trusted = false } = {}) {
  const n = Number(intervalDays) || 90
  return [
    { id: 'seen', day: 0 },
    { id: 'reminder', day: n - REMINDER_DAYS },
    { id: 'email', day: n },
    ...(trusted ? [{ id: 'trusted', day: n + TRUSTED_AFTER_DAYS }] : []),
    { id: 'heirs', day: n + GRACE_DAYS },
  ]
}

/** Heir shares are fine when none are set, or when they add up to 100. */
export function sharesOk(heirs = []) {
  const set = heirs.filter(h => Number(h.share) > 0)
  if (!set.length) return true
  return set.length === heirs.length && set.reduce((s, h) => s + Number(h.share), 0) === 100
}

/** A plan row counts once it says where the holding is. */
export const planRowReady = (row) => !!(row && row.kind && String(row.place || '').trim())

/**
 * How ready the legacy plan is. Each item is one thing an heir would miss.
 * `ctx`: holdings (symbols the user holds), notifications (can the phone be
 * reminded), backupAt (ms of the last backup).
 */
export function readiness(cfg, ctx = {}, now = Date.now()) {
  const heirs = cfg?.heirs || []
  const plan = cfg?.plan || []
  const held = (ctx.holdings || []).length
  const ready = plan.filter(planRowReady).length
  const items = [
    { id: 'heirs', done: heirs.length > 0 && sharesOk(heirs) },
    { id: 'message', done: !!String(cfg?.message || '').trim() },
    { id: 'plan', done: held ? ready >= held : ready > 0, ready, total: held },
    { id: 'trusted', done: !!cfg?.trusted?.email },
    { id: 'drill', done: ms(cfg?.drilledAt) > now - 365 * DAY_MS },
    { id: 'notify', done: !!ctx.notifications },
    { id: 'backup', done: ms(ctx.backupAt) > now - 30 * DAY_MS },
  ]
  const score = Math.round((items.filter(i => i.done).length / items.length) * 100)
  return { score, items }
}

/**
 * The plan for the holdings the user has: one row each, in holding order,
 * carrying whatever was saved for that symbol.
 */
export function planRows(holdings = [], plan = []) {
  const bySym = new Map((plan || []).map(r => [String(r.sym).toUpperCase(), r]))
  const syms = [...new Set(holdings.map(s => String(s).toUpperCase()))]
  return syms.map(sym => ({ sym, kind: '', place: '', how: '', to: [], ...(bySym.get(sym) || {}), sym }))
}

// ── Secrets must never go into the plan ─────────────────────────────────────
// A recovery phrase is 12 to 24 plain lowercase words; a private key is a long
// run of hex or base58. Either one typed into "how to reach it" would be
// emailed to heirs, so the form refuses it.
const SEED_COUNTS = new Set([12, 15, 18, 21, 24])
export function looksLikeSecret(text) {
  const s = String(text || '').trim()
  if (!s) return false
  const words = s.toLowerCase().split(/[\s,;]+/).filter(Boolean)
  const wordish = words.filter(w => /^[a-z]{3,8}$/.test(w))
  // A seed phrase written out, possibly inside a sentence.
  if (SEED_COUNTS.has(wordish.length) && wordish.length / words.length > 0.85) return true
  if (wordish.length >= 12 && words.length <= 26 && wordish.length === words.length) return true
  if (/\b(0x)?[0-9a-f]{64}\b/i.test(s)) return true                          // raw private key
  if (/\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(s)) return true            // WIF key
  if (/\b(xprv|yprv|zprv|tprv)[1-9A-HJ-NP-Za-km-z]{80,}\b/.test(s)) return true // extended key
  return false
}
