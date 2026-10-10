/**
 * WalletLens extension: background service worker (MV3).
 *
 *  • keeps the portfolio the site syncs in chrome.storage.local;
 *  • every 15 minutes prices it, puts today's change on the toolbar icon,
 *    saves a net worth snapshot for the history chart, and checks alerts;
 *  • every 5 minutes asks an open walletlens.live tab to re-sync.
 */

import {
  ext, STORAGE_KEY, loadPortfolio, getSettings, saveSettings, recordSnapshot,
  evaluateAlerts, badgeFor, fxRates,
} from './lib/core.js'

const SYNC_ALARM = 'wl_sync_alarm'
const CHECK_ALARM = 'wl_check_alarm'

function ensureAlarms() {
  ext.alarms.get(SYNC_ALARM, a => { if (!a) ext.alarms.create(SYNC_ALARM, { periodInMinutes: 5 }) })
  ext.alarms.get(CHECK_ALARM, a => { if (!a) ext.alarms.create(CHECK_ALARM, { delayInMinutes: 1, periodInMinutes: 15 }) })
}
ensureAlarms()
ext.runtime.onInstalled.addListener(() => { ensureAlarms(); check() })
ext.runtime.onStartup?.addListener(() => { ensureAlarms(); check() })

ext.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SYNC_ALARM) requestSyncFromTabs()
  if (alarm.name === CHECK_ALARM) check()
})

// ── The 15 minute check ─────────────────────────────────────────────────────

let running = false
async function check() {
  if (running) return
  running = true
  try {
    const p = await loadPortfolio()
    const settings = await getSettings()
    if (!p) { ext.action.setBadgeText({ text: '' }); return }
    await recordSnapshot(p.total)
    paintBadge(settings.badge ? p.dayPct : NaN)
    const rates = settings.currency !== 'USD' ? await fxRates() : { USD: 1 }
    // Prices for alerts on coins the portfolio does not hold are fetched by
    // the popup when the alert is made, and checked here from the holdings'
    // prices plus a small top up for the rest.
    const prices = { ...p.prices, ...(await pricesForAlerts(settings, p.prices)) }
    const { notes, settings: next } = evaluateAlerts({ ...settings, _rates: rates }, { prices, dayPct: p.dayPct, total: p.total })
    if (notes.length) {
      await saveSettings(next)
      for (const n of notes) notify(n)
    }
  } catch (e) {
    console.debug('[WalletLens] check failed', e)
  } finally {
    running = false
  }
}

async function pricesForAlerts(settings, have) {
  const missing = [...new Set(settings.alerts.filter(a => a.on && !have[a.coinId]).map(a => a.coinId))].filter(id => !/:/.test(id))
  if (!missing.length) return {}
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(missing.join(','))}&vs_currencies=usd`, { signal: AbortSignal.timeout(8000) })
    const j = await r.json()
    return Object.fromEntries(Object.entries(j).map(([id, v]) => [id, { usd: v.usd }]))
  } catch { return {} }
}

function paintBadge(dayPct) {
  const { text, color } = badgeFor(dayPct)
  ext.action.setBadgeText({ text })
  ext.action.setBadgeBackgroundColor({ color })
  ext.action.setBadgeTextColor?.({ color: '#ffffff' })
}

function notify({ id, title, message }) {
  ext.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon-128.png', title, message, priority: 1 })
}
ext.notifications.onClicked.addListener(id => {
  ext.tabs.create({ url: 'https://walletlens.live/dashboard' })
  ext.notifications.clear(id)
})

// ── Messages ──────────────────────────────────────────────────────────────────

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false
  if (message.type === 'SYNC_PORTFOLIO') {
    handleSyncPortfolio(message.data)
    sendResponse({ ok: true })
    return false
  }
  if (message.type === 'GET_PORTFOLIO') {
    ext.storage.local.get(STORAGE_KEY, r => sendResponse({ data: r[STORAGE_KEY] || null }))
    return true
  }
  // The popup asks for a fresh check after it changes settings or alerts.
  if (message.type === 'CHECK_NOW') { check(); sendResponse({ ok: true }); return false }
  return false
})

function handleSyncPortfolio(data) {
  if (!data || !Array.isArray(data.transactions)) return
  ext.storage.local.set({
    [STORAGE_KEY]: {
      transactions: data.transactions,
      wallets: Array.isArray(data.wallets) ? data.wallets : [],
      settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
      drive: data.drive && typeof data.drive === 'object' ? { connected: !!data.drive.connected, backupAt: Number(data.drive.backupAt) || 0 } : null,
      syncedAt: data.syncedAt || Date.now(),
    },
  }, () => check())
}

function requestSyncFromTabs() {
  ext.tabs.query({ url: 'https://walletlens.live/*' }, tabs => {
    for (const tab of tabs || []) ext.tabs.sendMessage(tab.id, { type: 'REQUEST_SYNC' }).catch?.(() => {})
  })
}
