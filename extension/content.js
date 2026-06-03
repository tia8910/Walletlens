/**
 * WalletLens Portfolio Extension — Content Script
 * Runs on https://walletlens.live/* at document_idle.
 * Reads portfolio data from localStorage and syncs it to the background
 * service worker via chrome.runtime.sendMessage.
 */

'use strict';

const ext = typeof browser !== 'undefined' ? browser : chrome;

// Keys used by the WalletLens app
const TX_KEY       = 'crypto_tracker_transactions';
const WALLETS_KEY  = 'crypto_tracker_wallets';
const SETTINGS_KEY = 'wl_settings';

/**
 * Read all relevant localStorage keys and send them to the background worker.
 */
function syncPortfolio() {
  try {
    const rawTx       = localStorage.getItem(TX_KEY);
    const rawWallets  = localStorage.getItem(WALLETS_KEY);
    const rawSettings = localStorage.getItem(SETTINGS_KEY);

    const transactions = rawTx       ? JSON.parse(rawTx)       : [];
    const wallets      = rawWallets  ? JSON.parse(rawWallets)  : [];
    const settings     = rawSettings ? JSON.parse(rawSettings) : {};

    // Only send if we have at least some transaction data
    // (avoids clobbering a valid cache with an empty-page read)
    if (!Array.isArray(transactions)) return;

    ext.runtime.sendMessage({
      type: 'SYNC_PORTFOLIO',
      data: {
        transactions,
        wallets,
        settings,
        syncedAt: Date.now(),
      },
    }).catch(() => {
      // Background service worker may be inactive on first send — ignore
    });
  } catch (err) {
    // JSON parse errors or localStorage access errors — fail silently
    console.debug('[WalletLens ext] syncPortfolio error:', err);
  }
}

/**
 * Relay a portfolio pushed directly by the web app via window.postMessage.
 * This makes the extension import automatically the moment the dashboard has
 * data — independent of localStorage load-order or where the app stores data.
 */
function handleAppMessage(event) {
  // Only trust messages from this same page (same window, same origin).
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== 'walletlens-app' || msg.type !== 'WL_PORTFOLIO') return;

  const payload = msg.payload || {};
  if (!Array.isArray(payload.transactions)) return;

  ext.runtime.sendMessage({
    type: 'SYNC_PORTFOLIO',
    data: {
      transactions: payload.transactions,
      wallets:      Array.isArray(payload.wallets) ? payload.wallets : [],
      settings:     (payload.settings && typeof payload.settings === 'object') ? payload.settings : {},
      syncedAt:     payload.syncedAt || Date.now(),
    },
  }).catch(() => {});
}

window.addEventListener('message', handleAppMessage);

// Initial sync when the content script loads
syncPortfolio();

// Re-sync whenever localStorage changes (same-tab writes)
window.addEventListener('storage', (event) => {
  if (
    event.key === TX_KEY ||
    event.key === WALLETS_KEY ||
    event.key === SETTINGS_KEY
  ) {
    syncPortfolio();
  }
});

// Listen for REQUEST_SYNC from the background alarm
ext.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'REQUEST_SYNC') {
    syncPortfolio();
  }
});

// Sync before the tab closes so trades added just before closing aren't lost.
window.addEventListener('beforeunload', syncPortfolio);

// Also observe localStorage mutation from within the same tab via a
// MutationObserver on storage isn't possible, but we can poll using
// a lightweight interval when the page is visible (paused when hidden)
// to catch in-app writes that don't fire the 'storage' event.
let lastTxHash = null;

function quickHash(str) {
  // FNV-1a 32-bit — fast, no crypto needed
  let h = 2166136261;
  for (let i = 0; i < Math.min(str.length, 512); i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function pollLocalStorage() {
  if (document.hidden) return;
  try {
    const raw = localStorage.getItem(TX_KEY) || '[]';
    const hash = quickHash(raw);
    if (hash !== lastTxHash) {
      lastTxHash = hash;
      syncPortfolio();
    }
  } catch {}
}

// Poll every 10 seconds while the tab is active
setInterval(pollLocalStorage, 10_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pollLocalStorage();
});
