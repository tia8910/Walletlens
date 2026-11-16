/**
 * WalletLens Portfolio Extension — Content Script
 * Runs on https://walletlens.live/* at document_idle.
 * Reads portfolio data from localStorage and syncs it to the background
 * service worker via chrome.runtime.sendMessage.
 */

'use strict';

const ext = typeof browser !== 'undefined' ? browser : chrome;

// Tell the page the extension is here, so walletlens.live stops offering it.
// Only the version number: the page learns nothing else from it.
try {
  document.documentElement.setAttribute('data-wl-ext', ext.runtime.getManifest().version);
} catch {}

// Keys used by the WalletLens app
const TX_KEY       = 'crypto_tracker_transactions';
const WALLETS_KEY  = 'crypto_tracker_wallets';
const SETTINGS_KEY = 'wl_settings';

/**
 * Whether this browser backs up to Google Drive, and when it last did. Only a
 * yes/no and a time: no token, key or file content ever leaves the page.
 */
function driveStatus() {
  try {
    const connected = !!(localStorage.getItem('wl_drive_file_id') || localStorage.getItem('wl_drive_refresh'))
    const backupAt = Number(localStorage.getItem('wl_drive_remote_at') || localStorage.getItem('wl_drive_backup_at') || 0)
    return { connected, backupAt }
  } catch { return { connected: false, backupAt: 0 } }
}

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
        drive: driveStatus(),
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
      drive:        driveStatus(),
      syncedAt:     payload.syncedAt || Date.now(),
    },
  }).catch(() => {});
}

window.addEventListener('message', handleAppMessage);

/**
 * The app's own latest prices, for the coins this portfolio holds only.
 *
 * The extension prices from CoinGecko, and when CoinGecko rate limits or is
 * blocked, a coin outside the top 250 had no price and was counted at what was
 * paid for it (a small coin bought for $2,000 and now worth $96 showed as
 * $2,000), metals had no day change, and the total drifted far from the app.
 * The app already prices everything (Binance, DexScreener, metals, stocks),
 * so its prices are borrowed as a fallback.
 */
const APP_PRICE_KEY = 'crypto_tracker_price_cache_v1';
let lastPriceHash = null;
// The app's logos too: for each held coin, the picture the app found that
// loads on this device (or the image CoinGecko gave it), and whether its ink
// is dark enough to need a white plate. The popup then shows the same logo.
const LOGO_RESOLVED_KEY = 'wl_logo_resolved';
const LOGO_DARK_KEY = 'wl_logo_dark';
const IMAGE_CACHE_KEY = 'crypto_tracker_image_cache_v2';
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {} } catch { return {} } };
const absUrl = (u) => { try { return new URL(String(u), location.origin).href } catch { return null } };
function syncPrices(force) {
  try {
    const cache = readJson(APP_PRICE_KEY);
    const resolved = readJson(LOGO_RESOLVED_KEY);
    const images = readJson(IMAGE_CACHE_KEY);
    const dark = readJson(LOGO_DARK_KEY);
    const held = new Set((JSON.parse(localStorage.getItem(TX_KEY) || '[]') || []).map(t => String(t && t.coin_id || '')));
    const prices = {};
    const logos = {};
    for (const id of held) {
      if (!id) continue;
      const p = cache[id];
      const usd = Number(p && p.usd);
      if (usd > 0) {
        const chg = Number(p.usd_24h_change);
        prices[id] = { usd, chg: Number.isFinite(chg) ? chg : null };
      }
      const srcs = [];
      for (const u of [resolved[id], images[id]]) {
        if (typeof u !== 'string' || !u) continue;
        const a = absUrl(u);
        if (a && /^https?:/.test(a) && !srcs.some(x => x.src === a)) srcs.push({ src: a, dark: dark[u] === true || dark[a] === true });
      }
      if (srcs.length) logos[id] = srcs;
    }
    if (!Object.keys(prices).length && !Object.keys(logos).length) return;
    const body = JSON.stringify([prices, logos]);
    let h = 2166136261; for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = (h * 16777619) >>> 0 }
    const hash = h + ':' + body.length;
    if (!force && hash === lastPriceHash) return;
    lastPriceHash = hash;
    ext.runtime.sendMessage({ type: 'SYNC_PRICES', data: { prices, logos, at: Date.now() } }).catch(() => {});
  } catch {}
}

// Initial sync when the content script loads
syncPortfolio();
setTimeout(() => syncPrices(true), 4000); // after the app's first price fetch

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
window.addEventListener('beforeunload', () => { syncPortfolio(); syncPrices(true); });

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
// Prices change constantly: send them once a minute when they did.
setInterval(() => { if (!document.hidden) syncPrices(false); }, 60_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pollLocalStorage();
});
