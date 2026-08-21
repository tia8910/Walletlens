import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { BACKUP_KEYS, DEVICE_ONLY_KEYS, BACKUP_FIELDS } from './backupCore'

// Why this file exists: BACKUP_KEYS had drifted to 14 keys while the app grew
// to write far more. Goals, the watchlist, risk budgets and the P&L baseline
// were all being silently dropped on restore, so moving to a new phone lost
// them with no error and no warning. A list maintained by hand will drift
// again; this makes it fail loudly instead.

/** Every localStorage key the source writes, as a literal. */
function writtenKeys() {
  let out = ''
  try {
    out = execSync(
      `grep -rhoE "localStorage\\.setItem\\(\\s*'[^']+'" src || true`,
      { encoding: 'utf8' },
    )
  } catch { /* grep exits 1 on no match */ }
  const keys = new Set()
  for (const line of out.split('\n')) {
    const m = line.match(/'([^']+)'/)
    if (m) keys.add(m[1])
  }
  return keys
}

// Keys written through a constant or a helper rather than inline, plus ones
// created by tests. Listing them here is the explicit escape hatch.
const NOT_STATICALLY_VISIBLE = new Set([
  'vision_buckets',                 // written via saveData(KEY, …)
  'crypto_tracker_next_vision_id',  // written via bumpId(ID_KEY)
  'wl_goals',                       // written via saveGoals()
  'crypto_tracker_schema_version',  // written by the migration runner
])

