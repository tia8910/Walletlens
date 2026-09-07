import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COPY, DEFAULT_PREFS, LANGS, TREND_COOLDOWN_MS, sanitizePrefs, trendSwitched,
} from '../../push-api/notify-logic.js'
import { trendFor } from './assetTrend.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0)

describe('trendSwitched', () => {
  it('sends when the direction reverses', () => {
    expect(trendSwitched({ prev: 'up', next: 'down', now: NOW })).toBe(true)
    expect(trendSwitched({ prev: 'down', next: 'up', now: NOW })).toBe(true)
  })

  it('is SILENT on the first sighting of an asset', () => {
    // The rule that decides whether this channel survives its first hour.
    // Without it, switching notifications on, or importing a portfolio, fires
    // one notification per holding at once.
    expect(trendSwitched({ prev: undefined, next: 'up', now: NOW })).toBe(false)
    expect(trendSwitched({ prev: null, next: 'down', now: NOW })).toBe(false)
  })

  it('sends when a flat asset starts trending', () => {
    expect(trendSwitched({ prev: 'flat', next: 'up', now: NOW })).toBe(true)
  })

  it('does not announce a trend ending', () => {
    // "This stopped trending" is not something anyone repositions on, and
    // sending it would make every reversal two notifications instead of one.
    expect(trendSwitched({ prev: 'up', next: 'flat', now: NOW })).toBe(false)
    expect(trendSwitched({ prev: 'down', next: 'flat', now: NOW })).toBe(false)
  })

  it('says nothing when nothing changed', () => {
    expect(trendSwitched({ prev: 'up', next: 'up', now: NOW })).toBe(false)
  })

  it('holds one asset to one turn per cooldown', () => {
    // A weekly trend flipping twice in two days is an asset sitting on the
    // flat band, not two pieces of news.
    const justFired = { prev: 'up', next: 'down', firedAt: NOW - 1000, now: NOW }
    expect(trendSwitched(justFired)).toBe(false)
    const longAgo = { prev: 'up', next: 'down', firedAt: NOW - TREND_COOLDOWN_MS - 1, now: NOW }
    expect(trendSwitched(longAgo)).toBe(true)
  })

  it('keeps the cooldown longer than noise and shorter than the window', () => {
    const day = 24 * 60 * 60 * 1000
    expect(TREND_COOLDOWN_MS).toBeGreaterThan(day)
    expect(TREND_COOLDOWN_MS).toBeLessThan(7 * day)
  })
})

describe('the trend channel is wired like every other one', () => {
  it('defaults on, and survives a record written before it existed', () => {
    // normalizeSub spreads DEFAULT_PREFS, so an older row backfills. A pref
    // missing from the defaults reads as undefined, which is falsy, and the
    // channel would ship to everyone and run for nobody.
    expect(DEFAULT_PREFS.trend).toBe(true)
    expect(sanitizePrefs({}).trend).toBe(true)
    expect(sanitizePrefs({ trend: false }).trend).toBe(false)
  })

  it('has copy in every language the app ships', () => {
    for (const lang of LANGS) {
      expect(typeof COPY.trendTitle[lang]).toBe('function')
      expect(typeof COPY.trendBody[lang]).toBe('function')
      expect(COPY.trendTitle[lang]('AR', true)).toContain('AR')
      expect(COPY.trendBody[lang]('AR', '+9.4%')).toContain('+9.4%')
    }
  })

  it('says which way it turned, not just that it turned', () => {
    const up = COPY.trendTitle.en('AR', true)
    const down = COPY.trendTitle.en('AR', false)
    expect(up).not.toBe(down)
  })
})

describe('the job', () => {
  const jobs = read('workers/push/jobs.js')

  it('shares the dashboard rule instead of restating it', () => {
    // A second copy of the thresholds would drift, and the failure mode is a
    // notification contradicting the screen it links to.
    expect(jobs).toContain("import { trendFor } from '../../client/src/assetTrend.js'")
  })

  it('reads the same weekly numbers the dashboard draws', () => {
    expect(jobs).toContain('fetchSevenDay')
    expect(read('push-api/markets.js')).toContain("dataUrl('market.json')")
  })

  it('records the direction whether or not it sent', () => {
    // This is what makes the first sighting silent rather than a burst.
    expect(jobs).toMatch(/sub\.trendRef\[k\] !== dir.*sub\.trendRef\[k\] = dir/s)
  })

  it('forgets assets the user has sold', () => {
    expect(jobs).toMatch(/live\.has\(k\).*delete sub\.trendRef\[k\]/s)
  })

  it('skips stablecoins, which cannot meaningfully trend', () => {
    const body = jobs.slice(jobs.indexOf('async function checkTrend'))
    expect(body).toContain('isStablecoin')
  })

  it('rides the hourly cron rather than adding a fourth trigger', () => {
    // The account is at the Workers Free cron-trigger limit.
    const index = read('workers/push/index.js')
    const hourly = index.slice(index.indexOf("cron === '5 * * * *'"))
    expect(hourly).toContain('checkTrend')
    const toml = read('workers/push/wrangler.toml')
    expect((toml.match(/"\S+ \S+ \S+ \S+ \S+"/g) || []).length).toBeLessThanOrEqual(3)
  })
})

describe('the notification agrees with the dashboard', () => {
  it('uses the same flat band, so neither claims a trend the other denies', () => {
    // Same function, same thresholds, by construction rather than by promise.
    expect(trendFor({ pct7d: 1.9 }).dir).toBe('flat')
    expect(trendFor({ pct7d: 2.1 }).dir).toBe('up')
    expect(trendSwitched({ prev: 'up', next: trendFor({ pct7d: 1.9 }).dir, now: NOW })).toBe(false)
    expect(trendSwitched({ prev: 'flat', next: trendFor({ pct7d: -9 }).dir, now: NOW })).toBe(true)
  })
})
