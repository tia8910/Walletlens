import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addToInbox, readInbox, unreadCount, markAllRead, markRead, clearInbox, INBOX_MAX } from './notifyInbox'

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')

// The bell lists the notifications the app sent, not the alerts page.
describe('notifications inbox', () => {
  beforeEach(() => { localStorage.clear() })

  it('keeps the newest first with an unread count', () => {
    addToInbox({ title: 'BTC above $90,000', body: 'Up 3% today', channel: 'level', url: '/asset/?id=bitcoin' })
    addToInbox({ title: 'SEI 2 signal alert', channel: 'smart' })
    const list = readInbox()
    expect(list.map(x => x.title)).toEqual(['SEI 2 signal alert', 'BTC above $90,000'])
    expect(unreadCount(list)).toBe(2)
    markRead(list[0].id)
    expect(unreadCount()).toBe(1)
    markAllRead()
    expect(unreadCount()).toBe(0)
  })

  it('replaces a repeat of the same tag instead of stacking it', () => {
    addToInbox({ title: 'ETH move', tag: 'move-eth' })
    addToInbox({ title: 'ETH move', tag: 'move-eth', body: 'newer' })
    expect(readInbox()).toHaveLength(1)
    expect(readInbox()[0].body).toBe('newer')
  })

  it('caps its size and clears', () => {
    for (let i = 0; i < INBOX_MAX + 10; i++) addToInbox({ title: `n${i}` })
    expect(readInbox()).toHaveLength(INBOX_MAX)
    clearInbox()
    expect(readInbox()).toHaveLength(0)
  })

  it('ignores an item with no title', () => {
    expect(addToInbox({ body: 'x' })).toBe(null)
    expect(readInbox()).toHaveLength(0)
  })

  it('is written by every local notification and every server push', () => {
    const local = read('./localNotify.js')
    expect(local.indexOf('addToInbox(')).toBeLessThan(local.indexOf('if (!canNotify()) return false\n\n  const b = shell()'))
    const sw = read('../public/sw.js')
    expect(sw).toContain("indexedDB.open('wl-inbox', 1)")
    expect(sw).toMatch(/e\.waitUntil\(Promise\.all\(\[keepForInbox\(/)
    expect(sw).toContain("postMessage({ type: 'WL_PUSH' })")
  })

  it('opens from the bell instead of going to the alerts page', () => {
    const app = read('./App.jsx')
    expect(app).toContain('<NotificationBell alertsPath={{ path: homePath(true), state: { tab: \'alerts\' } }}')
    expect(app).not.toMatch(/wl-topbar-bell"\s*\n\s*onClick=\{\(\) => \{ navigate\(/)
  })
})

describe('inbox backfill', () => {
  beforeEach(() => { localStorage.clear() })
  it('imports smart and triggered price alerts already on record, once each, newest first', async () => {
    const { collectExisting, importItems } = await import('./notifyInbox')
    const now = Date.parse('2026-10-12T12:00:00Z')
    localStorage.setItem('wl_smart_alerts', JSON.stringify([{ id: 'sei:news,volume', coinId: 'sei-network', coinSymbol: 'SEI', signalCount: 2, firedAt: '2026-10-12T11:40:00Z', signals: [{ type: 'volume', desc: ['saVolume', 11] }, { type: 'news', desc: 'UK freezes $12M penthouse' }] }]))
    localStorage.setItem('walletlens_price_alerts', JSON.stringify([
      { id: 'p1', coin_id: 'bitcoin', coin_symbol: 'btc', condition: 'above', targetPrice: 84000, triggered: true, triggeredAt: '2026-10-10T09:00:00Z', triggeredPrice: 84120 },
      { id: 'p2', coin_id: 'solana', coin_symbol: 'sol', condition: 'below', targetPrice: 100, triggered: false },
    ]))
    const items = collectExisting(now)
    expect(items).toHaveLength(2)
    expect(importItems(items)).toBe(2)
    const list = readInbox()
    expect(list.map(x => x.title)).toEqual(['SEI: 2 signal alert', 'BTC rose above $84,000'])
    expect(list[0].body).toBe('Volume 11% of market cap · UK freezes $12M penthouse')
    expect(list[0].read).toBe(false)
    expect(list[1].read).toBe(true)
    expect(list[1].url).toBe('/asset/?id=bitcoin')
    // Running again imports nothing, and a cleared inbox stays cleared.
    clearInbox()
    expect(importItems(collectExisting(now))).toBe(0)
    expect(readInbox()).toHaveLength(0)
  })
})
