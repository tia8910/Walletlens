// Bridge that pushes the live portfolio to the WalletLens browser extension.
//
// The extension's content script reads localStorage, but that only catches
// data that's already persisted and is subject to load-order timing. To make
// the extension import automatically — the moment the dashboard has data — we
// also broadcast the current portfolio over window.postMessage. The content
// script listens for this message and relays it to the extension's background
// worker, so the popup shows fresh data without any manual paste.

const MSG_SOURCE = 'walletlens-app'
const MSG_TYPE = 'WL_PORTFOLIO'

// Broadcast the current portfolio to the extension (if installed). Safe no-op
// when no extension is listening. `transactions` must be an array.
export function pushPortfolioToExtension({ transactions, wallets, settings } = {}) {
  if (!Array.isArray(transactions)) return
  try {
    let resolvedSettings = settings
    if (resolvedSettings == null) {
      try { resolvedSettings = JSON.parse(localStorage.getItem('wl_settings') || '{}') } catch { resolvedSettings = {} }
    }
    window.postMessage({
      source: MSG_SOURCE,
      type: MSG_TYPE,
      payload: {
        transactions,
        wallets: Array.isArray(wallets) ? wallets : [],
        settings: resolvedSettings && typeof resolvedSettings === 'object' ? resolvedSettings : {},
        syncedAt: Date.now(),
      },
    }, window.location.origin)
  } catch {
    // postMessage unavailable (SSR / locked-down context) — ignore.
  }
}
