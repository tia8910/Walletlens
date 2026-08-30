import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildMessage, isDeadToken, accessToken, resetTokenCache, FCM_ENDPOINT,
} from '../../workers/push/fcm.js'
import { normalizeSub } from '../../push-api/notify-logic.js'
import { tokenKey, endpointKey } from '../../workers/push/store.js'

// The app renders itself in a WebView now, and a WebView has no service
// worker — so the Web Push subscription the server has addressed since the
// Deno service does not exist there, and delivery has to become FCM.
//
// The thing to protect is that ONLY delivery moves. Every channel, threshold,
// cooldown and day gate in jobs.js sits above the transport, and Web Push is
// still how every browser, desktop and iOS install is reached.

const SRC = dirname(fileURLToPath(import.meta.url))

describe('two transports, one decision', () => {
  it('treats a record with no transport as Web Push', () => {
    // Every row written before this field existed. Defaulting the other way
    // would point thousands of live subscriptions at a token they do not have,
    // and each would fail silently — a send to nobody looks exactly like a
    // quiet market.
    expect(normalizeSub({ subscription: { endpoint: 'https://x' } }).transport).toBe('webpush')
    expect(normalizeSub({}).fcmToken).toBe('')
  })

  it('carries an explicit fcm transport through', () => {
    const s = normalizeSub({ transport: 'fcm', fcmToken: 'tok' })
    expect(s.transport).toBe('fcm')
    expect(s.fcmToken).toBe('tok')
  })

  it('refuses a transport it does not know rather than guessing', () => {
    expect(normalizeSub({ transport: 'carrier-pigeon' }).transport).toBe('webpush')
  })

  it('keys FCM rows apart from Web Push rows', async () => {
    // Both addresses are opaque strings hashed into the same 24-hex space. A
    // collision would hand one device another's subscription, in the same
    // table, with no way to tell which kind the row was.
    const t = await tokenKey('some-fcm-token')
    const e = await endpointKey('https://fcm.googleapis.com/fcm/send/abc')
    expect(t).toMatch(/^fcm:/)
    expect(e).not.toMatch(/^fcm:/)
    expect(t).not.toBe(e)
  })

  it('dispatches on the subscription, not on the notification', () => {
    // jobs.js has no idea either transport exists and must not acquire one:
    // the channels are decided above delivery and nothing there should know
    // how a device is reached.
    const jobs = readFileSync(join(SRC, '..', '..', 'workers/push/jobs.js'), 'utf8')
    expect(jobs).not.toMatch(/fcm|FCM|transport/)

    const index = readFileSync(join(SRC, '..', '..', 'workers/push/index.js'), 'utf8')
    expect(index).toMatch(/sub\.transport === 'fcm'/)
  })
})

describe('the FCM message', () => {
  const payload = { title: 'BTC up 6.1%', body: 'now $94,200', url: '/dashboard', channel: 'move' }

  it('sends data, never a notification block', () => {
    // A `notification` block is drawn by the system: it ignores the channels
    // the app defines, ignores the deep link, and is not handed to the app's
    // own service at all while the app is backgrounded. Data-only means the
    // app decides how every notification looks in every app state.
    const m = buildMessage({ token: 't', payload, urgency: 'high', ttl: 3600 })
    expect(m.message.data.title).toBe('BTC up 6.1%')
    expect(m.message.notification, 'the system must not draw these').toBeUndefined()
  })

  it('stringifies every value', () => {
    // FCM rejects the whole message if a data value is a number or null, and a
    // rejected message is a notification that silently never arrives.
    const m = buildMessage({
      token: 't',
      payload: { title: 'x', count: 5, flag: true, nope: null, gone: undefined },
      urgency: 'low', ttl: 60,
    })
    for (const v of Object.values(m.message.data)) expect(typeof v).toBe('string')
    expect(m.message.data.count).toBe('5')
    expect(m.message.data).not.toHaveProperty('nope')
    expect(m.message.data).not.toHaveProperty('gone')
  })

  it('maps urgency onto the only two levels FCM has', () => {
    expect(buildMessage({ token: 't', payload, urgency: 'high', ttl: 1 }).message.android.priority)
      .toBe('HIGH')
    for (const u of ['normal', 'low', undefined]) {
      expect(buildMessage({ token: 't', payload, urgency: u, ttl: 1 }).message.android.priority)
        .toBe('NORMAL')
    }
  })

  it('carries the TTL in the form FCM parses', () => {
    // Seconds with a trailing s. It exists for the same reason the Web Push
    // TTL does: a phone that was off for days must not come back to a price
    // alert from last Tuesday.
    expect(buildMessage({ token: 't', payload, urgency: 'high', ttl: 3600 }).message.android.ttl)
      .toBe('3600s')
    expect(buildMessage({ token: 't', payload, urgency: 'high', ttl: -5 }).message.android.ttl)
      .toBe('0s')
  })
})

