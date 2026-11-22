import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import worker from '../../workers/voice/index.js'

// The Guardian server, end to end, against an in-memory stand-in for D1 and
// with outgoing mail captured instead of sent.

function fakeDb() {
  const rows = new Map()
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return rows.has(args[0]) ? { v: rows.get(args[0]) } : null },
            async run() {
              if (sql.startsWith('INSERT')) rows.set(args[0], args[1])
              else if (sql.startsWith('DELETE')) rows.delete(args[0])
              return {}
            },
            async all() {
              const prefix = args[0].replace(/\\([\\%_])/g, '$1').replace(/%$/, '')
              return { results: [...rows.entries()].filter(([k]) => k.startsWith(prefix)).sort().map(([k, v]) => ({ k, v })) }
            },
          }
        },
      }
    },
  }
}

let env, mails
let ipN = 0
const DAY = 86_400_000
const T0 = new Date('2027-03-01T10:00:00Z').getTime()

async function post(body) {
  ipN += 1
  const res = await worker.fetch(new Request('https://x/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://walletlens.live', 'cf-connecting-ip': `10.${(ipN >> 8) & 255}.${ipN & 255}.7` },
    body: JSON.stringify(body),
  }), env)
  return res.json()
}
async function sweep() {
  const p = []
  await worker.scheduled({ cron: '0 */6 * * *' }, env, { waitUntil: x => p.push(x) })
  await Promise.all(p)
}
const record = (id = 'device-guardian-1') => JSON.parse(env.DB.rows.get(JSON.stringify(['guardian', id])))

const SETUP = {
  mode: 'guardian_setup', deviceId: 'device-guardian-1',
  ownerName: 'Ahmed', ownerEmail: 'owner@example.com', message: 'Call Nadia first.', intervalDays: 30,
  heirs: [{ name: 'Sara', email: 'sara@example.com', role: 'Spouse', share: 60 }, { name: 'Omar', email: 'omar@example.com', role: 'Son', share: 40 }],
  trusted: { name: 'Nadia', email: 'nadia@example.com' },
  plan: [
    { sym: 'BTC', kind: 'hardware', place: 'Ledger, home safe', how: 'Sheet is with Nadia', to: [] },
    { sym: 'AAPL', kind: 'broker', place: 'Interactive Brokers', how: '', to: ['omar@example.com'] },
    { sym: 'X', kind: 'nonsense', place: '', how: '' },
  ],
  portfolioSummary: { totalUsd: 84200, assetSymbols: ['BTC', 'AAPL'], currency: 'USD' },
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  env = { DB: fakeDb(), RESEND_API_KEY: 'test-key' }
  mails = []
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (String(url).includes('resend.com')) { mails.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }) }
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Guardian server', () => {
  it('stores heir roles and shares, the trusted person and a clean legacy plan', async () => {
    expect((await post(SETUP)).ok).toBe(true)
    const r = record()
    expect(r.heirs[0]).toMatchObject({ name: 'Sara', role: 'Spouse', share: 60 })
    expect(r.trusted).toEqual({ name: 'Nadia', email: 'nadia@example.com' })
    expect(r.plan.map(p => p.sym)).toEqual(['BTC', 'AAPL'])   // the empty row is dropped
    expect(r.plan[0].kind).toBe('hardware')
  })

  it('walks the steps in order: owner, trusted person, then each heir with their own share and plan', async () => {
    await post(SETUP)
    vi.setSystemTime(T0 + 31 * DAY); await sweep()
    expect(mails.map(m => m.to)).toEqual(['owner@example.com'])

    vi.setSystemTime(T0 + 39 * DAY); await sweep()
    expect(mails.map(m => m.to)).toEqual(['owner@example.com', 'nadia@example.com'])
    expect(mails[1].html).toContain('guardian-reset?d=device-guardian-1&amp;t=1'.replace('&amp;', '&'))

    vi.setSystemTime(T0 + 46 * DAY); await sweep()
    const heirs = mails.slice(2)
    expect(heirs.map(m => m.to)).toEqual(['sara@example.com', 'omar@example.com'])
    expect(heirs[0].html).toContain('60%')
    expect(heirs[0].html).toContain('Ledger, home safe')
    expect(heirs[0].html).not.toContain('Interactive Brokers')   // marked for Omar only
    expect(heirs[1].html).toContain('Interactive Brokers')
    expect(heirs[1].html).toContain('contact <b style="color:#e2e8f0">Nadia</b> first')
  })

  it('a check-in at any step starts the cycle again', async () => {
    await post(SETUP)
    vi.setSystemTime(T0 + 31 * DAY); await sweep()
    vi.setSystemTime(T0 + 39 * DAY); await sweep()
    expect(mails).toHaveLength(2)
    await post({ mode: 'guardian_checkin', deviceId: 'device-guardian-1' })
    expect(record().trustedAskedAt).toBeNull()
    vi.setSystemTime(T0 + 60 * DAY); await sweep()
    expect(mails).toHaveLength(2)
  })

  it('a pause holds everything, and the clock runs from its end', async () => {
    await post(SETUP)
    const up = await post({ mode: 'guardian_update', deviceId: 'device-guardian-1', pauseDays: 20 })
    expect(up.ok).toBe(true)
    vi.setSystemTime(T0 + 45 * DAY); await sweep()
    expect(mails).toHaveLength(0)   // 20 days paused + 30-day interval = 50
    vi.setSystemTime(T0 + 51 * DAY); await sweep()
    expect(mails.map(m => m.to)).toEqual(['owner@example.com'])
  })

  it('caps a pause, and changes made from the app count as a check-in', async () => {
    await post(SETUP)
    vi.setSystemTime(T0 + 10 * DAY)
    const up = await post({ mode: 'guardian_update', deviceId: 'device-guardian-1', pauseDays: 365, intervalDays: 60 })
    expect(new Date(up.pausedUntil).getTime()).toBe(T0 + 70 * DAY)
    expect(record().intervalDays).toBe(60)
    expect(new Date(record().lastCheckin).getTime()).toBe(T0 + 10 * DAY)
  })

  it('the drill sends each heir a clearly marked practice email, at most once a week', async () => {
    await post(SETUP)
    const d = await post({ mode: 'guardian_drill', deviceId: 'device-guardian-1' })
    expect(d).toMatchObject({ ok: true, sent: 2 })
    expect(mails.every(m => /Practice run/.test(m.subject))).toBe(true)
    expect((await post({ mode: 'guardian_drill', deviceId: 'device-guardian-1' })).reason).toBe('too_soon')
    vi.setSystemTime(T0 + 8 * DAY)
    expect((await post({ mode: 'guardian_drill', deviceId: 'device-guardian-1' })).ok).toBe(true)
  })

  it('an older app that sends no plan or trusted person keeps what was saved', async () => {
    await post(SETUP)
    const { plan, trusted, ...older } = SETUP
    await post(older)
    expect(record().plan).toHaveLength(2)
    expect(record().trusted?.name).toBe('Nadia')
  })
})
