// Pushes a portfolio summary to the Android home-screen widgets.
//
// The widgets are native, but the portfolio lives in this page's localStorage,
// which native code cannot read. So the app hands over a small summary through
// a local intent (walletlens://widget-sync) that WidgetSyncActivity receives.
//
// This is a device-local handoff — no network call, nothing leaves the phone.
// It is a no-op everywhere except inside the installed Android app.

const SYNC_KEY = 'wl_widget_sync_at'
const MIN_GAP_MS = 5 * 60 * 1000 // don't fire on every render

// Same detection the biometric bridge uses: the TWA renders in a Chromium
// Custom Tab, which reports itself as an Android webview.
function isAndroidTWA() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /android/i.test(ua) && (/wv\)/.test(ua) || /; wv/.test(ua))
}

function pct(part, whole) {
  if (!whole || whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
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
    if (!isAndroidTWA()) return false
    if (!enriched.length) return false

    if (!force) {
      const last = Number(localStorage.getItem(SYNC_KEY) || 0)
      if (Date.now() - last < MIN_GAP_MS) return false
    }

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

    const url = 'walletlens://widget-sync?data=' + encodeURIComponent(JSON.stringify(payload))

    // A hidden iframe rather than location.href: this is a background sync and
    // must never navigate the page the user is looking at, or leave them on an
    // error page if the handler is missing.
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.src = url
    document.body.appendChild(frame)
    setTimeout(() => { try { frame.remove() } catch { /* already gone */ } }, 1500)

    localStorage.setItem(SYNC_KEY, String(Date.now()))
    return true
  } catch {
    // Widgets are a nice-to-have; never let this break the dashboard.
    return false
  }
}
