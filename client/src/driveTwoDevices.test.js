import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Two devices sharing one Drive, end to end: real encryption, real merge, a
// fake Drive that stamps versions with its own clock. Each case is a way a
// trade made on one device used to never reach the other.

const drive = vi.hoisted(() => ({ files: [], clock: 0 }))
const iso = (t) => new Date(t).toISOString()

vi.mock('./googleDrive', () => ({
  isDriveConfigured: () => true,
  signOut: () => {},
  getAccessToken: async () => 'token',
  storedAccessToken: () => 'token',
  findBackup: async () => {
    const f = [...drive.files].sort((a, b) => b.t - a.t)[0]
    return f ? { id: f.id, modifiedTime: iso(f.t) } : null
  },
  uploadBackup: async (content, id) => {
    drive.clock += 1000
    let f = id && drive.files.find(x => x.id === id)
    if (!f) { f = { id: `file${drive.files.length + 1}` }; drive.files.push(f) }
    f.content = content
    f.t = drive.clock
    return { id: f.id, modifiedTime: iso(f.t) }
  },
  downloadBackup: async (id) => drive.files.find(x => x.id === id).content,
}))

const {
  backupNow, autoBackup, autoRestore, restoreNow, rejoinSync, mergeFromDrive, syncPaused, PASS_MISMATCH,
} = await import('./driveSync')

const tx = (id, created_at, coin_id) => ({
  id, wallet_id: 1, type: 'buy', category: 'crypto', coin_id, coin_symbol: coin_id.toUpperCase(),
  coin_name: '', coin_image: '', amount: 1, price_per_unit: 1, total_cost: 1, exchange: '', notes: '',
  date: '2026-10-01', created_at,
})

// Each device is its own localStorage and its own clock.
const devices = {}
let current = null
const realNow = Date.now
function use(name, { clockOffsetMs = 0 } = {}) {
  if (current) devices[current] = { ...localStorage }
  localStorage.clear()
  for (const [k, v] of Object.entries(devices[name] || {})) localStorage.setItem(k, v)
  current = name
  Date.now = () => realNow() + clockOffsetMs
}
function holdings(name, txs) {
  use(name)
  localStorage.setItem('crypto_tracker_wallets', JSON.stringify([{ id: 1, name: 'Main' }]))
  localStorage.setItem('crypto_tracker_transactions', JSON.stringify(txs))
}
const coins = () => JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]').map(t => t.coin_id).sort()
const addTrade = (t) => {
  const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
  localStorage.setItem('crypto_tracker_transactions', JSON.stringify([t, ...txs]))
}

beforeEach(() => {
  drive.files = []
  drive.clock = realNow()
  for (const k of Object.keys(devices)) delete devices[k]
  current = null
  localStorage.clear()
})
afterEach(() => { Date.now = realNow })

