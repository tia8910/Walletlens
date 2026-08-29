import { describe, it, expect } from 'vitest'
import {
  sqlString, sqlInt, encodeValue, pushKey, emitPushSql, emitVoiceSql, buildFile,
} from '../../workers/migrate/sqlgen.js'
import { KvOnD1, encodeKey } from '../../workers/voice/kv.js'

// This module writes SQL that runs against production data exactly once. A bug
// here is not a failed request that retries — it is a corrupted subscription
// table, or a silent no-op that looks like success. So the tests cover the
// encoding edges rather than the happy path alone.

describe('sqlString', () => {
  it('doubles quotes rather than backslash-escaping them', () => {
    expect(sqlString("O'Brien")).toBe("'O''Brien'")
  })

  it("does not treat a backslash as an escape, the way MySQL would", () => {
    // In SQLite `\` is an ordinary character. Escaping it would corrupt JSON
    // text, which is full of backslashes.
    expect(sqlString('a\\b')).toBe("'a\\b'")
  })

  it('survives a value that looks like the end of a row', () => {
    // The naive way to write this module is to emit quoted timestamps and strip
    // the quotes afterwards with a regex. This value is what breaks that.
    const v = "x, '1234')"
    expect(sqlString(v)).toBe("'x, ''1234'')'")
  })

  it('refuses a raw control character instead of emitting it', () => {
    expect(() => sqlString('a\u0007b')).toThrow(/control character/)
    expect(() => sqlString('a\nb')).toThrow(/control character/)
  })
})

describe('sqlInt', () => {
  it('emits a bare integer, never a quoted one', () => {
    expect(sqlInt(1758000000000)).toBe('1758000000000')
  })

  it('rejects anything that is not a safe integer', () => {
    expect(() => sqlInt('abc')).toThrow()
    expect(() => sqlInt(1.5)).toThrow()
  })
})

describe('encodeValue', () => {
  it('JSON-encodes an ordinary record', () => {
    expect(encodeValue({ a: 1 })).toBe('{"a":1}')
  })

  it('encodes a Deno.KvU64 as bare decimal text, not JSON', () => {
    // JSON.stringify throws on a bigint. ["signups_count"] is the one KV value
    // in either service that is not a plain object, so without this the export
    // dies partway through — after doing the expensive scan.
    expect(encodeValue({ value: 42n })).toBe('42')
    expect(encodeValue(9n)).toBe('9')
  })

  it('encodes a missing value as JSON null', () => {
    expect(encodeValue(undefined)).toBe('null')
  })
})

describe('pushKey', () => {
  it('unwraps ["sub", hash] to the bare hash the subs table uses', () => {
    expect(pushKey(['sub', 'ab12'])).toBe('ab12')
  })

  it('rejects keys that are not subscriptions', () => {
    expect(pushKey(['other', 'x'])).toBeNull()
    expect(pushKey(['sub'])).toBeNull()
    expect(pushKey(['sub', ''])).toBeNull()
  })
})

describe('emitPushSql', () => {
  const entries = [
    { key: ['sub', 'aaa'], value: { subscription: { endpoint: 'https://x/1' }, lang: 'en' } },
    { key: ['sub', 'bbb'], value: { subscription: { endpoint: 'https://x/2' } } },
  ]

  it('emits one row per subscription with an unquoted timestamp', () => {
    const { sql, count } = emitPushSql(entries, { now: 1700000000000 })
    expect(count).toBe(2)
    expect(sql.join('\n')).toContain("('aaa', '{\"subscription\":{\"endpoint\":\"https://x/1\"},\"lang\":\"en\"}', 1700000000000)")
  })

  it('leaves existing rows alone by default', () => {
    // After the cutover a row in D1 is one the user re-created, and is newer
    // than anything Deno still holds.
    expect(emitPushSql(entries).sql.join('')).toContain('ON CONFLICT(key) DO NOTHING')
  })

  it('overwrites only when asked', () => {
    const sql = emitPushSql(entries, { overwrite: true }).sql.join('')
    expect(sql).toContain('DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
  })

  it('reports non-subscription keys instead of dropping them silently', () => {
    const { count, skipped } = emitPushSql([...entries, { key: ['vapid'], value: 1 }])
    expect(count).toBe(2)
    expect(skipped).toEqual([['vapid']])
  })

  it('batches rather than emitting one statement per row', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ key: ['sub', `k${i}`], value: {} }))
    const { sql, count } = emitPushSql(many)
    expect(count).toBe(120)
    expect(sql).toHaveLength(3)
  })

  it('emits nothing at all for an empty database', () => {
    expect(emitPushSql([]).sql).toEqual([])
  })
})

