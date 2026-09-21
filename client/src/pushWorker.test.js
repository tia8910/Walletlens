import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runSchedule } from '../../workers/push/index.js'
import { createJobs } from '../../workers/push/jobs.js'
import {
  DEFAULT_PREFS, HACK_HOUR, ACADEMY_HOUR, PORTFOLIO_HOUR, HACK_GAP_MS, LANGS,
} from '../../push-api/notify-logic.js'
import { LANGUAGE_CODES } from './i18n'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hacks, questions } from './data/academyContent.js'

const here = dirname(fileURLToPath(import.meta.url))

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
  // Spread from the real defaults rather than restated. A hand-written copy
  // silently omits every pref added later, and a channel gated on a missing
  // pref reads as "off" — so the tests would go on passing while the feature
  // they were meant to cover never ran.
  prefs: { ...DEFAULT_PREFS, movePct: 5 },
  lastSeen: Date.now(), fired: {}, ref: {}, moveFired: {}, lastPrice: {}, lastLevel: {},
  seenRef: null, newsSent: {}, lastNewsAt: 0, digestDay: '', retention: [],
  featuresSent: [], lastFeatureAt: 0, sent: { day: '', n: 0 },
  hacksSent: [], lastHackAt: 0, academyDay: '', pulseDay: '',
  zakatDue: null, zakatSent: [], createdAt: Date.now(),
  ...over,
})

// checkDaily branches on the LOCAL hour, so a test that wants a given slot has
// to place the clock there. Pinning tz to 0 and moving fake time to the UTC
// hour is the least fragile way: the alternative, computing a tz offset from
// whatever hour the suite happens to run at, breaks twice a year.
function atHour(hour) {
  const d = new Date('2026-03-11T00:00:00Z')
  d.setUTCHours(hour, 5, 0, 0)
  vi.setSystemTime(d)
  return d.getTime()
}

