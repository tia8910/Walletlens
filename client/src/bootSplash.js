// The splash's exit: the lens opens onto the app.
//
// The splash lives inside #root (index.html), and React replaces #root the
// moment it mounts, so on its own the splash can only vanish in a hard cut.
// Just before mounting, this lays a copy of it over the page, lets it finish
// forming if the app came up very fast, then plays the exit: the lens zooms
// toward the viewer and fades, revealing the app underneath.
//
// The copy drops the `wlboot` class. That class is what index.html's boot
// watchdog looks for to decide React never mounted, and the copy is only ever
// shown AFTER a successful mount.

// Long enough for the lens to have formed, so a fast load does not open onto
// a half-drawn logo. Counted from navigation start, not from here, so a slow
// load waits no longer than it already has.
export const MIN_SPLASH_MS = 1300
const EXIT_MS = 900

export function handOffSplash({ now = () => performance.now(), doc = document } = {}) {
  try {
    const boot = doc.querySelector('#root .wlboot')
    if (!boot) return null
    const copy = boot.cloneNode(true)
    copy.classList.remove('wlboot')
    copy.classList.add('sg-exit')
    copy.style.zIndex = '2147483000'
    copy.style.pointerEvents = 'none'
    doc.body.appendChild(copy)

    let reduced = false
    try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* old webview */ }
    const wait = reduced ? 0 : Math.max(0, MIN_SPLASH_MS - now())
    setTimeout(() => {
      copy.classList.add('sg-out')
      setTimeout(() => copy.remove(), reduced ? 700 : EXIT_MS)
    }, wait)
    return copy
  } catch {
    return null
  }
}
