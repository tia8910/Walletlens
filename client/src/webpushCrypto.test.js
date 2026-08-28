import { describe, it, expect } from 'vitest'
import {
  encryptPayload, vapidHeader, b64urlToBytes, bytesToB64url,
} from '../../workers/push/webpush.js'

// The Deno service signed and encrypted with the `web-push` npm package. That
// is Node-only, so the Worker does the same job on WebCrypto — and this is the
// file that has to earn the trust web-push came with.
//
// The failure mode is the reason these are thorough: a subtly wrong key
// derivation does NOT throw. The push service accepts the body, the browser
// fails to decrypt it, and nothing is delivered and nothing is logged. So the
// test decrypts what we encrypt, by the receiver's half of RFC 8291, rather
// than only checking that bytes came out.

const enc = new TextEncoder()
const dec = new TextDecoder()

async function receiverKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  return { kp, p256dh: bytesToB64url(raw), auth: bytesToB64url(crypto.getRandomValues(new Uint8Array(16))) }
}

/** The receiver's side of RFC 8291 — what a browser does with the body. */
async function decryptAsBrowser(body, kp, p256dh, auth) {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)

  const asKey = await crypto.subtle.importKey(
    'raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  )
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: asKey }, kp.privateKey, 256,
  ))

  const hkdf = async (s, ikm, info, len) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: s, info }, k, len * 8))
  }

  const uaPublic = b64urlToBytes(p256dh)
  const keyInfo = new Uint8Array([
    ...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic,
  ])
  const ikm = await hkdf(b64urlToBytes(auth), shared, keyInfo, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, ciphertext,
  ))
  expect(plain[plain.length - 1], 'last-record padding delimiter').toBe(0x02)
  return dec.decode(plain.slice(0, -1))
}

describe('base64url', () => {
  it('round-trips bytes', () => {
    const b = crypto.getRandomValues(new Uint8Array(65))
    expect([...b64urlToBytes(bytesToB64url(b))]).toEqual([...b])
  })

  it('emits no padding or non-url characters', () => {
    for (let n = 1; n < 40; n++) {
      const s = bytesToB64url(crypto.getRandomValues(new Uint8Array(n)))
      expect(s, `${n} bytes`).not.toMatch(/[+/=]/)
    }
  })

  it('accepts input that needs padding restored', () => {
    expect([...b64urlToBytes('AQ')]).toEqual([1])
    expect([...b64urlToBytes('AQI')]).toEqual([1, 2])
  })
})

describe('payload encryption (RFC 8291)', () => {
  it('is decryptable by the receiver it was encrypted for', async () => {
    // The whole point. Bytes coming out is not evidence of anything.
    const { kp, p256dh, auth } = await receiverKeys()
    const message = JSON.stringify({ title: 'BTC hit your target', channel: 'target' })
    const body = await encryptPayload(enc.encode(message), p256dh, auth)
    expect(await decryptAsBrowser(body, kp, p256dh, auth)).toBe(message)
  })

  it('carries a well-formed aes128gcm header', async () => {
    const { p256dh, auth } = await receiverKeys()
    const body = await encryptPayload(enc.encode('x'), p256dh, auth)
    // salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext
    expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65)
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096)
    expect(body[20], 'key id length').toBe(65)
    expect(body[21], 'uncompressed point marker').toBe(0x04)
  })

  it('uses a fresh salt and ephemeral key every time', async () => {
    // Reusing either across messages leaks; AES-GCM in particular fails
    // catastrophically on nonce reuse.
    const { p256dh, auth } = await receiverKeys()
    const a = await encryptPayload(enc.encode('same'), p256dh, auth)
    const b = await encryptPayload(enc.encode('same'), p256dh, auth)
    expect([...a.slice(0, 16)]).not.toEqual([...b.slice(0, 16)])   // salt
    expect([...a.slice(21, 86)]).not.toEqual([...b.slice(21, 86)]) // ephemeral key
  })

  it('cannot be decrypted with the wrong auth secret', async () => {
    const { kp, p256dh, auth } = await receiverKeys()
    const body = await encryptPayload(enc.encode('secret'), p256dh, auth)
    const wrong = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)))
    await expect(decryptAsBrowser(body, kp, p256dh, wrong)).rejects.toThrow()
  })

  it('cannot be decrypted by a different subscriber', async () => {
    const mine = await receiverKeys()
    const theirs = await receiverKeys()
    const body = await encryptPayload(enc.encode('private'), mine.p256dh, mine.auth)
    await expect(decryptAsBrowser(body, theirs.kp, mine.p256dh, mine.auth)).rejects.toThrow()
  })

  it('handles a payload larger than one AES block', async () => {
    const { kp, p256dh, auth } = await receiverKeys()
    const big = JSON.stringify({ body: 'x'.repeat(1200) })
    const body = await encryptPayload(enc.encode(big), p256dh, auth)
    expect(await decryptAsBrowser(body, kp, p256dh, auth)).toBe(big)
  })

  it('rejects a p256dh that is not an uncompressed point', async () => {
    const { auth } = await receiverKeys()
    await expect(encryptPayload(enc.encode('x'), bytesToB64url(new Uint8Array(64)), auth))
      .rejects.toThrow(/uncompressed/)
  })
})

