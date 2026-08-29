import { describe, it, expect } from 'vitest'
import { KvOnD1, encodeKey, decodeKey, prefixPattern } from '../../workers/voice/kv.js'

// voice-api makes ~15 KV calls across 2,100 lines that are otherwise about
// Claude prompts and email. Rather than rewrite every one of those call sites
// to speak SQL, the Deno KV shape is kept and D1 put underneath — so this shim
// is the entire storage risk of that port, and it gets tested like it.

function fakeD1() {
  const rows = new Map()
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
          // The shim only ever emits `<escaped literal>%`, so matching is:
          // drop the trailing %, undo the ESCAPE, and compare as a prefix.
          const pat = String(st.args[0])
          const literal = pat.slice(0, -1)
            .replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/\\\\/g, '\\')
          const out = [...rows.entries()].filter(([k]) => k.startsWith(literal)).sort()
          return { results: out.map(([k, v]) => ({ k, v })) }
        },
        async run() {
          if (/^INSERT INTO kv/.test(sql) && /CAST/.test(sql)) {
            const [k, init, , delta] = st.args
            const cur = rows.has(k) ? parseInt(rows.get(k), 10) : null
            rows.set(k, cur === null ? String(init) : String(cur + delta))
          } else if (/^INSERT INTO kv/.test(sql)) {
            rows.set(st.args[0], st.args[1])
          } else if (/^DELETE FROM kv/.test(sql)) {
            rows.delete(st.args[0])
          }
          return { success: true }
        },
      }
      return st
    },
  }
}

const collect = async (iter) => { const o = []; for await (const e of iter) o.push(e); return o }

describe('key encoding', () => {
  it('round-trips a multi-part key', () => {
    expect(decodeKey(encodeKey(['guardian', 'device-1']))).toEqual(['guardian', 'device-1'])
  })

  it('closes the quote so one prefix cannot match a longer word', () => {
    // ["guardian"% must not match ["guardianship", ...]. The closing quote is
    // what separates them, and losing it would silently widen every scan.
    const p = prefixPattern(['guardian'])
    expect(p).toBe('["guardian"%')
    expect(p.endsWith('"%')).toBe(true)
  })

  it('escapes LIKE metacharacters in the prefix', () => {
    expect(prefixPattern(['we_ird%'])).toBe('["we\\_ird\\%"%')
  })
})

describe('get / set / delete', () => {
  it('round-trips a value', async () => {
    const kv = new KvOnD1(fakeD1())
    await kv.set(['guardian', 'd1'], { active: true, email: 'a@b.c' })
    expect((await kv.get(['guardian', 'd1'])).value).toEqual({ active: true, email: 'a@b.c' })
  })

  it('reports a missing key as a null value, as Deno KV does', async () => {
    const kv = new KvOnD1(fakeD1())
    const entry = await kv.get(['guardian', 'nope'])
    expect(entry.value).toBeNull()
    expect(entry.key).toEqual(['guardian', 'nope'])
  })

  it('overwrites rather than duplicating', async () => {
    const db = fakeD1()
    const kv = new KvOnD1(db)
    await kv.set(['weekly', 'd1'], { n: 1 })
    await kv.set(['weekly', 'd1'], { n: 2 })
    expect(db.rows.size).toBe(1)
    expect((await kv.get(['weekly', 'd1'])).value).toEqual({ n: 2 })
  })

  it('deletes', async () => {
    const kv = new KvOnD1(fakeD1())
    await kv.set(['weekly', 'd1'], { n: 1 })
    await kv.delete(['weekly', 'd1'])
    expect((await kv.get(['weekly', 'd1'])).value).toBeNull()
  })
})

describe('prefix listing', () => {
  it('yields every key under the prefix, and nothing beside it', async () => {
    const kv = new KvOnD1(fakeD1())
    await kv.set(['guardian', 'a'], { n: 1 })
    await kv.set(['guardian', 'b'], { n: 2 })
    await kv.set(['weekly', 'c'], { n: 3 })

    const got = await collect(kv.list({ prefix: ['guardian'] }))
    expect(got).toHaveLength(2)
    expect(got.map(e => e.key[1]).sort()).toEqual(['a', 'b'])
  })

  it('does not sweep in a key that merely starts with the same letters', async () => {
    // The real hazard: ["signups_count"] sits beside the ["signups", ...]
    // records, and a widened scan would feed a counter into the signup export.
    const kv = new KvOnD1(fakeD1())
    await kv.set(['signups', 'a@b.c'], { email: 'a@b.c' })
    await kv.atomic().sum(['signups_count'], 1).commit()

    const got = await collect(kv.list({ prefix: ['signups'] }))
    expect(got).toHaveLength(1)
    expect(got[0].key).toEqual(['signups', 'a@b.c'])
  })

  it('hands back a key that can be written straight back', async () => {
    // The guardian sweep does exactly this: kv.set(entry.key, {...}).
    const kv = new KvOnD1(fakeD1())
    await kv.set(['guardian', 'd1'], { active: true })
    const [entry] = await collect(kv.list({ prefix: ['guardian'] }))
    await kv.set(entry.key, { ...entry.value, warnedAt: 'now' })
    expect((await kv.get(['guardian', 'd1'])).value).toEqual({ active: true, warnedAt: 'now' })
  })

  it('is empty when nothing matches', async () => {
    const kv = new KvOnD1(fakeD1())
    expect(await collect(kv.list({ prefix: ['guardian'] }))).toEqual([])
  })
})

describe('atomic sum', () => {
  it('starts a counter that does not exist', async () => {
    const kv = new KvOnD1(fakeD1())
    await kv.atomic().sum(['signups_count'], 1).commit()
    expect((await kv.get(['signups_count'])).value).toBe(1)
  })

  it('accumulates', async () => {
    const kv = new KvOnD1(fakeD1())
    for (let i = 0; i < 5; i++) await kv.atomic().sum(['signups_count'], 1).commit()
    expect((await kv.get(['signups_count'])).value).toBe(5)
  })

  it('adds in SQL, not by read-modify-write', async () => {
    // The reason the original used atomic(): two concurrent signups must not
    // both read 4 and both write 5.
    const db = fakeD1()
    const kv = new KvOnD1(db)
    const sql = []
    const orig = db.prepare.bind(db)
    db.prepare = (s) => { sql.push(s); return orig(s) }
    await kv.atomic().sum(['signups_count'], 1).commit()
    expect(sql.join(' ')).toMatch(/CAST\(kv\.v AS INTEGER\) \+ \?/)
  })

  it('accepts a BigInt delta, as the Deno call site passes', async () => {
    const kv = new KvOnD1(fakeD1())
    await kv.atomic().sum(['signups_count'], 1n).commit()
    expect((await kv.get(['signups_count'])).value).toBe(1)
  })
})