describe('knowing when a token is dead', () => {
  // The equivalent of Web Push's 404/410, and it matters for the same reason:
  // it is the only way the subscription table ever shrinks on its own.

  it('drops a token FCM says is gone', () => {
    expect(isDeadToken(404, '')).toBe(true)
    expect(isDeadToken(400, '{"error":{"status":"INVALID_ARGUMENT"}}')).toBe(true)
    expect(isDeadToken(403, 'UNREGISTERED')).toBe(true)
    expect(isDeadToken(404, 'Requested entity was not found.')).toBe(true)
  })

  it('does NOT drop one on a transient fault', () => {
    // This is the assertion that matters most in this file. Treating a rate
    // limit or an outage as a dead token would unsubscribe live devices
    // permanently, and they would have no idea it had happened.
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isDeadToken(status, 'Internal error'), `status ${status}`).toBe(false)
    }
    expect(isDeadToken(401, 'unauthorized'), 'our credentials, not their token').toBe(false)
  })
})

describe('the access token', () => {
  beforeEach(() => { resetTokenCache() })
  afterEach(() => { vi.restoreAllMocks(); resetTokenCache() })

  it('refuses a service account that is missing its halves', async () => {
    await expect(accessToken({}, 0)).rejects.toThrow(/client_email|private_key/)
    await expect(accessToken({ client_email: 'a@b' }, 0)).rejects.toThrow(/private_key/)
  })

  it('fails before the network when the key cannot be read', async () => {
    // Signing happens first, so a malformed private_key never becomes a token
    // request. Worth pinning: the opposite order would send Google a JWT
    // signed with nothing and read the 400 as a credentials problem.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ access_token: 'abc', expires_in: 3600 }),
    })
    await expect(accessToken({ client_email: 'a@b', private_key: 'not-a-key' }, 0))
      .rejects.toThrow()
    expect(fetchSpy, 'a bad key must not reach the network').not.toHaveBeenCalled()
  })

  /** A real RSA key, so the signing path is exercised rather than stubbed. */
  async function realAccount() {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    )
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
    const b64 = Buffer.from(pkcs8).toString('base64').replace(/(.{64})/g, '$1\n')
    return {
      client_email: 'walletlens@walletlens-958d5.iam.gserviceaccount.com',
      private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
      project_id: 'walletlens-958d5',
    }
  }

  it('signs a real JWT and exchanges it', async () => {
    const account = await realAccount()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ access_token: 'abc123', expires_in: 3600 }),
    })

    expect(await accessToken(account, 0)).toBe('abc123')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')

    // The assertion the exchange actually turns on: a three-part JWT whose
    // claim names our service account and asks for the messaging scope. Get
    // the scope wrong and Google returns a token that 403s on every send.
    const body = init.body.toString()
    const jwt = new URLSearchParams(body).get('assertion')
    expect(jwt.split('.')).toHaveLength(3)
    const claim = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
    expect(claim.iss).toBe(account.client_email)
    expect(claim.scope).toBe('https://www.googleapis.com/auth/firebase.messaging')
    expect(claim.aud).toBe('https://oauth2.googleapis.com/token')
  })

  it('hands back a cached token without a second round trip', async () => {
    // A cron runs every minute and minting costs an RSA signature plus a round
    // trip to Google; paying that per notification would dominate the cost of
    // sending one.
    const account = await realAccount()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ access_token: 'abc123', expires_in: 3600 }),
    })

    await accessToken(account, 0)
    await accessToken(account, 60_000)
    await accessToken(account, 120_000)
    expect(fetchSpy, 'three sends, one exchange').toHaveBeenCalledTimes(1)
  })

  it('re-mints a minute BEFORE the token actually expires', async () => {
    // Not pedantry: a token that expires between the cache check and the send
    // is a 401 on a notification that has already been decided and cannot be
    // decided again.
    const account = await realAccount()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ access_token: 'abc123', expires_in: 3600 }),
    })

    await accessToken(account, 0)
    await accessToken(account, 3_539_000)   // just inside the margin
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await accessToken(account, 3_541_000)   // just past it
    expect(fetchSpy, 'refreshed early, not late').toHaveBeenCalledTimes(2)
  })

  it('points at the v1 endpoint, since legacy is gone', () => {
    // The legacy HTTP API was switched off on 2024-06-20. A worker still
    // calling it would get a 404 on every send.
    expect(FCM_ENDPOINT('walletlens-958d5'))
      .toBe('https://fcm.googleapis.com/v1/projects/walletlens-958d5/messages:send')
  })
})

