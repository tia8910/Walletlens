import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  asLang, buildPayload, bumpQuota, CHANNEL_URL, COPY, copy, DAILY_PUSH_BUDGET,
  DEFAULT_PREFS, deliveryFor, DIGEST_MIN_PCT, dueRetentionStep, evaluateMove,
  FEATURE_TIPS, FEATURE_TIP_GAP_MS, MAX_FEATURE_TIPS, pickFeatureTip, sanitizeSetup,
  fmtPct, fmtPrice, inQuietHours, pickHeadline, pushTopic, RETENTION_MIN_PCT,
  isBreaking, LANGS, localDayKey, localHour, matchArticle, MAX_WATCH,
  MOVE_REF_MAX_AGE_MS, pruneSent, RETENTION_STEPS, sanitizeAlerts, sanitizePrefs,
  sanitizeTz, sanitizeWatch, shortHash, termsFor, withinDailyBudget,
} from '../../push-api/notify-logic.js'
import { parseCoinGecko, parseNews, parseYahooChart, quoteFor, quoteKey } from '../../push-api/markets.js'
import { LANGUAGES } from './LanguageContext'
import { DEFAULT_PUSH_PREFS } from './push'

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
      if (COPY.retentionMoverBody[lang]('BTC', '9', true) === COPY.retentionMoverBody.en('BTC', '9', true)) same.push(lang)
    }
    expect(same).toEqual([])
  })

  it('builds a real sentence for each channel', () => {
    expect(COPY.moveTitle.en('BTC', '6.1', true)).toContain('BTC')
    expect(COPY.moveBody.en('BTC', '6.1', '$94,200', true)).toContain('$94,200')
    expect(COPY.digestBody.en('ETH', '3.4', false, 5)).toContain('5')
    expect(COPY.retentionMoverBody.en('BTC', '9', true)).toContain('BTC')
    // Singular/plural: "your 1 tracked assets" is the kind of thing users
    // screenshot and post.
    expect(COPY.digestBody.en('ETH', '3.4', false, 1)).toContain('1 tracked asset.')
    expect(COPY.digestBody.en('ETH', '3.4', false, 4)).toContain('4 tracked assets.')
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
  it('starts every channel on', () => {
    // The brief is included: it only fires when a holding actually moved, so
    // defaulting it on promises "tell me when something happens", not a daily
    // buzz. The daily budget still bounds all of them.
    expect(DEFAULT_PREFS.digest).toBe(true)
    expect(DEFAULT_PREFS.moves).toBe(true)
    expect(DEFAULT_PREFS.news).toBe(true)
    expect(DEFAULT_PREFS.retention).toBe(true)
    expect(DEFAULT_PREFS.features).toBe(true)
  })

  it('starts quiet hours OFF', () => {
    // The one default that suppresses rather than adds. 10pm-8am is a guess
    // about someone's night, and holding a real alert for ten hours on a guess
    // is a worse failure than buzzing at midnight — the user cannot see it
    // happening, so they cannot tell it from the app being broken.
    expect(DEFAULT_PREFS.quiet).toBe(false)
  })

  it('keeps the client and server defaults in step', () => {
    // These live in two files that ship separately. The server is what holds a
    // send, so a disagreement means the toggle shows one thing and delivery
    // does another — invisible from either side alone.
    expect(DEFAULT_PUSH_PREFS.quiet).toBe(DEFAULT_PREFS.quiet)
    expect(DEFAULT_PUSH_PREFS.movePct).toBe(DEFAULT_PREFS.movePct)
    for (const k of ['moves', 'news', 'digest', 'retention', 'features']) {
      expect(DEFAULT_PUSH_PREFS[k], k).toBe(DEFAULT_PREFS[k])
    }
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

describe('every notification needs a reason', () => {
  // The rule these enforce: a scheduled slot is permission to go looking for a
  // reason, never a reason in itself. Notifications that fire on a timer with
  // nothing to say train people to swipe without reading, which costs us the
  // alerts that actually matter.

  it('has no copy for "nothing happened"', () => {
    // Both of these existed and both were routine by construction: a brief
    // saying markets are calm, and a nudge saying your assets have new prices.
    // Their absence is the feature — if the copy exists, something will send it.
    expect(COPY.digestQuietBody).toBeUndefined()
    expect(COPY.retentionBody).toBeUndefined()
  })

  it('every surviving body says something specific happened', () => {
    // Each one names an asset and a number, because that is the reason.
    expect(COPY.moveBody.en('BTC', '6.1', '$94,200', true)).toMatch(/BTC.*6\.1/)
    expect(COPY.digestBody.en('ETH', '3.4', false, 5)).toMatch(/ETH.*3\.4/)
    expect(COPY.retentionMoverBody.en('SOL', '9', true)).toMatch(/SOL.*9/)
  })

  it('picks the single most notable mover', () => {
    const moves = [{ symbol: 'BTC', pct: 4 }, { symbol: 'ETH', pct: -11 }, { symbol: 'SOL', pct: 6 }]
    expect(pickHeadline(moves, DIGEST_MIN_PCT)).toEqual({ symbol: 'ETH', pct: -11 })
  })

  it('says nothing when nothing cleared the bar', () => {
    // The quiet-day case. Returning null is what makes the digest skip
    // entirely rather than reach for filler.
    expect(pickHeadline([{ symbol: 'BTC', pct: 0.4 }, { symbol: 'ETH', pct: -1.2 }], DIGEST_MIN_PCT))
      .toBeNull()
    expect(pickHeadline([], DIGEST_MIN_PCT)).toBeNull()
    expect(pickHeadline(undefined, DIGEST_MIN_PCT)).toBeNull()
  })

  it('judges a fall as newsworthy as a rise', () => {
    expect(pickHeadline([{ symbol: 'BTC', pct: -7 }], DIGEST_MIN_PCT).symbol).toBe('BTC')
  })

  it('holds a win-back to a higher bar than a morning brief', () => {
    // Interrupting someone who left needs a stronger reason than informing
    // someone who opted into a daily line.
    expect(RETENTION_MIN_PCT).toBeGreaterThan(DIGEST_MIN_PCT)
    const mild = [{ symbol: 'BTC', pct: 4 }]
    expect(pickHeadline(mild, DIGEST_MIN_PCT)).not.toBeNull()
    expect(pickHeadline(mild, RETENTION_MIN_PCT)).toBeNull()
  })

  it('ignores junk rather than treating it as a reason', () => {
    expect(pickHeadline([{ symbol: 'X', pct: NaN }, { symbol: 'Y', pct: 'abc' }, null], DIGEST_MIN_PCT))
      .toBeNull()
  })
})

describe('the Android shell no longer notifies on a timer', () => {
  // A second, uncoordinated notification source defeats quiet hours and the
  // daily budget at once: a user cannot tell two systems apart, so the Quiet
  // Hours switch in Settings would simply appear not to work.
  const scheduler = readFileSync(
    '../walletlens_source/release_package/app/src/main/java/live/walletlens/twa/NotificationScheduler.java',
    'utf8',
  )

  it('enqueues no periodic work', () => {
    expect(scheduler).not.toContain('PeriodicWorkRequest')
    expect(scheduler).not.toContain('enqueueUniquePeriodicWork')
  })

  it('does not fire a notification on app open', () => {
    expect(scheduler).not.toContain('OneTimeWorkRequest')
  })

  it('still cancels the old work, or existing installs never stop', () => {
    // WorkManager persists across app updates and the old registration used
    // KEEP, so deleting the scheduling code alone would leave every installed
    // device running the 30-minute worker forever. The cancel is the fix.
    expect(scheduler).toContain('cancelUniqueWork')
    expect(scheduler).toContain('walletlens_price_check')
    expect(scheduler).toContain('walletlens_immediate_check')
    // And it must run on upgrade, i.e. from the existing call sites.
    expect(scheduler).toMatch(/static void schedule\([^)]*\)\s*\{\s*cancel\(context\);/)
  })

  it('keeps the entry points compiling', () => {
    // WalletLensApp, LauncherActivity and BootReceiver all call these.
    for (const m of ['schedule', 'scheduleImmediate', 'cancel']) {
      expect(scheduler, `${m} must remain`).toContain(`static void ${m}(`)
    }
  })
})

describe('delivery semantics', () => {
  // This is what decides whether a closed, dozing phone hears anything useful.
  // web-push's own defaults are normal urgency and a FOUR WEEK TTL, so leaving
  // these unset means Chrome sits on a price alert until the device wakes, and
  // a phone that was off for days gets told about a target crossed last week.

  it('wakes the device for anything about a price', () => {
    expect(deliveryFor('target').urgency).toBe('high')
    expect(deliveryFor('move').urgency).toBe('high')
  })

  it('does not wake the device for things we initiated', () => {
    expect(deliveryFor('digest').urgency).toBe('low')
    expect(deliveryFor('retention').urgency).toBe('low')
  })

  it('expires price alerts long before web-push would', () => {
    const FOUR_WEEKS = 2419200
    for (const channel of ['target', 'move']) {
      expect(deliveryFor(channel).ttl).toBeLessThanOrEqual(3600)
      expect(deliveryFor(channel).ttl).toBeLessThan(FOUR_WEEKS)
    }
  })

  it('gives every channel a TTL matched to how fast it goes stale', () => {
    for (const channel of Object.keys(CHANNEL_URL)) {
      const { ttl, urgency } = deliveryFor(channel)
      expect(ttl, `${channel} ttl`).toBeGreaterThan(0)
      expect(['very-low', 'low', 'normal', 'high'], `${channel} urgency`).toContain(urgency)
    }
    // Ordered by how quickly the content stops being true.
    expect(deliveryFor('target').ttl).toBeLessThan(deliveryFor('news').ttl)
    expect(deliveryFor('news').ttl).toBeLessThan(deliveryFor('retention').ttl)
  })

  it('falls back to something sane for an unknown channel', () => {
    expect(deliveryFor('mystery')).toEqual({ urgency: 'normal', ttl: 3600 })
    expect(deliveryFor(undefined).ttl).toBeGreaterThan(0)
  })

  it('scrubs tags into a legal Topic header', () => {
    // web-push THROWS on anything outside URL-safe base64, so an unscrubbed
    // tag like "move-crypto:bitcoin" would turn every move alert into an
    // exception instead of a notification.
    expect(pushTopic('move-crypto:bitcoin')).toBe('move-crypto-bitcoin')
    expect(pushTopic('price-wl-12')).toBe('price-wl-12')
    expect(pushTopic('news-a1b2c3')).toBe('news-a1b2c3')
  })

  it('never emits a topic that web-push would reject', () => {
    const legal = /^[A-Za-z0-9_-]{1,32}$/
    for (const tag of [
      'move-crypto:bitcoin', 'move-stock:aapl', 'price-pa-9', 'winback-30',
      'digest', 'wl-test', 'move-crypto:some-absurdly-long-coin-identifier-here',
      'tag with spaces', 'emoji-🚀-tag', 'slash/and+plus=signs',
    ]) {
      expect(pushTopic(tag), tag).toMatch(legal)
    }
  })

  it('returns undefined rather than an empty topic', () => {
    // An empty string is falsy but still an invalid header value; the caller
    // omits the option entirely on undefined.
    expect(pushTopic('')).toBeUndefined()
    expect(pushTopic('🚀')).toBeUndefined()
    expect(pushTopic(null)).toBeUndefined()
  })

  it('keeps distinct assets on distinct topics so neither replaces the other', () => {
    expect(pushTopic('move-crypto:bitcoin')).not.toBe(pushTopic('move-crypto:ethereum'))
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


describe('feature tips', () => {
  // The old Android worker cycled canned feature tips on a 30-minute timer and
  // is exactly what these must not become. Every tip needs a reason drawn from
  // the user's own setup, and it fires once, ever.

  const allSetUp = { guardian: true, vision: true, watchlist: true, weekly: true }
  const state = (over = {}) => ({
    watchCount: 3, alertCount: 2, kinds: ['crypto', 'stock'], setup: allSetUp, ...over,
  })
  const pick = (over, sent = []) => pickFeatureTip(state(over), sent)

  it('offers each unique feature only when it is not set up', () => {
    expect(pick({ setup: { ...allSetUp, guardian: false } }).id).toBe('guardian')
    expect(pick({ setup: { ...allSetUp, vision: false } }).id).toBe('vision')
    expect(pick({ setup: { ...allSetUp, watchlist: false } }).id).toBe('watchlist')
    expect(pick({ setup: { ...allSetUp, weekly: false } }).id).toBe('weekly')
  })

  it('has nothing left to say to someone using all of it, bar one', () => {
    // smartimport is the only tip no setup flag covers: transactions do not
    // record how they were added, so there is no way to know whether voice or
    // screenshot import has ever been used. A power user therefore gets that
    // one tip and nothing else — acceptable because it fires once, ever.
    expect(pick({}).id).toBe('smartimport')
    expect(pick({}, ['smartimport'])).toBeNull()
  })

  it('suggests price targets only to someone with holdings and none set', () => {
    expect(pick({ alertCount: 0 }).id).toBe('targets')
    expect(pick({ alertCount: 1 })?.id).not.toBe('targets')
  })

  it('says nothing at all to someone tracking nothing', () => {
    // No holdings means no tip has a genuine hook; "set up Guardian" to an
    // empty portfolio is an advert, not a tip.
    const empty = { watchCount: 0, alertCount: 0, kinds: [], setup: {} }
    expect(pickFeatureTip(empty, [])).toBeNull()
  })

  it('treats an unknown setup as already configured', () => {
    // Subscriptions predating the snapshot know nothing. Guessing "not set up"
    // would tell long-time Guardian users to go and set up Guardian — and
    // smartimport, which reads no flag, must not slip through either.
    expect(pickFeatureTip({ watchCount: 3, alertCount: 2, kinds: ['crypto', 'stock'] }, []))
      .toBeNull()
  })

  it('leads with the most valuable unused feature', () => {
    // Everything unset at once: Guardian wins, because it is the one nobody
    // discovers on their own.
    const nothingSetUp = { guardian: false, vision: false, watchlist: false, weekly: false }
    expect(pick({ alertCount: 0, setup: nothingSetUp }).id).toBe('guardian')
  })

  it('never repeats a tip that has already been sent', () => {
    expect(pick({ alertCount: 0 }, ['targets'])?.id).not.toBe('targets')
    expect(pick({ alertCount: 0 }, FEATURE_TIPS.map(t => t.id))).toBeNull()
  })

  it('holds tips at least a week apart', () => {
    expect(FEATURE_TIP_GAP_MS).toBeGreaterThanOrEqual(7 * 86_400_000)
  })

  it('keeps the whole channel finite however long the list gets', () => {
    // A rotation that never ends is the failure mode being avoided. The list
    // will keep growing, so the ceiling is MAX_FEATURE_TIPS rather than the
    // list length — otherwise every tip added worsens the worst case.
    expect(new Set(FEATURE_TIPS.map(t => t.id)).size).toBe(FEATURE_TIPS.length)
    // Deliberately a bound, not an equality: the cap is allowed to move with a
    // product decision, but it must not drift upward one tip at a time as the
    // list grows. It went 6 -> 8 when the list reached sixteen, for reach
    // rather than volume.
    expect(MAX_FEATURE_TIPS).toBeLessThanOrEqual(8)
    // Every gate must read false, or the tip is skipped as already set up and
    // the rotation stops short of the cap for the wrong reason.
    const everything = Object.fromEntries(
      ['guardian', 'vision', 'watchlist', 'weekly', 'coinTargets', 'backup',
       'applock', 'technicals', 'whales', 'academy', 'coach', 'rebalance']
        .map(k => [k, false])
    )
    const sent = []
    for (let i = 0; i < FEATURE_TIPS.length + 3; i++) {
      const tip = pick({ alertCount: 0, setup: everything }, sent)
      if (!tip) break
      sent.push(tip.id)
    }
    expect(sent.length).toBe(MAX_FEATURE_TIPS)
    expect(pick({ alertCount: 0, setup: everything }, sent)).toBeNull()
  })

  it('gives every tip a precondition, a destination and copy', () => {
    const cap = id => id.charAt(0).toUpperCase() + id.slice(1)
    const appRoutes = new Set(
      [...readFileSync('src/App.jsx', 'utf8')
        .matchAll(/path="(\/[a-z-]*)"/g)].map(m => m[1]),
    )
    for (const tip of FEATURE_TIPS) {
      expect(typeof tip.when, tip.id).toBe('function')
      expect(tip.url, tip.id).toMatch(/^\//)
      // Same guard the channel URLs get: /watchlist and /intel are not routes,
      // and a tip pointing at one lands the user on the 404 page.
      const path = tip.url.split('?')[0]
      expect(appRoutes, `${tip.id} -> ${path}`).toContain(path)
      // A tip with no copy would throw inside the cron rather than send.
      expect(COPY[`feat${cap(tip.id)}Title`], tip.id).toBeTruthy()
      expect(COPY[`feat${cap(tip.id)}Body`], tip.id).toBeTruthy()
    }
  })

  it('survives a predicate that throws rather than failing the cron', () => {
    expect(() => pickFeatureTip({}, [])).not.toThrow()
  })
})

describe('setup snapshot', () => {
  it('keeps only the booleans it understands', () => {
    expect(sanitizeSetup({ guardian: true, vision: false, nonsense: 1, weekly: 'yes' }))
      .toEqual({ guardian: true, vision: false })
  })

  it('understands every key a tip actually gates on', () => {
    // A tip gating on `st.setup.whales === false` is dead code if sanitizeSetup
    // drops `whales` on the way in — the value arrives as undefined, which
    // pickFeatureTip reads as "already set up", so the tip never fires and
    // nothing anywhere reports a problem.
    const gated = new Set()
    for (const tip of FEATURE_TIPS) {
      for (const m of String(tip.when).matchAll(/setup\.([A-Za-z]+)/g)) gated.add(m[1])
    }
    expect(gated.size).toBeGreaterThan(6)
    const kept = sanitizeSetup(Object.fromEntries([...gated].map(k => [k, false])))
    expect(Object.keys(kept).sort()).toEqual([...gated].sort())
  })

  it('drops anything that is not a boolean, rather than coercing', () => {
    // A truthy string must not become "configured" — that would silence a tip
    // the user should have got.
    expect(sanitizeSetup({ guardian: 'true', vision: 1, watchlist: null })).toEqual({})
    expect(sanitizeSetup(null)).toEqual({})
    expect(sanitizeSetup('guardian')).toEqual({})
  })
})
