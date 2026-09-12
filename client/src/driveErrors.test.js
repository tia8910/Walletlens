import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// What the person reads when Drive fails.
//
// The backup card printed e.message as its fallback, so a request that never
// completed reached the screen as the browser's own "Failed to fetch" —
// sitting in red under a card that said "Connected · backup from 22 h ago".
// It names no service, offers no remedy, and does not say whether the
// portfolio on the device is still intact. That last one is the only thing
// the person actually wants to know.
//
// Underneath it there was a real distinction the code threw away: a refresh
// Google REFUSED means sign in again, a refresh that never ARRIVED means try
// again later. Treating both as "sign in again" sent people into a full OAuth
// redirect on a network that had just failed — which ends on "Sign-in did not
// complete" and clears a refresh token that was still good.

const here = dirname(fileURLToPath(import.meta.url))
const panel = readFileSync(join(here, 'components/DriveBackup.jsx'), 'utf8')

// The module reads both tokens out of localStorage at import time, so the
// state has to be in place before the import, not after it.
const withToken = () => localStorage.setItem('wl_drive_token', JSON.stringify({
  token: 'at-1', expiry: Date.now() + 30 * 60_000,
}))
const withRefresh = () => localStorage.setItem('wl_drive_refresh', 'rt-1')

const stubLocation = () => {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign, origin: 'https://walletlens.live', pathname: '/settings' },
    configurable: true,
  })
  return assign
}

const settles = async (check) => {
  for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 2))
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

describe('a request that never completed', () => {
  it('is a code naming the hop, not a TypeError', async () => {
    withToken()
    const { findBackup, NET_DRIVE } = await import('./googleDrive')
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
    await expect(findBackup()).rejects.toThrow(NET_DRIVE)
  })

  it('tells the token service apart from Drive itself', async () => {
    // Different problems: one is usually the connection, the other has been a
    // hostname the device cannot resolve. Same red line otherwise.
    withRefresh()
    const { getAccessToken, NET_AUTH } = await import('./googleDrive')
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
    await expect(getAccessToken({ interactive: true })).rejects.toThrow(NET_AUTH)
  })

  it('does not start a sign-in it cannot finish', async () => {
    // The redirect would fail the same way, and beginRedirectSignIn navigates
    // away — so this must reject rather than hand back a promise that never
    // settles while the page unloads.
    withRefresh()
    const assign = stubLocation()
    const { getAccessToken } = await import('./googleDrive')
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
    await getAccessToken({ interactive: true }).catch(() => {})
    expect(assign, 'navigated to Google on a network that had just failed').not.toHaveBeenCalled()
  })

  it('keeps the refresh token, which is probably still good', async () => {
    withRefresh()
    const { getAccessToken } = await import('./googleDrive')
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
    await getAccessToken({ interactive: false }).catch(() => {})
    expect(localStorage.getItem('wl_drive_refresh')).toBe('rt-1')
  })
})

describe('a refresh Google actually refused', () => {
  it('still clears the token and asks for a new sign-in', async () => {
    // The other half of the distinction. A revoked grant must NOT be treated
    // as a network blip, or the app retries a dead credential forever.
    withRefresh()
    const assign = stubLocation()
    const { getAccessToken } = await import('./googleDrive')
    vi.stubGlobal('fetch', async () => new Response('{"error":"invalid_grant"}', { status: 400 }))
    // Never settles by design: an interactive sign-in navigates away.
    getAccessToken({ interactive: true })
    await settles(() => assign.mock.calls.length > 0)
    expect(localStorage.getItem('wl_drive_refresh')).toBeNull()
    expect(assign, 'a revoked grant must send the user to sign in').toHaveBeenCalled()
  })
})

describe('the backup card', () => {
  it('never falls back to the browser error string', () => {
    // The exact shape of the bug: explain(e) || e.message || '...'.
    expect(panel).not.toMatch(/explain\([^)]*\)\s*\|\|\s*e\.message/)
    expect(panel).toMatch(/explain\(e, /)
  })

  it('says the device copy is safe, because that is the actual question', () => {
    expect(panel).toContain('Your data is safe on this device')
    expect(panel).toMatch(/Nothing on this device was changed/)
  })

  it('catches the raw string even if one reaches it from somewhere else', () => {
    expect(panel).toMatch(/Failed to fetch\|NetworkError\|Load failed/)
  })
})
