// Which of the app's own features someone has actually opened.
//
// The feature tips in push-api/notify-logic.js only earn their place when they
// are aimed at someone who has not found the thing yet. Without a signal for
// that, a tip is a guess — and the one tip already gated that loosely
// (smartimport) carries a comment saying not to add more like it.
//
// This is that signal, kept deliberately small: an id and when it was first
// opened, nothing about what the user did there. It never leaves the device
// except as the booleans featureSetup() derives from it, which is the same
// shape the server already receives for Guardian, Vision and the rest.

const KEY = 'wl_feature_use'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}

/**
 * Record that a feature was opened. First time only — the timestamp is the
 * discovery moment, and overwriting it on every visit would lose that while
 * writing to storage on every render.
 *
 * @param {string} id  short, stable; matches the tip ids the server knows
 */
export function noteFeatureUse(id) {
  if (!id) return
  try {
    const seen = read()
    if (seen[id]) return
    seen[id] = Date.now()
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch { /* private mode: tips stay silent, which is the safe direction */ }
}

/** @returns {boolean} whether this feature has ever been opened */
export function usedFeature(id) {
  return !!read()[id]
}

/** Every recorded id, for tests and diagnostics. */
export function usedFeatures() {
  return Object.keys(read())
}
