import { describe, it, expect, vi } from 'vitest'
import { runSchedule } from '../../workers/push/index.js'
import { createJobs } from '../../workers/push/jobs.js'

// The jobs were extracted from the Deno service mechanically, so what needs
// proving is the WIRING: that the adapter is shaped the way the job bodies
// expect, that a hit actually reaches the sender, and that each schedule runs
// the jobs it is supposed to.

function fakeStore(rows = []) {
  const map = new Map(rows.map(r => [r.key, r.sub]))
  return {
    map,
    saved: [],
    async all() { return [...map.entries()].map(([key, sub]) => ({ key, sub })) },
    async get(k) { return map.get(k) ?? null },
    async save(k, sub) { this.saved.push(k); map.set(k, sub) },
    async delete(k) { map.delete(k) },
    invalidate() {},
  }
}

const sub = (over = {}) => ({
  subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } },
  alerts: [], watch: [], setup: {}, lang: 'en', tz: 0,
  prefs: { moves: true, levels: true, news: true, digest: true, retention: true, features: true, zakat: true, movePct: 5 },
  lastSeen: Date.now(), fired: {}, ref: {}, moveFired: {}, lastPrice: {}, lastLevel: {},
  seenRef: null, newsSent: {}, lastNewsAt: 0, digestDay: '', retention: [],
  featuresSent: [], lastFeatureAt: 0, sent: { day: '', n: 0 },
  zakatDue: null, zakatSent: [], createdAt: Date.now(),
  ...over,
})

describe('cron dispatch', () => {
  const spyJobs = () => ({
    checkTargets: vi.fn().mockResolvedValue(undefined),
    checkMoves: vi.fn().mockResolvedValue(undefined),
    checkNews: vi.fn().mockResolvedValue(undefined),
    checkDaily: vi.fn().mockResolvedValue(undefined),
  })

  it('runs targets and the crypto-only move pass every minute', async () => {
    const jobs = spyJobs()
    await runSchedule('* * * * *', jobs)
    expect(jobs.checkTargets).toHaveBeenCalled()
    expect(jobs.checkMoves).toHaveBeenCalledWith({ kinds: ['crypto'], refreshSeen: false })
    expect(jobs.checkNews).not.toHaveBeenCalled()
    expect(jobs.checkDaily).not.toHaveBeenCalled()
  })

  it('runs the all-kinds pass and news every five minutes', async () => {
    const jobs = spyJobs()
    await runSchedule('*/5 * * * *', jobs)
    expect(jobs.checkMoves).toHaveBeenCalledWith()
    expect(jobs.checkNews).toHaveBeenCalled()
    expect(jobs.checkTargets).not.toHaveBeenCalled()
  })

  it('runs the hourly job at :05', async () => {
    const jobs = spyJobs()
    await runSchedule('5 * * * *', jobs)
    expect(jobs.checkDaily).toHaveBeenCalled()
    expect(jobs.checkTargets).not.toHaveBeenCalled()
  })

  it('does not let one failing job cancel the others', async () => {
    // Different channels. A news outage is not a reason to stop price alerts.
    const jobs = spyJobs()
    jobs.checkMoves = vi.fn().mockRejectedValue(new Error('quotes upstream down'))
    await expect(runSchedule('*/5 * * * *', jobs)).resolves.toBeUndefined()
    expect(jobs.checkNews, 'news still runs after moves threw').toHaveBeenCalled()
  })

  it('ignores a schedule it does not recognise', async () => {
    const jobs = spyJobs()
    await runSchedule('0 0 1 1 *', jobs)
    for (const fn of Object.values(jobs)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('a price target, end to end through the real job', () => {
  it('sends when the price crosses, and records that it fired', async () => {
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }] }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, payload) => { sent.push(payload); return true } })

    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 101000, change24h: 3 } })

    await jobs.checkTargets()

    expect(sent, 'one target notification').toHaveLength(1)
    expect(sent[0].channel).toBe('target')
    expect(sent[0].tag).toBe('price-7')
    expect(store.map.get('k1').fired['7'], 'fired flag recorded').toBeTruthy()
    expect(store.saved).toContain('k1')
    vi.restoreAllMocks()
  })

  it('stays silent when the target has not been reached', async () => {
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }] }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 90000, change24h: -2 } })

    await jobs.checkTargets()
    expect(sent).toHaveLength(0)
    vi.restoreAllMocks()
  })

  it('does not send the same target twice', async () => {
    const store = fakeStore([{
      key: 'k1',
      sub: sub({
        alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }],
        fired: { 7: Date.now() },
      }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 101000, change24h: 3 } })

    await jobs.checkTargets()
    expect(sent, 'already fired').toHaveLength(0)
    vi.restoreAllMocks()
  })

  it('re-arms once the price falls back below the target', async () => {
    const store = fakeStore([{
      key: 'k1',
      sub: sub({
        alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }],
        fired: { 7: Date.now() },
      }),
    }])
    const jobs = createJobs({ store, send: async () => true })

    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 90000, change24h: -2 } })

    await jobs.checkTargets()
    expect(store.map.get('k1').fired['7'], 'flag cleared so it can fire again').toBeUndefined()
    vi.restoreAllMocks()
  })

  it('does nothing, and asks for no quotes, when nobody has alerts', async () => {
    const store = fakeStore([{ key: 'k1', sub: sub() }])
    const markets = await import('../../push-api/markets.js')
    const spy = vi.spyOn(markets, 'fetchCryptoQuotes').mockResolvedValue({})
    const jobs = createJobs({ store, send: async () => true })

    await jobs.checkTargets()
    expect(spy, 'no alerts means no upstream call').not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
