// GA4 analytics wrapper
// All events automatically include page_path and session context.
// Register custom dimensions in GA4: Admin → Custom Definitions → Custom Dimensions
// Recommended dims: page, asset_count, portfolio_value_tier, tab, symbol, source

export function track(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return
  gtag('event', eventName, {
    page: window.location.pathname,
    ...params,
  })
}

// ── Auto-track EVERY user action ───────────────────────────────────────────
// Delegated listeners fire a GA event on every click and every selection /
// toggle across the whole app — so no interaction goes unmeasured, on top of
// the named events above. Text-input *values* are intentionally never read,
// to avoid logging anything sensitive the user types.
function safeClassName(el) {
  return typeof el.className === 'string' ? el.className : ''
}
function actionLabel(el) {
  const dt   = el.getAttribute?.('data-track')
  const aria = el.getAttribute?.('aria-label')
  const title= el.getAttribute?.('title')
  let txt = (dt || aria || title || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ')
  if (!txt && el.tagName === 'A') txt = el.getAttribute('href') || ''
  return txt.slice(0, 80)
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

  // Selections & toggles (NOT free-text inputs — values are never captured there).
  document.addEventListener('change', (e) => {
    try {
      const el = e.target
      if (!el?.matches?.('select, input[type="checkbox"], input[type="radio"], input[type="range"]')) return
      const value = el.type === 'checkbox'
        ? (el.checked ? 'on' : 'off')
        : String(el.value ?? '').slice(0, 80)
      track('ui_change', {
        element: (el.name || el.id || safeClassName(el) || el.tagName).toString().slice(0, 100),
        value,
        tag: el.tagName.toLowerCase(),
      })
    } catch {}
  }, { capture: true, passive: true })
}

// ── Portfolio-level tracking ──────────────────────────────────────────────────

// Call once after holdings are loaded to record portfolio snapshot
export function trackPortfolioLoaded({ assetCount, totalValue, hasProfit, assetTypes }) {
  if (typeof window.gtag !== 'function') return
  const valueTier =
    totalValue >= 100000 ? '100k+' :
    totalValue >= 10000  ? '10k-100k' :
    totalValue >= 1000   ? '1k-10k' :
    totalValue >= 100    ? '100-1k' : '<100'

  gtag('event', 'portfolio_loaded', {
    page: window.location.pathname,
    asset_count: assetCount,
    portfolio_value_tier: valueTier,
    has_profit: hasProfit ? 'yes' : 'no',
    asset_types: assetTypes || 'crypto_only',   // e.g. 'crypto+metals+stocks'
  })
}

// Track when user adds a holding
export function trackHoldingAdded({ symbol, assetClass, valueUsd, isFirstHolding }) {
  if (typeof window.gtag !== 'function') return
  gtag('event', 'holding_added', {
    page: window.location.pathname,
    symbol: symbol?.toUpperCase(),
    asset_class: assetClass || 'crypto',
    value_tier: valueUsd >= 10000 ? '10k+' : valueUsd >= 1000 ? '1k-10k' : valueUsd >= 100 ? '100-1k' : '<100',
    is_first_holding: isFirstHolding ? 'yes' : 'no',
  })
}

// Track feature engagement depth
export function trackFeatureEngagement(feature, depth = 1) {
  if (typeof window.gtag !== 'function') return
  gtag('event', 'feature_engagement', {
    page: window.location.pathname,
    feature_name: feature,
    engagement_depth: depth,
  })
}

// ── Profile creation tracking ──────────────────────────────────────────────
// Fires ONCE whenever a user populates their portfolio, tagged with the exact
// METHOD they used. This is the single funnel-completion event to watch in GA4
// Realtime to see HOW users build their profiles.
//   method: 'backup_code' | 'qr_scan' | 'screenshot' | 'voice' |
//           'manual_trade' | 'extension_sync' | 'demo'
export function trackProfileCreated({ method, assetCount, source }) {
  if (typeof window.gtag !== 'function') return
  gtag('event', 'profile_created', {
    page: window.location.pathname,
    method,
    asset_count: assetCount ?? 0,
    source: source || method,
  })
}

// Track referral link clicks with full context
export function trackReferral({ exchange, source, assetContext }) {
  if (typeof window.gtag !== 'function') return
  gtag('event', 'referral_click', {
    page: window.location.pathname,
    exchange_name: exchange,
    referral_source: source,
    asset_context: assetContext || 'none',
  })
}

// Track search / market browsing
export function trackSearch({ query, resultsCount, source }) {
  if (typeof window.gtag !== 'function') return
  gtag('event', 'search', {
    search_term: query,
    results_count: resultsCount,
    search_source: source || 'market',
  })
}

// Track wallet creation
export function trackWalletCreated({ walletName, isFirst } = {}) {
  if (typeof window.gtag !== 'function') return
  gtag('event', 'wallet_created', {
    page: window.location.pathname,
    wallet_name: walletName || 'unnamed',
    is_first_wallet: isFirst ? 'yes' : 'no',
  })
}

// Track AI feature usage
export function trackAI({ action, assetCount, planGenerated }) {
  if (typeof window.gtag !== 'function') return
  gtag('event', 'ai_interaction', {
    page: window.location.pathname,
    ai_action: action,
    asset_count: assetCount,
    plan_generated: planGenerated ? 'yes' : 'no',
  })
}
