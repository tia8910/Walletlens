// Turns Deno KV entries into SQL that D1 can execute.
//
// The migration is deliberately split into two halves that never share a
// credential: `export-kv.ts` reads Deno KV with a Deno access token and writes
// a .sql file; `wrangler d1 execute --file` applies that file with the
// Cloudflare login the user already has. Neither half needs both, and the
// intermediate file can be read before it touches production.
//
// Everything here is pure, so it is testable without either service.

import { encodeKey } from '../voice/kv.js'

// The key encoder is imported rather than reimplemented. If the shim's
// encoding ever changes, the export changes with it; a second copy here would
// be a silent way to write rows the worker cannot read back.
export { encodeKey }

// JSON.stringify escapes everything below 0x20, so encoded values never carry
// a raw control character. If one shows up anyway the input was not what this
// module thinks it is, and emitting it would produce a file whose meaning
// depends on how a terminal renders it.
const CONTROL = /[\u0000-\u001F\u007F]/

/**
 * A SQLite string literal.
 *
 * SQLite escapes a quote by doubling it, and that is the whole rule — there is
 * no backslash escape to get subtly wrong.
 */
export function sqlString(s) {
  const str = String(s)
  if (CONTROL.test(str)) {
    throw new Error('refusing to emit a SQL literal containing a raw control character')
  }
  return "'" + str.replace(/'/g, "''") + "'"
}

/** An integer literal, for the `updated_at` column. */
export function sqlInt(n) {
  const i = Number(n)
  if (!Number.isSafeInteger(i)) throw new Error(`not a safe integer: ${n}`)
  return String(i)
}

/**
 * The stored text for a KV value.
 *
 * Deno KV returns a counter as a Deno.KvU64 (or a bigint), and JSON.stringify
 * throws on both. voice-api's one counter, ["signups_count"], is exactly that
 * — so without this branch the export dies partway through, on the single row
 * that is not a plain object. KvOnD1.atomic() writes counters as bare decimal
 * text, so that is what a counter has to become here for the SQL arithmetic in
 * atomic() to keep working after the import.
 */
export function encodeValue(value) {
  if (typeof value === 'bigint') return value.toString()
  if (value && typeof value === 'object' && typeof value.value === 'bigint') {
    return value.value.toString()
  }
  return JSON.stringify(value ?? null)
}

/** `["sub", "ab12…"]` is one row in `subs`, keyed by the bare hash. */
export function pushKey(key) {
  const parts = Array.isArray(key) ? key : [key]
  if (parts.length !== 2 || parts[0] !== 'sub') return null
  const hash = String(parts[1])
  return hash || null
}

// D1 caps how much one statement may carry, and wrangler sends the file
// statement by statement. Batching keeps the round trips down without building
// a single statement large enough to be rejected.
const CHUNK = 50

/** `rows` are arrays of already-rendered SQL literals. */
function statements(table, columns, rows, overwrite) {
  if (rows.length === 0) return []
  const conflict = overwrite
    ? ` ON CONFLICT(${columns[0]}) DO UPDATE SET ` +
      columns.slice(1).map(c => `${c} = excluded.${c}`).join(', ')
    : ` ON CONFLICT(${columns[0]}) DO NOTHING`
  const out = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows.slice(i, i + CHUNK).map(r => '  (' + r.join(', ') + ')').join(',\n')
    out.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values}\n${conflict.trimStart()};`)
  }
  return out
}

/**
 * Rows are emitted with ON CONFLICT DO NOTHING by default.
 *
 * If the worker is already serving, a row that exists in D1 is one the user
 * re-created after the cutover, and it is newer than anything Deno still
 * holds. Overwriting it would hand them back a stale subscription or a stale
 * guardian schedule. `overwrite` is for a table known to be empty.
 */
export function emitPushSql(entries, { now = Date.now(), overwrite = false } = {}) {
  const rows = []
  const skipped = []
  for (const e of entries) {
    const key = pushKey(e.key)
    if (!key) { skipped.push(e.key); continue }
    rows.push([sqlString(key), sqlString(encodeValue(e.value)), sqlInt(now)])
  }
  return {
    sql: statements('subs', ['key', 'data', 'updated_at'], rows, overwrite),
    count: rows.length,
    skipped,
  }
}

export function emitVoiceSql(entries, { now = Date.now(), overwrite = false } = {}) {
  const rows = entries.map(e => [
    sqlString(encodeKey(e.key)),
    sqlString(encodeValue(e.value)),
    sqlInt(now),
  ])
  return { sql: statements('kv', ['k', 'v', 'updated_at'], rows, overwrite), count: rows.length, skipped: [] }
}

export function buildFile(service, entries, opts = {}) {
  const { sql, count, skipped } =
    service === 'push' ? emitPushSql(entries, opts) : emitVoiceSql(entries, opts)
  const header = [
    `-- ${count} row(s) exported from Deno KV for the ${service} worker.`,
    `-- Generated ${new Date(opts.now ?? Date.now()).toISOString()}.`,
    `-- Existing rows are ${opts.overwrite ? 'OVERWRITTEN' : 'left alone'}.`,
    '',
    '',
  ].join('\n')
  return { text: header + sql.join('\n\n') + '\n', count, skipped }
}
