// Is something opaque covering the whole app right now?
//
// The first-run welcome flow is a full-screen, opaque layer over the app. On
// a first visit the app underneath is the empty Home, which runs three
// animation loops of its own — the vault scene, the ticker drift and the
// particle canvas. None of them can be seen behind the welcome, but all kept
// running, rewriting the DOM every frame and competing with the welcome's own
// animation for the main thread. On a 4x-throttled CPU that is most of the
// frame budget, on the one screen every new user sees first.
//
// A full-screen layer calls coverScreen() while it is up; the loops behind it
// ask isScreenCovered() before scheduling a frame and listen with
// onScreenCover() to start again when it goes. A count, not a flag, so two
// layers can overlap without the first to close uncovering the second.

let covers = 0
const listeners = new Set()

function emit() {
  const covered = covers > 0
  for (const fn of [...listeners]) {
    try { fn(covered) } catch { /* a listener's error is its own */ }
  }
}

/** Mark the app as covered. Returns the function that uncovers it (idempotent). */
export function coverScreen() {
  covers++
  if (covers === 1) emit()
  let released = false
  return () => {
    if (released) return
    released = true
    covers = Math.max(0, covers - 1)
    if (covers === 0) emit()
  }
}

export function isScreenCovered() {
  return covers > 0
}

/** Calls fn(covered) whenever that changes. Returns the unsubscribe. */
export function onScreenCover(fn) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
