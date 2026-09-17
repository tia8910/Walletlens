import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setInterestSegments, readInterests, SEGMENTS } from './analytics'

// Segmenting users by the asset classes they asked for.
//
// The line this walks up to is the one at the top of analytics.js: no
// asset-class mix may leave the device. That means the mix of a real
// portfolio. What these send is the interest picker's answer — a stated
// preference that already rides out in interests_selected and that decides
// what the app shows. Someone can tick crypto and hold nothing.
//
// The tests below pin that distinction, because it is the whole basis for this
// being allowed to exist.

const here = dirname(fileURLToPath(import.meta.url))
const calls = []

beforeEach(() => {
  calls.length = 0
  window.gtag = (...args) => calls.push(args)
  try { localStorage.clear() } catch {}
})
afterEach(() => { delete window.gtag })

function props() {
  const set = calls.filter(c => c[0] === 'set' && c[1] === 'user_properties')
  return set.length ? set[set.length - 1][2] : null
}

describe('what gets sent', () => {
  it('labels a crypto picker as crypto and nothing else', () => {
    setInterestSegments(['crypto'])
    expect(props()).toMatchObject({ seg_crypto: 'yes', seg_stocks: 'no', seg_metals: 'no', seg_other: 'no' })
  })

  it('labels stocks and metals separately', () => {
    setInterestSegments(['stocks', 'gold'])
    expect(props()).toMatchObject({ seg_stocks: 'yes', seg_metals: 'yes', seg_crypto: 'no' })
  })

  it('counts stablecoins as crypto and ETFs as stocks', () => {
    setInterestSegments(['stablecoins', 'etfs'])
    expect(props()).toMatchObject({ seg_crypto: 'yes', seg_stocks: 'yes' })
  })

  it('tells a skipped picker apart from one answered with nothing', () => {
    // Different facts: skipped means the app chose the defaults, empty means
    // the user did. Collapsing them loses the more interesting one.
    setInterestSegments(null)
    expect(props().interest_state).toBe('unset')
    setInterestSegments([])
    expect(props().interest_state).toBe('none')
    setInterestSegments(['crypto'])
    expect(props().interest_state).toBe('picked')
  })

  it('sends how many were picked, not which ones', () => {
    setInterestSegments(['crypto', 'stocks', 'gold'])
    const p = props()
    expect(p.interest_count).toBe('3')
    // No raw id reaches GA as a VALUE. The property names are the buckets
    // themselves (seg_crypto), which is the point of them; what must not
    // travel is which of the ten boxes were ticked.
    const values = Object.values(p).join('|')
    for (const id of Object.values(SEGMENTS).flat()) {
      expect(values).not.toContain(id)
    }
  })

  it('does nothing at all when GA is absent', () => {
    delete window.gtag
    expect(() => setInterestSegments(['crypto'])).not.toThrow()
  })
})

describe('what it reads', () => {
  it('reads the picker’s own key', () => {
    localStorage.setItem('wl_interests', JSON.stringify(['crypto', 'gold']))
    expect(readInterests()).toEqual(['crypto', 'gold'])
  })

  it('treats an unreadable or missing value as unset, not as empty', () => {
    expect(readInterests()).toBeNull()
    localStorage.setItem('wl_interests', 'not json')
    expect(readInterests()).toBeNull()
  })

  it('never reads the portfolio', () => {
    // The guard that matters. Holdings are the forbidden thing; the picker's
    // answer is not.
    // Just this function's body: slicing to end of file drags in every other
    // exported function and the assertion stops meaning anything.
    const src = readFileSync(join(here, 'analytics.js'), 'utf8')
    const from = src.indexOf('export function setInterestSegments')
    const fn = src.slice(from, src.indexOf('\n}', from) + 2)
    expect(fn).not.toMatch(/portfolio|holding|getPortfolio|coin_id|symbol|balance/i)
    // It reads exactly one thing, and that thing is the picker's key.
    expect(readFileSync(join(here, 'analytics.js'), 'utf8')).toContain("localStorage.getItem('wl_interests')")
  })
})

describe('when it runs', () => {
  it('labels returning users, not only the ones who just picked', () => {
    // Set on every start. An event-only version labels the moment somebody
    // chose and leaves everyone who chose months ago unsegmented.
    const main = readFileSync(join(here, 'main.jsx'), 'utf8')
    expect(main).toContain('setInterestSegments()')
    expect(main).toContain('window.addEventListener(INTERESTS_EVENT, (e) => setInterestSegments(e.detail))')
  })
})
