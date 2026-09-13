/**
 * The four data feeds that used to run as GitHub Actions cron jobs.
 *
 * WHY THIS EXISTS
 * These were four Python scripts embedded in workflow YAML. Each fetched a
 * public feed, wrote a JSON file into client/public/, and committed it — so a
 * market refresh was a git commit, a site rebuild and a full deploy, and the
 * whole chain depended on GitHub Actions being able to run at all.
 *
 * On 2026-09-02 it stopped being able to. The account was flagged, Actions was
 * disabled, and every one of these froze mid-afternoon with no error and no
 * notification — the workflow list just stopped growing. The app carried on
 * serving two-day-old prices because the staleness was baked into files that
 * had already shipped.
 *
 * Moving them here removes git from the data path entirely. A refresh becomes
 * a KV write; nothing is rebuilt and nothing is deployed. The data survives
 * GitHub being unavailable indefinitely, which is the property that was
 * actually missing.
 *
 * WHAT IS PURE AND WHY
 * Every parser below takes text or JSON and returns a result. None of them
 * fetch. That split is deliberate: this sandbox cannot reach CoinGecko, Stooq
 * or the RSS hosts, so the fetching cannot be tested here — but the parsing is
 * where the bugs actually live, and that CAN be tested against captured
 * payloads. See client/src/dataWorker.test.js.
 *
 * OUTPUT SHAPES ARE FIXED BY THE CLIENT
 * The app fetches /market.json, /news.json, /stocks.json, /economy.json,
 * /economic-calendar.json and /stock-prices.json and reads specific fields off
 * them. Every envelope below reproduces exactly what the Python wrote —
 * {updated, count, <payload key>} — because the client is already deployed
 * against that shape and cannot be changed in step with this.
 */

const UA = 'Mozilla/5.0 (compatible; WalletLens/1.0)'