describe('cron dispatch', () => {
  const spyJobs = () => ({
    checkTargets: vi.fn().mockResolvedValue(undefined),
    checkMoves: vi.fn().mockResolvedValue(undefined),
    checkNews: vi.fn().mockResolvedValue(undefined),
    checkDaily: vi.fn().mockResolvedValue(undefined),
  })

  it('runs targets, moves and news on the five-minute pass', async () => {
    const jobs = spyJobs()
    await runSchedule('*/5 * * * *', jobs)
    expect(jobs.checkTargets).toHaveBeenCalled()
    expect(jobs.checkMoves).toHaveBeenCalled()
    expect(jobs.checkNews).toHaveBeenCalled()
    expect(jobs.checkDaily).not.toHaveBeenCalled()
  })

  it('has no per-minute schedule left to dispatch', async () => {
    // The minute pass is gone: on Workers Free the CPU ceiling is per
    // invocation, and 1,440 of them a day was the whole overrun. A revert that
    // reinstates the branch without reinstating the cron, or the reverse,
    // leaves one of the two silently doing nothing.
    const jobs = spyJobs()
    await runSchedule('* * * * *', jobs)
    expect(jobs.checkTargets).not.toHaveBeenCalled()
    expect(jobs.checkMoves).not.toHaveBeenCalled()
  })

  it('checks targets at least as often as the cron that fires them', () => {
    // The dispatcher and wrangler.toml have to agree. They are two files, and
    // a schedule listed in one and not the other is a job that never runs.
    const toml = readFileSync(join(here, '../../workers/push/wrangler.toml'), 'utf8')
    const crons = [...toml.matchAll(/"([^"]*\*[^"]*)"/g)].map(m => m[1])
    expect(crons, 'the five-minute cron is what now carries targets').toContain('*/5 * * * *')
    expect(crons, 'the per-minute cron is gone').not.toContain('* * * * *')
  })

  it('runs the all-kinds pass and news every five minutes', async () => {
    const jobs = spyJobs()
    await runSchedule('*/5 * * * *', jobs)
    // No argument: all kinds, which is what absorbed the crypto-only pass the
    // minute cron used to run.
    expect(jobs.checkMoves).toHaveBeenCalledWith()
    expect(jobs.checkNews).toHaveBeenCalled()
    expect(jobs.checkDaily).not.toHaveBeenCalled()
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

// ── The scheduled content channels ──────────────────────────────────────────
//
// These exist because the reactive channels are, correctly, silent on a quiet
// week: a two-asset portfolio at a 2% threshold can go days without clearing
// any bar. That is the right answer to "did a price do something" and the
// wrong answer to "is this app worth having notifications on". So three
// channels send on a schedule and rotate through real content instead.
//
// What needs proving is that each one actually reaches the sender in its own
// slot, and — the failure that would matter most — that none of them repeats
// itself.

describe('scheduled content channels', () => {
  const quoteFixture = {
    'crypto:bitcoin':  { price: 100000, change24h: 4.2 },
    'crypto:ethereum': { price: 3000,   change24h: -1.4 },
    'crypto:solana':   { price: 200,    change24h: 0.3 },
  }
  const watch3 = [
    { id: 'bitcoin',  symbol: 'BTC', kind: 'crypto' },
    { id: 'ethereum', symbol: 'ETH', kind: 'crypto' },
    { id: 'solana',   symbol: 'SOL', kind: 'crypto' },
  ]

  async function stubQuotes(quotes = quoteFixture) {
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchQuotes')
      .mockResolvedValue(quotes)
  }

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('sends a portfolio pulse in its own hour, with breadth and a leader', async () => {
    atHour(PORTFOLIO_HOUR)
    await stubQuotes()
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3, tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()

    const pulse = sent.find(p => p.channel === 'portfolio')
    expect(pulse, 'the pulse reached the sender').toBeTruthy()
    // Two of three green, BTC the biggest mover either way.
    expect(pulse.body).toContain('2 of your 3')
    expect(pulse.body).toContain('BTC')
    expect(pulse.body).toContain('4.2')
    // No amount, no total, no currency figure — the server has none to leak.
    expect(pulse.body).not.toMatch(/\$/)
  })

  it('says nothing on a day when no holding moved', async () => {
    atHour(PORTFOLIO_HOUR)
    await stubQuotes({
      'crypto:bitcoin':  { price: 100000, change24h: 0.2 },
      'crypto:ethereum': { price: 3000,   change24h: -0.3 },
    })
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3.slice(0, 2), tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()
    expect(sent.filter(p => p.channel === 'portfolio')).toHaveLength(0)
  })

  it('sends the pulse once a day, not once an hour', async () => {
    atHour(PORTFOLIO_HOUR)
    await stubQuotes()
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3, tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()
    await jobs.checkDaily()
    expect(sent.filter(p => p.channel === 'portfolio')).toHaveLength(1)
  })

  it('sends the day’s Academy question as the notification body', async () => {
    atHour(ACADEMY_HOUR)
    await stubQuotes()
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3, tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()

    const q = sent.find(p => p.channel === 'academy')
    expect(q, 'the challenge reached the sender').toBeTruthy()
    // The body is a real stem from the bank, not a "your challenge is ready".
    expect(questions('en').map(x => x.q)).toContain(q.body)
    // The challenge tab specifically. /academy alone opens whatever tab is
    // default, which is a coincidence rather than a destination.
    expect(q.url).toBe('/academy?tab=challenge')
  })

  it('does not repeat the challenge later the same day', async () => {
    atHour(ACADEMY_HOUR)
    await stubQuotes()
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3, tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()
    await jobs.checkDaily()
    expect(sent.filter(p => p.channel === 'academy')).toHaveLength(1)
  })

  it('sends an investment hack, and a different one next time', async () => {
    atHour(HACK_HOUR)
    await stubQuotes()
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3, tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()
    const first = sent.find(p => p.channel === 'hack')
    expect(first, 'the hack reached the sender').toBeTruthy()
    expect(first.body).toBe(hacks('en')[0].body)
    // THIS hack, opened, by the index the rotation recorded — not a list of
    // forty for the reader to search for the one they were just told about.
    expect(first.url).toBe('/academy?tab=hacks&hack=0')

    // Same hour two days later: the gap has elapsed, so the next one is due —
    // and it must not be the one already read.
    vi.setSystemTime(new Date(Date.now() + HACK_GAP_MS))
    await jobs.checkDaily()
    const all = sent.filter(p => p.channel === 'hack')
    expect(all).toHaveLength(2)
    expect(all[1].body).toBe(hacks('en')[1].body)
  })

  it('holds the hack until the gap has actually elapsed', async () => {
    atHour(HACK_HOUR)
    await stubQuotes()
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3, tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()
    vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000))  // one day, not two
    await jobs.checkDaily()
    expect(sent.filter(p => p.channel === 'hack')).toHaveLength(1)
  })

  it('starts the hack rotation over rather than going silent for ever', async () => {
    atHour(HACK_HOUR)
    await stubQuotes()
    const list = hacks('en')
    // Every hack already read.
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ watch: watch3, tz: 0, hacksSent: list.map((_, i) => String(i)) }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()
    const hack = sent.find(p => p.channel === 'hack')
    expect(hack, 'an exhausted list restarts instead of ending the channel').toBeTruthy()
    expect(hack.body).toBe(list[0].body)
    // And the bookkeeping is reset, not appended to, or the next pass would
    // read "all sent" again and wrap on every single run.
    expect(store.map.get('k1').hacksSent).toEqual(['0'])
  })

  it('keeps each channel to its own hour', async () => {
    await stubQuotes()
    const store = fakeStore([{ key: 'k1', sub: sub({ watch: watch3, tz: 0 }) }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    atHour(PORTFOLIO_HOUR)
    await jobs.checkDaily()
    expect(sent.map(p => p.channel)).not.toContain('academy')

    sent.length = 0
    atHour(ACADEMY_HOUR)
    await jobs.checkDaily()
    expect(sent.map(p => p.channel)).not.toContain('portfolio')
  })

  it('respects each channel’s own switch', async () => {
    atHour(PORTFOLIO_HOUR)
    await stubQuotes()
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ watch: watch3, tz: 0, prefs: { ...DEFAULT_PREFS, portfolio: false } }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkDaily()
    expect(sent.filter(p => p.channel === 'portfolio')).toHaveLength(0)
  })
})

// ── Market-wide news ────────────────────────────────────────────────────────
//
// The per-asset match is right and is also why the channel was near-silent: a
// device watching two coins matches almost nothing a wire publishes in a day.
// A second, clearly-labelled kind of story fixes that without loosening the
// match that keeps "GAS prices" from pushing to a GAS holder.

describe('what a price alert actually reads like', () => {
  it('puts symbol, direction, percentage and price in the headline', async () => {
    // Through the real job, because the copy and the call site have to agree
    // about argument order — and a mismatch there is silent: every argument is
    // a string, so a swapped pair prints a plausible-looking wrong sentence.
    const store = fakeStore([{
      key: 'k1',
      sub: sub({
        watch: [{ id: 'bitcoin', symbol: 'BTC', kind: 'crypto' }],
        ref: { 'crypto:bitcoin': { price: 100000, ts: Date.now() - 1000 } },
        prefs: { ...DEFAULT_PREFS, movePct: 2 },
      }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s2, payload) => { sent.push(payload); return true } })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchQuotes')
      .mockResolvedValue({ 'crypto:bitcoin': { price: 106400, change24h: 8.42 } })

    await jobs.checkMoves()

    const move = sent.find(p => p.channel === 'move')
    expect(move, 'a move notification').toBeTruthy()
    // 📈 BTC +6.4% · $106,400
    expect(move.title).toBe('📈 BTC +6.4% · $106,400')
    // The day, which the title's percentage is not: that one is measured from
    // a rolling reference, so on its own it has no sense of scale.
    // 8.42 rounds to one decimal, as every percentage in this app does.
    expect(move.body).toBe('BTC over 24h: +8.4%')
    vi.restoreAllMocks()
  })

  it('shows a fall as a fall, with a minus sign that cannot be misread', async () => {
    const store = fakeStore([{
      key: 'k1',
      sub: sub({
        watch: [{ id: 'ethereum', symbol: 'ETH', kind: 'crypto' }],
        ref: { 'crypto:ethereum': { price: 3000, ts: Date.now() - 1000 } },
        prefs: { ...DEFAULT_PREFS, movePct: 2 },
      }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s2, payload) => { sent.push(payload); return true } })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchQuotes')
      .mockResolvedValue({ 'crypto:ethereum': { price: 2700, change24h: -11.2 } })

    await jobs.checkMoves()

    const move = sent.find(p => p.channel === 'move')
    expect(move.title).toBe('📉 ETH −10% · $2,700')
    expect(move.body).toBe('ETH over 24h: −11%')
    vi.restoreAllMocks()
  })
})

describe('news reaches a small watch list', () => {
  const story = (title, link) => ({
    title, link, description: '', pubDate: new Date().toISOString(),
  })

  async function stubNews(articles) {
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchNews')
      .mockResolvedValue(articles)
  }

  afterEach(() => { vi.restoreAllMocks() })

  it('sends a market-wide story to someone who holds none of what it names', async () => {
    await stubNews([story('Fed cuts rates by 25bps as inflation cools', 'https://x/1')])
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ watch: [{ id: 'solana', symbol: 'SOL', kind: 'crypto' }] }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkNews()
    expect(sent, 'the old code required a watch-list match and sent nothing').toHaveLength(1)
    expect(sent[0].channel).toBe('news')
    // Framed as market news — it does not claim to be about a holding.
    expect(sent[0].sym).toBeUndefined()
    expect(sent[0].title).toMatch(/market|marché|mercado|Markt|mercato/i)
  })

  it('still prefers a story that names something the user actually holds', async () => {
    await stubNews([
      story('Fed cuts rates by 25bps', 'https://x/1'),
      story('Solana network upgrade ships this week', 'https://x/2'),
    ])
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ watch: [{ id: 'solana', symbol: 'SOL', kind: 'crypto' }] }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkNews()
    // The general story is FIRST in the feed. Ranking it ahead of the held one
    // would spend the four-hour window on the weaker of the two.
    expect(sent).toHaveLength(1)
    expect(sent[0].sym).toBe('SOL')
  })

  it('does not turn every story into a notification', async () => {
    await stubNews([story('Pudgy Penguins launches a new NFT drop', 'https://x/1')])
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ watch: [{ id: 'solana', symbol: 'SOL', kind: 'crypto' }] }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkNews()
    expect(sent, 'neither held nor market-wide').toHaveLength(0)
  })

  it('leaves the market channel switchable on its own', async () => {
    await stubNews([story('Fed cuts rates by 25bps', 'https://x/1')])
    const store = fakeStore([{
      key: 'k1',
      sub: sub({ watch: [], prefs: { ...DEFAULT_PREFS, newsMarket: false } }),
    }])
    const sent = []
    const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

    await jobs.checkNews()
    expect(sent).toHaveLength(0)
  })
})

// ── The user's chosen language ──────────────────────────────────────────────
//
// The server writes the notification text, so it can only be as multilingual
// as the code the client sends it. Both halves have failed independently:
// the client had a hardcoded four-language allowlist while the app shipped
// six, and content added later can easily arrive English-only.

describe('notifications are written in the language the user picked', () => {
  it('sends every language the app offers, not a hardcoded subset', () => {
    // The regression: ['en', 'ar', 'fr', 'es'] was written out by hand, then
    // German and Italian were added to the app. Those users picked their
    // language and still got English lock screens — the client would not send
    // a code the server had full copy for, and nothing errored.
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'push.js'), 'utf8',
    )
    // Comments stripped first. The prose right above the fix quotes the old
    // list verbatim to explain it, so a raw match finds the very string it is
    // meant to prove absent — this assertion failed on its own explanation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const fn = code.slice(code.indexOf('function currentLang'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/LANGUAGE_CODES/)
    // A literal list inside the function is the shape of the bug, whatever
    // codes it happens to contain today.
    expect(body).not.toMatch(/\[\s*'en'\s*,/)
  })

  it('reaches every language the server can write', () => {
    // The client's list and the server's copy tables have to agree, or one
    // side silently falls back for a language the other supports.
    expect([...LANGUAGE_CODES].sort()).toEqual([...LANGS].sort())
  })

  for (const lang of ['ar', 'de', 'it', 'fr', 'es']) {
    it(`writes the ${lang} hack and challenge in ${lang}`, async () => {
      vi.useFakeTimers()
      atHour(HACK_HOUR)
      vi.spyOn(await import('../../push-api/markets.js'), 'fetchQuotes').mockResolvedValue({})
      const store = fakeStore([{ key: 'k1', sub: sub({ lang, tz: 0 }) }])
      const sent = []
      const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })

      await jobs.checkDaily()
      const hack = sent.find(p => p.channel === 'hack')
      expect(hack, `a hack for ${lang}`).toBeTruthy()
      expect(hack.body).toBe(hacks(lang)[0].body)
      expect(hack.body, `${lang} must not fall back to English`)
        .not.toBe(hacks('en')[0].body)

      sent.length = 0
      atHour(ACADEMY_HOUR)
      await jobs.checkDaily()
      const q = sent.find(p => p.channel === 'academy')
      expect(q, `a challenge for ${lang}`).toBeTruthy()
      expect(questions(lang).map(x => x.q)).toContain(q.body)
      expect(questions('en').map(x => x.q), `${lang} stem must not be English`)
        .not.toContain(q.body)

      vi.useRealTimers()
      vi.restoreAllMocks()
    })
  }

  it('writes the portfolio line in the chosen language too', async () => {
    vi.useFakeTimers()
    atHour(PORTFOLIO_HOUR)
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchQuotes').mockResolvedValue({
      'crypto:bitcoin':  { price: 100000, change24h: 4.2 },
      'crypto:ethereum': { price: 3000,   change24h: -1.4 },
    })
    const watch = [
      { id: 'bitcoin',  symbol: 'BTC', kind: 'crypto' },
      { id: 'ethereum', symbol: 'ETH', kind: 'crypto' },
    ]
    const seen = {}
    for (const lang of ['en', 'de', 'ar']) {
      const store = fakeStore([{ key: 'k1', sub: sub({ lang, tz: 0, watch }) }])
      const sent = []
      const jobs = createJobs({ store, send: async (s, p) => { sent.push(p); return true } })
      await jobs.checkDaily()
      const pulse = sent.find(p => p.channel === 'portfolio')
      expect(pulse, `a pulse for ${lang}`).toBeTruthy()
      seen[lang] = pulse.title + '|' + pulse.body
    }
    expect(new Set(Object.values(seen)).size, 'three languages, three strings').toBe(3)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
})