describe('VAPID (RFC 8292)', () => {
  // A real P-256 keypair in the storage format the Deno service used: the
  // public point as base64url, the private key as the raw 32-byte scalar.
  async function vapidKeys() {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
    return { publicKey: bytesToB64url(raw), privateKey: jwk.d, verifyKey: kp.publicKey }
  }

  it('produces a header the push service can parse', async () => {
    const { publicKey, privateKey } = await vapidKeys()
    const h = await vapidHeader({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      subject: 'mailto:contact@walletlens.live', publicKey, privateKey,
    })
    expect(h).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/)
    expect(h).toContain(`k=${publicKey}`)
  })

  it('signs something the public key actually verifies', async () => {
    const { publicKey, privateKey, verifyKey } = await vapidKeys()
    const h = await vapidHeader({
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/xyz',
      subject: 'mailto:contact@walletlens.live', publicKey, privateKey,
    })
    const jwt = h.slice(h.indexOf('t=') + 2, h.indexOf(', k='))
    const [head, body, sig] = jwt.split('.')
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, verifyKey,
      b64urlToBytes(sig), enc.encode(`${head}.${body}`),
    )
    expect(ok, 'signature must verify against the advertised key').toBe(true)
  })

  it('addresses the endpoint ORIGIN, not the full URL', async () => {
    // A token minted for the wrong audience is rejected, so this cannot be
    // computed once and reused across push services.
    const { publicKey, privateKey } = await vapidKeys()
    const h = await vapidHeader({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123?x=1',
      subject: 'mailto:contact@walletlens.live', publicKey, privateKey,
    })
    const body = JSON.parse(new TextDecoder().decode(
      b64urlToBytes(h.slice(h.indexOf('t=') + 2, h.indexOf(', k=')).split('.')[1])))
    expect(body.aud).toBe('https://fcm.googleapis.com')
    expect(body.sub).toBe('mailto:contact@walletlens.live')
  })

  it('expires within the 24 hours the spec allows', async () => {
    const { publicKey, privateKey } = await vapidKeys()
    const now = 1_800_000_000_000
    const h = await vapidHeader({
      endpoint: 'https://example.com/p/1', subject: 'mailto:a@b.c',
      publicKey, privateKey, now,
    })
    const body = JSON.parse(new TextDecoder().decode(
      b64urlToBytes(h.slice(h.indexOf('t=') + 2, h.indexOf(', k=')).split('.')[1])))
    expect(body.exp).toBeGreaterThan(now / 1000)
    expect(body.exp - now / 1000).toBeLessThanOrEqual(24 * 60 * 60)
  })

  it('mints a different audience per push service', async () => {
    const { publicKey, privateKey } = await vapidKeys()
    const a = await vapidHeader({ endpoint: 'https://fcm.googleapis.com/x', subject: 'mailto:a@b.c', publicKey, privateKey })
    const b = await vapidHeader({ endpoint: 'https://updates.push.services.mozilla.com/y', subject: 'mailto:a@b.c', publicKey, privateKey })
    expect(a).not.toBe(b)
  })
})
