import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  asLang, buildPayload, bumpQuota, CHANNEL_URL, COPY, copy, DAILY_PUSH_BUDGET,
  DEFAULT_PREFS, dueRetentionStep, evaluateMove, fmtPct, fmtPrice, inQuietHours,
  isBreaking, LANGS, localDayKey, localHour, matchArticle, MAX_WATCH,
  MOVE_REF_MAX_AGE_MS, pruneSent, RETENTION_STEPS, sanitizeAlerts, sanitizePrefs,
  sanitizeTz, sanitizeWatch, shortHash, termsFor, withinDailyBudget,
} from '../../push-api/notify-logic.js'
import { parseCoinGecko, parseNews, parseYahooChart, quoteFor, quoteKey } from '../../push-api/markets.js'
import { LANGUAGES } from './LanguageContext'

// These rules run on a cron in Deno Deploy, where nothing else in this repo can
// reach them. They decide whether to wake a few thousand phones, so the failure
// modes are loud: a bad threshold spams everyone at once, a sign error in the
// timezone maths buzzes people at 3am, and a broken retention ladder either
// nags returning users or never fires at all.

const HOUR = 3_600_000
const DAY = 86_400_000

// A Thursday at 12:00 UTC — a neutral midday anchor for the clock tests.
const NOON_UTC = Date.parse('2026-08-20T12:00:00Z')

describe('notification copy', () => {
  it('covers every language the picker offers', () => {
    // An unknown code silently falls back to English, so a language added to
    // LanguageContext without copy here would ship English lock screens.
    expect([...LANGS].sort()).toEqual(LANGUAGES.map(l => l.code).sort())
  })

  for (const key of Object.keys(COPY)) {
    it(`${key} has a function for all four languages`, () => {
      for (const lang of LANGS) {
        expect(typeof COPY[key][lang], `${key}.${lang}`).toBe('function')
      }
    })
  }

  it('falls back to English for an unknown language', () => {
    expect(copy('digestTitle', 'de')).toBe(COPY.digestTitle.en)
    expect(copy('digestTitle', undefined)).toBe(COPY.digestTitle.en)
  })

  it('throws on a key that does not exist rather than sending an empty push', () => {
    expect(() => copy('nope', 'en')).toThrow()
  })

  it('actually translates the bodies rather than copying English', () => {
    // Every string below is user-facing; a copy-paste would pass a "has a
    // function" check while shipping English to an Arabic reader.
    const same = []
    for (const lang of LANGS.filter(l => l !== 'en')) {
      expect(COPY.moveTitle[lang]('BTC', '6.1', true)).not.toBe(COPY.moveTitle.en('BTC', '6.1', true))
      if (COPY.retentionBody[lang](3) === COPY.retentionBody.en(3)) same.push(lang)
    }
    expect(same).toEqual([])
  })

  it('builds a real sentence for each channel', () => {
    expect(COPY.moveTitle.en('BTC', '6.1', true)).toContain('BTC')
    expect(COPY.moveBody.en('BTC', '6.1', '$94,200', true)).toContain('$94,200')
    expect(COPY.digestBody.en('ETH', '3.4', false, 5)).toContain('5')
    // Singular/plural: "your 1 tracked assets" is the kind of thing users
    // screenshot and post.
    expect(COPY.digestQuietBody.en(1)).toContain('asset.')
    expect(COPY.digestQuietBody.en(4)).toContain('assets')
    // A user with nothing tracked must not be told about "your 0 tracked assets".
    expect(COPY.retentionBody.en(0)).not.toMatch(/\b0\b/)
  })

  it('gives every retention step its own title', () => {
    const titles = RETENTION_STEPS.map(s => COPY.retentionTitle.en(s))
    expect(new Set(titles).size).toBe(RETENTION_STEPS.length)
  })
})

describe('formatting', () => {
  it('drops false precision on large percentages', () => {
    expect(fmtPct(6.14)).toBe('6.1')
    expect(fmtPct(-6.14)).toBe('6.1')   // sign is carried by the copy, not here
    expect(fmtPct(12.7)).toBe('13')
  })

  it('scales price precision from BTC to SHIB', () => {
    expect(fmtPrice(94200.4)).toBe('$94,200')
    expect(fmtPrice(3.5)).toBe('$3.50')
    expect(fmtPrice(0.0421)).toBe('$0.0421')
    expect(fmtPrice(0.00002137)).toBe('$0.000021')
    expect(fmtPrice(NaN)).toBe('—')
  })
})