// ── An Android device, from the database row to Firebase ─────────────────────
//
// THE GAP THESE CLOSE.
//
// Every job test above uses fakeStore(), which returns whatever it was handed.
// The real SubStore does not: it decides which rows are worth returning, and
// its rule was "has a Web Push endpoint". An FCM device has a token instead, so
// the real scan dropped every Android install and no test above could notice,
// because none of them used the real scan.
//
// So these run the actual store over an actual (fake) D1 holding ONE row — a
// device with a token and no subscription — through the actual cron dispatch
// and the actual sender, and check a message reaches Firebase addressed to
// that token. Every link in the chain the user's phone depends on.

describe('a token-addressed device reaches Firebase', () => {
  /** Minimal D1 double: enough for SELECT/INSERT/UPDATE as the store uses them. */
  function d1(rows = {}) {
    const map = new Map(Object.entries(rows))
    return {
      map,
      prepare(sql) {
        const st = {
          args: [],
          bind(...a) { st.args = a; return st },
          async all() {
            return /SELECT key, data FROM subs/.test(sql)
              ? { results: [...map.entries()].map(([key, data]) => ({ key, data })) }
              : { results: [] }
          },
          async first() {
            const d = map.get(st.args[0])
            return d ? { data: d } : null
          },
          async run() {
            if (/^INSERT INTO subs/.test(sql)) map.set(st.args[0], st.args[1])
            else if (/^UPDATE subs/.test(sql)) map.set(st.args[2], st.args[0])
            else if (/^DELETE FROM subs/.test(sql)) map.delete(st.args[0])
            return { success: true }
          },
        }
        return st
      },
    }
  }

  /**
   * A real RSA key, generated here.
   *
   * accessToken() signs a JWT with WebCrypto and importKey rejects anything
   * that is not a genuine PKCS8 key, so a placeholder string would fail before
   * the code under test ran. Generating one costs milliseconds and keeps the
   * signing step honest instead of stubbed.
   */
  async function serviceAccount() {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    )
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
    let bin = ''
    for (const b of pkcs8) bin += String.fromCharCode(b)
    const body = btoa(bin).match(/.{1,64}/g).join('\n')
    return JSON.stringify({
      project_id: 'walletlens-test',
      client_email: 'push@walletlens-test.iam.gserviceaccount.com',
      private_key: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    })
  }

  const TOKEN = 'the-devices-fcm-registration-token'

  /** The row an Android install writes: a token, and no subscription at all. */
  const fcmRow = (over = {}) => JSON.stringify(sub({
    subscription: null,
    transport: 'fcm',
    fcmToken: TOKEN,
    ...over,
  }))

  async function harness(rows) {
    const { SubStore } = await import('../../workers/push/store.js')
    const { makeSender } = await import('../../workers/push/index.js')
    const db = d1(rows)
    const store = new SubStore(db, { cacheMs: 0 })
    const env = { FCM_SERVICE_ACCOUNT: await serviceAccount() }

    const calls = []
    const fetchMock = vi.fn(async (url, init) => {
      // Only the FCM send carries JSON. The token exchange posts form-encoded
      // URLSearchParams, and parsing that as JSON throws inside the mock —
      // which surfaces as "no message was sent" and looks exactly like the bug
      // under test rather than like a broken double.
      let body = null
      try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null } catch { body = null }
      calls.push({ url: String(url), body })
      if (String(url).includes('oauth2.googleapis.com')) {
        return { ok: true, status: 200, async json() { return { access_token: 'at', expires_in: 3600 } } }
      }
      return { ok: true, status: 200, async json() { return {} }, async text() { return '' } }
    })
    return { store, jobs: createJobs({ store, send: makeSender(env, store) }), calls, fetchMock, db }
  }

  beforeEach(async () => {
    const { resetTokenCache } = await import('../../workers/push/fcm.js')
    resetTokenCache()
  })

  it('is returned by the real scan at all', async () => {
    // The regression in one line. Before the fix this list was empty, and
    // everything below it was unreachable for an app install.
    const { store } = await harness({ 'fcm:1': fcmRow() })
    const all = await store.all()
    expect(all, 'the crons must be able to see the device').toHaveLength(1)
    expect(all[0].sub.fcmToken).toBe(TOKEN)
  })

  it('gets a price target notification through the real cron dispatch', async () => {
    const { jobs, calls, fetchMock } = await harness({
      'fcm:1': fcmRow({
        alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }],
      }),
    })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 101000, change24h: 3 } })
    vi.stubGlobal('fetch', fetchMock)

    // The real schedule, not the job called by hand.
    await runSchedule('*/5 * * * *', jobs)

    const send = calls.find(c => c.url.includes('fcm.googleapis.com'))
    expect(send, 'a message was posted to Firebase').toBeTruthy()
    expect(send.body.message.token, 'addressed to this device').toBe(TOKEN)
    expect(send.body.message.data.channel).toBe('target')
    // HIGH or it waits out Doze on an idle phone, which is most of the time
    // the app is closed — the whole point of the transport.
    expect(send.body.message.android.priority).toBe('HIGH')

    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('gets a scheduled channel — the one that had never arrived', async () => {
    // The hack, the academy question and the portfolio pulse all run from
    // checkDaily on the hourly cron. Every one of them was silent on an app
    // install for the same single reason.
    const now = atHour(HACK_HOUR)
    const { jobs, calls, fetchMock } = await harness({
      'fcm:1': fcmRow({ lastHackAt: now - HACK_GAP_MS - 1, hacksSent: [], tz: 0 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await runSchedule('5 * * * *', jobs)

    const send = calls.find(c => c.url.includes('fcm.googleapis.com'))
    expect(send, 'the hourly job reached the device').toBeTruthy()
    expect(send.body.message.token).toBe(TOKEN)

    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('records the notification against the day it was sent', async () => {
    // THE INSTRUMENT, and it was reading zero for every device on every
    // transport since the counter was written.
    //
    // bumpSent(sent, nowMs, tzOffsetMin) RETURNS the new counter; it does not
    // mutate. Both senders called it as bumpSent(sub, now) and dropped the
    // result — so `sent` was passed the whole row (which has no .day), the
    // timezone was silently omitted, and the value went nowhere.
    //
    // Nothing about delivery depended on it, which is why it survived: every
    // notification still arrived. What broke is the only number that tells
    // "nothing was due" apart from "this device is not wired up" — the
    // distinction /status exists to report, and the one that has now cost
    // this project several rounds of looking in the wrong place.
    const now = Date.UTC(2026, 7, 31, 12, 0, 0)
    const { store, jobs, calls, fetchMock } = await harness({
      'fcm:1': fcmRow({
        tz: 180,   // UTC+3: the local day must be the user's, not the server's
        alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }],
      }),
    })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 101000, change24h: 3 } })
    vi.stubGlobal('fetch', fetchMock)
    vi.setSystemTime(now)

    await runSchedule('*/5 * * * *', jobs)

    expect(calls.some(c => c.url.includes('fcm.googleapis.com')), 'it did send').toBe(true)

    // Read it back through the store, not off the in-memory row: a counter
    // that is incremented and then dropped by the merge is no counter at all.
    store.invalidate()
    const [{ sub: after }] = await store.all()
    expect(after.sent, 'the send was counted').toEqual({ day: '2026-08-31', n: 1 })

    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('records WHY a send was refused, where the user can read it', async () => {
    // The other half of the counter. "0 sent today" reads identically whether
    // nothing was due or Firebase refused every attempt, and those two want
    // opposite fixes — so the refusal text is kept on the row and reported by
    // /status. Until now it went only to a console.warn inside the Worker,
    // which nobody can see without attaching a live tail at the exact moment.
    const now = Date.UTC(2026, 7, 31, 12, 0, 0)
    const { store, jobs, fetchMock } = await harness({
      'fcm:1': fcmRow({
        alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }],
      }),
    })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 101000, change24h: 3 } })
    // A refusal that is NOT a dead token: 401 must leave the row in place, so
    // there is still something to read the error off.
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).includes('oauth2.googleapis.com')) return fetchMock(url, init)
      return { ok: false, status: 401, async text() { return 'SENDER_ID_MISMATCH' } }
    }))
    vi.setSystemTime(now)

    await runSchedule('*/5 * * * *', jobs)

    store.invalidate()
    const rows = await store.all()
    expect(rows, 'a refused send must not drop the device').toHaveLength(1)
    expect(rows[0].sub.lastError).toEqual({ at: now, code: 'fcm 401 SENDER_ID_MISMATCH' })
    expect(rows[0].sub.sent, 'and it must not be counted as sent').toEqual({ day: '', n: 0 })

    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clears the error once a send gets through', async () => {
    // An error left on screen after recovery is worse than none: it sends the
    // reader after a fault that has already gone.
    const now = Date.UTC(2026, 7, 31, 12, 0, 0)
    const { store, jobs, fetchMock } = await harness({
      'fcm:1': fcmRow({
        lastError: { at: now - 60_000, code: 'fcm 401 SENDER_ID_MISMATCH' },
        alerts: [{ id: 7, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 100000 }],
      }),
    })
    vi.spyOn(await import('../../push-api/markets.js'), 'fetchCryptoQuotes')
      .mockResolvedValue({ bitcoin: { price: 101000, change24h: 3 } })
    vi.stubGlobal('fetch', fetchMock)
    vi.setSystemTime(now)

    await runSchedule('*/5 * * * *', jobs)

    store.invalidate()
    const [{ sub: after }] = await store.all()
    expect(after.lastError, 'a successful send clears it').toBeNull()

    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the device addressable after a cron has written the row back', async () => {
    // save() merges the cron's copy over storage. If the address were not
    // user-owned, this write would be where a rotated token got clobbered —
    // and the device would go quiet again with nothing to see.
    const { store } = await harness({ 'fcm:1': fcmRow() })
    const [{ key, sub: row }] = await store.all()
    await store.save(key, { ...row, lastHackAt: 999 })
    store.invalidate()
    const after = await store.all()
    expect(after, 'still visible to the next scan').toHaveLength(1)
    expect(after[0].sub.fcmToken, 'still addressable').toBe(TOKEN)
  })
})
