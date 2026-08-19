// The envelope format exists so a backup can be written without a passphrase
// and still be opened with one somewhere else. Both halves of that sentence
// are load-bearing: drop the first and automatic backups are impossible, drop
// the second and the backup is worthless on the device you actually need it on
// — a new one, because the old one is lost.
//
// These tests exercise the real WebCrypto, not a mock. A stub here would prove
// only that the functions were called.

import { describe, it, expect } from 'vitest'
import {
  encryptBackup, encryptBackupEnvelope, encryptBackupWithWrap,
  decryptBackup, decryptBackupWithKey, unwrapDataKey, wrapBlockOf,
  isEncryptedBackup, newDataKey, dataKeyToString, dataKeyFromString,
} from './backupEncryption'

const PASS = 'a passphrase nobody guesses'
const DATA = JSON.stringify({ txs: [{ symbol: 'BTC', amount: 0.5 }] })

describe('envelope backups', () => {
  it('opens with either the data key or the passphrase', async () => {
    const key = newDataKey()
    const payload = await encryptBackupEnvelope(DATA, key, PASS)

    expect(await decryptBackupWithKey(payload, key)).toBe(DATA)
    expect(await decryptBackup(payload, PASS)).toBe(DATA)
  })

  it('survives an automatic rewrite with no passphrase in sight', async () => {
    // This is the whole feature: the second upload is made by a timer that
    // has no passphrase, and the result must still restore on a new device.
    const key = newDataKey()
    const manual = await encryptBackupEnvelope('first', key, PASS)
    const wrap = wrapBlockOf(manual)

    const automatic = await encryptBackupWithWrap('second, written by a timer', key, wrap)

    expect(await decryptBackupWithKey(automatic, key)).toBe('second, written by a timer')
    expect(await decryptBackup(automatic, PASS)).toBe('second, written by a timer')
  })

  it('never reuses an IV across rewrites', async () => {
    // Reusing an IV with the same key breaks GCM outright, and automatic
    // backups rewrite the same file with the same key over and over.
    const key = newDataKey()
    const first = await encryptBackupEnvelope(DATA, key, PASS)
    const wrap = wrapBlockOf(first)
    const ivs = new Set([first.split('.')[1]])
    for (let i = 0; i < 25; i++) {
      ivs.add((await encryptBackupWithWrap(DATA + i, key, wrap)).split('.')[1])
    }
    expect(ivs.size).toBe(26)
  })

  it('rejects the wrong passphrase rather than returning rubbish', async () => {
    const payload = await encryptBackupEnvelope(DATA, newDataKey(), PASS)
    await expect(decryptBackup(payload, 'not it')).rejects.toThrow(/Wrong passphrase/)
    await expect(unwrapDataKey(payload, 'not it')).rejects.toThrow(/Wrong passphrase/)
  })

  it('rejects the wrong data key', async () => {
    const payload = await encryptBackupEnvelope(DATA, newDataKey(), PASS)
    await expect(decryptBackupWithKey(payload, newDataKey())).rejects.toThrow()
  })

  it('refuses to write an envelope with no wrapped key', async () => {
    // Without a wrap the file opens only on the device that wrote it, which
    // silently turns a backup into a single point of failure.
    await expect(encryptBackupWithWrap(DATA, newDataKey(), '')).rejects.toThrow(/wrapped key/)
    await expect(encryptBackupEnvelope(DATA, newDataKey(), '')).rejects.toThrow(/passphrase/)
  })

  it('still reads the old passphrase-only format', async () => {
    // Backups written before the envelope existed are sitting in people's
    // Drives right now.
    const legacy = await encryptBackup(DATA, PASS)
    expect(legacy.startsWith('WLE1.')).toBe(true)
    expect(await decryptBackup(legacy, PASS)).toBe(DATA)
    expect(isEncryptedBackup(legacy)).toBe(true)
  })

  it('recognises both formats and nothing else', async () => {
    expect(isEncryptedBackup(await encryptBackupEnvelope(DATA, newDataKey(), PASS))).toBe(true)
    expect(isEncryptedBackup('{"just":"json"}')).toBe(false)
    expect(isEncryptedBackup('')).toBe(false)
    expect(isEncryptedBackup(null)).toBe(false)
  })

  it('round-trips the stored key form', async () => {
    const key = newDataKey()
    const restored = dataKeyFromString(dataKeyToString(key))
    expect(Array.from(restored)).toEqual(Array.from(key))
    // and it still decrypts after the storage round trip
    const payload = await encryptBackupEnvelope(DATA, key, PASS)
    expect(await decryptBackupWithKey(payload, restored)).toBe(DATA)
  })

  it('gives no wrap block for a legacy file', async () => {
    expect(wrapBlockOf(await encryptBackup(DATA, PASS))).toBeNull()
    expect(wrapBlockOf('nonsense')).toBeNull()
  })
})
