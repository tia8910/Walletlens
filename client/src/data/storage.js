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

export function saveData(key, data) {
  try {
    const raw = JSON.stringify(data)
    localStorage.setItem(`${PREFIX}${key}`, raw)
    parseCache.set(key, { raw, value: data })
  } catch {}
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