/** The timestamp format the Python used: 2026-09-02T11:16:30Z */
export function isoStamp(now = Date.now()) {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function getText(url, timeoutMs = 20000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function getJson(url, timeoutMs = 20000) {
  return JSON.parse(await getText(url, timeoutMs))
}

// ── Market snapshot (CoinGecko) ─────────────────────────────────────────────

export const MARKET_URL =
  'https://api.coingecko.com/api/v3/coins/markets'
  + '?vs_currency=usd&order=market_cap_desc&per_page=250&page=1'
  + '&sparkline=true&price_change_percentage=1h%2C24h%2C7d'

/**
 * Accept a market payload, or reject it.
 *
 * The 50-coin floor is carried over from the Python and is load-bearing:
 * CoinGecko's free tier answers a rate-limited request with a short valid
 * JSON body rather than an error status, so "did it parse" is not the same
 * question as "is this a market snapshot". Publishing a 3-coin list would
 * empty the app's market page just as thoroughly as publishing nothing.
 */
export function parseMarket(data) {
  if (!Array.isArray(data) || data.length < 50) return null
  return data.map(withSpark)
}

/** How many points a stored 7-day sparkline keeps. */
export const SPARK_POINTS = 28

/**
 * Thin a 7-day hourly series down to something worth shipping.
 *
 * CoinGecko returns about 168 hourly points per coin. Across 250 coins that
 * is roughly 42,000 numbers, which would take market.json from 250 KB to near
 * a megabyte, on a file the dashboard fetches on load. At the size these are
 * actually drawn, a few hundred pixels wide, 28 points carries the same shape.
 *
 * Endpoints are always kept: the first and last prices are the ones a reader
 * compares, and dropping either would let the line disagree with the 7-day
 * percentage printed beside it.
 */
export function downsampleSpark(prices, points = SPARK_POINTS) {
  if (!Array.isArray(prices)) return null
  const clean = prices.filter((n) => Number.isFinite(n))
  if (clean.length < 2) return null
  if (clean.length <= points) return clean.map(round6)

  const out = []
  const step = (clean.length - 1) / (points - 1)
  for (let i = 0; i < points; i++) out.push(round6(clean[Math.round(i * step)]))
  return out
}

// Six significant digits, not fixed decimals: the same series has to hold
// bitcoin near 100000 and a memecoin near 0.00000002 without flattening one
// of them to zero.
const round6 = (n) => Number(n.toPrecision(6))

/**
 * Swap the bulky hourly series for the thinned one the client draws.
 *
 * The original key is dropped rather than kept alongside, or the saving is
 * spent twice over.
 */
function withSpark(coin) {
  if (!coin || typeof coin !== 'object') return coin
  const spark = downsampleSpark(coin.sparkline_in_7d?.price)
  const { sparkline_in_7d: _drop, ...rest } = coin
  return spark ? { ...rest, spark7d: spark } : rest
}

// ── Coin catalogue: the top 1000 by market cap ──────────────────────────────
//
// market.json is the dashboard's load-time fetch, so it stays at 250 coins
// with sparklines. This is the browsable catalogue, fetched only when someone
// opens the coin list or searches, and it carries four times as many coins in
// less space by dropping everything the list does not draw: no sparkline, no
// 1h/7d series, no fully-diluted valuation.
//
// It is also the offline and filtered-network answer to search. api.searchCoins
// queries CoinGecko directly, which returns nothing at all on a device that
// cannot reach api.coingecko.com — and the app is full of devices like that.
// Same-origin, this file works wherever the site itself loads.

/** CoinGecko caps per_page at 250 on the free tier, so 1000 is four pages. */
export const COIN_PAGES = 4
export const coinsUrl = (page) =>
  'https://api.coingecko.com/api/v3/coins/markets'
  + `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`
  + '&sparkline=false&price_change_percentage=24h'

/** Only the fields a searchable list actually renders. */
export function slimCoin(c) {
  return {
    id: c.id,
    symbol: (c.symbol || '').toLowerCase(),
    name: c.name,
    image: c.image || null,
    price: Number.isFinite(c.current_price) ? Number(c.current_price.toPrecision(6)) : null,
    rank: c.market_cap_rank ?? null,
    cap: Number.isFinite(c.market_cap) ? Math.round(c.market_cap) : null,
    d24: Number.isFinite(c.price_change_percentage_24h)
      ? Number(c.price_change_percentage_24h.toFixed(2)) : null,
  }
}

export function parseCoinPage(data) {
  // The same rate-limit trap parseMarket guards: CoinGecko answers a throttled
  // request with a short valid JSON body rather than an error status, so a
  // page that parses is not necessarily a page of coins. A full page is 250;
  // the last one can legitimately be short, so accept anything substantial.
  if (!Array.isArray(data) || data.length < 50) return null
  return data.map(slimCoin)
}

export async function fetchCoins(now = Date.now()) {
  const coins = []
  const seen = new Set()
  for (let page = 1; page <= COIN_PAGES; page++) {
    let rows = null
    for (let i = 0; i < 2 && !rows; i++) {
      try {
        rows = parseCoinPage(await getJson(coinsUrl(page), 30000))
      } catch (e) {
        console.warn(`coins page ${page} attempt ${i + 1} failed: ${e}`)
      }
    }
    // A page that will not come is not a reason to throw away the ones that
    // did. 750 coins is a worse catalogue than 1000 and a far better one than
    // none, and the next run starts over from page 1 anyway.
    if (!rows) break
    for (const c of rows) {
      if (!c.id || seen.has(c.id)) continue   // pages can overlap as caps move
      seen.add(c.id)
      coins.push(c)
    }
    if (rows.length < 250) break              // that was the last page
  }
  if (coins.length < 50) return null
  return { updated: isoStamp(now), count: coins.length, coins }
}

export async function fetchMarket(now = Date.now()) {
  let coins = null
  // Three attempts, as the Python did. The retries are worth keeping: the
  // failure being retried is a rate limit, which clears on its own.
  for (let i = 0; i < 3 && !coins; i++) {
    try {
      coins = parseMarket(await getJson(MARKET_URL, 30000))
    } catch (e) {
      console.warn(`market attempt ${i + 1} failed: ${e}`)
    }
  }
  if (!coins) return null
  return { updated: isoStamp(now), count: coins.length, coins }
}

// ── News, stocks and economy (RSS) ──────────────────────────────────────────

export const FEED_GROUPS = {
  // Crypto. Kept under the name "news" for back-compat: the client has
  // fetched /news.json since long before the other two groups existed.
  news: [
    { name: 'CoinTelegraph',    url: 'https://cointelegraph.com/rss',                   color: '#f7931a' },
    { name: 'CoinDesk',         url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#1a9fff' },
    { name: 'Decrypt',          url: 'https://decrypt.co/feed',                         color: '#6b21a8' },
    { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed',                color: '#ff9900' },
  ],
  stocks: [
    { name: 'MarketWatch',   url: 'https://feeds.marketwatch.com/marketwatch/topstories/', color: '#00a99d' },
    { name: 'CNBC Markets',  url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',  color: '#005594' },
    { name: 'Investing',     url: 'https://www.investing.com/rss/news_25.rss',             color: '#d4af37' },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex',               color: '#6001d2' },
  ],
  economy: [
    { name: 'MarketWatch',  url: 'https://feeds.marketwatch.com/marketwatch/economy-politics/', color: '#00a99d' },
    { name: 'CNBC Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',        color: '#005594' },
    { name: 'Investing',    url: 'https://www.investing.com/rss/news_14.rss',                   color: '#d4af37' },
  ],
}

/**
 * Markup out, entities in, whitespace collapsed.
 *
 * Strip-then-decode, in that order, mirroring the Python's strip_tags. It
 * matters: decoding first would turn an escaped "&lt;script&gt;" into a real
 * tag and the stripper would then eat it, silently deleting text the feed
 * meant to display literally.
 */
export function stripTags(text) {
  if (!text) return ''
  return decodeEntities(String(text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * The handful of XML entities that actually appear in RSS titles.
 *
 * Python's html.unescape() knows the full HTML5 table; Workers have no
 * equivalent and pulling a library in for this would be the largest
 * dependency in the file. Numeric references cover the long tail, and the
 * five named ones below cover essentially everything else a headline uses.
 */
export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Ampersand LAST. Decoding it first would turn "&amp;lt;" into "<"
    // rather than the literal "&lt;" the feed actually meant.
    .replace(/&amp;/g, '&')
}

function safeCodePoint(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return ''
  try { return String.fromCodePoint(n) } catch { return '' }
}

/**
 * Inner text of the first <tag> in a block, as an XML parser would give it.
 *
 * "As an XML parser would" is the whole point, and it is what a naive regex
 * extractor gets wrong. Feeds escape their HTML once inside the XML, so a
 * description arrives as `&lt;p&gt;text&lt;/p&gt;`; Python's ElementTree
 * decoded that to `<p>text</p>` as part of parsing, and everything downstream
 * — strip_tags, the <img> scrape in find_image — assumed it had. Returning the
 * raw escaped text here left tags no stripper could see and images no scraper
 * could find.
 *
 * CDATA is the exception and is returned verbatim: its contents are literal by
 * definition and an XML parser does not expand entities inside it.
 */
export function tagText(block, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  if (!m) return ''
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1])
  return cdata ? cdata[1] : decodeEntities(m[1])
}

/**
 * A thumbnail for an item, trying the three places feeds put one.
 *
 * Order matters and matches the Python: media:content is the explicit
 * declaration, enclosure is the podcast-era fallback that is only an image if
 * the extension says so, and an <img> scraped out of the description is the
 * last resort because plenty of feeds put a tracking pixel there.
 */
export function findImage(block) {
  const mc = /<media:content[^>]*\surl=["']([^"']+)["']/i.exec(block)
  if (mc) return mc[1]

  const enc = /<enclosure[^>]*\surl=["']([^"']+)["']/i.exec(block)
  if (enc && /\.(jpe?g|png|webp)/i.test(enc[1])) return enc[1]

  const desc = tagText(block, 'description')
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(desc)
  return img ? img[1] : ''
}

/** RFC-822 pubDate to epoch ms; 0 when unparseable, so it sorts last. */
export function pubDateMs(pub) {
  const t = Date.parse(pub || '')
  return Number.isFinite(t) ? t : 0
}

/**
 * Articles from one feed's XML.
 *
 * Regex rather than a parser because Workers have no DOMParser and every XML
 * library is heavier than this whole worker. The shape being matched is one
 * level deep and well-formed by RSS convention, which is the case regex
 * handles acceptably — an <item> cannot legally nest another <item>.
 */
export function parseFeed(xml, feed, seen = new Set(), limit = 30) {
  const out = []
  const items = String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []

  for (const block of items.slice(0, limit)) {
    const title = stripTags(tagText(block, 'title'))
    if (!title) continue

    // De-duplicated on the first 60 characters, as the Python did: the same
    // story is syndicated across these feeds with trailing "- CoinDesk"
    // style suffixes that a whole-title comparison would miss.
    const key = title.slice(0, 60)
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      title,
      link: stripTags(tagText(block, 'link')),
      description: stripTags(tagText(block, 'description')).slice(0, 300),
      pubDate: stripTags(tagText(block, 'pubDate')),
      thumbnail: findImage(block),
      source: feed.name,
      sourceColor: feed.color,
    })
  }
  return out
}

export async function fetchFeedGroup(feeds, now = Date.now()) {
  const articles = []
  const seen = new Set()
  for (const feed of feeds) {
    try {
      articles.push(...parseFeed(await getText(feed.url, 15000), feed, seen))
    } catch (e) {
      // One dead feed must not empty the group. Three of four still makes a
      // usable news page; failing the whole job makes an empty one.
      console.warn(`${feed.name} failed: ${e}`)
    }
  }
  articles.sort((a, b) => pubDateMs(b.pubDate) - pubDateMs(a.pubDate))
  return { updated: isoStamp(now), count: articles.length, articles: articles.slice(0, 120) }
}

// ── Economic calendar (FairEconomy / ForexFactory) ──────────────────────────

export const CALENDAR_FEEDS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
]

const KEEP_COUNTRIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'NZD'])
const IMPACT_MAP = { High: 'high', Medium: 'medium', Low: 'low', Holiday: 'holiday', 'Non-Economic': 'low' }

