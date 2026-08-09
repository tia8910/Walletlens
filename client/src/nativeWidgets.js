// Pushes a portfolio summary to the Android home-screen widgets.
//
// The widgets are native, but the portfolio lives in this page's localStorage,
// which native code cannot read. So the app hands over a small summary through
// a local intent (walletlens://widget-sync) that WidgetSyncActivity receives.
//
// This is a device-local handoff — no network call, nothing leaves the phone.
// It is a no-op everywhere except inside the installed Android app.

import { isAndroidTWA, fireNativeIntent } from './nativeBridge'

const SYNC_KEY = 'wl_widget_sync_at'
const PAYLOAD_KEY = 'wl_widget_payload'
const DIAG_KEY = 'wl_widget_diag'
const FRESH_KEY = 'wl_widget_session_synced'
const MIN_GAP_MS = 5 * 60 * 1000 // don't fire on every render

function pct(part, whole) {
  if (!whole || whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

/**
 * Record why the last sync attempt did or didn't fire.
 *
 * There is no logcat on a user's phone and the intent fails silently by design,
 * so without this the only symptom of a broken sync is a widget stuck at zero —
 * which looks identical whether the app wasn't detected, the portfolio was
 * empty, or the throttle was still holding. Settings reads this back.
 */
function note(result, extra = {}) {
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify({
      at: Date.now(),
      result,
      referrer: (typeof document !== 'undefined' && document.referrer) || '',
      ua: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
      ...extra,
    }))
  } catch { /* diagnostics are never worth throwing over */ }
  return result === 'fired'
}

/** What the last attempt concluded, for the Settings readout. */
export function widgetSyncDiagnostics() {
  let diag = null
  let hasPayload = false
  try { diag = JSON.parse(localStorage.getItem(DIAG_KEY) || 'null') } catch { /* corrupt */ }
  try { hasPayload = !!localStorage.getItem(PAYLOAD_KEY) } catch { /* blocked */ }
  let lastSync = 0
  try { lastSync = Number(localStorage.getItem(SYNC_KEY) || 0) } catch { /* blocked */ }
  return { diag, hasPayload, lastSync, twa: isAndroidTWA() }
}

/**
 * The language chosen in the web app.
 *
 * It rides along on the widget payload because native code cannot read
 * localStorage — the page is a Custom Tab in another process — and
 * PeriodicUpdateWorker needs it to send notifications in a language the user
 * actually reads. The device locale is not a stand-in: someone on an English
 * phone can deliberately be using WalletLens in Arabic.
 */
function currentLang() {
  try {
    const l = localStorage.getItem('wl_lang')
    return ['en', 'ar', 'fr', 'es'].includes(l) ? l : 'en'
  } catch { return 'en' }
}

/**
 * Push the language across on its own, right after the user picks one.
 *
 * The regular sync is throttled and only runs from the dashboard, so without
 * this a language change could take until the next portfolio sync to reach
 * the notifications. Choosing a language is a tap, which is what
 * fireNativeIntent needs, so this can fire immediately — and it reuses the
 * stored payload so the widgets are not blanked by a summary-less message.
 */
export function syncLanguage({ retryOnGesture = true } = {}) {
  try {
    if (!isAndroidTWA()) return note('not-twa')
    let payload = {}
    try { payload = JSON.parse(localStorage.getItem(PAYLOAD_KEY) || '{}') } catch { /* fresh install */ }
    payload.lang = currentLang()
    const json = JSON.stringify(payload)
    try { localStorage.setItem(PAYLOAD_KEY, json) } catch { /* quota; carry on */ }
    if (!fireNativeIntent('walletlens://widget-sync?data=' + encodeURIComponent(json))) {
      // Activation is transient and the picker may close, re-render and settle
      // before this runs — and a language change that misses the window then
      // waits for the next dashboard sync to reach the notifications. Ride the
      // next tap instead; `once` means at most one extra attempt.
      if (retryOnGesture && typeof document !== 'undefined') {
        document.addEventListener('pointerup', () => syncLanguage({ retryOnGesture: false }), { once: true })
      }
      return note('no-activation', { lang: payload.lang })
    }
    return note('fired', { lang: payload.lang })
  } catch (e) {
    return note('threw', { message: String(e && e.message) })
  }
}

/**
 * Re-send the most recent summary, ignoring both the throttle and the TWA
 * check. Wired to a button, so the user has already told us this is the app —
 * and if detection is what's broken, this is the way round it.
 */
export function forceSyncWidgets() {
  try {
    const raw = localStorage.getItem(PAYLOAD_KEY)
    if (!raw) return note('no-payload')
    // Same rule as syncWidgets: only stamp a sync that actually left. This
    // path runs from a button, so activation is normally present — but if the
    // tap has already expired by the time we get here, saying "fired" would be
    // a lie the Settings readout then repeats back to the user.
    if (!fireNativeIntent('walletlens://widget-sync?data=' + encodeURIComponent(raw))) {
      return note('no-activation', { manual: true })
    }
    localStorage.setItem(SYNC_KEY, String(Date.now()))
    return note('fired', { manual: true })
  } catch {
    return note('threw')
  }
}