describe('preferences', () => {
  it('defaults the daily brief to off and the rest to on', () => {
    // A scheduled daily buzz has to be asked for; the others follow from the
    // user having just opted into push at all.
    expect(DEFAULT_PREFS.digest).toBe(false)
    expect(DEFAULT_PREFS.moves).toBe(true)
    expect(DEFAULT_PREFS.news).toBe(true)
    expect(DEFAULT_PREFS.retention).toBe(true)
    expect(DEFAULT_PREFS.quiet).toBe(true)
  })

  it('fills in missing fields and rejects junk', () => {
    expect(sanitizePrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(sanitizePrefs({ moves: 'yes' }).moves).toBe(DEFAULT_PREFS.moves)
    expect(sanitizePrefs({ news: false }).news).toBe(false)
  })

  it('clamps the move threshold to a sane band', () => {
    // 0% would fire on every tick for every asset the user holds.
    expect(sanitizePrefs({ movePct: 0 }).movePct).toBe(1)
    expect(sanitizePrefs({ movePct: -5 }).movePct).toBe(1)
    expect(sanitizePrefs({ movePct: 900 }).movePct).toBe(50)
    expect(sanitizePrefs({ movePct: 'abc' }).movePct).toBe(DEFAULT_PREFS.movePct)
    expect(sanitizePrefs({ movePct: 8 }).movePct).toBe(8)
  })
})

describe('watch list sanitising', () => {
  it('normalises case and defaults the asset class', () => {
    expect(sanitizeWatch([{ id: 'Bitcoin', symbol: 'btc' }]))
      .toEqual([{ id: 'bitcoin', symbol: 'BTC', kind: 'crypto' }])
  })

  it('drops incomplete rows and de-duplicates', () => {
    const out = sanitizeWatch([
      { id: 'bitcoin', symbol: 'BTC' },
      { id: 'bitcoin', symbol: 'BTC' },
      { id: '', symbol: 'X' },
      { id: 'ethereum' },
      null,
    ])
    expect(out).toEqual([{ id: 'bitcoin', symbol: 'BTC', kind: 'crypto' }])
  })

  it('keeps the same id in two asset classes apart', () => {
    const out = sanitizeWatch([
      { id: 'gold', symbol: 'XAU', kind: 'metal' },
      { id: 'gold', symbol: 'GOLD', kind: 'stock' },
    ])
    expect(out).toHaveLength(2)
  })

  it('caps the list so one device cannot bloat a KV record', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `coin-${i}`, symbol: `C${i}` }))
    expect(sanitizeWatch(many)).toHaveLength(MAX_WATCH)
  })

  it('rejects a non-array', () => {
    expect(sanitizeWatch('bitcoin')).toEqual([])
  })
})

describe('price-target sanitising', () => {
  it('keeps valid rules and drops unusable ones', () => {
    const out = sanitizeAlerts([
      { id: 1, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'below', targetPrice: 60000 },
      { id: 2, coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'above', targetPrice: 0 },
      { id: 3, coin_id: '', coin_symbol: 'X', targetPrice: 10 },
    ])
    expect(out).toEqual([
      { id: '1', coin_id: 'bitcoin', coin_symbol: 'BTC', condition: 'below', targetPrice: 60000 },
    ])
  })

  it('treats any condition that is not "below" as "above"', () => {
    expect(sanitizeAlerts([{ id: 1, coin_id: 'x', targetPrice: 1, condition: 'sideways' }])[0].condition)
      .toBe('above')
  })
})

describe('timezone handling', () => {
  it('reads an offset east of UTC as later in the day', () => {
    // The single most consequential sign in this file: getting it backwards
    // moves quiet hours to the middle of the user's afternoon.
    expect(localHour(NOON_UTC, 0)).toBe(12)
    expect(localHour(NOON_UTC, 180)).toBe(15)    // UTC+3
    expect(localHour(NOON_UTC, -300)).toBe(7)    // UTC-5
  })

  it('wraps across midnight without going negative', () => {
    const lateUtc = Date.parse('2026-08-20T23:00:00Z')
    expect(localHour(lateUtc, 120)).toBe(1)      // next day, UTC+2
    const earlyUtc = Date.parse('2026-08-20T01:00:00Z')
    expect(localHour(earlyUtc, -180)).toBe(22)   // previous day, UTC-3
  })

  it('rolls the local day key over at local midnight', () => {
    const lateUtc = Date.parse('2026-08-20T23:30:00Z')
    expect(localDayKey(lateUtc, 0)).toBe('2026-08-20')
    expect(localDayKey(lateUtc, 120)).toBe('2026-08-21')
  })

  it('falls back to UTC for an impossible offset', () => {
    expect(sanitizeTz(99999)).toBe(0)
    expect(sanitizeTz('abc')).toBe(0)
    expect(sanitizeTz(undefined)).toBe(0)
    expect(sanitizeTz(330)).toBe(330)   // India, UTC+5:30
    expect(sanitizeTz(-720)).toBe(-720)
  })
})

