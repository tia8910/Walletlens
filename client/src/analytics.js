// GA4 analytics wrapper — PRIVACY CONTRACT:
// WalletLens is marketed as privacy-first, so NOTHING that describes the
// user's portfolio may leave the device: no symbols, no value tiers, no
// asset counts, no asset-class mix, no profit/loss signals, no user-typed
// text. Events describe WHICH features are used — never WHAT the user owns.
// If you add an event, keep every param free of portfolio-derived data.

// KNOWN GAP, recorded rather than quietly left: `page` below is the raw path,
// and this app has routes that name an asset — /asset/bitcoin, /track/solana.
// So for any event fired from those screens the asset reaches GA through the
// path even when no param mentions it. That is ordinary web analytics and the
// asset there may be one the user is merely browsing, not one they hold, which
// is why it is left as it is rather than assumed to be a leak. If it should be
// redacted, this line is the single place to do it.
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

// ── Import funnel ──────────────────────────────────────────────────────────
// One event across all three importers, because the question worth asking is
// comparative: does spreadsheet convert better than screenshot, and where does
// each one lose people. Separate event names per method make that a join in
// GA4; one name with a method param makes it a breakdown.
//
// The spreadsheet path had NO instrumentation at all before this — its only
// trace in GA was the shared profile_created at the very end, so a parse that
// failed, or a file whose columns were not recognised, was indistinguishable
// from a user who never opened the tab.
//
// PARAMS ARE DELIBERATELY COUNT-FREE. The contract at the top of this file
// forbids asset counts, and "how many rows were in your spreadsheet" is one.
// Step and reason answer the funnel question without it; `format` is the file
// extension, which describes the FILE and not the portfolio.
//
//   method: 'screenshot' | 'spreadsheet' | 'voice'
//   step:   'opened' | 'started' | 'parsed' | 'saved' | 'failed'
//   reason: a fixed code, never a message or user text — exception strings
//           routinely carry filenames and cell contents.
//
// The dashboard's import tiles are keyed for the UI, where the spreadsheet one
// is called 'excel' because that is what people call it. The funnel is keyed
// for the data, where it is 'spreadsheet' because the same path takes .csv.
// One map, so a rename on either side cannot silently split one method into
// two rows in GA.
const IMPORT_METHODS = {
  excel: 'spreadsheet',
  spreadsheet: 'spreadsheet',
  screenshot: 'screenshot',
  voice: 'voice',
  backup: 'backup',
}
export function importMethod(key) {
  return IMPORT_METHODS[key] || 'other'
}

export function trackImport({ method, step, reason, format } = {}) {
  track('import_step', {
    import_method: importMethod(method),
    import_step: step,
    ...(reason ? { failure_reason: reason } : {}),
    ...(format ? { file_format: format } : {}),
  })
}

// A successful import, as its own event name rather than only a step.
//
// import_step is the right shape for a funnel and the wrong shape for the
// question actually being asked most of the time, which is "did anyone manage
// to import today". Answering that from import_step means registering
// import_step as a custom dimension first, because GA4 shows event names in
// Realtime and reports but hides parameters until they are declared, and the
// declaration is not retroactive. So a success is also emitted under a name of
// its own: it is visible with no configuration, and it can be marked as a Key
// Event, which import_step cannot be without also counting every failure.
//
// Fired ALONGSIDE trackImport({ step: 'saved' }) rather than replacing it, so
// the funnel still adds up.
export function importCompleted({ method } = {}) {
  track('import_completed', { import_method: importMethod(method) })
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
