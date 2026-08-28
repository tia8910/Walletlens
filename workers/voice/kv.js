// A Deno.Kv-shaped store backed by D1.
//
// voice-api uses four KV operations across 2,100 lines — get, set, list and a
// single atomic sum. Rewriting every call site to speak SQL would mean editing
// code all over a file whose real subject is Claude prompts and email, and
// every one of those edits is a chance to change behaviour by accident.
//
// So the shape is kept and the storage swapped underneath. The port then
// touches the four runtime lines (openKv, env, cron, serve) and nothing else.
//
// This implements only what voice-api actually calls. It is not a general Deno
// KV emulator and should not grow into one: anything more is better served by
// writing real SQL for the case that needs it.

// Keys are arrays in Deno KV. They are stored as the JSON array text, which
// keeps them printable, unambiguous and orderable — and makes a prefix scan a
// LIKE against a literal prefix, rather than a range against a sentinel
// character that has to be chosen carefully and can still be wrong.
export function encodeKey(parts) {
  return JSON.stringify((Array.isArray(parts) ? parts : [parts]).map(p => String(p)))
}

export function decodeKey(s) {
  try { return JSON.parse(s) } catch { return [s] }
}

/** The LIKE pattern matching every key under `prefix`. */
export function prefixPattern(prefix) {
  const arr = (Array.isArray(prefix) ? prefix : [prefix]).map(p => String(p))
  // `["a","b"` — the open bracket and the quoted parts, without the close.
  const head = JSON.stringify(arr).slice(0, -1)
  // Escape the LIKE metacharacters, so a key containing % or _ cannot widen
  // the scan to rows that merely look similar.
  const esc = head.replace(/([\\%_])/g, '\\$1')
  return esc + '%'
}

export class KvOnD1 {
  constructor(db) {
    this.db = db
  }

  /** Deno KV returns an entry whose `.value` is null when absent. */
  async get(key) {
    const row = await this.db.prepare('SELECT v FROM kv WHERE k = ?').bind(encodeKey(key)).first()
    return { key: Array.isArray(key) ? key : [key], value: row ? parse(row.v) : null }
  }

  async set(key, value) {
    await this.db
      .prepare('INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ' +
               'ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at')
      .bind(encodeKey(key), JSON.stringify(value ?? null), Date.now())
      .run()
    return { ok: true }
  }

  async delete(key) {
    await this.db.prepare('DELETE FROM kv WHERE k = ?').bind(encodeKey(key)).run()
  }

  /**
   * Async-iterable like Deno KV's list, so every
   * `for await (const e of kv.list(...))` keeps working unchanged.
   */
  list({ prefix }) {
    const pattern = prefixPattern(prefix)
    const db = this.db
    return {
      async *[Symbol.asyncIterator]() {
        const { results } = await db
          .prepare("SELECT k, v FROM kv WHERE k LIKE ? ESCAPE '\\' ORDER BY k")
          .bind(pattern)
          .all()
        for (const r of results || []) yield { key: decodeKey(r.k), value: parse(r.v) }
      },
    }
  }

  /**
   * Only `sum`, the one atomic operation this app uses — a running signup
   * counter. Done as arithmetic inside SQL so two concurrent requests cannot
   * read-modify-write over each other, which is the whole reason the original
   * reached for atomic() rather than a get/set pair.
   */
  atomic() {
    const ops = []
    const db = this.db
    return {
      sum(key, delta) {
        ops.push({ k: encodeKey(key), delta: Number(delta) })
        return this
      },
      async commit() {
        for (const { k, delta } of ops) {
          await db
            .prepare('INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ' +
                     'ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(kv.v AS INTEGER) + ? AS TEXT), ' +
                     'updated_at = excluded.updated_at')
            .bind(k, String(delta), Date.now(), delta)
            .run()
        }
        return { ok: true }
      },
    }
  }
}

function parse(v) {
  try { return JSON.parse(v) } catch { return v }
}