describe('quiet hours', () => {
  const at = (iso, tz) => inQuietHours(Date.parse(iso), tz)

  it('is silent overnight and awake through the day', () => {
    expect(at('2026-08-20T23:00:00Z', 0)).toBe(true)
    expect(at('2026-08-20T03:00:00Z', 0)).toBe(true)
    expect(at('2026-08-20T07:59:00Z', 0)).toBe(true)
    expect(at('2026-08-20T08:00:00Z', 0)).toBe(false)
    expect(at('2026-08-20T21:59:00Z', 0)).toBe(false)
    expect(at('2026-08-20T22:00:00Z', 0)).toBe(true)
  })

  it('follows the user rather than the server clock', () => {
    // Midday in UTC is the middle of the night in UTC+13.
    expect(at('2026-08-20T12:00:00Z', 0)).toBe(false)
    expect(at('2026-08-20T12:00:00Z', 780)).toBe(true)
  })
})

describe('daily push budget', () => {
  it('allows a fresh day and stops at the cap', () => {
    const day = localDayKey(NOON_UTC, 0)
    expect(withinDailyBudget(null, NOON_UTC, 0)).toBe(true)
    expect(withinDailyBudget({ day, n: DAILY_PUSH_BUDGET - 1 }, NOON_UTC, 0)).toBe(true)
    expect(withinDailyBudget({ day, n: DAILY_PUSH_BUDGET }, NOON_UTC, 0)).toBe(false)
  })

  it('resets when the user’s own day rolls over', () => {
    const spent = { day: '2026-08-19', n: 99 }
    expect(withinDailyBudget(spent, NOON_UTC, 0)).toBe(true)
  })

  it('counts up within a day and restarts on a new one', () => {
    const first = bumpQuota(null, NOON_UTC, 0)
    expect(first).toEqual({ day: '2026-08-20', n: 1 })
    expect(bumpQuota(first, NOON_UTC, 0).n).toBe(2)
    expect(bumpQuota(first, NOON_UTC + DAY, 0)).toEqual({ day: '2026-08-21', n: 1 })
  })
})

describe('movement detection', () => {
  const base = { thresholdPct: 5, now: NOON_UTC }

  it('says nothing the first time it sees an asset', () => {
    // There is no baseline yet, so any "change" would be invented.
    const r = evaluateMove({ ...base, price: 100, ref: undefined })
    expect(r.fire).toBe(false)
    expect(r.nextRef).toEqual({ price: 100, ts: NOON_UTC })
  })

  it('fires once the move clears the threshold, in either direction', () => {
    const ref = { price: 100, ts: NOON_UTC - HOUR }
    expect(evaluateMove({ ...base, price: 106, ref }).fire).toBe(true)
    expect(evaluateMove({ ...base, price: 94, ref }).fire).toBe(true)
    expect(evaluateMove({ ...base, price: 104, ref }).fire).toBe(false)
  })

  it('reports the signed size of the move', () => {
    const ref = { price: 100, ts: NOON_UTC - HOUR }
    expect(evaluateMove({ ...base, price: 106, ref }).changePct).toBeCloseTo(6)
    expect(evaluateMove({ ...base, price: 94, ref }).changePct).toBeCloseTo(-6)
  })

  it('rebases after firing so a steady climb does not re-fire every cycle', () => {
    const ref = { price: 100, ts: NOON_UTC - HOUR }
    const r = evaluateMove({ ...base, price: 106, ref })
    expect(r.nextRef).toEqual({ price: 106, ts: NOON_UTC })
    // From the new baseline, the same price is no longer news.
    expect(evaluateMove({ ...base, price: 106, ref: r.nextRef }).fire).toBe(false)
  })

  it('holds a second alert on the same asset during the cooldown', () => {
    const ref = { price: 100, ts: NOON_UTC - HOUR }
    const r = evaluateMove({ ...base, price: 106, ref, lastFired: NOON_UTC - HOUR, cooldownMs: 3 * HOUR })
    expect(r.fire).toBe(false)
    // and must not rebase, or the move would be forgotten instead of deferred.
    expect(r.nextRef).toBe(ref)
  })

  it('fires again once the cooldown has passed', () => {
    const ref = { price: 100, ts: NOON_UTC - HOUR }
    expect(evaluateMove({ ...base, price: 106, ref, lastFired: NOON_UTC - 4 * HOUR, cooldownMs: 3 * HOUR }).fire)
      .toBe(true)
  })

  it('rolls a stale baseline forward so old prices cannot fake a crash', () => {
    const stale = { price: 100, ts: NOON_UTC - MOVE_REF_MAX_AGE_MS - HOUR }
    const r = evaluateMove({ ...base, price: 102, ref: stale })
    expect(r.fire).toBe(false)
    expect(r.nextRef).toEqual({ price: 102, ts: NOON_UTC })
  })

  it('keeps a fresh baseline untouched when nothing happened', () => {
    const ref = { price: 100, ts: NOON_UTC - HOUR }
    expect(evaluateMove({ ...base, price: 101, ref }).nextRef).toBe(ref)
  })

  it('ignores a missing or nonsensical quote', () => {
    const ref = { price: 100, ts: NOON_UTC - HOUR }
    for (const price of [undefined, null, 0, -5, NaN, 'abc']) {
      expect(evaluateMove({ ...base, price, ref }).fire).toBe(false)
    }
  })

  it('recovers from a corrupt stored baseline', () => {
    const r = evaluateMove({ ...base, price: 100, ref: { price: 0, ts: 1 } })
    expect(r.fire).toBe(false)
    expect(r.nextRef).toEqual({ price: 100, ts: NOON_UTC })
  })
})