describe('BACKUP_KEYS', () => {
  it('has no key in both lists', () => {
    const overlap = BACKUP_KEYS.filter(k => DEVICE_ONLY_KEYS.includes(k))
    expect(overlap).toEqual([])
  })

  it('has no duplicates', () => {
    expect(BACKUP_KEYS.length).toBe(new Set(BACKUP_KEYS).size)
    expect(DEVICE_ONLY_KEYS.length).toBe(new Set(DEVICE_ONLY_KEYS).size)
  })

  it('carries the profile data a new device needs', () => {
    // The ones that were actually missing, named so a future edit that drops
    // them fails here rather than in someone's restore.
    for (const k of [
      'crypto_tracker_transactions',
      'wl_goals', 'vision_buckets', 'wl_risk_budgets',
      'wl_watchlist', 'wl_watchlist_alerts',
      'wl_portfolio_baseline', 'wl_guardian',
    ]) {
      expect(BACKUP_KEYS, `${k} must survive a restore`).toContain(k)
    }
  })

  it('never carries device-bound credentials off the device', () => {
    // Restoring a WebAuthn credential elsewhere yields one that cannot
    // authenticate; restoring the enabled flag without it can lock the user out.
    for (const k of ['wl_biometric_cred', 'wl_biometric_enabled', 'wl_admin_mail_token']) {
      expect(BACKUP_KEYS, `${k} must not leave the device`).not.toContain(k)
    }
  })

  it('never puts the Drive decryption key inside a backup', () => {
    // A backup code carries the whole portfolio. wl_drive_data_key decrypts
    // the Drive backup, and the code is not always encrypted — including it
    // would ship the lock next to the door. The passphrase is the only
    // intended way for another device to recover that key.
    expect(BACKUP_KEYS).not.toContain('wl_drive_data_key')
    expect(BACKUP_KEYS).not.toContain('wl_drive_wrap')
  })

  it('classifies every key the app writes', () => {
    const known = new Set([...BACKUP_KEYS, ...DEVICE_ONLY_KEYS, ...NOT_STATICALLY_VISIBLE])
    const unclassified = [...writtenKeys()]
      .filter(k => k.startsWith('wl_') || k.startsWith('crypto_tracker'))
      // Caches, throttles and one-shot markers rebuild themselves.
      .filter(k => !/(_at$|_ts$|_seen|_dismiss|cache|_shown|session|_v1$|sync|review|twa|intent|welcomed|started|_diag|payload|_done$)/.test(k))
      .filter(k => !known.has(k))

    expect(unclassified,
      'new localStorage keys must be added to BACKUP_KEYS or DEVICE_ONLY_KEYS'
    ).toEqual([])
  })

  it('is written and read from the same table', () => {
    // The original bug: generateBackupCode and applyBackupCode each carried
    // their own hand-typed copy of the alias map, so a field added to one was
    // missing from the other. Both must iterate BACKUP_FIELDS.
    const src = readFileSync('src/backupCore.js', 'utf8')
    const gen = src.split('export async function generateBackupCode')[1].split('\nexport ')[0]
    const app = src.split('export async function applyBackupCode')[1].split('\nexport ')[0]
    expect(gen, 'generateBackupCode must iterate BACKUP_FIELDS').toContain('Object.entries(BACKUP_FIELDS)')
    expect(app, 'applyBackupCode must iterate BACKUP_FIELDS').toContain('Object.entries(BACKUP_FIELDS)')
    expect(src, 'no hand-maintained alias map should remain').not.toMatch(/const OPT = \{/)
  })

  it('has unique, stable aliases', () => {
    const aliases = Object.keys(BACKUP_FIELDS)
    expect(aliases.length).toBe(new Set(aliases).size)
    expect(new Set(Object.values(BACKUP_FIELDS)).size).toBe(aliases.length)
    // Codes already in the wild decode with these. Changing what one means
    // silently restores the wrong data into the wrong place.
    const frozen = { ct: 'crypto_tracker_coin_targets', cn: 'crypto_tracker_coin_notes',
      mp: 'crypto_tracker_manual_prices', st: 'wl_settings', cv: 'wl_card_vis',
      ex: 'crypto_tracker_exchanges', gd: 'wl_guardian', gi: 'wl_guardian_device_id' }
    for (const [a, k] of Object.entries(frozen)) expect(BACKUP_FIELDS[a]).toBe(k)
  })
})

describe('round trip', () => {
  it('carries goals, watchlist and budgets through generate and apply', async () => {
    const { generateBackupCode, applyBackupCode } = await import('./backupCore')
    localStorage.clear()

    const before = {
      crypto_tracker_transactions: JSON.stringify([
        { id: 1, coin_id: 'bitcoin', coin_symbol: 'BTC', amount: 0.5, price: 60000, type: 'buy' },
        { id: 2, coin_id: 'gold', coin_symbol: 'XAU', amount: 2, price: 4000, type: 'buy', category: 'metals' },
      ]),
      crypto_tracker_wallets: JSON.stringify([{ id: 1, name: 'Main' }]),
      wl_goals: JSON.stringify([{ id: 1, label: 'One million', target: 1000000 }]),
      vision_buckets: JSON.stringify([{ id: 1, name: 'Retirement' }]),
      wl_watchlist: JSON.stringify(['ethereum', 'solana']),
      wl_risk_budgets: JSON.stringify({ crypto: 60 }),
      wl_portfolio_baseline: JSON.stringify({ value: 75000 }),
      wl_guardian: JSON.stringify({ email: 'heir@example.com' }),
      wl_theme: 'emerald',
      // Must NOT travel.
      wl_biometric_cred: 'device-bound-credential',
    }
    for (const [k, v] of Object.entries(before)) localStorage.setItem(k, v)

    const { code } = await generateBackupCode()
    localStorage.clear()
    await applyBackupCode(code)

    for (const k of Object.keys(before)) {
      if (k === 'wl_biometric_cred') continue
      expect(localStorage.getItem(k), `${k} should survive`).toBeTruthy()
    }
    expect(JSON.parse(localStorage.getItem('wl_goals'))[0].target).toBe(1000000)
    expect(JSON.parse(localStorage.getItem('wl_watchlist'))).toEqual(['ethereum', 'solana'])
    expect(localStorage.getItem('wl_theme')).toBe('emerald')
    // The metals row must come back as metals, not silently defaulted to crypto.
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions'))
    expect(txs.find(t => t.coin_symbol === 'XAU').category).toBe('metals')
    expect(localStorage.getItem('wl_biometric_cred'), 'credential must stay on the old device').toBeNull()
  })
})
