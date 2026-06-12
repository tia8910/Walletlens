const KEY = 'wl_snapshots_v1'
const MAX = 2160 // 90 days × 24 hourly snapshots
const MIN_INTERVAL_MS = 30 * 60 * 1000 // save at most once every 30 minutes

// Module-level cache so repeated callers (saveSnapshot + getSnapshotsForDays)
// within the same event loop tick share one parse instead of each doing their own.
let _snapsCache = null
let _snapsCacheKey = null

export function loadSnapshots() {
  const raw = localStorage.getItem(KEY) || '[]'
  if (raw === _snapsCacheKey && _snapsCache !== null) return _snapsCache
  try {
    _snapsCache = JSON.parse(raw)
    _snapsCacheKey = raw
    return _snapsCache
  } catch { return [] }
}

function _invalidateCache() { _snapsCache = null; _snapsCacheKey = null }

// Module-level last-saved timestamp so saveSnapshot can bail early
// without parsing the full snapshot array first.
let _lastSavedTs = 0

export function saveSnapshot(value, invested) {
  if (!value || value <= 0) return
  const now = Date.now()
  // Fast path: skip expensive JSON.parse when we know it's too soon
  if (_lastSavedTs > 0 && (now - _lastSavedTs) < MIN_INTERVAL_MS) return
  const snaps = loadSnapshots()
  const last = snaps[snaps.length - 1]
  if (last && (now - last.ts) < MIN_INTERVAL_MS) { _lastSavedTs = last.ts; return }
  const entry = { ts: now, v: value, inv: invested || 0 }
  snaps.push(entry)
  const trimmed = snaps.slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); _invalidateCache() } catch {}
  _lastSavedTs = now
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
