const KEY = 'wl_snapshots_v1'
const MAX = 90 // keep 90 days

export function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function saveSnapshot(value, invested) {
  if (!value || value <= 0) return
  const today = new Date().toISOString().split('T')[0]
  const snaps = loadSnapshots()
  // Only one snapshot per day — update if same day, else append
  const last = snaps[snaps.length - 1]
  const entry = { ts: Date.now(), date: today, v: value, inv: invested || 0 }
  if (last && last.date === today) {
    snaps[snaps.length - 1] = entry
  } else {
    snaps.push(entry)
  }
  // Keep only last MAX entries
  const trimmed = snaps.slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)) } catch {}
  return trimmed
}

export function getSnapshotsForDays(days) {
  const snaps = loadSnapshots()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return snaps.filter(s => s.ts >= cutoff)
}
