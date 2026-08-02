import { describe, it, expect, beforeEach, vi } from 'vitest'

// The redirect flow exists because Google's popup flow returns its token by
// postMessage to the opener, and mobile browsers routinely open the "popup" as
// a plain tab with no opener. The library then reports "Popup window closed",
// which is what the first real device test hit. These cover the replacement.

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
})

describe('buildAuthUrl', () => {
  it('asks Google for exactly the drive.file scope, by token response', async () => {
    const { buildAuthUrl } = await import('./googleDrive')
    const u = new URL(buildAuthUrl('st8'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const p = u.searchParams
    expect(p.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
    expect(p.get('response_type')).toBe('token')
    expect(p.get('state')).toBe('st8')
    expect(p.get('client_id')).toMatch(/\.apps\.googleusercontent\.com$/)
    // Must match the redirect URI registered on the OAuth client exactly.
    expect(p.get('redirect_uri')).toBe(window.location.origin + '/drive-callback')
  })
})

describe('completeRedirectSignIn', () => {
  it('accepts a token when the state round-tripped', async () => {
    const { beginRedirectSignIn, completeRedirectSignIn, isSignedIn } = await import('./googleDrive')
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign, origin: 'https://walletlens.live', pathname: '/settings' },
      configurable: true,
    })

    beginRedirectSignIn()
    const state = new URL(assign.mock.calls[0][0]).searchParams.get('state')
    expect(state).toBeTruthy()

    const { returnTo } = completeRedirectSignIn(`#access_token=tok123&expires_in=3600&state=${state}`)
    expect(returnTo).toBe('/settings')
    expect(isSignedIn()).toBe(true)
  })

  it('rejects a token whose state does not match', async () => {
    // Without this check, any page could navigate the user here with a
    // fragment and hand the app an attacker-controlled Drive token.
    const { completeRedirectSignIn } = await import('./googleDrive')
    sessionStorage.setItem('wl_drive_oauth_state', 'expected')
    expect(() => completeRedirectSignIn('#access_token=evil&state=forged'))
      .toThrow(/state mismatch/i)
  })

  it('rejects a fragment with no stored state at all', async () => {
    const { completeRedirectSignIn } = await import('./googleDrive')
    expect(() => completeRedirectSignIn('#access_token=tok&state=anything'))
      .toThrow(/state mismatch/i)
  })

  it('reports a cancelled consent as cancellation, not a crash', async () => {
    const { completeRedirectSignIn } = await import('./googleDrive')
    sessionStorage.setItem('wl_drive_oauth_state', 's')
    expect(() => completeRedirectSignIn('#error=access_denied&state=s'))
      .toThrow(/cancelled/i)
  })

  it('clears the stored state so a fragment cannot be replayed', async () => {
    const { completeRedirectSignIn } = await import('./googleDrive')
    sessionStorage.setItem('wl_drive_oauth_state', 's')
    sessionStorage.setItem('wl_drive_return', '/settings')
    const hash = '#access_token=tok&expires_in=3600&state=s'
    completeRedirectSignIn(hash)
    expect(sessionStorage.getItem('wl_drive_oauth_state')).toBeNull()
    expect(() => completeRedirectSignIn(hash)).toThrow(/state mismatch/i)
  })
})
