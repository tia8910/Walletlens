// Client-side encryption for cloud backups.
//
// Named "encryption", not "crypto": in this codebase crypto means coins. This
// file has nothing to do with asset classes. It encrypts the whole backup,
// whatever is in it.
//
// The whole point of putting a backup in the user's own Drive is that nobody
// else can read it, and that has to include us and Google. So the snapshot is
// encrypted here, in the browser, before it ever leaves the device. What lands
// in Drive is opaque bytes.
//
// AES-GCM with a key stretched from the passphrase by PBKDF2-SHA256. GCM is
// authenticated, so a corrupted or tampered file fails to decrypt rather than
// silently restoring garbage over someone's portfolio.
//
// The consequence, stated plainly because it cannot be worked around: lose the
// passphrase and the backup is gone. There is no reset. Callers must say so
// before asking anyone to choose one.

// ── Two formats ────────────────────────────────────────────────────────────
//
// WLE1 derives the encryption key straight from the passphrase. Simple, and
// fine for a backup a person types a passphrase to make — but it means the
// passphrase is required for every upload, which is why unattended backups
// were impossible.
//
// WLE2 is envelope encryption. A random data key encrypts the backup, and that
// data key is then wrapped with the passphrase and stored alongside. Two
// things follow:
//
//   • Anyone holding the data key can decrypt without the passphrase. That is
//     what lets the app back up on its own.
//   • The passphrase still recovers the data key from the file itself, so a
//     backup restores on a device that has never seen this one.
//
// The device keeps a copy of the data key in localStorage. That sounds like it
// gives the encryption away, and it would if the ciphertext lived there too —
// but it does not, it lives in Drive. On the device the portfolio is already
// in localStorage in the clear, so anyone able to read the stored key could
// simply read the portfolio instead. What the encryption is actually for is
// keeping Google, and anyone who gets hold of the file, from reading it, and a
// key held on the user's own device does nothing to weaken that.
//
// WLE1 files still decrypt, so backups written before this exist keep working.

const MAGIC = 'WLE1' // format marker, so a future scheme can be told apart
const MAGIC2 = 'WLE2' // envelope format: random data key, wrapped by passphrase
const KEY_BYTES = 32 // AES-256
const ITERATIONS = 210_000 // OWASP's 2023 floor for PBKDF2-SHA256
const SALT_BYTES = 16
const IV_BYTES = 12 // 96 bits, the size GCM is specified for

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64(bytes) {
  let s = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s)
}

function unb64(str) {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypt a backup string.
 *
 * A fresh salt and IV per call, both stored alongside the ciphertext. Reusing
 * an IV with the same key breaks GCM badly, so they are never derived from
 * anything predictable.
 *
 * @returns {Promise<string>} "WLE1.<salt>.<iv>.<ciphertext>", all base64
 */
export async function encryptBackup(plaintext, passphrase) {
  if (!passphrase) throw new Error('A passphrase is required')
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return [MAGIC, b64(salt), b64(iv), b64(ct)].join('.')
}

/**
 * Decrypt a backup produced by encryptBackup.
 *
 * Throws on a wrong passphrase — GCM's auth tag fails rather than returning
 * plausible-looking rubbish, which is exactly what we want before overwriting
 * somebody's transactions.
 */
export async function decryptBackup(payload, passphrase) {
  const parts = String(payload || '').split('.')

  // Envelope files: recover the data key with the passphrase, then use it.
  // This is the path a restore onto a brand-new device takes — it has no
  // stored key, only whatever the person can type.
  if (parts[0] === MAGIC2) {
    const raw = await unwrapDataKey(payload, passphrase)
    return decryptBackupWithKey(payload, raw)
  }

  if (parts.length !== 4 || parts[0] !== MAGIC) {
    throw new Error('This does not look like a WalletLens encrypted backup')
  }
  const [, saltB64, ivB64, ctB64] = parts
  const key = await deriveKey(passphrase, unb64(saltB64))
  let plain
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64))
  } catch {
    throw new Error('Wrong passphrase, or the backup file is damaged')
  }
  return dec.decode(plain)
}

