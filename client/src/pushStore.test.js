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

  it('skips a row that cannot be addressed at all', async () => {
    const db = fakeD1()
    db.rows.set('empty', { data: JSON.stringify({ alerts: [] }), updated_at: 0 })
    const store = new SubStore(db, { now: () => 0 })
    expect(await store.all()).toHaveLength(0)
  })

  it('includes a device addressed by an FCM token', async () => {
    // THE BUG THIS FILE EXISTS FOR NOW.
    //
    // The condition here was `sub?.subscription?.endpoint`, written when Web
    // Push was the only transport. An FCM device has no subscription at all —
    // it has a token, because a WebView has no service worker to subscribe
    // with — so every device running the Android app was dropped from this
    // list. all() is the loader EVERY cron job uses, so those devices were
    // invisible to moves, targets, news, the morning brief, retention, feature
    // tips, zakat, hacks, academy and the portfolio pulse. All of them.
    //
    // And it hid perfectly: the welcome notification still arrived, because
    // /test addresses the device by token through get() and never touches this
    // list. Permission granted, token registered, Firebase delivering, one
    // notification received — and not a single scheduled one ever sent.
    const db = fakeD1()
    db.rows.set('fcm:abc', {
      data: JSON.stringify({
        transport: 'fcm',
        fcmToken: 'a-real-looking-token',
        subscription: null,
        watch: [{ kind: 'crypto', id: 'bitcoin', symbol: 'BTC' }],
      }),
      updated_at: 0,
    })
    const store = new SubStore(db, { now: () => 0 })
    const all = await store.all()
    expect(all, 'an app install must be visible to the crons').toHaveLength(1)
    expect(all[0].key).toBe('fcm:abc')
    expect(all[0].sub.fcmToken).toBe('a-real-looking-token')
  })

  it('carries both kinds of device in one scan', async () => {
    // The two transports run side by side; a scan that returns only one of
    // them is the failure above in either direction.
    const db = fakeD1()
    const store = new SubStore(db, { now: () => 0 })
    await store.put('web', sub())
    db.rows.set('fcm:xyz', {
      data: JSON.stringify({ transport: 'fcm', fcmToken: 'tok', subscription: null }),
      updated_at: 0,
    })
    store.invalidate()
    expect(await store.all()).toHaveLength(2)
  })
})

describe('the address survives a cron write', () => {
  it('keeps a token the device re-registered while a cron held the row', async () => {
    // USER_OWNED_FIELDS protects `subscription` for an obvious reason: a
    // device that re-subscribed mid-run must not have its new endpoint
    // overwritten by the stale one the cron is carrying. The FCM pair belongs
    // there by exactly the same argument, and was missing.
    //
    // FCM tokens rotate — a restore to a new device, an app-data clear, or at
    // Firebase's own discretion. Without this the first cron write would put
    // the dead token back and the device would go silent again, with a
    // subscription that still looks perfectly healthy on /status.
    const db = fakeD1()
    const store = new SubStore(db, { now: () => 0 })
    db.rows.set('fcm:k', {
      data: JSON.stringify({ transport: 'fcm', fcmToken: 'NEW-token', subscription: null }),
      updated_at: 0,
    })
    // The cron's copy, read before the device re-registered.
    await store.save('fcm:k', {
      transport: 'fcm', fcmToken: 'OLD-token', subscription: null,
      lastHackAt: 123,
    })
    const after = await store.get('fcm:k')
    expect(after.fcmToken, 'the address the device registered wins').toBe('NEW-token')
    expect(after.transport).toBe('fcm')
    // And the cron's own bookkeeping still lands.
    expect(after.lastHackAt).toBe(123)
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