describe('emitVoiceSql', () => {
  it('writes keys in exactly the encoding the shim reads back', () => {
    const { sql } = emitVoiceSql([{ key: ['guardian', 'dev-1'], value: { active: true } }], { now: 1 })
    expect(sql[0]).toContain(`'${encodeKey(['guardian', 'dev-1'])}'`)
    expect(sql[0]).toContain('\'["guardian","dev-1"]\'')
  })

  it('carries the signup counter across as an addable integer', () => {
    const { sql } = emitVoiceSql([{ key: ['signups_count'], value: { value: 7n } }], { now: 1 })
    expect(sql[0]).toContain('(\'["signups_count"]\', \'7\', 1)')
  })
})

// The end-to-end property that matters: what the exporter writes is what the
// worker reads. Anything less proves only that two separate ideas of the
// encoding agree with themselves.
describe('round trip through the real shim', () => {
  function fakeD1(seed = new Map()) {
    const rows = seed
    return {
      rows,
      prepare(sql) {
        const st = {
          args: [],
          bind(...a) { st.args = a; return st },
          async first() {
            const r = rows.get(st.args[0])
            return r ? { v: r } : null
          },
          async all() {
            const like = String(st.args[0]).replace(/\\([\\%_])/g, '$1').replace(/%$/, '')
            const results = [...rows.entries()]
              .filter(([k]) => k.startsWith(like))
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, v]) => ({ k, v }))
            return { results }
          },
          async run() {
            if (/^INSERT/.test(sql)) rows.set(st.args[0], st.args[1])
            return { ok: true }
          },
        }
        return st
      },
    }
  }

  /** Apply the generated INSERTs to a map, the way D1 would. */
  function applySql(sqlText) {
    const rows = new Map()
    const re = /\('((?:[^']|'')*)', '((?:[^']|'')*)', (\d+)\)/g
    let m
    while ((m = re.exec(sqlText))) {
      rows.set(m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'"))
    }
    return rows
  }

  it('gives KvOnD1.get back the value that was in Deno KV', async () => {
    const value = { active: true, email: "o'brien@example.com", note: 'a\\b "quoted"' }
    const { text } = buildFile('voice', [{ key: ['guardian', 'dev-1'], value }], { now: 5 })
    const kv = new KvOnD1(fakeD1(applySql(text)))
    expect((await kv.get(['guardian', 'dev-1'])).value).toEqual(value)
  })

  it('gives KvOnD1.list back every row under a prefix', async () => {
    const { text } = buildFile('voice', [
      { key: ['guardian', 'a'], value: { n: 1 } },
      { key: ['guardian', 'b'], value: { n: 2 } },
      { key: ['weekly', 'c'], value: { n: 3 } },
    ], { now: 5 })
    const kv = new KvOnD1(fakeD1(applySql(text)))
    const seen = []
    for await (const e of kv.list({ prefix: ['guardian'] })) seen.push(e.value.n)
    expect(seen).toEqual([1, 2])
  })

  it('keeps the migrated counter addable by atomic().sum', async () => {
    const { text } = buildFile('voice', [{ key: ['signups_count'], value: { value: 7n } }], { now: 5 })
    const rows = applySql(text)
    expect(rows.get('["signups_count"]')).toBe('7')
    // The shim's ON CONFLICT arithmetic is `CAST(kv.v AS INTEGER) + delta`,
    // which is only correct because the row is bare digits and not `"7"`.
    expect(Number(rows.get('["signups_count"]')) + 1).toBe(8)
  })

  it('produces a file whose header records what it will do', () => {
    const { text } = buildFile('push', [{ key: ['sub', 'a'], value: {} }], { now: 0 })
    expect(text).toContain('-- 1 row(s) exported')
    expect(text).toContain('-- Existing rows are left alone.')
  })
})
