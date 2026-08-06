import { describe, it, expect } from 'vitest'

// The privacy contract at the top of analytics.js is the thing under test here:
// error strings are the easiest way for a portfolio amount to escape by
// accident, because nobody writes an exception message expecting it to be
// transmitted.

// Listeners are registered once per window and deliberately not removable, so
// the harness resets the shared state they read rather than re-registering
// them — re-registering would leave the previous test's listeners attached and
// every event would be counted twice.
async function freshAnalytics() {
  const mod = await import('./analytics')
  delete window.__wlErrState
  delete window.__wlHumanMarked
  const events = []
  window.gtag = (...args) => events.push(args)
  mod.initErrorTracking()
  mod.initHumanSignal()
  return { mod, events }
}

const eventsNamed = (events, name) =>
  events.filter(([kind, ev]) => kind === 'event' && ev === name).map(([, , params]) => params)

describe('error reporting', () => {
  it('redacts digits out of error messages', async () => {
    const { events } = await freshAnalytics()
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'Cannot read total 48213.55 for wallet',
      filename: 'https://walletlens.live/assets/Dashboard-a1b2.js',
      lineno: 42,
    }))
    const [params] = eventsNamed(events, 'js_error')
    expect(params.error_message).not.toContain('48213')
    expect(params.error_message).toContain('#')
    expect(params.error_kind).toBe('exception')
  })

  it('ignores failed images, which are CoinLogo walking its fallback chain', async () => {
    const { events } = await freshAnalytics()
    const img = document.createElement('img')
    document.body.appendChild(img)
    const ev = new Event('error')
    Object.defineProperty(ev, 'target', { value: img })
    window.dispatchEvent(ev)
    expect(eventsNamed(events, 'js_error')).toHaveLength(0)
  })

  it('still reports a failed script, which means a broken deploy', async () => {
    const { events } = await freshAnalytics()
    const sc = document.createElement('script')
    sc.src = 'https://walletlens.live/assets/index-abc.js'
    const ev = new Event('error')
    Object.defineProperty(ev, 'target', { value: sc })
    window.dispatchEvent(ev)
    const [p] = eventsNamed(events, 'js_error')
    expect(p.error_kind).toBe('resource')
    expect(p.error_message).toBe('script')
    expect(p.error_source).toBe('walletlens.live')
  })

  it('sends only the filename, never the full URL', async () => {
    // Proxied asset URLs carry the original lookup in a query string.
    const { events } = await freshAnalytics()
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'boom', filename: 'https://walletlens.live/assets/Dashboard-a1b2.js', lineno: 1,
    }))
    const [params] = eventsNamed(events, 'js_error')
    expect(params.error_source).toBe('Dashboard-a1b2.js')
    expect(params.error_source).not.toContain('https')
  })

  it('reports a repeated fault once, not once per throw', async () => {
    // A render loop can throw the same error hundreds of times a second.
    const { events } = await freshAnalytics()
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(new ErrorEvent('error', { message: 'same fault', filename: 'a.js', lineno: 1 }))
    }
    expect(eventsNamed(events, 'js_error')).toHaveLength(1)
  })

  it('caps distinct errors so a broken page cannot flood GA', async () => {
    const { events } = await freshAnalytics()
    for (let i = 0; i < 40; i++) {
      window.dispatchEvent(new ErrorEvent('error', { message: `fault ${i}`, filename: 'a.js', lineno: i }))
    }
    // Distinct messages, but digits are redacted to '#', so they collapse to
    // one key — either way the cap must hold.
    expect(eventsNamed(events, 'js_error').length).toBeLessThanOrEqual(8)
  })

  it('ignores chunk-load rejections, which are handled by reloading', async () => {
    const { events } = await freshAnalytics()
    const ev = new Event('unhandledrejection')
    ev.reason = new Error('Loading chunk 42 failed')
    window.dispatchEvent(ev)
    expect(eventsNamed(events, 'js_error')).toHaveLength(0)
  })

  it('does nothing at all when gtag is absent', async () => {
    // Ad blockers remove gtag. Reporting must stay silent rather than throw
    // inside a global error handler, which would loop.
    delete window.gtag
    await import('./analytics')

    expect(() => window.dispatchEvent(new ErrorEvent('error', {
      message: 'boom', filename: 'a.js', lineno: 1,
    }))).not.toThrow()
  })
})

describe('human signal', () => {
  it('fires nothing until something is actually interacted with', async () => {
    const { events } = await freshAnalytics()
    expect(eventsNamed(events, 'human_interaction')).toHaveLength(0)
  })

  it('marks the session on the first real input', async () => {
    const { events } = await freshAnalytics()
    window.dispatchEvent(new Event('pointerdown'))
    expect(eventsNamed(events, 'human_interaction')).toHaveLength(1)
    const props = events.filter(([k]) => k === 'set').map(([, , p]) => p)
    expect(props.some(p => p?.interacted === 'yes')).toBe(true)
  })

  it('marks it once, not on every click', async () => {
    const { events } = await freshAnalytics()
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('keydown'))
    expect(eventsNamed(events, 'human_interaction')).toHaveLength(1)
  })
})