describe('news matching', () => {
  const btc = { id: 'bitcoin', symbol: 'BTC', kind: 'crypto' }
  const sol = { id: 'solana', symbol: 'SOL', kind: 'crypto' }
  const avax = { id: 'avalanche-2', symbol: 'AVAX', kind: 'crypto' }

  it('matches on the ticker', () => {
    expect(matchArticle({ title: 'BTC breaks $100k' }, [btc])).toBe(btc)
  })

  it('matches on the asset name from its id', () => {
    expect(matchArticle({ title: 'Solana outage resolved' }, [sol])).toBe(sol)
  })

  it('strips the disambiguating suffix from a CoinGecko id', () => {
    expect(termsFor(avax)).toContain('avalanche')
    expect(matchArticle({ title: 'Avalanche subnets grow' }, [avax])).toBe(avax)
  })

  it('searches the description as well as the headline', () => {
    expect(matchArticle({ title: 'Markets today', description: 'Ethereum leads gains' },
      [{ id: 'ethereum', symbol: 'ETH', kind: 'crypto' }])).toBeTruthy()
  })

  it('respects word boundaries', () => {
    // The bug this exists to prevent: "solar" pushing a Solana alert.
    expect(matchArticle({ title: 'Solar stocks rally' }, [sol])).toBeNull()
    expect(matchArticle({ title: 'Ethereum climbs' }, [{ id: 'eth-x', symbol: 'ETH', kind: 'crypto' }]))
      .toBeNull()
  })

  it('never matches on a ticker that is an ordinary word', () => {
    // GAS, ONE and TOP are all real tickers and all guaranteed false positives.
    for (const sym of ['GAS', 'ONE', 'TOP', 'AI']) {
      expect(termsFor({ id: sym.toLowerCase(), symbol: sym })).toEqual([])
    }
    expect(matchArticle({ title: 'Gas prices fall across Europe' },
      [{ id: 'gas', symbol: 'GAS', kind: 'crypto' }])).toBeNull()
  })

  it('ignores one- and two-letter tickers', () => {
    expect(termsFor({ id: 'x', symbol: 'X' })).toEqual([])
  })

  it('returns null for an empty article', () => {
    expect(matchArticle({}, [btc])).toBeNull()
    expect(matchArticle({ title: 'Bitcoin surges' }, [])).toBeNull()
    expect(matchArticle({ title: 'Bitcoin surges' }, undefined)).toBeNull()
  })

  it('does not let a regex-shaped ticker break the matcher', () => {
    expect(() => matchArticle({ title: 'anything' }, [{ id: 'c++', symbol: 'C++' }])).not.toThrow()
  })
})

