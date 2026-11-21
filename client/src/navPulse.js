// The bottom bar's living icons follow the portfolio pulse. Home works the
// pulse out; this marks it on <html> so the bar, on any page, can read it:
// data-wl-pulse is the level (0 calm, 1 normal, 2 elevated, 3 wild) and
// data-wl-day is the day's direction. null clears both and the bar stays plain.
// The day's reading is remembered, so the bar moves on any page from the start,
// and ?pulse=0-3&day=up|down shows a level on demand.
const KEY = 'wl_nav_pulse'
const today = () => new Date().toDateString()
let previewing = false
const valid = (lv) => Number.isInteger(lv) && lv >= 0 && lv <= 3

function mark(root, p) {
  if (!root) return
  if (!p) { root.removeAttribute('data-wl-pulse'); root.removeAttribute('data-wl-day'); return }
  root.setAttribute('data-wl-pulse', String(p.level))
  root.setAttribute('data-wl-day', p.up ? 'up' : 'down')
}

export function setNavPulse(p, root = typeof document !== 'undefined' ? document.documentElement : null, store = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (previewing) return // a ?pulse= preview holds until the app is reloaded
  const lv = Number(p?.level)
  const next = p && valid(lv) ? { level: lv, up: !!p.up } : null
  mark(root, next)
  try { next ? store?.setItem(KEY, JSON.stringify({ ...next, day: today() })) : store?.removeItem(KEY) } catch { /* private mode */ }
}

/** On start: a ?pulse= preview, else today's remembered reading. */
export function initNavPulse(search = typeof location !== 'undefined' ? location.search : '', root = typeof document !== 'undefined' ? document.documentElement : null, store = typeof localStorage !== 'undefined' ? localStorage : null) {
  const q = new URLSearchParams(search || '')
  if (q.has('pulse')) {
    const lv = Number(q.get('pulse'))
    if (valid(lv)) { previewing = true; mark(root, { level: lv, up: q.get('day') !== 'down' }); return }
  }
  try {
    const s = JSON.parse(store?.getItem(KEY) || 'null')
    if (s && s.day === today() && valid(s.level)) mark(root, s)
  } catch { /* nothing remembered */ }
}
