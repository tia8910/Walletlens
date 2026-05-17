const KEY = 'wl_snapshots_v1'
const MAX = 2160 // 90 days × 24 hourly snapshots
const MIN_INTERVAL_MS = 30 * 60 * 1000 // save at most once every 30 minutes

export function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function saveSnapshot(value, invested) {
  if (!value || value <= 0) return
  const now = Date.now()
  const snaps = loadSnapshots()
  const last = snaps[snaps.length - 1]
  // Throttle: skip if last snapshot was less than 30 min ago AND same rounded value
  if (last && (now - last.ts) < MIN_INTERVAL_MS) return
  const entry = { ts: now, v: value, inv: invested || 0 }
  snaps.push(entry)
  const trimmed = snaps.slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)) } catch {}
  return trimmed
}

export function getSnapshotsForDays(days) {
  const snaps = loadSnapshots()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return snaps.filter(s => s.ts >= cutoff)
}

// Returns true if we have enough real data points for the given timeframe
export function hasRealData(days) {
  const needed = days === 0 ? 2 : days <= 1 ? 2 : 3
  return getSnapshotsForDays(Math.max(days, 1)).length >= needed
}
