// GA4 analytics wrapper — PRIVACY CONTRACT:
// WalletLens is marketed as privacy-first, so NOTHING that describes the
// user's portfolio may leave the device: no symbols, no value tiers, no
// asset counts, no asset-class mix, no profit/loss signals, no user-typed
// text. Events describe WHICH features are used — never WHAT the user owns.
// If you add an event, keep every param free of portfolio-derived data.

export function track(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return
  gtag('event', eventName, {
    page: window.location.pathname,
    ...params,
  })
}

// Redact digits from any captured on-screen text so amounts/prices that
// happen to sit inside a clicked element can never reach analytics.
function redactNumbers(s) {
  return s.replace(/\d[\d,.]*/g, '#')
}

// ── Auto-track user actions ─────────────────────────────────────────────────
// Delegated listeners fire a GA event on clicks and toggles. Free-text input
// values are never read, captured labels have numbers redacted, and select
// values are not transmitted (the element name alone identifies the control).
function safeClassName(el) {
  return typeof el.className === 'string' ? el.className : ''
}
function actionLabel(el) {
  const dt   = el.getAttribute?.('data-track')
  const aria = el.getAttribute?.('aria-label')
  const title= el.getAttribute?.('title')
  let txt = (dt || aria || title || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ')
  if (!txt && el.tagName === 'A') txt = el.getAttribute('href') || ''
  return redactNumbers(txt).slice(0, 80)
}
function elementId(el) {
  return (el.getAttribute?.('data-track-id') || el.id || safeClassName(el) || el.tagName).toString().slice(0, 100)
}

export function initAutoTrack() {
  if (typeof document === 'undefined' || window.__wlAutoTrack) return
  window.__wlAutoTrack = true

  // Throttle: skip events fired within 120 ms of the previous one on the same
  // element to avoid double-counts from rapid taps or event bubbling.
  let lastClickEl = null, lastClickTime = 0
  const CLICK_SEL = 'button, a, [role="button"], [role="tab"], [data-track], summary, label'
  document.addEventListener('click', (e) => {
    try {
      const el = e.target?.closest?.(CLICK_SEL)
      if (!el) return
      const now = Date.now()
      if (el === lastClickEl && now - lastClickTime < 120) return
      lastClickEl = el; lastClickTime = now
      const name = actionLabel(el)
      track('button_click', {
        button_name: name || elementId(el),
        element: elementId(el),
        tag: el.tagName.toLowerCase(),
        ...(el.tagName === 'A' ? { href: (el.getAttribute('href') || '').slice(0, 120) } : {}),
      })
    } catch {}
  }, { capture: true, passive: true })

  // Toggles: report WHICH control changed, never the chosen value — select
  // values can encode currencies/assets, which is user financial context.
  document.addEventListener('change', (e) => {
    try {
      const el = e.target
      if (!el?.matches?.('select, input[type="checkbox"], input[type="radio"], input[type="range"]')) return
      track('ui_change', {
        element: (el.name || el.id || safeClassName(el) || el.tagName).toString().slice(0, 100),
        ...(el.type === 'checkbox' ? { value: el.checked ? 'on' : 'off' } : {}),
        tag: el.tagName.toLowerCase(),
      })
    } catch {}
  }, { capture: true, passive: true })
}

// ── Portfolio-level tracking ─────────────────────────────────────────────────
// Deliberately parameter-free: fires so funnels show the dashboard loaded with
// data, but transmits nothing about size, value, profit, or composition.
export function trackPortfolioLoaded() {
  track('portfolio_loaded')
}

// Track when user adds a holding — method funnel only, no symbol/value/class.
export function trackHoldingAdded({ isFirstHolding } = {}) {
  track('holding_added', {
    is_first_holding: isFirstHolding ? 'yes' : 'no',
  })
}

// Track feature engagement depth
export function trackFeatureEngagement(feature, depth = 1) {
  track('feature_engagement', {
    feature_name: feature,
    engagement_depth: depth,
  })
}

// ── Profile creation tracking ──────────────────────────────────────────────
// Fires ONCE whenever a user populates their portfolio, tagged with the exact
// METHOD they used (the funnel-completion event to watch in GA4 Realtime).
//   method: 'backup_code' | 'qr_scan' | 'screenshot' | 'voice' |
//           'manual_trade' | 'extension_sync' | 'demo'
export function trackProfileCreated({ method, source } = {}) {
  track('profile_created', {
    method,
    source: source || method,
  })
}

// Track referral link clicks
export function trackReferral({ exchange, source }) {
  track('referral_click', {
    exchange_name: exchange,
    referral_source: source,
  })
}

// Track search / market browsing (count only — the typed query is not sent).
export function trackSearch({ resultsCount, source } = {}) {
  track('search', {
    results_count: resultsCount,
    search_source: source || 'market',
  })
}

// Track wallet creation (the user-typed wallet name is not sent).
export function trackWalletCreated({ isFirst } = {}) {
  track('wallet_created', {
    is_first_wallet: isFirst ? 'yes' : 'no',
  })
}

// Track AI feature usage — which feature ran, never portfolio contents.
export function trackAI({ action, planGenerated } = {}) {
  track('ai_interaction', {
    ai_action: action,
    plan_generated: planGenerated ? 'yes' : 'no',
  })
}
