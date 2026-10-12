// Which Academy lessons someone has watched, on this device only. No points,
// no streaks: a set of video keys and when each was first played.
//
// Carries over what the old Academy recorded (wl_academy_v1.watched), so a
// lesson watched before the redesign still counts.

export const WATCHED_KEY = 'wl_academy_watched'
export const WATCHED_EVENT = 'wl-academy-watched'

function read() {
  try {
    const now = JSON.parse(localStorage.getItem(WATCHED_KEY) || 'null')
    if (now && typeof now === 'object') return now
    const old = JSON.parse(localStorage.getItem('wl_academy_v1') || '{}')?.watched
    return old && typeof old === 'object' ? old : {}
  } catch { return {} }
}

/** The keys of every lesson watched here. */
export const readWatched = () => new Set(Object.keys(read()))

/** Record a lesson as watched (the first time counts) and tell anyone listening. */
export function markWatched(key) {
  if (!key) return
  const all = read()
  if (all[key]) return
  all[key] = Date.now()
  try { localStorage.setItem('wl_academy_watched', JSON.stringify(all)) } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(WATCHED_EVENT)) } catch { /* no window */ }
}