describe('the Android half', () => {
  const JAVA = join(
    SRC, '..', '..',
    'walletlens_source/release_package/app/src/main/java/live/walletlens/twa',
  )
  const raw = (f) => readFileSync(join(JAVA, f), 'utf8')
  // Block comments only. Stripping line comments here would eat the `//` in
  // every https:// literal in the file — which is exactly what it did, and the
  // origin assertion below failed against code that was perfectly correct.
  const code = (f) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '')

  it('only opens links on our own origin', () => {
    // The payload arrives from the network and a notification is a tappable
    // thing on the lock screen. Without this, anyone who could forge a push
    // could put a link to a page of their choosing there, wearing this app's
    // icon and name.
    expect(raw('WalletLensMessagingService.java'))
      .toMatch(/!url\.startsWith\("https:\/\/walletlens\.live\/"\)/)
  })

  it('re-registers when FCM rotates the token', () => {
    // A rotated token is the FCM equivalent of an expired endpoint: the server
    // keeps sending to an address nobody is at and nothing fails loudly.
    const src = code('WalletLensMessagingService.java')
    expect(src).toMatch(/onNewToken/)
    expect(src).toMatch(/KEY_TOKEN_SYNCED/)
    // Only a CHANGED token clears the flag, or the web app re-POSTs the same
    // address on every single launch.
    expect(src).toMatch(/previous\.equals\(token\)/)
  })

  it('refuses to build against a placeholder Firebase config', () => {
    // This exact mistake has shipped: a stub google-services.json made
    // FirebaseInitProvider throw at process start — before Application.onCreate,
    // so nothing could catch it — and every launch died with "this app has a
    // bug". The Google services plugin only checks the file exists.
    const gradle = readFileSync(
      join(SRC, '..', '..', 'walletlens_source/release_package/app/build.gradle'), 'utf8',
    )
    expect(gradle).toMatch(/google-services\.json is missing/)
    expect(gradle).toMatch(/does not look like a real Firebase project/)
  })

  it('ships the real config, matching the app it signs', () => {
    const gs = JSON.parse(readFileSync(
      join(SRC, '..', '..', 'walletlens_source/release_package/app/google-services.json'), 'utf8',
    ))
    expect(gs.client[0].client_info.android_client_info.package_name)
      .toBe('live.walletlens.twa')
    expect(gs.client[0].client_info.mobilesdk_app_id).toMatch(/^1:\d+:android:[0-9a-f]+$/)
  })
})
