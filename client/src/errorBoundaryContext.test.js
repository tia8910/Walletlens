import { describe, it, expect, vi, beforeEach } from 'vitest'
import ErrorBoundary from './components/ErrorBoundary'

// "t is not defined" has been reported from a phone three times and reproduced
// here zero times: clean static analysis, clean production build, every route,
// both languages, with and without holdings. The message on its own does not
// say which component threw, so every round has been a guess.
//
// componentDidCatch receives React's componentStack, which names it. This
// checks the string-building — the part that can silently produce nothing and
// leave the next screenshot as uninformative as the last one.

function instance() {
  const b = new ErrorBoundary({})
  b.state = { hasError: true, message: 'x', isChunk: false, autoReloading: false, where: '' }
  b.setState = (patch) => { b.state = { ...b.state, ...patch } }
  return b
}

beforeEach(() => { vi.restoreAllMocks() })

describe('error boundary context capture', () => {
  it('names the component that threw', () => {
    const b = instance()
    b.componentDidCatch(
      new Error('t is not defined'),
      { componentStack: '\n    at WalletEvalTab\n    at ToolsTab\n    at Dashboard\n    at App' },
    )
    expect(b.state.where).toContain('at WalletEvalTab')
    expect(b.state.where).toContain('at ToolsTab')
  })

  it('includes the first stack frame, which carries the bundle location', () => {
    const err = new Error('t is not defined')
    err.stack = 'ReferenceError: t is not defined\n    at Ac (/assets/Dashboard-9f2a.js:12:3456)'
    const b = instance()
    b.componentDidCatch(err, { componentStack: '\n    at Foo' })
    expect(b.state.where).toContain('Dashboard-9f2a.js')
  })

  it('caps the length so a deep tree cannot fill the screen', () => {
    const deep = Array.from({ length: 80 }, (_, i) => `    at Component${i}`).join('\n')
    const b = instance()
    b.componentDidCatch(new Error('boom'), { componentStack: deep })
    expect(b.state.where.length).toBeLessThanOrEqual(300)
  })

  it('survives React giving it no component stack at all', () => {
    const b = instance()
    expect(() => b.componentDidCatch(new Error('boom'), undefined)).not.toThrow()
    expect(() => b.componentDidCatch(new Error('boom'), {})).not.toThrow()
  })

  it('never masks the original error if capture itself fails', () => {
    // A throw inside componentDidCatch would replace a useful message with a
    // useless one, which is the opposite of the point.
    const b = instance()
    const hostile = { get componentStack() { throw new Error('nope') } }
    expect(() => b.componentDidCatch(new Error('t is not defined'), hostile)).not.toThrow()
  })

  it('still auto-reloads on a chunk error', () => {
    // The capture is inserted ahead of the chunk-retry branch; that path must
    // keep working or a routine deploy turns into a stuck screen.
    const b = instance()
    b.state.isChunk = true
    expect(() => b.componentDidCatch(new Error('Loading chunk 3 failed'), { componentStack: '\n at X' })).not.toThrow()
  })
})

// A page that throws must not take the rest of the app with it.
//
// The boundary wraps the whole <Routes> tree, so before this it stayed in the
// error state forever: navigating re-rendered nothing, and the only escape was
// a reload. One missing import in Settings therefore read as "every page is
// broken", which is exactly how it was reported.
describe('recovering by navigation', () => {
  it('clears the error when the route changes', async () => {
    const { default: ErrorBoundary } = await import('./components/ErrorBoundary')
    const boundary = new ErrorBoundary({ resetKey: '/settings' })
    boundary.state = { hasError: true, message: 'pulseSettings is not defined', isChunk: false, autoReloading: false, where: '' }

    const applied = []
    boundary.setState = (patch) => { applied.push(patch); Object.assign(boundary.state, patch) }

    // Same route, still broken — a re-render must not silently retry.
    boundary.componentDidUpdate({ resetKey: '/settings' })
    expect(boundary.state.hasError).toBe(true)

    // Navigating away clears it.
    boundary.props = { resetKey: '/dashboard' }
    boundary.componentDidUpdate({ resetKey: '/settings' })
    expect(boundary.state.hasError).toBe(false)
  })

  it('does nothing when there was no error', async () => {
    const { default: ErrorBoundary } = await import('./components/ErrorBoundary')
    const boundary = new ErrorBoundary({ resetKey: '/a' })
    boundary.state = { hasError: false }
    let touched = false
    boundary.setState = () => { touched = true }
    boundary.props = { resetKey: '/b' }
    boundary.componentDidUpdate({ resetKey: '/a' })
    expect(touched).toBe(false)
  })
})

describe('stale chunks after a deploy', () => {
  // The tab still points at the previous build's files. The boundary reloads
  // on its own, so this is not a crash and must not be reported as one, or
  // every deploy shows up in GA as js_error_context.
  const chunkErr = () => new Error('Failed to fetch dynamically imported module: https://walletlens.live/assets/ZakatCalculator-DmeauxSB.js')
  function chunkInstance() {
    const b = instance(); b.state.isChunk = true; return b
  }
  const ctxEvents = (calls) => calls.filter(([k, e]) => k === 'event' && e === 'js_error_context')

  it('is not reported while the automatic reload can still fix it', () => {
    const calls = []; window.gtag = (...a) => calls.push(a)
    sessionStorage.removeItem('wl_chunk_retry')
    try { delete window.caches } catch {}
    const reload = vi.fn()
    const orig = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, reload } })
    try { chunkInstance().componentDidCatch(chunkErr(), { componentStack: '\n    at Zakat' }) } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig })
    }
    expect(ctxEvents(calls)).toHaveLength(0)
    expect(reload).toHaveBeenCalled()
  })

  it('is reported once the reloads have run out, because then it is really stuck', () => {
    const calls = []; window.gtag = (...a) => calls.push(a)
    sessionStorage.setItem('wl_chunk_retry', '3')
    chunkInstance().componentDidCatch(chunkErr(), { componentStack: '\n    at Zakat' })
    sessionStorage.removeItem('wl_chunk_retry')
    expect(ctxEvents(calls)).toHaveLength(1)
  })
})
