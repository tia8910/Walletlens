import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetUrl, buildPayload, CHANNEL_URL } from '../../push-api/notify-logic.js'

// A notification is a promise about where a tap will land. Every channel used
// to answer that with the dashboard, whatever it had just said — so being told
// "BTC crossed $100,000" and tapping put the reader on a portfolio screen with
// the work still to do: find the asset, open it, see the chart.
//
// The payload already knew which asset it was about. These check it says so.

const SRC = dirname(fileURLToPath(import.meta.url))
const jobs = readFileSync(join(SRC, '..', '..', 'workers/push/jobs.js'), 'utf8')

/** The buildPayload({ ... }) call for one channel, as text. */
function payloadFor(channel) {
  const at = jobs.indexOf(`channel: "${channel}"`)
  if (at < 0) return ''
  const open = jobs.lastIndexOf('buildPayload({', at)
  let depth = 0
  for (let i = jobs.indexOf('{', open); i < jobs.length; i++) {
    if (jobs[i] === '{') depth++
    else if (jobs[i] === '}' && --depth === 0) return jobs.slice(open, i + 1)
  }
  return ''
}

describe('assetUrl', () => {
  it('uses the id the route is keyed by, not the symbol', () => {
    // /asset/:coinId takes the stored id. Two listings can share a symbol, so
    // a symbol would sometimes open the wrong asset and sometimes nothing.
    expect(assetUrl({ id: 'bitcoin', symbol: 'BTC' })).toBe('/asset/bitcoin')
  })

  it('accepts either name the two stores use for it', () => {
    // Watch entries carry `id`; alerts carry `coin_id`.
    expect(assetUrl({ coin_id: 'ethereum' })).toBe('/asset/ethereum')
  })

  it('encodes an id that arrived from a device', () => {
    expect(assetUrl({ id: 'brk/b' })).toBe('/asset/brk%2Fb')
  })

  it('returns null rather than a link to nowhere', () => {
    // The caller falls back to the channel's own page. "/asset/undefined" is a
    // dead end that looks like a working link.
    for (const bad of [null, undefined, {}, { id: '' }, { id: '   ' }]) {
      expect(assetUrl(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('buildPayload', () => {
  it('prefers an explicit url over the channel default', () => {
    expect(buildPayload({ channel: 'move', title: 't', body: 'b', url: '/asset/solana' }).url)
      .toBe('/asset/solana')
  })

  it('falls back to the channel page when there is none', () => {
    expect(buildPayload({ channel: 'move', title: 't', body: 'b' }).url).toBe(CHANNEL_URL.move)
  })
})

describe('every channel lands on what it is about', () => {
  it('the price channels open the asset', () => {
    for (const channel of ['target', 'move', 'level']) {
      expect(payloadFor(channel), `${channel} must link to its asset`).toMatch(/url: assetUrl\(/)
    }
  })

  it('news opens the holding it names, or the market page', () => {
    const body = payloadFor('news')
    expect(body).toMatch(/url: asset \? assetUrl\(asset\) : '\/market-index'/)
  })

  it('news does not send the reader out to the article', () => {
    // The source link is a news site. Following it leaves the app entirely,
    // and nothing the app knows about the portfolio is on screen there.
    //
    // Matched against the url VALUE, not the whole payload: the comment above
    // that line names the rejected option in order to explain it, and an
    // assertion that reads prose fails on the explanation of its own rule.
    const url = payloadFor('news').match(/url:[^\n]*/)[0]
    expect(url).not.toContain('article.link')
    expect(url).toContain('/market-index')
  })

  it('the hack opens that hack, by the index the rotation recorded', () => {
    const body = payloadFor('hack')
    expect(body).toContain('/academy?tab=hacks&hack=${choice.index}')
    // The same index the tag and hacksSent use, so the link cannot drift from
    // the hack that was actually sent.
    expect(body).toContain('tag: `hack-${choice.index}`')
  })

  it('zakat opens the zakat tab, not the one beside it', () => {
    expect(CHANNEL_URL.zakat).toBe('/dashboard?tab=zakat')
  })

  it('the academy question opens the challenge', () => {
    expect(CHANNEL_URL.academy).toBe('/academy?tab=challenge')
  })

  it('every channel default is a path this app serves', () => {
    // A destination is only as good as the route behind it. Anything outside
    // this set is a 404 wearing the app's icon.
    const ROUTES = new Set(['/dashboard', '/academy', '/settings', '/market-index', '/'])
    for (const [channel, url] of Object.entries(CHANNEL_URL)) {
      expect(url, `${channel} must be a path`).toMatch(/^\//)
      expect(ROUTES.has(url.split('?')[0]), `${channel} → ${url}`).toBe(true)
    }
  })

  it('every dashboard tab named is one the dashboard has', () => {
    // ?tab= is silently ignored when it names a tab that does not exist, so a
    // typo here degrades to the overview with nothing to see.
    const dash = readFileSync(join(SRC, 'pages', 'Dashboard.jsx'), 'utf8')
    const tabs = new Set(
      (dash.match(/const DASH_TABS = new Set\(\[([^\]]+)\]/)[1].match(/'([^']+)'/g) || [])
        .map(q => q.slice(1, -1)))
    for (const url of Object.values(CHANNEL_URL)) {
      const tab = new URLSearchParams(url.split('?')[1] || '').get('tab')
      if (tab && url.startsWith('/dashboard')) {
        expect(tabs.has(tab), `${url} names a tab the dashboard does not have`).toBe(true)
      }
    }
  })
})

describe('the Academy honours the link', () => {
  const academy = readFileSync(join(SRC, 'pages', 'Academy.jsx'), 'utf8')

  it('opens the hack the notification named', () => {
    expect(academy).toContain("get('hack')")
    expect(academy).toMatch(/startOpen=\{i === deepLinkedHack\}/)
  })

  it('scrolls it into view, so the tap is visibly answered', () => {
    // A card that expands below the fold reads as a tap that did nothing.
    expect(academy).toMatch(/scrollIntoView/)
  })

  it('reads the parameter once, not on every render', () => {
    // Re-reading would re-open the card after the user closed it.
    expect(academy).toMatch(/const \[deepLinkedHack\] = useState\(\(\) => \{/)
  })

  it('ignores a parameter that is not an index', () => {
    // The value arrives on a URL. A non-number must not open card NaN.
    const at = academy.indexOf('const [deepLinkedHack]')
    const body = academy.slice(at, academy.indexOf('\n  })', at))
    expect(body).toContain('Number.isInteger(n) && n >= 0')
  })
})
