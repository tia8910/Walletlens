// Thin localStorage wrappers + global cache primitives. Keeping these
// in one place means the schema-migration code, the tests, and api.js
// all read/write through the same API, and there's a single point to
// add e.g. IndexedDB or per-wallet partitioning later.

const PREFIX = 'crypto_tracker_'

// Parsed-JSON cache keyed by storage key, holding the last raw string seen
// alongside its parsed value. getPortfolio/getTransactions/etc. are all
// called back-to-back on nearly every page load and poll tick, each
// independently re-parsing the same (often large) transactions blob — this
// skips the JSON.parse when the underlying string hasn't changed since the
// last read. Callers get a fresh shallow copy each time so mutating the
// returned array (a common pattern: load, push/unshift, saveData) can never
// corrupt the cached value.
const parseCache = new Map()

export function loadData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`)
    if (raw == null) return fallback
    const cached = parseCache.get(key)
    const value = (cached && cached.raw === raw) ? cached.value : JSON.parse(raw)
    if (!cached || cached.raw !== raw) parseCache.set(key, { raw, value })
    if (Array.isArray(value)) return value.slice()
    if (value && typeof value === 'object') return { ...value }
    return value
  } catch { return fallback }
}

// The two keys that ARE the portfolio. A change to either is worth mirroring
// into the Android app's own storage; a change to anything else is not, and
// firing an intent per settings toggle would be noise.
const MIRRORED = new Set(['transactions', 'wallets'])

/** A transaction's identity across devices: ids are per-device counters. */
export function txKey(tx) {
  return tx?.created_at ? `c:${tx.created_at}` : `j:${tx?.wallet_id}|${tx?.coin_id}|${tx?.type}|${tx?.amount}|${tx?.date}`
}
export const TX_DELETED_KEY = 'crypto_tracker_tx_deleted'
const MAX_TOMBSTONES = 2000

/**
 * Remember which transactions a save removed.
 *
 * Syncing merges this device's list with another's, and a merge cannot tell
 * "deleted here" from "never seen here" without being told — the deleted
 * trade would come straight back from the other device. The list rides in
 * the backup, so a delete on the phone deletes on the laptop too.
 */
function recordDeletes(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) return
  const kept = new Set(after.map(txKey))
  const gone = before.map(txKey).filter(k => !kept.has(k))
  if (!gone.length) return
  try {
    const prev = JSON.parse(localStorage.getItem(TX_DELETED_KEY) || '[]')
    const next = [...new Set([...(Array.isArray(prev) ? prev : []), ...gone])].slice(-MAX_TOMBSTONES)
    localStorage.setItem(TX_DELETED_KEY, JSON.stringify(next))
  } catch { /* storage full: the delete still happened locally */ }
}

export function saveData(key, data) {
  try {
    if (key === 'transactions') {
      let before = parseCache.get(key)?.value
      if (!before) { try { before = JSON.parse(localStorage.getItem(`${PREFIX}${key}`) || '[]') } catch { before = null } }
      recordDeletes(before, data)
    }
    const raw = JSON.stringify(data)
    localStorage.setItem(`${PREFIX}${key}`, raw)
    parseCache.set(key, { raw, value: data })
  } catch {}

  // Every write to the portfolio, whichever screen made it, tells the Drive
  // sync to back up now. Only TradeSheet and a few others announced their
  // changes, so an import, an edit or a delete waited for the 10-minute
  // sweep. A separate event from wl:portfolio-updated, which the dashboard
  // reloads on: this one fires on the dashboard's own writes too.
  if (MIRRORED.has(key)) {
    try { window.dispatchEvent(new Event('wl:data-saved')) } catch { /* no window */ }
  }

  // Mirror to the app, on Android only, and never at the cost of the write
  // above.
  //
  // Imported lazily for isolation rather than for bundle size — App.jsx pulls
  // the same module in statically to handle a restore at boot, so it is in the
  // main chunk either way. What the dynamic import buys is that this line
  // cannot throw: saveData is the path every holding takes on its way to disk,
  // and a mirror that is a nice-to-have must not be able to fail the write it
  // is copying.
  if (MIRRORED.has(key)) {
    import('../nativeVault').then(m => m.scheduleVaultSave()).catch(() => {})
  }
}

export function bumpId(key) {
  let current = 1
  try {
    current = parseInt(localStorage.getItem(key) || '1', 10)
    if (!Number.isFinite(current)) current = 1
    localStorage.setItem(key, String(current + 1))
  } catch {
    // Storage full/unavailable — fall back to a time-based id so callers
    // still get a unique value instead of throwing mid-write.
    current = Date.now()
  }
  return current
}

// Generic JSON-cache load/save (used by price/image/chart caches).
export function loadJson(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback }
  catch { return fallback }
}
export function saveJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ── Schema versioning ──
// Bump SCHEMA_VERSION when any persisted shape changes; migrations run
// once on app boot in increasing order.
export const SCHEMA_VERSION = 4
const SCHEMA_KEY = 'crypto_tracker_schema_version'

export function runSchemaMigrations() {
  let current = 0
  try { current = parseInt(localStorage.getItem(SCHEMA_KEY) || '0', 10) || 0 } catch {}
  if (current === SCHEMA_VERSION) return

  // v < 4: clean stale Sell-For receive legs that recorded amount=0
  // (the pre-#25 missing-await bug).
  if (current < 4) {
    try {
      const txs = loadData('transactions')
      const cleaned = txs.filter(t => (Number(t.amount) || 0) > 0)
      if (cleaned.length !== txs.length) saveData('transactions', cleaned)
    } catch {}
  }

  try { localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION)) } catch {}
}