/**
 * Calendar rows to the app's event shape.
 *
 * `seen` is threaded across both feeds because this week and next week
 * overlap at the boundary and would otherwise list the same release twice.
 */
export function parseCalendarRows(rows, seen = new Set()) {
  const events = []
  if (!Array.isArray(rows)) return events

  for (const row of rows) {
    const country = String(row?.country || '').toUpperCase()
    if (country && !KEEP_COUNTRIES.has(country)) continue

    const iso = String(row?.date || '')
    const d = new Date(iso)
    const ok = !Number.isNaN(d.getTime())

    // The feed stamps dates with an offset (2026-01-03T15:00:00-05:00), and
    // the date/time shown must be the one in that offset, not the reader's.
    // Slicing the string keeps the feed's own wall clock; using the Date
    // would silently shift every event by the server's zone.
    const dateOnly = iso.slice(0, 10)
    const hhmm = ok ? iso.slice(11, 16) : ''
    // All-day items arrive at 00:00 and carry no meaningful time.
    const timeOnly = hhmm === '00:00' ? '' : hhmm

    const title = String(row?.title || '').trim()
    if (!title || !dateOnly) continue

    const key = `${dateOnly}|${timeOnly}|${country}|${title}`
    if (seen.has(key)) continue
    seen.add(key)

    events.push({
      date: dateOnly,
      time: timeOnly,
      ts: ok ? Math.floor(d.getTime() / 1000) : null,
      title,
      country,
      impact: IMPACT_MAP[String(row?.impact || '')] ?? 'low',
      forecast: String(row?.forecast || '').trim(),
      previous: String(row?.previous || '').trim(),
      actual: String(row?.actual || '').trim(),
    })
  }
  return events
}

