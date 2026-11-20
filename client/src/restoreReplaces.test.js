import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateBackupCode, applyBackupCode } from './backupCore'

// A restore from Drive (or a backup code) REPLACES this device's data with the
// backup's. The account restored is exactly the one backed up: nothing that
// was on this device before stays mixed in.

const tx = (id, coin) => ({ id, wallet_id: 1, type: 'buy', coin_id: coin, coin_symbol: coin.toUpperCase(), amount: 1, price_per_unit: 1, total_cost: 1, date: '2026-01-01' })

describe('restoring replaces the data on this device', () => {
  beforeEach(() => localStorage.clear())

  it('swaps in the backup\'s trades, wallets and targets, and drops what it does not have', async () => {
    // The account that was backed up: one BTC trade, no targets, no goals.
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([tx(1, 'bitcoin')]))
    localStorage.setItem('crypto_tracker_wallets', JSON.stringify([{ id: 1, name: 'Main' }]))
    localStorage.setItem('wl_lang', 'ar')
    const { code } = await generateBackupCode()

    // This device before the restore: other trades, a target, a goal.
    localStorage.clear()
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([tx(7, 'solana'), tx(8, 'aptos')]))
    localStorage.setItem('crypto_tracker_wallets', JSON.stringify([{ id: 1, name: 'Phone' }, { id: 2, name: 'Old' }]))
    localStorage.setItem('crypto_tracker_coin_targets', JSON.stringify({ solana: { targets: [{ id: 1, price: 500 }] } }))
    localStorage.setItem('wl_goals', JSON.stringify([{ id: 1, name: 'Car' }]))
    localStorage.setItem('wl_theme', 'dark')

    await applyBackupCode(code)

    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions'))
    expect(txs.map(t => t.coin_id)).toEqual(['bitcoin'])
    expect(JSON.parse(localStorage.getItem('crypto_tracker_wallets')).map(w => w.name)).toEqual(['Main'])
    // Portfolio data the backup did not have is gone, not left over.
    expect(localStorage.getItem('crypto_tracker_coin_targets')).toBeNull()
    expect(localStorage.getItem('wl_goals')).toBeNull()
    // The backup's own preference comes with it; this device's theme stays.
    expect(localStorage.getItem('wl_lang')).toBe('ar')
    expect(localStorage.getItem('wl_theme')).toBe('dark')
  })

  it('restores from Drive on connect instead of merging when this device has data', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'components/DriveBackup.jsx'), 'utf8')
    const ask = src.slice(src.indexOf("else if (next === 'ask')"), src.indexOf("else say('ok', t('dbUpToDate'))"))
    expect(ask).toMatch(/restoreNow\(\)/)
    expect(ask).not.toMatch(/mergeFromDrive/)
    expect(ask).toMatch(/ask\('restore'\)/)
  })
})
