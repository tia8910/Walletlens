import { describe, it, expect } from 'vitest'
import { SubStore, endpointKey } from '../../workers/push/store.js'

// The storage layer is where this migration can go wrong quietly: the
// notification logic is unchanged and already covered, the crypto is covered
// separately, and everything else is routing. So the fake D1 below is faithful
// about the things that matter — bound parameters, upsert semantics, and rows
// coming back as they went in.

function fakeD1() {
  const rows = new Map()
  const calls = []
  const db = {
    rows, calls,
    prepare(sql) {
      const stmt = {
        sql, args: [],
        bind(...a) { stmt.args = a; return stmt },
        async all() {
          calls.push({ sql, args: stmt.args })
          if (/SELECT key, data FROM subs/.test(sql)) {
            return { results: [...rows.entries()].map(([key, r]) => ({ key, data: r.data })) }
          }
          return { results: [] }
        },
        async first() {
          calls.push({ sql, args: stmt.args })
          const r = rows.get(stmt.args[0])
          return r ? { data: r.data } : null
        },
        async run() {
          calls.push({ sql, args: stmt.args })
          if (/^INSERT INTO subs/.test(sql)) {
            rows.set(stmt.args[0], { data: stmt.args[1], updated_at: stmt.args[2] })
          } else if (/^UPDATE subs/.test(sql)) {
            if (rows.has(stmt.args[2])) rows.set(stmt.args[2], { data: stmt.args[0], updated_at: stmt.args[1] })
          } else if (/^DELETE FROM subs/.test(sql)) {
            rows.delete(stmt.args[0])
          }
          return { success: true }
        },
      }
      return stmt
    },
  }
  return db
}

const sub = (over = {}) => ({
  subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } },
  alerts: [], watch: [], setup: {}, prefs: { moves: true }, lang: 'en', tz: 0,
  lastSeen: 1000, fired: {}, ref: {}, retention: [], zakatDue: null, zakatSent: [],
  ...over,
})

describe('endpointKey', () => {
  it('is stable and short, matching the Deno key derivation', async () => {
    const k = await endpointKey('https://push.example/abc')
    expect(k).toMatch(/^[0-9a-f]{24}$/)
    expect(await endpointKey('https://push.example/abc')).toBe(k)
  })

  it('separates different endpoints', async () => {
    expect(await endpointKey('https://a/1')).not.toBe(await endpointKey('https://a/2'))
  })
})

describe('the cached scan', () => {
  it('reads the table once inside the window', async () => {
    const db = fakeD1()
    let t = 0
    const store = new SubStore(db, { now: () => t })
    await store.put('k1', sub())

    db.calls.length = 0
    await store.all()
    t += 60_000            // a minute later
    await store.all()
    t += 60_000
    await store.all()

    const scans = db.calls.filter(c => /SELECT key, data/.test(c.sql))
    expect(scans, 'three ticks inside the window is one scan').toHaveLength(1)
  })

  it('reads again once the window has passed', async () => {
    const db = fakeD1()
    let t = 0
    const store = new SubStore(db, { now: () => t })
    await store.put('k1', sub())
    db.calls.length = 0

    await store.all()
    t += 5 * 60_000 + 1
    await store.all()
    expect(db.calls.filter(c => /SELECT key, data/.test(c.sql))).toHaveLength(2)
  })

  it('is dropped by a write, so a new subscriber is not invisible', async () => {
    const db = fakeD1()
    const store = new SubStore(db, { now: () => 0 })
    await store.all()
    await store.put('k2', sub())
    expect(await store.all()).toHaveLength(1)
  })

  it('skips a corrupt row instead of failing the whole scan', async () => {
    // One unreadable record must not stop every other user's notifications.
    const db = fakeD1()
    db.rows.set('bad', { data: '{not json', updated_at: 0 })
    const store = new SubStore(db, { now: () => 0 })
    await store.put('good', sub())
    const all = await store.all()
    expect(all).toHaveLength(1)
    expect(all[0].key).toBe('good')
  })

  it('skips a row with no endpoint', async () => {
    const db = fakeD1()
    db.rows.set('empty', { data: JSON.stringify({ alerts: [] }), updated_at: 0 })
    const store = new SubStore(db, { now: () => 0 })
    expect(await store.all()).toHaveLength(0)
  })
})

