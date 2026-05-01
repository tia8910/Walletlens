// Thin localStorage wrappers + global cache primitives. Keeping these
// in one place means the schema-migration code, the tests, and api.js
// all read/write through the same API, and there's a single point to
// add e.g. IndexedDB or per-wallet partitioning later.

const PREFIX = 'crypto_tracker_'

export function loadData(key, fallback = []) {
  try {
    const data = localStorage.getItem(`${PREFIX}${key}`)
    return data ? JSON.parse(data) : fallback
  } catch { return fallback }
}

export function saveData(key, data) {
  try { localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(data)) } catch {}
}

export function bumpId(key) {
  const current = parseInt(localStorage.getItem(key) || '1', 10)
  localStorage.setItem(key, String(current + 1))
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