describe('breaking-news freshness', () => {
  const iso = ms => new Date(ms).toISOString()

  it('accepts a story published minutes ago', () => {
    expect(isBreaking({ pubDate: iso(NOON_UTC - 30 * 60_000) }, NOON_UTC)).toBe(true)
  })

  it('rejects yesterday’s news', () => {
    expect(isBreaking({ pubDate: iso(NOON_UTC - DAY) }, NOON_UTC)).toBe(false)
  })

  it('tolerates slight clock skew but not a wildly future date', () => {
    expect(isBreaking({ pubDate: iso(NOON_UTC + 60_000) }, NOON_UTC)).toBe(true)
    expect(isBreaking({ pubDate: iso(NOON_UTC + DAY) }, NOON_UTC)).toBe(false)
  })

  it('rejects an unparseable or missing date', () => {
    expect(isBreaking({ pubDate: 'sometime' }, NOON_UTC)).toBe(false)
    expect(isBreaking({}, NOON_UTC)).toBe(false)
  })
})

describe('retention ladder', () => {
  const now = NOON_UTC

  it('stays quiet while the user is still active', () => {
    expect(dueRetentionStep({ lastSeen: now - HOUR, now, sentSteps: [] })).toBeNull()
    expect(dueRetentionStep({ lastSeen: now - 2 * DAY, now, sentSteps: [] })).toBeNull()
  })

  it('fires the first step once they cross the idle threshold', () => {
    expect(dueRetentionStep({ lastSeen: now - 3 * DAY, now, sentSteps: [] })).toBe(3)
  })

  it('walks up the ladder as the silence grows', () => {
    expect(dueRetentionStep({ lastSeen: now - 8 * DAY, now, sentSteps: [3] })).toBe(7)
    expect(dueRetentionStep({ lastSeen: now - 15 * DAY, now, sentSteps: [3, 7] })).toBe(14)
  })

  it('never sends the same step twice', () => {
    expect(dueRetentionStep({ lastSeen: now - 4 * DAY, now, sentSteps: [3] })).toBeNull()
  })

  it('sends only the highest earned step to someone long gone', () => {
    // The failure this prevents: a user who vanished for 40 days coming back
    // to four stacked notifications.
    expect(dueRetentionStep({ lastSeen: now - 40 * DAY, now, sentSteps: [] })).toBe(30)
  })

  it('stops for good once the ladder is exhausted', () => {
    expect(dueRetentionStep({ lastSeen: now - 400 * DAY, now, sentSteps: RETENTION_STEPS })).toBeNull()
  })

  it('ignores a missing heartbeat rather than treating it as year zero', () => {
    // lastSeen 0 with epoch maths would read as ~56 years idle and fire at
    // every user whose record predates the heartbeat.
    expect(dueRetentionStep({ lastSeen: 0, now, sentSteps: [] })).toBeNull()
    expect(dueRetentionStep({ lastSeen: undefined, now, sentSteps: [] })).toBeNull()
  })

  it('escalates strictly and ends', () => {
    // Walk a user who never returns through the whole ladder.
    const sent = []
    for (let day = 1; day <= 120; day++) {
      const step = dueRetentionStep({ lastSeen: now, now: now + day * DAY, sentSteps: sent })
      if (step) sent.push(step)
    }
    expect(sent).toEqual(RETENTION_STEPS)
  })
})

describe('sent-map pruning', () => {
  it('keeps recent entries and drops expired ones', () => {
    const map = { fresh: NOON_UTC - HOUR, old: NOON_UTC - 5 * DAY }
    expect(pruneSent(map, NOON_UTC, 2 * DAY)).toEqual({ fresh: NOON_UTC - HOUR })
  })

  it('survives junk without throwing', () => {
    expect(pruneSent(null, NOON_UTC, DAY)).toEqual({})
    expect(pruneSent({ bad: 'nope' }, NOON_UTC, DAY)).toEqual({})
  })
})

describe('story hashing', () => {
  it('is stable and distinct per URL', () => {
    expect(shortHash('https://a.example/1')).toBe(shortHash('https://a.example/1'))
    expect(shortHash('https://a.example/1')).not.toBe(shortHash('https://a.example/2'))
  })
})

