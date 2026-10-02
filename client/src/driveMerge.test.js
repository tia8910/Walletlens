import { describe, it, expect, beforeEach } from 'vitest'
import { mergeBackupCode, generateBackupCode } from './backupCore'
import { saveData, loadData, TX_DELETED_KEY } from './data/storage'

// Two devices that both changed something used to stop syncing (or the next
// upload overwrote the other's trades). Now their copies are merged.
const tx = (id, created_at, coin_id, wallet_id = 1) => ({ id, wallet_id, type: 'buy', category: 'crypto', coin_id, coin_symbol: coin_id.toUpperCase(), coin_name: '', coin_image: '', amount: 1, price_per_unit: 1, total_cost: 1, exchange: '', notes: '', date: '2026-10-01', created_at })

async function remoteCodeWith(txs, ws, deleted = []) {
  const keep = { ...localStorage }
  localStorage.clear()
  localStorage.setItem('crypto_tracker_transactions', JSON.stringify(txs))
  localStorage.setItem('crypto_tracker_wallets', JSON.stringify(ws))
  if (deleted.length) localStorage.setItem(TX_DELETED_KEY, JSON.stringify(deleted))
  const { code } = await generateBackupCode()
  localStorage.clear()
  for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v)
  return code
}

describe('syncing two devices that both changed', () => {
  beforeEach(() => localStorage.clear())

  it('keeps both sides\' trades, even when their ids collide', async () => {
    localStorage.setItem('crypto_tracker_wallets', JSON.stringify([{ id: 1, name: 'Main' }]))
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([tx(1, 'a', 'bitcoin'), tx(2, 'b', 'ethereum')]))
    const code = await remoteCodeWith([tx(1, 'a', 'bitcoin'), tx(2, 'c', 'solana')], [{ id: 1, name: 'Main' }])
    const res = await mergeBackupCode(code)
    expect(res.added).toBe(1)
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions'))
    expect(txs.map(t => t.coin_id).sort()).toEqual(['bitcoin', 'ethereum', 'solana'])
    expect(new Set(txs.map(t => t.id)).size).toBe(3)
  })

  it('maps the other device\'s wallets by name', async () => {
    localStorage.setItem('crypto_tracker_wallets', JSON.stringify([{ id: 1, name: 'Main' }]))
    localStorage.setItem('crypto_tracker_transactions', '[]')
    const code = await remoteCodeWith([tx(1, 'x', 'bitcoin', 7), tx(2, 'y', 'solana', 1)], [{ id: 7, name: 'Main' }, { id: 1, name: 'Binance' }])
    await mergeBackupCode(code)
    const ws = JSON.parse(localStorage.getItem('crypto_tracker_wallets'))
    expect(ws.map(w => w.name).sort()).toEqual(['Binance', 'Main'])
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions'))
    expect(txs.find(t => t.coin_id === 'bitcoin').wallet_id).toBe(1)
    expect(txs.find(t => t.coin_id === 'solana').wallet_id).toBe(ws.find(w => w.name === 'Binance').id)
  })

  it('a trade deleted on either device stays deleted', async () => {
    localStorage.setItem('crypto_tracker_wallets', JSON.stringify([{ id: 1, name: 'Main' }]))
    saveData('transactions', [tx(1, 'a', 'bitcoin'), tx(2, 'b', 'ethereum')])
    saveData('transactions', [tx(1, 'a', 'bitcoin')]) // deleted ethereum here
    expect(JSON.parse(localStorage.getItem(TX_DELETED_KEY))).toEqual(['c:b'])
    const code = await remoteCodeWith([tx(1, 'a', 'bitcoin'), tx(2, 'b', 'ethereum'), tx(3, 'd', 'solana')], [{ id: 1, name: 'Main' }], ['c:a'])
    await mergeBackupCode(code)
    const coins = JSON.parse(localStorage.getItem('crypto_tracker_transactions')).map(t => t.coin_id)
    expect(coins).toEqual(['solana'])
  })

  it('every save of the portfolio asks for a backup', () => {
    let fired = 0
    const on = () => fired++
    window.addEventListener('wl:data-saved', on)
    saveData('transactions', [])
    saveData('wallets', [])
    saveData('manual_prices', {})
    window.removeEventListener('wl:data-saved', on)
    expect(fired).toBe(2)
    expect(loadData('transactions')).toEqual([])
  })
})
