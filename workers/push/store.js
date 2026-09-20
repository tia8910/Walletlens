// D1-backed subscription store.
//
// This replaces Deno KV, and the reason for the whole migration lives here:
// the Deno free plan's KV Reads allowance was exhausted by the crons scanning
// every subscription on every job, and the org was suspended. D1 measures the
// same work in rows read, with an allowance orders of magnitude larger.
//
// The scan is still cached, exactly as the Deno service ended up doing, for
// the same reason: a bigger allowance is not a licence to re-read the same
// rows five times a minute.

import { mergeSubForWrite, normalizeSub } from '../../push-api/notify-logic.js'

// Imported, not copied. The merge rule is subtle — it exists because a cron
// holding a cached row must not overwrite a preference change or a /seen
// heartbeat — and two copies of it would drift. It is unit-tested from
// client/src/zakatPush.test.js.

const SUBS_CACHE_MS = 5 * 60_000

// D1's bound-parameter cap is comfortably above this, so a chunk is one round
// trip in the overwhelmingly common case; it exists as a ceiling, not a target.
const SAVE_CHUNK = 100

/** SHA-256 of the endpoint, truncated. Same derivation the Deno service used. */
export async function endpointKey(endpoint) {
  return hashKey(endpoint)
}

/**
 * The row key for a device addressed by an FCM token.
 *
 * Prefixed, and that prefix is the point. A token and an endpoint are both
 * opaque strings, and hashing them into the same 24-hex space means a
 * collision would silently hand one device another's subscription — the same
 * table, the same key length, no way to tell which kind it was. Twelve
 * characters of key spent on saying which transport a row belongs to is a
 * trade worth making.
 */
export async function tokenKey(token) {
  return `fcm:${(await hashKey(token)).slice(0, 20)}`
}

/**
 * Whether a stored row can actually be sent to.
 *
 * One question, two transports, and it must stay one question: a check for
 * either address written inline at each call site is how the FCM half went
 * missing from the cron scan while every other path supported it.
 */
export function addressable(sub) {
  return !!(sub?.subscription?.endpoint || sub?.fcmToken)
}

