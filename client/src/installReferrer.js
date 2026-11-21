// Which link brought an Android install, reported once to analytics.
//
// The app reads Google Play's Install Referrer on its first launch (native
// InstallReferrer.java) and hands it over through the bridge. That string is
// the referrer= text that was on the Play link the person tapped, e.g.
// "utm_source=walletlens.live&utm_medium=website&utm_campaign=landing_hero",
// or Play's own "utm_source=google-play&utm_medium=organic" for someone who
// found the app by searching the store.
//
// Only the campaign fields are sent, never the raw string, and only once.

import { track } from './analytics'

const SENT_KEY = 'wl_install_ref_sent'

/** The utm fields of a referrer string; null when there is nothing to read. */
export function parseReferrer(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  let q
  try { q = new URLSearchParams(s.includes('=') ? s : '') } catch { return null }
  const pick = (k) => String(q.get(k) || '').slice(0, 100)
  const out = {
    ref_source: pick('utm_source') || 'unknown',
    ref_medium: pick('utm_medium'),
    ref_campaign: pick('utm_campaign'),
    ref_content: pick('utm_content'),
  }
  return out
}

/**
 * Report the install referrer once, if the app has one. Returns true once it
 * has been sent. Safe to call on every launch and outside the app (no-op).
 */
export function reportInstallReferrer(win = typeof window !== 'undefined' ? window : null, store = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const b = win?.AndroidBridge
    if (!b || typeof b.installReferrer !== 'function') return false
    if (store?.getItem(SENT_KEY)) return true
    const json = b.installReferrer()
    // Play has not answered yet (the first launch asks in the background);
    // the next launch tries again.
    if (!json) return false
    const data = JSON.parse(json)
    const fields = parseReferrer(data?.referrer) || { ref_source: 'none' }
    track('install_referrer', fields)
    store?.setItem(SENT_KEY, '1')
    return true
  } catch {
    return false
  }
}