export async function fetchCalendar(now = Date.now()) {
  const events = []
  const seen = new Set()
  for (const url of CALENDAR_FEEDS) {
    try {
      events.push(...parseCalendarRows(await getJson(url, 30000), seen))
    } catch (e) {
      console.warn(`calendar feed failed ${url}: ${e}`)
    }
  }
  if (!events.length) return null
  // Undated items sink to the end rather than sorting as epoch zero.
  events.sort((a, b) => (a.ts == null) - (b.ts == null) || (a.ts || 0) - (b.ts || 0))
  return { updated: isoStamp(now), count: events.length, events }
}

// ── Stock prices (Stooq) ────────────────────────────────────────────────────

export const TICKERS = [
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','ORCL','CRM',
  'AMD','INTC','QCOM','IBM','ADBE','NOW','PLTR','SNOW',
  'NET','DDOG','CRWD','ZS','APP','TTD','SMCI','ARM','ASML','TSM','NFLX','MSTR',
  'UBER','LYFT','ABNB','DASH','SNAP','PINS','SPOT','RBLX','ZM','AFRM',
  'BABA','PDD','JD',
  'BRK.B','JPM','V','MA','BAC','GS','MS','WFC','AXP','C','COIN','HOOD',
  'SQ','PYPL','SOFI','NU','SCHW','BLK','PGR','DKNG',
  'LLY','UNH','JNJ','ABBV','PFE','MRK','NVO',
  'TMO','ISRG','ABT','AMGN','GILD','VRTX','REGN','MRNA',
  'WMT','COST','MCD','NKE','SBUX','KO','PEP','TGT',
  'DIS','CMCSA','LULU','HD','LOW',
  'XOM','CVX','COP','OXY','NEE','FSLR','ENPH',
  'RIOT','MARA','CORZ','HUT',
  'LMT','RTX','BA','GE','CAT','DE',
  'SPY','QQQ','IWM','DIA','VOO','VTI','GLD','TLT','ARKK','SOXX',
  'XLK','XLF','XLV','XLC','SCHD','JEPI','JEPQ',
]

