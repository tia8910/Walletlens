import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldScrollTop } from './useScrollTop'

const SRC = dirname(fileURLToPath(import.meta.url))

const call = (over = {}) => shouldScrollTop({
  pathname: '/asset/bitcoin', prev: '/dashboard', hash: '', navigationType: 'PUSH', ...over,
})

describe('shouldScrollTop', () => {
  it('scrolls when a tap opens a different page', () => {
    // The reported bug: tapping a holding near the bottom of a long dashboard
    // opened the asset page already scrolled past its chart.
    expect(call()).toBe(true)
  })

  it('leaves back and forward alone', () => {
    // Returning to the dashboard should land on the holding you tapped, not
    // the top. The browser restores that itself, and scrolling here fights it.
    expect(call({ navigationType: 'POP' })).toBe(false)
  })

  it('leaves an anchor alone', () => {
    expect(call({ hash: '#faq-fees' })).toBe(false)
  })

  it('ignores a query change on the page you are already reading', () => {
    // A filter or a tab. Yanking the page to the top loses your place.
    expect(call({ pathname: '/academy', prev: '/academy' })).toBe(false)
  })

  it('still scrolls on a REPLACE to somewhere else', () => {
    expect(call({ navigationType: 'REPLACE' })).toBe(true)
  })

  it('does not scroll on the first render of a deep link', () => {
    // prev is seeded with the current pathname, so a reload or a shared link
    // lands wherever the browser put it.
    expect(call({ pathname: '/asset/bitcoin', prev: '/asset/bitcoin' })).toBe(false)
  })

  it('scrolls between two assets', () => {
    expect(call({ pathname: '/asset/ethereum', prev: '/asset/bitcoin' })).toBe(true)
  })
})

describe('where a page change is wired', () => {
  const read = (p) => readFileSync(join(SRC, p), 'utf8')

  it('App calls the hook, so both of its shells are covered', () => {
    // App returns from two branches, the landing shell and the app shell. A
    // component mounted in one of them would leave the other unfixed.
    const app = read('App.jsx')
    expect(app).toMatch(/import useScrollTop from '\.\/useScrollTop'/)
    expect(app).toMatch(/\n\s*useScrollTop\(\)/)
  })

  it('a finished trade on the asset page goes back to the dashboard', () => {
    // A trade changes the whole portfolio, and the number it changes is on the
    // dashboard. Reloading the asset page left someone looking at one coin.
    const asset = read('pages/AssetDetail.jsx')
    const onDone = /onDone=\{[\s\S]{0,600}?\n\s{8}\}\}/.exec(asset)
    expect(onDone, 'TradeSheet onDone handler not found').toBeTruthy()
    expect(onDone[0]).toMatch(/navigate\('\/dashboard'\)/)
  })
})