describe('reads and writes', () => {
  it('round-trips a record', async () => {
    const store = new SubStore(fakeD1(), { now: () => 0 })
    await store.put('k1', sub({ tz: 120 }))
    expect((await store.get('k1')).tz).toBe(120)
  })

  it('upserts rather than duplicating', async () => {
    const db = fakeD1()
    const store = new SubStore(db, { now: () => 0 })
    await store.put('k1', sub({ tz: 0 }))
    await store.put('k1', sub({ tz: 60 }))
    expect(db.rows.size).toBe(1)
    expect((await store.get('k1')).tz).toBe(60)
  })

  it('finds a subscription by its endpoint', async () => {
    const store = new SubStore(fakeD1(), { now: () => 0 })
    const key = await endpointKey('https://push.example/abc')
    await store.put(key, sub())
    const found = await store.getByEndpoint('https://push.example/abc')
    expect(found.key).toBe(key)
    expect(found.sub.subscription.endpoint).toBe('https://push.example/abc')
  })

  it('returns null for an endpoint it does not have', async () => {
    const store = new SubStore(fakeD1(), { now: () => 0 })
    expect(await store.getByEndpoint('https://push.example/nope')).toBeNull()
  })

  it('deletes', async () => {
    const store = new SubStore(fakeD1(), { now: () => 0 })
    await store.put('k1', sub())
    await store.delete('k1')
    expect(await store.get('k1')).toBeNull()
  })
})

describe('save() — the cron write path', () => {
  it('does not overwrite a preference changed while the cron worked', async () => {
    const store = new SubStore(fakeD1(), { now: () => 0 })
    await store.put('k1', sub({ prefs: { moves: true } }))

    const stale = sub({ prefs: { moves: true }, fired: { a: 1 } })   // cron's copy
    await store.put('k1', sub({ prefs: { moves: false } }))          // user toggles
    await store.save('k1', stale)

    const out = await store.get('k1')
    // Asserted field by field rather than as a whole object: reads are
    // normalised now, so `prefs` comes back complete with every default filled
    // in. What this test is about is WHOSE value wins for a field both sides
    // touched, and an exact-object match answered that question only by
    // accident — it broke on the next preference added, which is not the same
    // thing as the merge rule breaking.
    expect(out.prefs.moves, 'the user’s change survives the cron write').toBe(false)
    expect(out.fired).toEqual({ a: 1 })           // ours
  })

  it('fills in fields a row predating them never had', async () => {
    // A record written before a channel existed has no preference for it and
    // no bookkeeping. Read raw, that preference is `undefined` — which every
    // gate reads as "off", so a channel shipped to everyone would quietly run
    // for nobody — and the bookkeeping is `undefined`, which is a TypeError
    // the first time a job spreads it. Neither announces itself.
    const db = fakeD1()
    const store = new SubStore(db, { now: () => 0 })
    // Straight into storage, bypassing put(), exactly as an older build left it.
    db.rows.set('k1', {
      key: 'k1',
      data: JSON.stringify({
        subscription: { endpoint: 'https://fcm.googleapis.com/x' },
        prefs: { moves: true },
      }),
      updated_at: 0,
    })

    const out = await store.get('k1')
    expect(out.prefs.hacks, 'a channel added later defaults ON, not undefined').toBe(true)
    expect(out.prefs.moves, 'and an explicit choice is still respected').toBe(true)
    expect(out.hacksSent).toEqual([])
    expect(out.watch).toEqual([])
  })

  it('does not resurrect a subscription deleted mid-run', async () => {
    const db = fakeD1()
    const store = new SubStore(db, { now: () => 0 })
    await store.put('k1', sub())
    await store.delete('k1')
    await store.save('k1', sub({ fired: { a: 1 } }))
    expect(db.rows.size).toBe(0)
  })
})
