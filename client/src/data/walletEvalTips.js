// Shared plumbing for the wallet-evaluation tips.
//
// There are two evaluations in the app — Coach's and the Dashboard's — with
// overlapping but not identical pillar sets, so they cannot simply be merged
// without changing the scores users already see. What they can share is the
// copy: the wording of "Only 3 holdings — extremely concentrated" was
// duplicated verbatim in both files, and translating it twice would have
// meant two sets of keys drifting apart.
//
// A tip is [key, ...args]. The check functions that produce them run at module
// scope, where there is no hook to call useLanguage() from, so they hand back
// a descriptor and the row renders it.

/** Mix keys → translation keys, so a generated sentence can name the class. */
export const CLASS_LABEL_KEYS = {
  crypto: 'clsCrypto', stock: 'clsStock', metal: 'clsMetal',
  cash: 'clsCash', bond: 'clsBond', other: 'clsOther',
}

/**
 * Render a tip descriptor.
 *
 * Most args are already-formatted numbers, but an arg of the shape
 * `{ k: 'someKey' }` is itself a translation key — the asset-class nouns that
 * get dropped into a sentence. Resolving those here keeps the check functions
 * hook-free.
 *
 * Falls back to returning whatever `t` gave back when the key does not resolve
 * to a function, so a missing key shows the key rather than throwing inside a
 * render.
 */
export function renderTip(tip, t) {
  if (!Array.isArray(tip) || !tip.length) return ''
  const fn = t(tip[0])
  if (typeof fn !== 'function') return fn
  return fn(...tip.slice(1).map(a => (a && typeof a === 'object' && a.k) ? t(a.k) : a))
}
