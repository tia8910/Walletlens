// ── Weekly report email subscription ─────────────────────────────────────────
// Thin client for the voice-api "weekly_*" modes. The user opts in with their
// email; the server stores a small rounded stats snapshot (no exact amounts,
// no transactions) and emails a branded report every week from
// noreply@walletlens.live. We keep only the email + opt-in time locally.
import { loadSnapshots } from './snapshots'

const ENDPOINT = 'https://walletlens-voice-parse.tia8910.deno.net/'
const SUB_KEY = 'wl_weekly_email'
// Reuse the same anonymous device id as Portfolio Guardian so a device has one
// identity across features (it's just a random opaque key, never PII).
const DEVICE_ID_KEY = 'wl_guardian_device_id'

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(18)))
        .map(b => b.toString(36)).join('').slice(0, 24)
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch { return 'wl-' + Date.now().toString(36) }
}

export function getWeeklySub() {
  try { return JSON.parse(localStorage.getItem(SUB_KEY) || 'null') } catch { return null }
}
export function isWeeklySubscribed() {
  return !!getWeeklySub()?.email
}

async function post(body) {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.error) throw new Error(data.error || 'network_error')
  return data
}

// Derive the value / week-change / day-count fields from the local snapshot
// history — the same data the on-screen weekly report card is drawn from.
function snapshotFields() {
  const snaps = loadSnapshots()
  if (snaps.length < 1) return null
  const now = Date.now()
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
  const current = snaps[snaps.length - 1]
  const weekStart = snaps.filter(s => s.ts >= oneWeekAgo)[0] || snaps[snaps.length - 2] || current
  const weekChange = current.v - weekStart.v
  const weekChangePct = weekStart.v > 0 ? (weekChange / weekStart.v) * 100 : 0
  const fmtD = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return {
    totalUsd: current.v,
    weekChange,
    weekChangePct,
    daysTracked: snaps.length,
    weekLabel: `${fmtD(weekStart.ts)} – ${fmtD(current.ts)}`,
  }
}

// Build the full payload the server stores. `enriched` (optional) supplies the
// top holdings + asset count; without it the server keeps the previously-stored
// holdings on a refresh.
export function buildWeeklyPayload({ enriched, currency = 'USD' } = {}) {
  const base = snapshotFields()
  if (!base) return null
  const holdings = Array.isArray(enriched)
    ? enriched.slice(0, 6).map(h => ({
        sym: (h.coin_symbol || h.symbol || '?').toUpperCase(),
        valueUsd: h.value || 0,
        pnlPct: h.pnlPct || 0,
      }))
    : []
  return {
    currency,
    ...base,
    assetCount: Array.isArray(enriched) ? enriched.length : 0,
    holdings,
  }
}

// Opt in: sends the first report now and schedules the weekly send.
export async function subscribeWeekly(email, payload) {
  const data = await post({ mode: 'weekly_subscribe', email, deviceId: getDeviceId(), stats: payload })
  try { localStorage.setItem(SUB_KEY, JSON.stringify({ email, at: Date.now() })) } catch {}
  return data
}

// Keep the stored snapshot fresh so the cron sends current numbers. Best-effort
// and silent — called on app open when subscribed.
export async function refreshWeekly(payload) {
  if (!isWeeklySubscribed() || !payload) return
  try { await post({ mode: 'weekly_refresh', deviceId: getDeviceId(), stats: payload }) } catch {}
}

export async function unsubscribeWeekly() {
  try { await post({ mode: 'weekly_unsubscribe', deviceId: getDeviceId() }) } catch {}
  try { localStorage.removeItem(SUB_KEY) } catch {}
}
