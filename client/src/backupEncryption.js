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

const MAGIC = 'WLE1' // format marker, so a future scheme can be told apart
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

/** True if a blob looks like our encrypted format, without trying to decrypt. */
export function isEncryptedBackup(payload) {
  return typeof payload === 'string' && payload.startsWith(MAGIC + '.')
}