async function hashKey(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

/**
 * A Worker isolate can serve many requests and cron ticks, so the cache lives
 * on the instance rather than in a module global — that keeps it per-isolate
 * and makes it testable without reloading modules.
 */
export class SubStore {
  constructor(db, { now = () => Date.now(), cacheMs = SUBS_CACHE_MS } = {}) {
    this.db = db
    this.now = now
    this.cacheMs = cacheMs
    this.cache = null
  }

  /** Drop the cached scan. Called whenever a request may have written. */
  invalidate() {
    this.cache = null
  }

  /** Every subscription, cached across cron ticks within the window. */
  async all() {
    const t = this.now()
    if (this.cache && t - this.cache.at < this.cacheMs) return this.cache.rows

    const { results } = await this.db.prepare('SELECT key, data FROM subs').all()
    const rows = []
    for (const r of results || []) {
      const sub = parse(r.data)
      // A row that will not parse is skipped rather than thrown on: one bad
      // record must not stop every other user's notifications.
      //
      // ADDRESSABLE, not "has a Web Push endpoint" — and that distinction is
      // the whole bug this line used to be.
      //
      // This is the loader EVERY cron job uses. The condition was written when
      // Web Push was the only transport, and an FCM device does not have a
      // subscription at all: it has a token, in another field, because a
      // WebView has no service worker to subscribe with. So every device
      // running the Android app was dropped here and was invisible to every
      // scheduled job — moves, targets, news, the morning brief, retention,
      // feature tips, zakat, hacks, academy, the portfolio pulse. All of them.
      //
      // It was invisible in the one way that is worst to debug: the app's
      // welcome notification still arrived, because /test addresses the device
      // by token through get() and never comes near this list. So the pipe
      // looked healthy end to end — permission granted, token registered,
      // Firebase delivering — and not one scheduled notification had ever been
      // sent to an app install since the transport was added.
      if (addressable(sub)) rows.push({ key: r.key, sub })
    }
    this.cache = { at: t, rows }
    return rows
  }

  async get(key) {
    const row = await this.db.prepare('SELECT data FROM subs WHERE key = ?').bind(key).first()
    return row ? parse(row.data) : null
  }

  async getByEndpoint(endpoint) {
    const key = await endpointKey(endpoint)
    const sub = await this.get(key)
    return sub ? { key, sub } : null
  }

  /**
   * Find a device by whichever address it has.
   *
   * A Web Push device is identified by its endpoint and an FCM device by its
   * token — they are different strings in different fields, and every handler
   * that used to take only an endpoint now takes either. Written once here
   * rather than branched at six call sites, which is how one of them ends up
   * quietly supporting only half the devices.
   *
   * @param {{endpoint?:string, fcmToken?:string}} body a request body
   */
  async getByAddress({ endpoint, fcmToken } = {}) {
    if (fcmToken) {
      const key = await tokenKey(fcmToken)
      const sub = await this.get(key)
      return sub ? { key, sub } : null
    }
    if (endpoint) return this.getByEndpoint(endpoint)
    return null
  }

  /** Write a record outright. Used by the request handlers, which own the row. */
  async put(key, sub) {
    await this.db
      .prepare('INSERT INTO subs (key, data, updated_at) VALUES (?, ?, ?) ' +
               'ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .bind(key, JSON.stringify(sub), this.now())
      .run()
    this.invalidate()
  }

  /**
   * Write a record a CRON mutated, without clobbering the user.
   *
   * The cached row can be minutes old, so everything the request handlers own
   * is re-read at write time and everything the crons own is kept. One extra
   * read, and only on the rare path where a cron actually has something to
   * write. A row deleted mid-run is not resurrected.
   */
  async save(key, sub) {
    const fresh = await this.get(key)
    const merged = mergeSubForWrite(sub, fresh)
    if (!merged) return
    await this.db
      .prepare('UPDATE subs SET data = ?, updated_at = ? WHERE key = ?')
      .bind(JSON.stringify(merged), this.now(), key)
      .run()
  }

  /**
   * Write many cron-mutated rows in two round trips per chunk, instead of the
   * 2N a loop of save() calls costs.
   *
   * Every job runs this once per tick over every subscription it touched, on
   * a cron as tight as once a minute — save()'s one extra read is fine for a
   * single row, but paid N times sequentially it was the actual cost of the
   * job. Same merge semantics as save(): each row is re-read fresh right
   * before merging (batched into one SELECT ... IN per chunk here), and a row
   * deleted mid-run is not resurrected.
   *
   * Chunked at SAVE_CHUNK keys per round trip — D1 caps bound parameters per
   * statement, so one subscriber base large enough to exceed that would
   * otherwise fail this in one shot rather than degrade to more round trips.
   *
   * @param {Array<{key: string, sub: object}>} entries
   */
  async saveMany(entries) {
    for (let i = 0; i < entries.length; i += SAVE_CHUNK) {
      await this.saveChunk(entries.slice(i, i + SAVE_CHUNK))
    }
  }

  async saveChunk(entries) {
    if (!entries.length) return

    const keys = [...new Set(entries.map(e => e.key))]
    const placeholders = keys.map(() => '?').join(',')
    const { results } = await this.db
      .prepare(`SELECT key, data FROM subs WHERE key IN (${placeholders})`)
      .bind(...keys)
      .all()
    const freshByKey = new Map((results || []).map(r => [r.key, parse(r.data)]))

    const ts = this.now()
    const statements = []
    for (const { key, sub } of entries) {
      const merged = mergeSubForWrite(sub, freshByKey.get(key) ?? null)
      if (!merged) continue
      statements.push(
        this.db
          .prepare('UPDATE subs SET data = ?, updated_at = ? WHERE key = ?')
          .bind(JSON.stringify(merged), ts, key)
      )
    }
    if (statements.length) await this.db.batch(statements)
  }

  async delete(key) {
    await this.db.prepare('DELETE FROM subs WHERE key = ?').bind(key).run()
    this.invalidate()
  }
}

function parse(json) {
  // Normalised on the way out, not on the way in: rows written by earlier
  // versions are already in the table, and there is no migration step. Every
  // consumer therefore sees a complete record with defaults filled in, rather
  // than whatever shape the row had the last time it was saved.
  try {
    const sub = JSON.parse(json)
    return sub && typeof sub === 'object' ? normalizeSub(sub) : null
  } catch { return null }
}
