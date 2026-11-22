import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJobs } from '../../workers/push/jobs.js'
import {
  sanitizeSignals, signalFiredKey, pruneSignalFired, signalDir, normalizeSub, mergeSubForWrite,
  copy, CHANNEL_DELIVERY, DEFAULT_PREFS,
} from '../../push-api/notify-logic.js'
import { serverChartFor, signalRulesForServer } from './push'
import { checkAlerts } from './components/AlertEngine'
import { PRO_ALERTS_KEY } from './alertRules'

// Chart signal alerts (Buy, Sell, crosses, RSI) ring with the app closed: the
// app sends the rules to the push server, which reads the same chart with the
// same engine and sends an alarm push.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const H4 = 4 * 3600_000

// Gentle zig-zag up for 120 candles, then a steep fall: RSI drops through 30
// on a closed candle near the end.
function fallingChart(start = Date.UTC(2027, 0, 1)) {
  const out = []
  let p = 100
  for (let i = 0; i < 130; i++) {
    const step = i < 120 ? (i % 2 ? 0.6 : -0.3) : -4
    const o = p; p = Math.max(1, p + step)
    out.push({ t: start + i * H4, o, h: Math.max(o, p) + 0.2, l: Math.min(o, p) - 0.2, c: p })
  }
  return out
}

const rule = (over = {}) => ({ id: 'r1', coin_id: 'arweave', symbol: 'AR', tf: '4h', event: 'rsi_low', armedAt: Date.UTC(2027, 0, 1), ...over })

function fakeStore(rows = []) {
  const map = new Map(rows.map(r => [r.key, r.sub]))
  return {
    map, saved: [],
    async all() { return [...map.entries()].map(([key, sub]) => ({ key, sub })) },
    async get(k) { return map.get(k) ?? null },
    async save(k, sub) { this.saved.push(k); map.set(k, sub) },
  }
}
const subWith = (over = {}) => normalizeSub({
  subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } },
  lang: 'en', prefs: { ...DEFAULT_PREFS }, ...over,
})

describe('signal rules on the server', () => {
  it('keeps only well-formed rules, and nothing extra', () => {
    const out = sanitizeSignals([
      rule({ junk: 'x' }),
      rule({ id: 'bad', event: 'moon' }),
      rule({ id: 'tf', tf: '1m' }),
      rule({ id: 's', coin_id: 'stock:aapl', symbol: 'aapl', ticker: 'AAPL' }),
      'nonsense', null,
    ])
    expect(out).toEqual([
      { id: 'r1', coin_id: 'arweave', symbol: 'AR', tf: '4h', event: 'rsi_low', armedAt: Date.UTC(2027, 0, 1) },
      { id: 's', coin_id: 'stock:aapl', symbol: 'AAPL', tf: '4h', event: 'rsi_low', armedAt: Date.UTC(2027, 0, 1), ticker: 'AAPL' },
    ])
    expect(sanitizeSignals('x')).toEqual([])
  })

  it('rings once per arming, and forgets rules that were removed or re-armed', () => {
    const r = rule()
    expect(signalFiredKey(r)).toBe(`r1:${r.armedAt}`)
    const fired = { [signalFiredKey(r)]: 1, 'gone:1': 2 }
    expect(pruneSignalFired(fired, [r])).toEqual({ [signalFiredKey(r)]: 1 })
    expect(pruneSignalFired(fired, [{ ...r, armedAt: r.armedAt + 1 }])).toEqual({})
  })

  it('the rules are the app\'s to change; a cron write never puts old ones back', () => {
    const fresh = normalizeSub({ signals: [rule({ id: 'new' })] })
    const mutated = normalizeSub({ signals: [rule()], signalFired: { x: 1 } })
    const merged = mergeSubForWrite(mutated, fresh)
    expect(merged.signals.map(r => r.id)).toEqual(['new'])
    expect(merged.signalFired).toEqual({ x: 1 })
  })

  it('is loud, short-lived, rises or falls, and is written in every language', () => {
    expect(CHANNEL_DELIVERY.signal.urgency).toBe('high')
    expect(signalDir('buy')).toBe('up')
    expect(signalDir('sell')).toBe('down')
    expect(signalDir('rsi_low')).toBe('up')
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      expect(copy('signalTitle', lang)('AR', 'buy')).toMatch(/^AR/)
      expect(copy('signalTitle', lang)('AR', 'buy')).not.toContain('buy')
      expect(copy('signalBody', lang)('4h', '$2.37', null)).toContain('$2.37')
    }
  })
})

