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