/**
 * @param {object}   o
 * @param {Array}    o.enriched     holdings as built by the Dashboard memo
 *                                  ({ coin_symbol, value, price, pct24h, … })
 * @param {number}   o.totalValue   net worth
 * @param {Function} [o.categoryOf] the Dashboard's categorizeAsset, passed in
 *                                  rather than duplicated so the widget's
 *                                  allocation always matches the app's
 * @param {boolean}  [o.force]      bypass the throttle (after a manual refresh)
 */
export function syncWidgets({ enriched = [], totalValue = 0, categoryOf = null, force = false } = {}) {
  try {
    if (!enriched.length) return note('no-holdings')

    // Day's move, weighted by position size rather than a flat average — a 5%
    // move on a $10 bag shouldn't read the same as 5% on half the portfolio.
    let dayPnl = 0
    let winners = 0
    let losers = 0
    for (const h of enriched) {
      const chg = Number(h.pct24h || 0)
      const val = Number(h.value || 0)
      if (val > 0 && chg) dayPnl += (val * chg) / 100
      if (chg > 0) winners++
      else if (chg < 0) losers++
    }
    const dayPct = totalValue > 0 ? (dayPnl / totalValue) * 100 : 0

    // Allocation by asset class. The widget layout has exactly four bars, so
    // metals map to the gold bar and anything that isn't crypto/stocks/metals
    // (cash, real estate) lands in the last one.
    const bucket = { crypto: 0, stocks: 0, gold: 0, cash: 0 }
    for (const h of enriched) {
      const val = Number(h.value || 0)
      const cat = categoryOf ? categoryOf(h) : 'crypto'
      if (cat === 'stocks') bucket.stocks += val
      else if (cat === 'metals') bucket.gold += val
      else if (cat === 'crypto') bucket.crypto += val
      else bucket.cash += val
    }

    // The user's own biggest movers, not the market's.
    const movers = [...enriched]
      .filter(h => Number(h.value || 0) > 0)
      .sort((a, b) => Math.abs(Number(b.pct24h || 0)) - Math.abs(Number(a.pct24h || 0)))
      .slice(0, 5)
      .map(h => ({
        s: String(h.coin_symbol || '').toUpperCase().slice(0, 6),
        p: Number(h.price || 0) >= 1
          ? '$' + Number(h.price || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
          : '$' + Number(h.price || 0).toPrecision(3),
        c: Math.round(Number(h.pct24h || 0) * 100) / 100,
      }))

    const payload = {
      lang: currentLang(),
      nw: Math.round(totalValue * 100) / 100,
      pnl: Math.round(dayPnl * 100) / 100,
      pnlPct: Math.round(dayPct * 100) / 100,
      tracked: enriched.length,
      winners,
      losers,
      alloc: {
        crypto: pct(bucket.crypto, totalValue),
        stocks: pct(bucket.stocks, totalValue),
        gold: pct(bucket.gold, totalValue),
        cash: pct(bucket.cash, totalValue),
      },
      movers,
    }

    // Stash it before deciding whether to send. If we don't fire — wrong
    // context, throttled, detection wrong — the Settings "Sync now" button can
    // still push this exact summary, and the stored copy is proof the dashboard
    // computed something sane.
    const json = JSON.stringify(payload)
    try { localStorage.setItem(PAYLOAD_KEY, json) } catch { /* quota; carry on */ }

    if (!isAndroidTWA()) return note('not-twa', { nw: payload.nw, tracked: payload.tracked })

    // The throttle lives here, in localStorage; the widget data it is throttling
    // lives in Android SharedPreferences. They are separate stores with separate
    // lifetimes, and only one of them can be wiped: clearing the app's data
    // empties the widgets while this side carries on believing it synced
    // recently, so the widgets sit at "Not yet updated" until the gap expires
    // and the dashboard happens to be open again.
    //
    // A cold start is exactly when that reset may have happened, and it is
    // cheap to cover: force the first sync of each app session. sessionStorage
    // is per document, so this is once per launch, not once per navigation.
    let firstThisSession = false
    try {
      firstThisSession = sessionStorage.getItem(FRESH_KEY) !== '1'
      if (firstThisSession) sessionStorage.setItem(FRESH_KEY, '1')
    } catch { /* private mode: fall back to the throttle */ }

    if (!force && !firstThisSession) {
      const last = Number(localStorage.getItem(SYNC_KEY) || 0)
      if (Date.now() - last < MIN_GAP_MS) return note('throttled')
    }

    // fireNativeIntent refuses without user activation, because the navigation
    // it performs would end the TWA session. Record the timestamp only when it
    // actually went — stamping a sync that never happened would start the
    // throttle against a widget that was never updated.
    if (!fireNativeIntent('walletlens://widget-sync?data=' + encodeURIComponent(json))) {
      return note('no-activation', { nw: payload.nw, tracked: payload.tracked })
    }

    localStorage.setItem(SYNC_KEY, String(Date.now()))
    return note('fired', { nw: payload.nw, tracked: payload.tracked })
  } catch (e) {
    // Widgets are a nice-to-have; never let this break the dashboard.
    return note('threw', { message: String(e && e.message) })
  }
}
