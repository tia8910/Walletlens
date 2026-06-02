/**
 * WalletLens Portfolio Extension — Background Service Worker (MV3)
 * Persists portfolio data and triggers periodic re-syncs from the site tab.
 */

'use strict';

const ext = typeof browser !== 'undefined' ? browser : chrome;

const STORAGE_KEY  = 'wl_portfolio_cache';
const ALARM_NAME   = 'wl_sync_alarm';
const ALARM_PERIOD = 5; // minutes

// ── Alarm setup ──────────────────────────────────────────────────────────────

// Create the periodic alarm when the service worker first installs / wakes up.
function ensureAlarm() {
  ext.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      ext.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD });
    }
  });
}

ensureAlarm();

ext.runtime.onInstalled.addListener(() => {
  ensureAlarm();
});

// When the alarm fires, ask any open walletlens.live tabs to re-sync
ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  requestSyncFromTabs();
});

// ── Message handling ─────────────────────────────────────────────────────────

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  if (message.type === 'SYNC_PORTFOLIO') {
    handleSyncPortfolio(message.data);
    sendResponse({ ok: true });
    return false; // synchronous response
  }

  if (message.type === 'GET_PORTFOLIO') {
    ext.storage.local.get(STORAGE_KEY, (result) => {
      sendResponse({ data: result[STORAGE_KEY] || null });
    });
    return true; // async
  }

  return false;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Persist the synced portfolio payload to chrome.storage.local.
 * @param {object} data
 */
function handleSyncPortfolio(data) {
  if (!data || !Array.isArray(data.transactions)) return;

  // Sanitise and store
  const payload = {
    transactions: data.transactions,
    wallets:      Array.isArray(data.wallets) ? data.wallets : [],
    settings:     (data.settings && typeof data.settings === 'object') ? data.settings : {},
    syncedAt:     data.syncedAt || Date.now(),
  };

  ext.storage.local.set({ [STORAGE_KEY]: payload });
}

/**
 * Send REQUEST_SYNC to all active walletlens.live tabs so the content
 * script re-reads localStorage.
 */
function requestSyncFromTabs() {
  ext.tabs.query({ url: 'https://walletlens.live/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    for (const tab of tabs) {
      ext.tabs.sendMessage(tab.id, { type: 'REQUEST_SYNC' }).catch?.(() => {});
    }
  });
}