/** True if a blob looks like one of our encrypted formats. */
export function isEncryptedBackup(payload) {
  return typeof payload === 'string'
    && (payload.startsWith(MAGIC + '.') || payload.startsWith(MAGIC2 + '.'))
}

/** A fresh random data key, as raw bytes. */
export function newDataKey() {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES))
}

/** Raw key bytes <-> the base64 form we keep in storage. */
export function dataKeyToString(raw) { return b64(raw) }
export function dataKeyFromString(s) { return unb64(String(s || '')) }

async function importDataKey(raw, usages) {
  return crypto.subtle.importKey('raw', new Uint8Array(raw), { name: 'AES-GCM' }, false, usages)
}

/**
 * Encrypt with a data key, and wrap that key with the passphrase so the file
 * can still be opened by someone who only knows the passphrase.
 *
 * @returns {Promise<string>} "WLE2.<iv>.<ct>.<salt>.<wrapIv>.<wrappedKey>"
 */
export async function encryptBackupEnvelope(plaintext, rawKey, passphrase) {
  if (!passphrase) throw new Error('A passphrase is required')
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await importDataKey(rawKey, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))

  // Wrap the data key. Same PBKDF2 cost as WLE1 — this is the only thing
  // standing between a stolen Drive file and the portfolio inside it.
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const wrapKey = await deriveKey(passphrase, salt)
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv }, wrapKey, new Uint8Array(rawKey))

  return [MAGIC2, b64(iv), b64(ct), b64(salt), b64(wrapIv), b64(wrapped)].join('.')
}

/**
 * The passphrase-wrapped key portion of a WLE2 file, as an opaque string.
 *
 * Kept so an unattended backup can rewrite the body while carrying the same
 * wrapped key across untouched. Without this an automatic upload would have to
 * either re-wrap — impossible, it has no passphrase — or drop the wrap, which
 * would quietly turn the backup into something only this one device could ever
 * open. That is the opposite of what a backup is for.
 */
export function wrapBlockOf(payload) {
  const parts = String(payload || '').split('.')
  if (parts.length !== 6 || parts[0] !== MAGIC2) return null
  return parts.slice(3).join('.')
}

/** Re-encrypt with the same data key and an existing wrap block. */
export async function encryptBackupWithWrap(plaintext, rawKey, wrapBlock) {
  const wrap = String(wrapBlock || '')
  if (wrap.split('.').length !== 3) throw new Error('A wrapped key is required')
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await importDataKey(rawKey, ['encrypt'])
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return [MAGIC2, b64(iv), b64(ct), wrap].join('.')
}

/** Recover the data key from a WLE2 file using the passphrase. */
export async function unwrapDataKey(payload, passphrase) {
  const parts = String(payload || '').split('.')
  if (parts.length !== 6 || parts[0] !== MAGIC2) {
    throw new Error('This backup has no wrapped key to recover')
  }
  const [, , , saltB64, wrapIvB64, wrappedB64] = parts
  const wrapKey = await deriveKey(passphrase, unb64(saltB64))
  try {
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(wrapIvB64) }, wrapKey, unb64(wrappedB64))
    return new Uint8Array(raw)
  } catch {
    throw new Error('Wrong passphrase, or the backup file is damaged')
  }
}

/** Decrypt a WLE2 file with the data key, no passphrase involved. */
export async function decryptBackupWithKey(payload, rawKey) {
  const parts = String(payload || '').split('.')
  if (parts.length !== 6 || parts[0] !== MAGIC2) {
    throw new Error('This does not look like a WalletLens envelope backup')
  }
  const key = await importDataKey(rawKey, ['decrypt'])
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(parts[1]) }, key, unb64(parts[2]))
    return dec.decode(plain)
  } catch {
    throw new Error('That backup could not be opened with this device\'s key')
  }
}
