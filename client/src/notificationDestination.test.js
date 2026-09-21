import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetUrl, buildPayload, CHANNEL_URL, signedPct, fmtPct } from '../../push-api/notify-logic.js'
import { toWatchAssets } from './push'
import { GOLD_ID, SILVER_ID } from './data/assets'

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
    expect(assetUrl({ id: 'bitcoin', symbol: 'BTC', kind: 'crypto' })).toBe('/asset/?id=bitcoin')
  })

  it('accepts either name the two stores use for it', () => {
    // Watch entries carry `id`; alerts carry `coin_id`.
    expect(assetUrl({ coin_id: 'ethereum' })).toBe('/asset/?id=ethereum')
  })

  // ── The prefix ──────────────────────────────────────────────────────────
  //
  // THE BUG THIS SECTION EXISTS FOR, caught before it shipped.
  //
  // toWatchAssets() splits an asset into a `kind` and an id with the prefix
  // REMOVED: 'metal:xau' becomes kind 'metal' + id 'xau'. Right for the
  // server, which groups quote lookups by kind. Wrong for a link — assetClass()
  // reads the prefix, so '/asset/xau' is a request for a crypto coin called
  // "xau", and the page comes up empty.
  //
  // Gold is the largest holding in a great many portfolios. The flagship case
  // of this feature would have been broken for the people most likely to tap it.

  it('puts back the prefix a watch entry had stripped', () => {
    expect(assetUrl({ kind: 'metal', id: 'xau', symbol: 'XAU' })).toBe('/asset/?id=metal%3Axau')
    expect(assetUrl({ kind: 'stock', id: 'aapl', symbol: 'AAPL' })).toBe('/asset/?id=stock%3Aaapl')
  })

  it('round-trips a real holding back to the id the app stores', () => {
    // The guard that would have caught it. Runs a holding through the same
    // toWatchAssets() the subscription uses, then asks for its link, and
    // requires the two ids to match.
    for (const coin_id of [GOLD_ID, SILVER_ID, 'stock:aapl', 'bitcoin', 'ethereum']) {
      const [watched] = toWatchAssets([{ coin_id, coin_symbol: 'X', amount: 1 }])
      expect(watched, `${coin_id} is watched`).toBeTruthy()
      expect(assetUrl(watched), `${coin_id} must link to itself`)
        .toBe(`/asset/?id=${encodeURIComponent(coin_id)}`)
    }
  })

  it('does not double the prefix if it is already there', () => {
    expect(assetUrl({ kind: 'metal', id: 'metal:xau' })).toBe('/asset/?id=metal%3Axau')
  })

  it('leaves an unfamiliar kind alone rather than guessing', () => {
    // A wrong prefix is a link to nothing; a bare id still works for crypto,
    // which is what an unrecognised kind most likely is.
    expect(assetUrl({ kind: 'something-new', id: 'solana' })).toBe('/asset/?id=solana')
  })

  it('encodes an id that arrived from a device', () => {
    expect(assetUrl({ id: 'brk/b' })).toBe('/asset/?id=brk%2Fb')
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

// ── How a price alert reads ─────────────────────────────────────────────────

describe('signedPct', () => {
  it('carries the direction the way an exchange writes it', () => {
    expect(signedPct(3.24)).toBe('+3.2%')
    expect(signedPct(-3.24)).toBe('−3.2%')
    expect(signedPct(12.7)).toBe('+13%')
  })

  it('uses a real minus sign, not a hyphen', () => {
    // At notification size a hyphen beside a digit is easy to miss or to read
    // as a dash. Mistaking −5% for +5% is the worst thing this text can do.
    expect(signedPct(-5)).toContain('\u2212')
    expect(signedPct(-5)).not.toContain('-')
  })

  it('agrees with fmtPct on the number itself', () => {
    // Two formatters that round differently would print two different figures
    // for one move depending on which channel sent it.
    for (const n of [0.04, 1.25, 6.14, 9.99, 10, 12.7, 99.5]) {
      expect(signedPct(n)).toBe(`+${fmtPct(n)}%`)
      expect(signedPct(-n)).toBe(`−${fmtPct(n)}%`)
    }
  })

  it('treats a missing 24h change as flat rather than printing NaN', () => {
    // change24h is 0 on any feed that does not supply it, and undefined if a
    // quote is malformed. "+NaN%" in a notification is unrecoverable.
    for (const bad of [undefined, null, NaN, 'x']) {
      expect(signedPct(bad)).toBe('+0.0%')
    }
  })
})
