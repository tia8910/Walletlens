// Web Push encryption and VAPID signing, on WebCrypto alone.
//
// The Deno service used the `web-push` npm package, which is built on Node's
// crypto module and does not run on Workers. This is the same job done with
// the primitives Workers actually has — the identical set Node exposes, so it
// is testable off-platform.
//
// Two specs:
//   RFC 8291 — Message Encryption for Web Push (aes128gcm)
//   RFC 8292 — VAPID, the signed assertion identifying the sender
//
// Getting this subtly wrong does not throw. It produces a body the push
// service accepts and the browser silently fails to decrypt, so nothing is
// delivered and nothing is reported. Every constant below is quoted from the
// spec for that reason, and the round-trip is covered by tests.

const enc = new TextEncoder()

// ── base64url ───────────────────────────────────────────────────────────────
export function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (String(s).length % 4)) % 4)
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64url(bytes) {
  let bin = ''
  const b = new Uint8Array(bytes)
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

// ── HKDF (RFC 5869), the shape RFC 8291 uses ────────────────────────────────
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8,
  )
  return new Uint8Array(bits)
}

// ── P-256 keys ──────────────────────────────────────────────────────────────
// A subscription's p256dh is an uncompressed point: 0x04 || X(32) || Y(32).
function pointToJwk(point, d) {
  const p = new Uint8Array(point)
  if (p.length !== 65 || p[0] !== 0x04) throw new Error('expected an uncompressed P-256 point')
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: bytesToB64url(p.slice(1, 33)),
    y: bytesToB64url(p.slice(33, 65)),
  }
  if (d) jwk.d = bytesToB64url(d)
  return jwk
}

async function importPublic(point) {
  return crypto.subtle.importKey('jwk', pointToJwk(point), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

/**
 * Encrypt a payload for one subscription (RFC 8291 §3, aes128gcm).
 *
 * @param plaintext Uint8Array — the JSON body the service worker will read
 * @param p256dh    the subscription's public key, base64url
 * @param auth      the subscription's auth secret, base64url
 * @returns Uint8Array — the complete request body, header included
 */
export async function encryptPayload(plaintext, p256dh, auth, opts = {}) {
  const uaPublic = b64urlToBytes(p256dh)
  const authSecret = b64urlToBytes(auth)
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16))

  // An ephemeral keypair per message, as the spec requires.
  const as = opts.asKeyPair || await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  )
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))

  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: await importPublic(uaPublic) }, as.privateKey, 256,
  ))

  // RFC 8291 §3.4. The label carries BOTH public keys, which is what binds the
  // ciphertext to this exact sender/receiver pair.
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, shared, keyInfo, 32)

  // RFC 8188 §2.2 — the content-encoding labels are NUL-terminated.
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // RFC 8188 §2: a single record, so the padding delimiter is 0x02 ("last").
  const padded = concat(plaintext, new Uint8Array([0x02]))
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, padded,
  ))

  // Header (RFC 8188 §2.1): salt(16) | record size(4, BE) | idlen(1) | keyid
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

// ── VAPID (RFC 8292) ────────────────────────────────────────────────────────
function jwtSegment(obj) {
  return bytesToB64url(enc.encode(JSON.stringify(obj)))
}

/**
 * The Authorization header value for one push endpoint.
 *
 * `aud` is the endpoint's ORIGIN, not the full URL — a JWT minted for the
 * wrong audience is rejected, and each push service is its own audience, so
 * this cannot be computed once and reused across endpoints.
 */
export async function vapidHeader({ endpoint, subject, publicKey, privateKey, now = Date.now() }) {
  const aud = new URL(endpoint).origin
  const header = { typ: 'JWT', alg: 'ES256' }
  // Twelve hours. The spec caps it at 24; shorter limits the damage if a
  // signed token is ever captured in a log.
  const body = { aud, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject }
  const signingInput = `${jwtSegment(header)}.${jwtSegment(body)}`

  // The VAPID private key is stored as the raw 32-byte scalar, the same form
  // web-push accepted, so the public point supplies x and y.
  const jwk = pointToJwk(b64urlToBytes(publicKey), b64urlToBytes(privateKey))
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput),
  ))

  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${publicKey}`
}