describe('payloads', () => {
  it('routes each channel to the page it is about', () => {
    expect(buildPayload({ channel: 'news', title: 't', body: 'b' }).url).toBe(CHANNEL_URL.news)
    expect(buildPayload({ channel: 'target', title: 't', body: 'b' }).url).toBe('/dashboard?tab=alerts')
  })

  it('only ever deep-links to routes the app actually serves', () => {
    // The bug this replaces: every price-target alert opened "/watchlist",
    // which has never been a route, so the tap landed on the 404 page.
    const routes = new Set(
      [...readFileSync('src/App.jsx', 'utf8')
        .matchAll(/path="(\/[a-z-]*)"/g)].map(m => m[1]),
    )
    for (const [channel, url] of Object.entries(CHANNEL_URL)) {
      expect(routes, `${channel} → ${url}`).toContain(url.split('?')[0])
    }
  })

  it('uses a query string for dashboard tabs, which is all a cold launch carries', () => {
    // Router state does not survive an app opened from the lock screen, so a
    // tab deep link has to live in the URL.
    const tab = new URL(CHANNEL_URL.target, 'https://walletlens.live').searchParams.get('tab')
    expect(tab).toBe('alerts')
    const dash = readFileSync('src/pages/Dashboard.jsx', 'utf8')
    expect(dash, 'Dashboard must read ?tab=').toContain("new URLSearchParams(location.search).get('tab')")
    expect(dash.match(/const DASH_TABS = new Set\(\[([^\]]*)\]/)[1]).toContain("'alerts'")
  })

  it('carries the channel so opens can be attributed', () => {
    const p = buildPayload({ channel: 'move', title: 't', body: 'b', sym: 'BTC' })
    expect(p).toMatchObject({ channel: 'move', tag: 'move', sym: 'BTC' })
  })

  it('lets the caller override the tag and url', () => {
    const p = buildPayload({ channel: 'move', title: 't', body: 'b', tag: 'move-x', url: '/a' })
    expect(p.tag).toBe('move-x')
    expect(p.url).toBe('/a')
  })

  it('falls back to the root for an unknown channel', () => {
    expect(buildPayload({ channel: 'mystery', title: 't', body: 'b' }).url).toBe('/')
  })
})

describe('market data parsing', () => {
  it('reads CoinGecko prices and 24h change', () => {
    const json = { bitcoin: { usd: 94200, usd_24h_change: 3.2 }, ethereum: { usd: 4200 } }
    const out = parseCoinGecko(json, ['bitcoin', 'ethereum', 'missing'])
    expect(out.bitcoin).toEqual({ price: 94200, change24h: 3.2 })
    expect(out.ethereum).toEqual({ price: 4200, change24h: 0 })
    expect(out.missing).toBeUndefined()
  })

  it('skips a coin quoted at zero rather than treating it as free', () => {
    expect(parseCoinGecko({ x: { usd: 0 } }, ['x'])).toEqual({})
  })

  it('reads a Yahoo quote', () => {
    const q = parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 210.5, regularMarketChangePercent: -1.4 } }] } })
    expect(q).toEqual({ price: 210.5, change24h: -1.4 })
  })

  it('derives the day change when Yahoo omits the percentage', () => {
    const q = parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 100 } }] } })
    expect(q.change24h).toBeCloseTo(10)
  })

  it('returns null for an empty or malformed Yahoo payload', () => {
    expect(parseYahooChart({})).toBeNull()
    expect(parseYahooChart({ chart: { result: [{ meta: {} }] } })).toBeNull()
  })

  it('keeps only complete news articles', () => {
    const out = parseNews({ articles: [
      { title: 'A', link: 'https://x/1', pubDate: 'now' },
      { title: '', link: 'https://x/2' },
      { title: 'C' },
    ] })
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('A')
  })

  it('survives a missing news payload', () => {
    expect(parseNews(null)).toEqual([])
    expect(parseNews({ articles: 'nope' })).toEqual([])
  })

  it('keys stocks by symbol and everything else by id', () => {
    const quotes = {
      [quoteKey('crypto', 'bitcoin')]: { price: 1, change24h: 0 },
      [quoteKey('stock', 'aapl')]: { price: 2, change24h: 0 },
    }
    expect(quoteFor(quotes, { id: 'bitcoin', symbol: 'BTC', kind: 'crypto' }).price).toBe(1)
    expect(quoteFor(quotes, { id: 'stock:aapl', symbol: 'AAPL', kind: 'stock' }).price).toBe(2)
    expect(quoteFor(quotes, { id: 'nope', symbol: 'NOPE', kind: 'crypto' })).toBeNull()
  })
})

describe('language codes', () => {
  it('accepts the four supported codes and nothing else', () => {
    expect(asLang('ar')).toBe('ar')
    expect(asLang('de')).toBeUndefined()
    expect(asLang(null)).toBeUndefined()
    expect(asLang(42)).toBeUndefined()
  })
})
