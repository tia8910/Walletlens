import { describe, it, expect } from 'vitest'
import {
  decodeEntities, stripTags, tagText, findImage, pubDateMs, parseFeed,
  parseCalendarRows, parseStooqCsv, parseMarket, stooqUrl, TICKERS, FEED_GROUPS,
  isoStamp,
} from '../../workers/data/feeds.js'
import { DATASETS, isStale, refresh, serve } from '../../workers/data/index.js'

// The data worker replaces four GitHub Actions cron jobs that fetched public
// feeds and committed JSON into client/public/. Those jobs were never tested —
// they were Python embedded in workflow YAML, only observable by watching the
// committed files change, and when Actions was disabled on 2026-09-02 they
// stopped with no error and no notification.
//
// Everything here tests the PARSING and the STALENESS logic, which is where
// the bugs are. The fetching cannot be tested from this sandbox — the egress
// proxy blocks CoinGecko, Stooq and the RSS hosts — so the parsers were split
// out to take text rather than URLs, and these run against captured payload
// shapes instead.

// ── The envelope every consumer already depends on ──────────────────────────

describe('the output envelope matches what the deployed client reads', () => {
  it('stamps time the way the Python did', () => {
    // The app renders `updated` directly. Python wrote
    // time.strftime('%Y-%m-%dT%H:%M:%SZ') — second precision, no millis.
    expect(isoStamp(Date.UTC(2026, 8, 2, 11, 16, 30))).toBe('2026-09-02T11:16:30Z')
    expect(isoStamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })

  it('covers every file the site currently serves', () => {
    // A dataset missing here is a path the Pages build still owns and that
    // silently keeps serving whatever the last deploy baked in.
    expect(Object.keys(DATASETS).sort()).toEqual([
      'economic-calendar.json', 'economy.json', 'market.json',
      'news.json', 'stock-prices.json', 'stocks.json',
    ])
  })
})

// ── RSS ─────────────────────────────────────────────────────────────────────

const RSS = `<?xml version="1.0"?><rss><channel>
<item>
  <title><![CDATA[Bitcoin ETFs notch best month & more]]></title>
  <link>https://example.com/a</link>
  <description>&lt;p&gt;Some &amp;amp; body&lt;/p&gt;</description>
  <pubDate>Tue, 02 Sep 2026 08:00:00 +0000</pubDate>
  <media:content url="https://img.example.com/a.jpg" />
</item>
<item>
  <title>Second story</title>
  <link>https://example.com/b</link>
  <description>&lt;img src="https://img.example.com/b.png"&gt; body text</description>
  <pubDate>Tue, 02 Sep 2026 09:00:00 +0000</pubDate>
</item>
</channel></rss>`

describe('decodeEntities', () => {
  it('decodes the ampersand LAST', () => {
    // THE ORDERING BUG. Decoding & first turns the escaped sequence "&amp;lt;"
    // into "&lt;" and then into "<" on a later pass — so a feed that literally
    // wanted to print "&lt;" gets a broken tag instead.
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeEntities('a &amp; b')).toBe('a & b')
  })

  it('handles numeric and named references', () => {
    expect(decodeEntities('&#8217;')).toBe('’')
    expect(decodeEntities('&#x2014;')).toBe('—')
    expect(decodeEntities('&quot;hi&quot;')).toBe('"hi"')
  })

  it('drops a nonsense code point rather than throwing', () => {
    // Feeds do emit malformed references, and one bad character must not take
    // down the whole group's parse.
    expect(() => decodeEntities('&#999999999;')).not.toThrow()
    expect(decodeEntities('&#999999999;')).toBe('')
  })
})

describe('tagText and stripTags', () => {
  it('unwraps CDATA', () => {
    expect(tagText('<title><![CDATA[Hello & bye]]></title>', 'title')).toBe('Hello & bye')
  })

  it('ignores attributes on the tag', () => {
    expect(tagText('<link rel="x">https://a.example</link>', 'link')).toBe('https://a.example')
  })

  it('strips markup and collapses whitespace', () => {
    expect(stripTags('<p>a  <b>b</b>\n c</p>')).toBe('a b c')
    expect(stripTags('')).toBe('')
    expect(stripTags(null)).toBe('')
  })
})

describe('findImage', () => {
  it('prefers media:content', () => {
    expect(findImage('<media:content url="https://a/x.jpg" /><enclosure url="https://b/y.jpg" />'))
      .toBe('https://a/x.jpg')
  })

  it('takes an enclosure only when it looks like an image', () => {
    // Enclosure is the podcast-era element; plenty of feeds put audio there.
    expect(findImage('<enclosure url="https://a/x.mp3" />')).toBe('')
    expect(findImage('<enclosure url="https://a/x.webp" />')).toBe('https://a/x.webp')
  })

  it('falls back to an img scraped from the description', () => {
    expect(findImage('<description>&lt;img src="https://a/z.png"&gt;</description>'))
      .toBe('https://a/z.png')
  })

  it('returns empty rather than undefined when there is nothing', () => {
    expect(findImage('<item></item>')).toBe('')
  })
})

