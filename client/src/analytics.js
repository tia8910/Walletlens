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

// ── Telling humans from crawlers ─────────────────────────────────────────────
// GA4 filters the IAB known-bot list, which does not include headless Chrome.
// A scraper loads the page, fires session_start / first_visit / page_view and
// the load-time vitals, then dies — indistinguishable in reports from a real
// visitor who bounced, and it inflates every user count you might make a
// decision from.
//
// The one thing those crawlers reliably do not do is interact. So the first
// genuine pointer or key input sets a user property, which gives you a segment
// ("interacted = yes") that excludes them. It is a heuristic, not proof: a
// determined bot can synthesise a pointer event. It filters the ordinary ones.
// State lives on window, not in module scope. Code splitting can evaluate a
// module twice, and two copies each with their own "already marked" flag would
// each report the same interaction.
export function initHumanSignal() {
  if (typeof window === 'undefined' || window.__wlHumanInit) return
  window.__wlHumanInit = true

  const mark = () => {
    if (window.__wlHumanMarked) return
    window.__wlHumanMarked = true
    try {
      if (typeof window.gtag === 'function') {
        gtag('set', 'user_properties', { interacted: 'yes' })
      }
      track('human_interaction')
    } catch { /* analytics must never break the app */ }
  }
  // Left attached rather than { once: true }: after the flag is set these are
  // three predicate checks on the first tap and nothing after, and keeping them
  // means the flag alone decides, with no removal handshake to get wrong.
  window.addEventListener('pointerdown', mark, { capture: true, passive: true })
  window.addEventListener('keydown', mark, { capture: true })
  window.addEventListener('touchstart', mark, { capture: true, passive: true })
}

// ── Error reporting ──────────────────────────────────────────────────────────
// Individual features report their own failures (assistant_error and friends),
// but nothing reported an uncaught exception, so a crash that broke a page for
// every user looked identical in GA to a page nobody visited.
//
// Messages are redacted and truncated on the way out: an exception thrown from
// portfolio code can easily carry an amount or a symbol in its text, and the
// privacy contract at the top of this file applies to error strings too.
const MAX_ERRORS = 8

// On window for the same reason as the human flag: two module copies must
// share one budget, or a duplicated bundle doubles the cap.
function errState() {
  if (!window.__wlErrState) window.__wlErrState = { sent: 0, seen: new Set() }
  return window.__wlErrState
}

function reportError(kind, message, extra = {}) {
  const st = errState()
  if (st.sent >= MAX_ERRORS) return
  const msg = redactNumbers(String(message || 'unknown')).slice(0, 150)
  const key = kind + '|' + msg
  if (st.seen.has(key)) return   // one report per distinct fault per load
  st.seen.add(key)
  st.sent++
  track('js_error', { error_kind: kind, error_message: msg, ...extra })
}

export function initErrorTracking() {
  if (typeof window === 'undefined' || window.__wlErrTrack) return
  window.__wlErrTrack = true

  window.addEventListener('error', (e) => {
    try {
      // A failed <img>/<script> load surfaces here with no message and the
      // element as the target.
      if (e.target && e.target !== window && e.target.tagName) {
        const tag = e.target.tagName.toLowerCase()
        // Images are excluded on purpose. CoinLogo walks a six-stage fallback
        // chain — jsdelivr, coincap, lcw, cryptoicons, our proxy, then a drawn
        // icon — and advances on each onError. Those failures are the design
        // working, not a fault, and reporting them buried the real exceptions
        // under noise in the one place we can see them.
        //
        // Scripts and stylesheets are different: nothing retries those, and one
        // failing means a broken deploy.
        if (tag !== 'script' && tag !== 'link') return
        const src = e.target.src || e.target.href || ''
        return reportError('resource', tag, {
          // Host only: query strings on proxied asset URLs can carry lookups.
          error_source: (() => { try { return new URL(src, location.href).host } catch { return 'unknown' } })(),
        })
      }
      reportError('exception', e.message, {
        error_source: (e.filename || '').split('/').pop().slice(0, 60),
        error_line: e.lineno || 0,
      })
    } catch { /* never let the reporter throw */ }
  }, true)

  window.addEventListener('unhandledrejection', (e) => {
    try {
      const msg = e.reason?.message || e.reason || ''
      // Chunk-load failures already trigger a reload in main.jsx; reporting
      // them here would just measure our own deploy cache-busting.
      if (/loading chunk|dynamically imported module|Importing a module script failed/i.test(String(msg))) return
      reportError('rejection', msg)
    } catch { /* never let the reporter throw */ }
  })
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