describe('the server job', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('reads the chart, rings the alarm with the same id the app uses, and only once', async () => {
    const store = fakeStore([{ key: 'k1', sub: subWith({ signals: [rule()] }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes').mockResolvedValue({})
    const fetchCandles = vi.fn(async () => fallingChart())

    await jobs.checkSignals({ fetchCandles })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ channel: 'signal', tag: 'signal:r1', dir: 'up', sym: 'AR' })
    expect(sent[0].title).toBe('AR: RSI below 30')
    expect(sent[0].url).toContain('arweave')
    expect(store.map.get('k1').signalFired[signalFiredKey(rule())]).toBeTruthy()

    await jobs.checkSignals({ fetchCandles })
    expect(sent, 'not twice').toHaveLength(1)
  })

  it('fetches each chart once however many devices watch it', async () => {
    const store = fakeStore([
      { key: 'a', sub: subWith({ signals: [rule()] }) },
      { key: 'b', sub: subWith({ signals: [rule({ id: 'r2' })] }) },
    ])
    const jobs = createJobs({ store, send: async () => true })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes').mockResolvedValue({})
    const fetchCandles = vi.fn(async () => fallingChart())
    await jobs.checkSignals({ fetchCandles })
    expect(fetchCandles).toHaveBeenCalledTimes(1)
  })

  it('stays silent when the exchange ticker is a different coin', async () => {
    const store = fakeStore([{ key: 'k1', sub: subWith({ signals: [rule()] }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes').mockResolvedValue({ arweave: { price: 900 } })
    await jobs.checkSignals({ fetchCandles: async () => fallingChart() })
    expect(sent).toHaveLength(0)
  })

  it('ignores a signal from before the rule was armed', async () => {
    const store = fakeStore([{ key: 'k1', sub: subWith({ signals: [rule({ armedAt: Date.UTC(2030, 0, 1) })] }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes').mockResolvedValue({})
    await jobs.checkSignals({ fetchCandles: async () => fallingChart() })
    expect(sent).toHaveLength(0)
  })

  it('runs on the five-minute cron, every third pass, and stores the rules from the app', () => {
    const index = readFileSync(join(ROOT, 'workers/push/index.js'), 'utf8')
    expect(index).toMatch(/% 3 === 0\) await run\('signals', \(\) => jobs\.checkSignals\(\)\)/)
    expect(index).toMatch(/signals: body\.signals !== undefined \? sanitizeSignals\(body\.signals\)/)
    expect(index).toMatch(/if \(body\.signals !== undefined\) \{/)
    expect(index).toMatch(/signalFired: Object\.keys\(sub\.signalFired/)
  })
})

describe('the alarm on the phone', () => {
  it('rings as an alarm on Android and stays on screen on the web', () => {
    const java = readFileSync(join(ROOT, 'walletlens_source/release_package/app/src/main/java/live/walletlens/twa/WalletLensMessagingService.java'), 'utf8')
    expect(java).toMatch(/\("target"\.equals\(channel\) \|\| "signal"\.equals\(channel\)\) && NotificationHelper\.alarmEnabled/)
    expect(java).toMatch(/case "signal":/)
    const sw = readFileSync(join(ROOT, 'client/public/sw.js'), 'utf8')
    expect(sw).toMatch(/LOUD_CHANNELS = new Set\(\[[^\]]*'signal'/)
    expect(sw).toMatch(/requireInteraction: channel === 'target' \|\| channel === 'signal'/)
  })
})

describe('the app side', () => {
  beforeEach(() => { localStorage.clear() })

  it('sends armed signal rules with where to read each chart', () => {
    expect(serverChartFor('bitcoin')).toEqual({})
    expect(serverChartFor('stock:aapl')).toEqual({ ticker: 'AAPL' })
    expect(serverChartFor('stock:brk.b')).toEqual({ ticker: 'BRK-B' })
    expect(serverChartFor('metal:xau')).toEqual({ ticker: 'GC=F' })
    expect(serverChartFor('fiat:eur')).toBeNull()
    const rules = [
      { type: 'signal', id: 'a', coin_id: 'arweave', symbol: 'ar', tf: '4h', event: 'buy', armedAt: 5 },
      { type: 'signal', id: 'b', coin_id: 'arweave', symbol: 'ar', tf: '4h', event: 'sell', armedAt: 5, triggered: true },
      { type: 'goal', id: 'c', kind: 'value_above' },
    ]
    expect(signalRulesForServer(rules)).toEqual([{ id: 'a', coin_id: 'arweave', symbol: 'AR', tf: '4h', event: 'buy', armedAt: 5 }])
  })

  it('does not ring again a rule the server already rang', async () => {
    const r = { type: 'signal', id: 'r1', coin_id: 'arweave', symbol: 'AR', tf: '4h', event: 'rsi_low', armedAt: Date.UTC(2027, 0, 1), triggered: false }
    localStorage.setItem(PRO_ALERTS_KEY, JSON.stringify([r]))
    const getCandles = vi.fn(async () => ({ candles: fallingChart() }))
    const fired = await checkAlerts({
      t: (k) => (typeof k === 'string' && k.startsWith('alSig') ? () => k : k),
      getPrices: async () => ({}), getPortfolio: async () => [], getCandles,
      getServerFired: async () => new Set([`r1:${r.armedAt}`]),
    })
    expect(fired).toHaveLength(0)
    expect(getCandles).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(PRO_ALERTS_KEY))[0].triggered).toBe(true)
  })
})
