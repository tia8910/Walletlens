import { describe, it, expect, beforeEach, vi } from 'vitest'
import { canAutoBackup, decideAction, hasLocalPortfolio } from './driveSync'
import { encryptBackup, decryptBackup, isEncryptedBackup } from './backupEncryption'

// Drive I/O is mocked away; what matters here is the one decision that can
// destroy data, and that the encryption round trips.
vi.mock('./googleDrive', () => ({
  isDriveConfigured: () => true,
  getAccessToken: vi.fn(),
  findBackup: vi.fn(),
  uploadBackup: vi.fn(),
  downloadBackup: vi.fn(),
}))

const remote = (iso) => ({ id: 'f1', modifiedTime: iso })

beforeEach(() => localStorage.clear())

describe('decideAction', () => {
  it('auto-restores only onto a device with no portfolio', () => {
    expect(decideAction({ hasLocal: false, remote: remote('2026-08-01T00:00:00Z') }))
      .toBe('auto-restore')
  })

  it('never auto-restores over existing data', () => {
    // The whole point: silently replacing a populated device would destroy a
    // portfolio, and there is no undo.
    const action = decideAction({ hasLocal: true, remote: remote('2026-08-01T00:00:00Z') })
    expect(action).not.toBe('auto-restore')
    expect(action).toBe('ask')
  })

  it('offers a first backup when Drive is empty', () => {
    expect(decideAction({ hasLocal: true, remote: null })).toBe('first-backup')
    expect(decideAction({ hasLocal: false, remote: null })).toBe('first-backup')
  })

  it('says nothing to do when this device wrote the newest copy', () => {
    const lastBackupAt = Date.parse('2026-08-02T00:00:00Z')
    expect(decideAction({ hasLocal: true, remote: remote('2026-08-01T00:00:00Z'), lastBackupAt }))
      .toBe('up-to-date')
  })

  it('asks when the remote copy is newer than our last upload', () => {
    const lastBackupAt = Date.parse('2026-08-01T00:00:00Z')
    expect(decideAction({ hasLocal: true, remote: remote('2026-08-02T00:00:00Z'), lastBackupAt }))
      .toBe('ask')
  })
})

describe('hasLocalPortfolio', () => {
  it('is false on a fresh install', () => {
    expect(hasLocalPortfolio()).toBe(false)
    localStorage.setItem('crypto_tracker_transactions', '[]')
    expect(hasLocalPortfolio()).toBe(false)
  })

  it('is true once there are transactions', () => {
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([{ id: 1 }]))
    expect(hasLocalPortfolio()).toBe(true)
  })

  it('treats unreadable data as present, not absent', () => {
    // Failing to parse is not evidence the device is empty. Guessing "empty"
    // here would hand decideAction an auto-restore over real data.
    localStorage.setItem('crypto_tracker_transactions', '{ this is not json')
    expect(hasLocalPortfolio()).toBe(true)
  })
})

describe('backup encryption', () => {
  it('round trips', async () => {
    const secret = 'WL3-abc123-a-portfolio'
    const blob = await encryptBackup(secret, 'correct horse battery staple')
    expect(blob).not.toContain(secret)
    expect(isEncryptedBackup(blob)).toBe(true)
    expect(await decryptBackup(blob, 'correct horse battery staple')).toBe(secret)
  })

  it('refuses the wrong passphrase instead of returning rubbish', async () => {
    const blob = await encryptBackup('WL3-payload', 'right')
    await expect(decryptBackup(blob, 'wrong')).rejects.toThrow(/passphrase|damaged/i)
  })

  it('detects tampering', async () => {
    // GCM is authenticated, so a flipped byte fails loudly rather than
    // restoring corrupted transactions over a real portfolio.
    const blob = await encryptBackup('WL3-payload', 'pw')
    const parts = blob.split('.')
    const ct = [...atob(parts[3])]
    ct[0] = String.fromCharCode(ct[0].charCodeAt(0) ^ 0xff)
    parts[3] = btoa(ct.join(''))
    await expect(decryptBackup(parts.join('.'), 'pw')).rejects.toThrow()
  })

  it('uses a fresh salt and IV every time', async () => {
    // Reusing an IV under the same key breaks GCM badly.
    const a = await encryptBackup('same', 'pw')
    const b = await encryptBackup('same', 'pw')
    expect(a.split('.')[1]).not.toBe(b.split('.')[1])
    expect(a.split('.')[2]).not.toBe(b.split('.')[2])
    expect(a).not.toBe(b)
  })

  it('rejects a blob that is not ours', async () => {
    await expect(decryptBackup('not-a-backup', 'pw')).rejects.toThrow(/WalletLens encrypted backup/)
    expect(isEncryptedBackup('WL3-plain-code')).toBe(false)
  })
})

