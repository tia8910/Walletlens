import { describe, it, expect, beforeEach, vi } from 'vitest'

// The redirect flow exists because Google's popup flow returns its token by
// postMessage to the opener, and mobile browsers routinely open the "popup" as
// a plain tab with no opener. The library then reports "Popup window closed",
// which is what the first real device test hit.
//
// Beyond that, the flow now uses the authorization-code grant and a short
// Cloudflare Worker proxy (workers/drive-auth) that holds the OAuth
// client_secret. That worker issues a long-lived refresh_token, which is what
// lets automatic backups silently renew an expired access token instead of
// stopping an hour after the last manual sign-in ("Drive session expired").

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  localStorage.clear()
})

describe('buildAuthUrl', () => {
  it('asks Google for exactly the drive.file scope, by authorization code', async () => {
    const { buildAuthUrl } = await import('./googleDrive')
    const u = new URL(buildAuthUrl('st8'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const p = u.searchParams
    expect(p.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
    // The whole fix depends on getting a refresh token, so the auth code flow
    // with offline access (not the implicit token grant) is mandatory.
    expect(p.get('response_type')).toBe('code')
    expect(p.get('access_type')).toBe('offline')
    expect(p.get('state')).toBe('st8')
    expect(p.get('client_id')).toMatch(/\.apps\.googleusercontent\.com$/)
    // Must match the redirect URI registered on the OAuth client exactly.
    expect(p.get('redirect_uri')).toBe(window.location.origin + '/drive-callback')
  })
})

describe('completeRedirectSignIn (legacy implicit-grant fragment)', () => {
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

    const { returnTo } = await completeRedirectSignIn(`#access_token=tok123&expires_in=3600&state=${state}`)
    expect(returnTo).toBe('/settings')
    expect(isSignedIn()).toBe(true)
  })

  it('rejects a token whose state does not match', async () => {
    const { completeRedirectSignIn } = await import('./googleDrive')
    sessionStorage.setItem('wl_drive_oauth_state', 'expected')
    await expect(completeRedirectSignIn('#access_token=evil&state=forged'))
      .rejects.toThrow(/state mismatch/i)
  })

  it('rejects a fragment with no stored state at all', async () => {
    const { completeRedirectSignIn } = await import('./googleDrive')
    await expect(completeRedirectSignIn('#access_token=tok&state=anything'))
      .rejects.toThrow(/state mismatch/i)
  })

  it('clears the stored state so a fragment cannot be replayed', async () => {
    const { completeRedirectSignIn } = await import('./googleDrive')
    sessionStorage.setItem('wl_drive_oauth_state', 's')
    sessionStorage.setItem('wl_drive_return', '/settings')
    const hash = '#access_token=tok&expires_in=3600&state=s'
    await completeRedirectSignIn(hash)
    expect(sessionStorage.getItem('wl_drive_oauth_state')).toBeNull()
    await expect(completeRedirectSignIn(hash)).rejects.toThrow(/state mismatch/i)
  })
})

describe('completeRedirectSignInWithCode (new authorization-code flow)', () => {
  it('exchanges a code for tokens and persists a refresh token', async () => {
    // Mock the token-exchange worker.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'at-123',
        refresh_token: 'rt-456',
        expires_in: 3600,
      }),
    })

    const { completeRedirectSignInWithCode, isSignedIn, storedAccessToken } = await import('./googleDrive')
    sessionStorage.setItem('wl_drive_return', '/dashboard')

    const { returnTo } = await completeRedirectSignInWithCode('4/0AX4XfWh-code')
    expect(returnTo).toBe('/dashboard')
    expect(storedAccessToken()).toBe('at-123')
    expect(isSignedIn()).toBe(true)
    // The long-lived refresh token is what keeps auto-backup running past the
    // first hour.
    expect(localStorage.getItem('wl_drive_refresh')).toBe('rt-456')
  })
})

describe('getAccessToken and silent refresh', () => {
  it('returns a cached token without touching the network', async () => {
    // Set localStorage BEFORE importing, since the module reads it at load time.
    localStorage.setItem('wl_drive_token', JSON.stringify({
      token: 'cached',
      expiry: Date.now() + 3600_000,
    }))
    const { getAccessToken } = await import('./googleDrive')
    const token = await getAccessToken({ interactive: false })
    expect(token).toBe('cached')
  })

  it('silently refreshes an expired token via the worker using the refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fresh-at', expires_in: 3600 }),
    })
    global.fetch = fetchMock

    // Stored refresh token, no valid access token — must refresh.
    localStorage.setItem('wl_drive_refresh', 'rt-456')

    const { getAccessToken } = await import('./googleDrive')
    const token = await getAccessToken({ interactive: false })
    expect(token).toBe('fresh-at')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/refresh')
    expect(JSON.parse(init.body).refreshToken).toBe('rt-456')
    // A new access token is cached for the next call.
    const again = await getAccessToken({ interactive: false })
    expect(again).toBe('fresh-at')
  })

  it('returns null (never prompts) for a background call with no usable token', async () => {
    const { getAccessToken } = await import('./googleDrive')
    const token = await getAccessToken({ interactive: false })
    expect(token).toBeNull()
  })
})