describe('a trade on one device reaches the other', () => {
  it('even when the receiving phone\'s clock runs ten minutes fast', async () => {
    holdings('laptop', [tx(1, 'a', 'bitcoin')])
    await backupNow('correct horse battery')

    use('phone', { clockOffsetMs: 10 * 60_000 })
    await restoreNow('correct horse battery')
    expect(coins()).toEqual(['bitcoin'])

    use('laptop')
    addTrade(tx(2, 'b', 'ethereum'))
    expect((await autoBackup()).reason).toBe('backed-up')

    // The phone stamped its last sync with its own fast clock under the old
    // rule, so Drive's newer version looked older and was never pulled.
    use('phone', { clockOffsetMs: 10 * 60_000 })
    expect((await autoRestore()).reason).toBe('pulled')
    expect(coins()).toEqual(['bitcoin', 'ethereum'])
  })

  it('when a second device makes its own first backup, both keep each other\'s trades', async () => {
    holdings('laptop', [tx(1, 'a', 'bitcoin')])
    await backupNow('correct horse battery')

    // The phone already had a portfolio and backed up instead of restoring.
    // This used to re-key the file under a fresh key the laptop could not read.
    holdings('phone', [tx(1, 'p', 'solana')])
    await backupNow('correct horse battery')
    expect(coins()).toEqual(['bitcoin', 'solana'])

    use('laptop')
    addTrade(tx(2, 'b', 'ethereum'))
    expect((await autoBackup()).reason).toBe('backed-up')
    expect(coins()).toEqual(['bitcoin', 'ethereum', 'solana'])

    use('phone')
    expect((await autoRestore()).reason).toBe('pulled')
    expect(coins()).toEqual(['bitcoin', 'ethereum', 'solana'])
  })

  it('refuses a passphrase that does not open the existing backup, instead of forking it', async () => {
    holdings('laptop', [tx(1, 'a', 'bitcoin')])
    await backupNow('correct horse battery')
    const before = drive.files[0].content

    holdings('phone', [tx(1, 'p', 'solana')])
    await expect(backupNow('a different phrase')).rejects.toThrow(PASS_MISMATCH)
    expect(drive.files[0].content).toBe(before)
  })

  it('never overwrites a backup this device cannot read, and resumes with the passphrase', async () => {
    holdings('laptop', [tx(1, 'a', 'bitcoin')])
    await backupNow('correct horse battery')

    // Someone chose to replace the Drive backup with a new passphrase.
    holdings('phone', [tx(1, 'p', 'solana')])
    await backupNow('brand new phrase', { replace: true })
    const phoneCopy = drive.files[0].content

    use('laptop')
    addTrade(tx(2, 'b', 'ethereum'))
    expect((await autoBackup()).reason).toBe('key-mismatch')
    expect(drive.files[0].content).toBe(phoneCopy)
    expect(syncPaused()).toBe(true)

    await rejoinSync('brand new phrase')
    expect(syncPaused()).toBe(false)
    expect(coins()).toEqual(['bitcoin', 'ethereum', 'solana'])

    use('phone')
    expect((await autoRestore()).reason).toBe('pulled')
    expect(coins()).toEqual(['bitcoin', 'ethereum', 'solana'])
  })

  it('connecting a device that already has a portfolio merges Drive in, replacing nothing', async () => {
    holdings('laptop', [tx(1, 'a', 'bitcoin')])
    await backupNow('correct horse battery')

    holdings('phone', [tx(1, 'p', 'solana')])
    const { added } = await mergeFromDrive('correct horse battery')
    expect(added).toBe(1)
    expect(coins()).toEqual(['bitcoin', 'solana'])

    // The union went back up, so the laptop gets the phone's trade too.
    use('laptop')
    expect((await autoRestore()).reason).toBe('pulled')
    expect(coins()).toEqual(['bitcoin', 'solana'])
  })

  it('a device that synced before merges on reconnect with no passphrase', async () => {
    holdings('laptop', [tx(1, 'a', 'bitcoin')])
    await backupNow('correct horse battery')
    use('phone')
    await restoreNow('correct horse battery')
    addTrade(tx(2, 'p', 'solana'))
    use('laptop')
    addTrade(tx(2, 'b', 'ethereum'))
    await autoBackup()

    use('phone')
    await mergeFromDrive()
    expect(coins()).toEqual(['bitcoin', 'ethereum', 'solana'])
  })

  it('reads the newest file when an old duplicate is the one this device remembers', async () => {
    holdings('laptop', [tx(1, 'a', 'bitcoin')])
    await backupNow('correct horse battery')
    use('phone')
    await restoreNow('correct horse battery')

    // A second file appears (two devices once created one each) and the
    // laptop's newer trades land in it.
    use('laptop')
    drive.clock += 1000
    drive.files.push({ id: 'file2', content: drive.files[0].content, t: drive.clock })
    addTrade(tx(2, 'b', 'ethereum'))
    expect((await autoBackup()).reason).toBe('backed-up')
    expect(drive.files.find(f => f.id === 'file2').t).toBe(drive.clock)

    use('phone')
    expect(localStorage.getItem('wl_drive_file_id')).toBe('file1')
    expect((await autoRestore()).reason).toBe('pulled')
    expect(coins()).toEqual(['bitcoin', 'ethereum'])
  })
})