describe('parseFeed', () => {
  const feed = { name: 'Test', color: '#abc' }

  it('pulls the fields the client renders', () => {
    const [first] = parseFeed(RSS, feed)
    expect(first.title).toBe('Bitcoin ETFs notch best month & more')
    expect(first.link).toBe('https://example.com/a')
    expect(first.description).toBe('Some & body')
    expect(first.thumbnail).toBe('https://img.example.com/a.jpg')
    expect(first.source).toBe('Test')
    expect(first.sourceColor).toBe('#abc')
  })

  it('de-duplicates across feeds on the first 60 characters', () => {
    // The same wire story appears in several of these feeds with different
    // trailing attribution, which a whole-title comparison would miss.
    const seen = new Set()
    expect(parseFeed(RSS, feed, seen)).toHaveLength(2)
    expect(parseFeed(RSS, feed, seen)).toHaveLength(0)
  })

  it('skips items with no title rather than emitting a blank card', () => {
    const xml = '<rss><item><link>https://a</link></item></rss>'
    expect(parseFeed(xml, feed)).toEqual([])
  })

  it('caps each feed so one prolific source cannot crowd out the rest', () => {
    const many = '<rss>' + Array.from({ length: 50 },
      (_, i) => `<item><title>Story number ${i}</title></item>`).join('') + '</rss>'
    expect(parseFeed(many, feed)).toHaveLength(30)
  })

  it('truncates descriptions to 300 characters', () => {
    const long = '<rss><item><title>T</title><description>' + 'x'.repeat(500) + '</description></item></rss>'
    expect(parseFeed(long, feed)[0].description).toHaveLength(300)
  })

  it('survives junk instead of XML', () => {
    expect(parseFeed('not xml at all', feed)).toEqual([])
    expect(parseFeed('', feed)).toEqual([])
  })

  it('declares three feed groups, all with names, urls and colours', () => {
    expect(Object.keys(FEED_GROUPS).sort()).toEqual(['economy', 'news', 'stocks'])
    for (const [group, feeds] of Object.entries(FEED_GROUPS)) {
      expect(feeds.length, group).toBeGreaterThan(0)
      for (const f of feeds) {
        expect(f.url, `${group}/${f.name}`).toMatch(/^https:\/\//)
        expect(f.color, `${group}/${f.name}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
})

describe('pubDateMs', () => {
  it('reads RFC-822 dates and sorts newest first', () => {
    expect(pubDateMs('Tue, 02 Sep 2026 09:00:00 +0000'))
      .toBeGreaterThan(pubDateMs('Tue, 02 Sep 2026 08:00:00 +0000'))
  })

  it('sinks an unparseable date to the bottom instead of to 1970-adjacent noise', () => {
    expect(pubDateMs('whenever')).toBe(0)
    expect(pubDateMs('')).toBe(0)
    expect(pubDateMs(undefined)).toBe(0)
  })
})

// ── Economic calendar ───────────────────────────────────────────────────────

describe('parseCalendarRows', () => {
  const row = (over = {}) => ({
    title: 'Prelim Industrial Production m/m', country: 'JPY', impact: 'Low',
    date: '2026-08-30T19:50:00-04:00', forecast: '-0.7%', previous: '1.3%', actual: '',
    ...over,
  })

  it('keeps the feed\'s own wall clock, not the server\'s', () => {
    // THE TIMEZONE TRAP. The feed stamps an offset; the date and time shown
    // must be the ones in that offset. Formatting a Date object here would
    // shift every event by whatever zone the worker happened to run in.
    const [e] = parseCalendarRows([row()])
    expect(e.date).toBe('2026-08-30')
    expect(e.time).toBe('19:50')
  })

  it('blanks the time on all-day items', () => {
    expect(parseCalendarRows([row({ date: '2026-08-30T00:00:00-04:00' })])[0].time).toBe('')
  })

  it('filters to the majors that move markets', () => {
    expect(parseCalendarRows([row({ country: 'SEK' })])).toEqual([])
    expect(parseCalendarRows([row({ country: 'USD' })])).toHaveLength(1)
  })

  it('maps impact to the app\'s vocabulary, defaulting low', () => {
    expect(parseCalendarRows([row({ impact: 'High' })])[0].impact).toBe('high')
    expect(parseCalendarRows([row({ impact: 'Holiday' })])[0].impact).toBe('holiday')
    expect(parseCalendarRows([row({ impact: 'Non-Economic' })])[0].impact).toBe('low')
    expect(parseCalendarRows([row({ impact: 'whatever' })])[0].impact).toBe('low')
  })

  it('de-duplicates where this week and next week overlap', () => {
    // The two feeds share the boundary, so a release near it arrives twice.
    const seen = new Set()
    expect(parseCalendarRows([row()], seen)).toHaveLength(1)
    expect(parseCalendarRows([row()], seen)).toHaveLength(0)
  })

  it('drops rows with no title', () => {
    expect(parseCalendarRows([row({ title: '   ' })])).toEqual([])
  })

  it('survives a non-array payload', () => {
    expect(parseCalendarRows(null)).toEqual([])
    expect(parseCalendarRows({ error: 'nope' })).toEqual([])
  })
})

// ── Stock prices ────────────────────────────────────────────────────────────

const CSV = [
  'Symbol,Date,Time,Open,High,Low,Close,Volume,Name',
  'AAPL.US,2026-09-02,21:00:00,230.00,235.00,229.00,234.60,50000000,APPLE',
  'MSFT.US,2026-09-02,21:00:00,400.00,405.00,398.00,396.00,20000000,MICROSOFT',
  'ZZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D,N/D',
].join('\n')

describe('parseStooqCsv', () => {
  it('keys prices by the app\'s own id convention', () => {
    // `stock:<lowercase>` is what client/src/api.js routes on and what
    // alphaScore.js classifies by. A different key produces a file the app
    // loads and silently ignores.
    const { prices } = parseStooqCsv(CSV)
    expect(Object.keys(prices).sort()).toEqual(['stock:aapl', 'stock:msft'])
  })

  it('computes the day change from open to close, signed correctly', () => {
    const { prices } = parseStooqCsv(CSV)
    expect(prices['stock:aapl'].usd).toBe(234.6)
    expect(prices['stock:aapl'].usd_24h_change).toBeCloseTo(2, 1)
    expect(prices['stock:msft'].usd_24h_change).toBeCloseTo(-1, 1)
  })

  it('reports N/D rows as missing rather than as a zero price', () => {
    // Stooq answers a closed market or an unknown ticker with N/D in the
    // price columns rather than omitting the row. Treating that as 0 would
    // show a holding as worthless.
    const { prices, missing } = parseStooqCsv(CSV)
    expect(prices['stock:zzzz']).toBeUndefined()
    expect(missing).toContain('ZZZZ')
  })

  it('returns empty structures for junk instead of throwing', () => {
    expect(parseStooqCsv('').prices).toEqual({})
    expect(parseStooqCsv('one line only').prices).toEqual({})
  })

  it('builds a batch URL with the .us suffix Stooq expects', () => {
    const url = stooqUrl(['AAPL', 'BRK.B'])
    expect(url).toContain('aapl.us,brk.b.us')
    expect(url).toContain('e=csv')
  })

  it('carries the full ticker list across', () => {
    expect(TICKERS.length).toBeGreaterThan(100)
    expect(new Set(TICKERS).size, 'duplicate tickers waste the batch').toBe(TICKERS.length)
  })
})

// ── Market ──────────────────────────────────────────────────────────────────

describe('parseMarket', () => {
  const coins = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, current_price: 1 }))

  it('rejects a short list as a rate-limit response, not a market', () => {
    // CoinGecko's free tier answers a throttled request with valid JSON and a
    // truncated body. "It parsed" is not "it is a market snapshot", and
    // publishing three coins empties the market page as surely as publishing
    // nothing would.
    expect(parseMarket(coins(3))).toBeNull()
    expect(parseMarket([])).toBeNull()
    expect(parseMarket({ status: { error_code: 429 } })).toBeNull()
    expect(parseMarket(null)).toBeNull()
  })

  it('accepts a full snapshot', () => {
    expect(parseMarket(coins(250))).toHaveLength(250)
  })
})

// ── Staleness, refresh and serving ──────────────────────────────────────────

/** A KV double that records puts, so "was the old value kept" is assertable. */
function fakeKv(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [`data:${k}`, JSON.stringify(v)]))
  return {
    puts: [],
    async get(k, type) {
      const raw = store.get(k)
      if (raw == null) return null
      return type === 'json' ? JSON.parse(raw) : raw
    },
    async put(k, v) { this.puts.push(k); store.set(k, v) },
  }
}

const envWith = (kv) => ({ DATA: kv })
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0)
const agedBy = (ms) => ({ updated: isoStamp(NOW - ms), count: 1, coins: [] })

describe('isStale', () => {
  it('is true with nothing stored', () => {
    expect(isStale(null, 1000, NOW)).toBe(true)
  })

  it('reads the payload\'s own timestamp, so it survives a KV migration', () => {
    expect(isStale(agedBy(30 * 60 * 1000), 60 * 60 * 1000, NOW)).toBe(false)
    expect(isStale(agedBy(90 * 60 * 1000), 60 * 60 * 1000, NOW)).toBe(true)
  })

  it('treats an unreadable timestamp as stale rather than as fresh', () => {
    // Erring the other way would freeze a dataset permanently on one bad write.
    expect(isStale({ updated: 'garbage' }, 1000, NOW)).toBe(true)
    expect(isStale({}, 1000, NOW)).toBe(true)
  })
})

describe('refresh', () => {
  it('does nothing while the stored copy is fresh', async () => {
    const kv = fakeKv({ 'market.json': agedBy(60 * 1000) })
    const r = await refresh(envWith(kv), 'market.json', { now: NOW })
    expect(r.skipped).toBe('fresh')
    expect(kv.puts).toEqual([])
  })

  it('KEEPS the previous value when the upstream gives nothing', async () => {
    // The failure that actually reaches users. The Python had this branch
    // ("keeping existing market.json") and it is the reason a rate-limited
    // CoinGecko never blanked the app's market page.
    const kv = fakeKv({ 'market.json': agedBy(24 * 60 * 60 * 1000) })
    const spec = DATASETS['market.json']
    const original = spec.fetch
    try {
      spec.fetch = async () => null
      const r = await refresh(envWith(kv), 'market.json', { now: NOW })
      expect(r.skipped).toBe('upstream')
      expect(r.kept).toBe(true)
      expect(kv.puts, 'a failed fetch must never overwrite good data').toEqual([])
    } finally {
      spec.fetch = original
    }
  })

  it('keeps the previous value when the fetch throws, too', async () => {
    const kv = fakeKv({ 'news.json': agedBy(24 * 60 * 60 * 1000) })
    const spec = DATASETS['news.json']
    const original = spec.fetch
    try {
      spec.fetch = async () => { throw new Error('network down') }
      const r = await refresh(envWith(kv), 'news.json', { now: NOW })
      expect(r.skipped).toBe('upstream')
      expect(kv.puts).toEqual([])
    } finally {
      spec.fetch = original
    }
  })

  it('writes when stale and the upstream answers', async () => {
    const kv = fakeKv({ 'market.json': agedBy(24 * 60 * 60 * 1000) })
    const spec = DATASETS['market.json']
    const original = spec.fetch
    try {
      spec.fetch = async (now) => ({ updated: isoStamp(now), count: 250, coins: [] })
      const r = await refresh(envWith(kv), 'market.json', { now: NOW })
      expect(r.count).toBe(250)
      expect(kv.puts).toEqual(['data:market.json'])
    } finally {
      spec.fetch = original
    }
  })

  it('ignores a dataset it does not own', async () => {
    const kv = fakeKv()
    expect((await refresh(envWith(kv), 'secrets.json', { now: NOW })).skipped).toBe('unknown')
    expect(kv.puts).toEqual([])
  })
})

describe('serve', () => {
  it('returns the stored payload with a cacheable header', async () => {
    const kv = fakeKv({ 'market.json': agedBy(60 * 1000) })
    const res = await serve(envWith(kv), 'market.json', NOW)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate')
    expect((await res.json()).updated).toBeTruthy()
  })

  it('fills a cold KV on the first request instead of serving a hole', async () => {
    // THE DEPLOY-ORDER TRAP. Once the route is live the Pages copy of this
    // path is unreachable, so an empty KV would serve nothing where a stale
    // file used to be. The first request has to heal it.
    const kv = fakeKv()
    const spec = DATASETS['news.json']
    const original = spec.fetch
    try {
      spec.fetch = async (now) => ({ updated: isoStamp(now), count: 5, articles: [] })
      const res = await serve(envWith(kv), 'news.json', NOW)
      expect(res.status).toBe(200)
      expect((await res.json()).count).toBe(5)
      expect(kv.puts).toEqual(['data:news.json'])
    } finally {
      spec.fetch = original
    }
  })

  it('503s rather than inventing an empty envelope when it has nothing at all', async () => {
    // An authoritative-looking empty list is worse than an error: the client
    // has its own fallback path and can show the last data it holds.
    const kv = fakeKv()
    const spec = DATASETS['news.json']
    const original = spec.fetch
    try {
      spec.fetch = async () => null
      const res = await serve(envWith(kv), 'news.json', NOW)
      expect(res.status).toBe(503)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    } finally {
      spec.fetch = original
    }
  })
})
