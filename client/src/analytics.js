// GA4 analytics wrapper
// All events automatically include page_path and session context.
// Register custom dimensions in GA4: Admin → Custom Definitions → Custom Dimensions
// Recommended dims: page, asset_count, portfolio_value_tier, tab, symbol, source

export function track(eventName, params = {}) {
  if (typeof gtag !== 'function') return
  gtag('event', eventName, {
    page: window.location.pathname,
    ...params,
  })
}

// ── Portfolio-level tracking ──────────────────────────────────────────────────

// Call once after holdings are loaded to record portfolio snapshot
export function trackPortfolioLoaded({ assetCount, totalValue, hasProfit, assetTypes }) {
  if (typeof gtag !== 'function') return
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
  if (typeof gtag !== 'function') return
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
  if (typeof gtag !== 'function') return
  gtag('event', 'feature_engagement', {
    page: window.location.pathname,
    feature_name: feature,
    engagement_depth: depth,
  })
}

// Track referral link clicks with full context
export function trackReferral({ exchange, source, assetContext }) {
  if (typeof gtag !== 'function') return
  gtag('event', 'referral_click', {
    page: window.location.pathname,
    exchange_name: exchange,
    referral_source: source,
    asset_context: assetContext || 'none',
  })
}

// Track search / market browsing
export function trackSearch({ query, resultsCount, source }) {
  if (typeof gtag !== 'function') return
  gtag('event', 'search', {
    search_term: query,
    results_count: resultsCount,
    search_source: source || 'market',
  })
}

// Track AI feature usage
export function trackAI({ action, assetCount, planGenerated }) {
  if (typeof gtag !== 'function') return
  gtag('event', 'ai_interaction', {
    page: window.location.pathname,
    ai_action: action,
    asset_count: assetCount,
    plan_generated: planGenerated ? 'yes' : 'no',
  })
}