describe('latestBackupAt', () => {
  it('describes the Drive copy, not this device history', async () => {
    // The bug this replaces: a second browser has never uploaded, so
    // lastBackupAt is 0 and the panel announced "no backup yet" while the
    // Restore button for that very backup sat next to the sentence.
    const { latestBackupAt } = await import('./driveSync')
    const remoteAt = Date.parse('2026-07-30T00:00:00Z')
    expect(latestBackupAt({ remoteAt, lastBackupAt: 0 })).toBe(remoteAt)
  })

  it('prefers the remote time over a local restore stamp', async () => {
    // restoreNow() also writes lastBackupAt. Taking the newer of the two would
    // report "backup just now" on a device that just pulled down a week-old
    // one, which is the opposite of true.
    const { latestBackupAt } = await import('./driveSync')
    const remoteAt = Date.parse('2026-07-26T00:00:00Z')
    expect(latestBackupAt({ remoteAt, lastBackupAt: Date.now() })).toBe(remoteAt)
  })

  it('falls back to a local upload from before remote times were stored', async () => {
    const { latestBackupAt } = await import('./driveSync')
    expect(latestBackupAt({ remoteAt: 0, lastBackupAt: 1754000000000 })).toBe(1754000000000)
    expect(latestBackupAt({ remoteAt: 0, lastBackupAt: 0 })).toBe(0)
  })
})

describe('knownBackup', () => {
  it('is null until a file id is known', async () => {
    const { knownBackup } = await import('./driveSync')
    expect(knownBackup({ fileId: null, remoteAt: 0, lastBackupAt: 0 })).toBe(null)
  })

  it('survives a reload so the panel does not forget the backup exists', async () => {
    const { knownBackup } = await import('./driveSync')
    const at = Date.parse('2026-07-30T00:00:00Z')
    expect(knownBackup({ fileId: 'f1', remoteAt: at, lastBackupAt: 0 })).toEqual({ id: 'f1', at })
  })
})

describe('previouslyConnected', () => {
  it('is false on a device that has never connected', async () => {
    const { previouslyConnected } = await import('./driveSync')
    expect(previouslyConnected({ fileId: null, lastBackupAt: 0 })).toBe(false)
  })

  it('is true from either surviving marker', async () => {
    // The access token is memory-only and always gone after a reload, so it
    // cannot be the signal. These two persist and are what "already connected"
    // actually means.
    const { previouslyConnected } = await import('./driveSync')
    expect(previouslyConnected({ fileId: 'abc', lastBackupAt: 0 })).toBe(true)
    expect(previouslyConnected({ fileId: null, lastBackupAt: 1754000000000 })).toBe(true)
  })
})


describe('canAutoBackup', () => {
  // This gate is why "I connected Drive and nothing backs up" was true.
  // Connecting alone satisfies none of it: the data key and wrap block are
  // written by the first passphrase-protected backup, so until one happens
  // every automatic run returns 'no-key' and does nothing, silently.
  const connect = () => localStorage.setItem('wl_drive_file_id', 'f1')
  const key = 'paWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaU='  // base64 of 32 raw bytes, as dataKeyToString writes it
  const wrap = 'salt.iv.wrapped'

  it('is false after merely connecting', () => {
    connect()
    expect(canAutoBackup()).toBe(false)
  })

  it('is false with a data key but no wrap block', () => {
    // The wrap is what keeps the backup recoverable by passphrase on another
    // device. Backing up without one would produce a file only this phone
    // could ever read.
    connect()
    localStorage.setItem('wl_drive_data_key', key)
    expect(canAutoBackup()).toBe(false)
  })

  it('is false with a key and wrap but no prior upload', () => {
    localStorage.setItem('wl_drive_data_key', key)
    localStorage.setItem('wl_drive_wrap', wrap)
    expect(canAutoBackup()).toBe(false)
  })

  it('is true once a first backup has completed', () => {
    connect()
    localStorage.setItem('wl_drive_data_key', key)
    localStorage.setItem('wl_drive_wrap', wrap)
    expect(canAutoBackup()).toBe(true)
  })

  it('stays false if the wrap was stored empty', () => {
    // backupNow writes `wrapBlockOf(payload) || ''`. An empty string is falsy,
    // so a malformed envelope would disable automatic backups permanently and
    // without a word — worth pinning, since nothing else would notice.
    connect()
    localStorage.setItem('wl_drive_data_key', key)
    localStorage.setItem('wl_drive_wrap', '')
    expect(canAutoBackup()).toBe(false)
  })
})
