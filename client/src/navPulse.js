// The bottom bar's living icons follow the portfolio pulse. Home works the
// pulse out; this marks it on <html> so the bar, on any page, can read it:
// data-wl-pulse is the level (0 calm, 1 normal, 2 elevated, 3 wild) and
// data-wl-day is the day's direction. null clears both and the bar stays plain.
export function setNavPulse(p, root = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!root) return
  const lv = Number(p?.level)
  if (!p || !Number.isInteger(lv) || lv < 0 || lv > 3) {
    root.removeAttribute('data-wl-pulse')
    root.removeAttribute('data-wl-day')
    return
  }
  root.setAttribute('data-wl-pulse', String(lv))
  root.setAttribute('data-wl-day', p.up ? 'up' : 'down')
}