export const stooqUrl = (symbols) =>
  `https://stooq.com/q/l/?s=${symbols.map(t => `${t.toLowerCase()}.us`).join(',')}&f=sd2t2ohlcvn&h&e=csv`

/**
 * Stooq's CSV to the app's price map.
 *
 * Keys are `stock:<lowercase symbol>`, which is the app's own id convention —
 * the same prefix client/src/api.js routes on and alphaScore.js classifies by.
 * Getting that wrong produces a file the app loads and silently ignores.
 */
export function parseStooqCsv(text) {
  const prices = {}
  const missing = []
  const lines = String(text).trim().split(/\r?\n/)
  if (lines.length < 2) return { prices, missing }

  const headers = lines[0].split(',').map(h => h.trim())
  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    const row = {}
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim() })

    const sym = String(row.Symbol || '').toUpperCase().replace(/\.US$/, '')
    if (!sym) continue
    const close = parseFloat(row.Close)
    const open = parseFloat(row.Open)

    if (Number.isFinite(close) && close > 0) {
      const change = Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : 0
      prices[`stock:${sym.toLowerCase()}`] = {
        usd: round4(close),
        usd_24h_change: round4(change),
      }
    } else {
      // Stooq answers a closed market or an unknown ticker with "N/D" in the
      // price columns rather than omitting the row.
      missing.push(sym)
    }
  }
  return { prices, missing }
}

const round4 = (n) => Math.round(n * 1e4) / 1e4

/** Stooq answers a long symbol list with partial data, so ask in batches. */
export const STOOQ_CHUNK = 20

/** Symbols Stooq did not price, asked of Yahoo one at a time. Bounded. */
export const YAHOO_FALLBACK_MAX = 25

export function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * The stock snapshot every client reads.
 *
 * This asked Stooq for all 125 tickers in a single CSV request and kept
 * whatever came back. Stooq does not answer a list that long in full: most
 * symbols returned N/D, parseStooqCsv put them in `missing`, and `missing` was
 * dropped on the floor. The published file therefore carried a handful of
 * prices — in the Buy Asset picker, AAPL and MSFT had a price and the other
 * 128 rows showed a dash, while the client went looking for them live one
 * screen at a time.
 *
 * So: ask in batches Stooq will actually answer, then ask Yahoo about what is
 * still missing. Both are bounded, because this runs in a Worker and the free
 * plan allows 50 subrequests per invocation — 7 batches plus at most 25
 * single-symbol lookups stays well inside it. That is the same ceiling that
 * truncated push sends and broke /api/stocks.
 */
export async function fetchStockPrices(now = Date.now()) {
  const prices = {}
  const unpriced = []

  for (const group of chunk(TICKERS, STOOQ_CHUNK)) {
    try {
      const { prices: p, missing } = parseStooqCsv(await getText(stooqUrl(group), 20000))
      Object.assign(prices, p)
      unpriced.push(...missing)
    } catch (e) {
      // One bad batch is 20 symbols, not the whole file.
      console.warn(`stooq batch [${group[0]}…] failed: ${e}`)
      unpriced.push(...group)
    }
  }

  // Stooq does not carry every US listing, and answers a closed market for
  // some with N/D. Yahoo fills those rather than leaving a dash in the picker.
  for (const sym of unpriced.slice(0, YAHOO_FALLBACK_MAX)) {
    const key = `stock:${sym.toLowerCase()}`
    if (prices[key]) continue
    try {
      const data = await getJson(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
        8000,
      )
      const meta = data?.chart?.result?.[0]?.meta
      if (meta && Number.isFinite(meta.regularMarketPrice) && meta.regularMarketPrice > 0) {
        prices[key] = {
          usd: round4(meta.regularMarketPrice),
          usd_24h_change: round4(meta.regularMarketChangePercent || 0),
        }
      }
    } catch { /* the dash for this one symbol is the cost */ }
  }

  // `missing` is reported rather than discarded: a count that drops tells the
  // next person the upstreams changed, instead of the picker doing it.
  const missing = unpriced.filter((sym) => !prices[`stock:${sym.toLowerCase()}`])
  return {
    updated: isoStamp(now),
    count: Object.keys(prices).length,
    missing: missing.length,
    prices,
  }
}
