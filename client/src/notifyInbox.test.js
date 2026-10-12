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

describe('bell feeds: WalletLens updates and news', () => {
  beforeEach(() => { localStorage.clear() })
  const now = Date.parse('2026-10-12T12:00:00Z')

  it('uses the reader\'s language when the update has it', async () => {
    const { collectAnnouncements } = await import('./notifyInbox')
    const json = { items: [{ id: 'z', kind: 'feature', date: '2026-10-12', title: 'Hello', body: 'World', i18n: { ar: { title: 'مرحبا', body: 'عالم' } } }] }
    expect(collectAnnouncements(json, now, 'ar')[0]).toMatchObject({ title: 'مرحبا', body: 'عالم' })
    expect(collectAnnouncements(json, now, 'de')[0]).toMatchObject({ title: 'Hello', body: 'World' })
  })

  it('turns announcements into update items, unread for a week', async () => {
    const { collectAnnouncements } = await import('./notifyInbox')
    const items = collectAnnouncements({ items: [
      { id: 'a', kind: 'feature', date: '2026-10-11', title: 'All your notifications in one place', url: '/dashboard' },
      { id: 'b', kind: 'update', date: '2026-09-01', title: 'Old one' },
      { kind: 'feature', title: 'no id, skipped' },
    ] }, now)
    expect(items.map(x => [x.key, x.channel, x.read])).toEqual([['ann:a', 'feature', false], ['ann:b', 'update', true]])
  })

  it('picks headlines about held coins first, then the newest', async () => {
    const { collectNews, heldWords } = await import('./notifyInbox')
    localStorage.setItem('crypto_tracker_transactions', JSON.stringify([{ coin_id: 'solana', coin_symbol: 'sol' }]))
    const words = heldWords()
    expect(words).toEqual(expect.arrayContaining(['SOL', 'solana']))
    const art = (title, h, link) => ({ title, link, source: 'CoinDesk', pubDate: new Date(now - h * 3600e3).toUTCString() })
    const items = collectNews([art('Solana hits a record in fees', 20, 'l1'), art('Fed holds rates', 1, 'l2'), art('Gold slips', 2, 'l3'), art('Console sales', 3, 'l4'), art('Ancient', 80, 'l5')], words, now)
    expect(items.map(x => x.url)).toEqual(['l1', 'l2', 'l3'])
    expect(items[0].body).toBe('Solana · CoinDesk')
    expect(items.every(x => x.channel === 'news')).toBe(true)
  })

  it('fetches both feeds and imports them once', async () => {
    const { fetchFeeds } = await import('./notifyInbox')
    const files = {
      'announcements.json': { items: [{ id: 'x', kind: 'feature', date: new Date().toISOString().slice(0, 10), title: 'Hello' }] },
      'news.json': { articles: [{ title: 'Markets open', link: 'https://n/1', source: 'X', pubDate: new Date().toUTCString() }] },
    }
    const fetchImpl = async (u) => ({ ok: true, json: async () => files[u.split('/').pop().split('?')[0]] })
    expect(await fetchFeeds({ force: true, fetchImpl })).toBe(2)
    expect(await fetchFeeds({ force: true, fetchImpl })).toBe(0)
    expect(readInbox().map(x => x.channel).sort()).toEqual(['feature', 'news'])
  })

  it('ships announcement copy without dashes and with unique ids', () => {
    const ann = JSON.parse(read('../public/announcements.json'))
    const ids = ann.items.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of ann.items) {
      expect(['feature', 'update', 'tip']).toContain(a.kind)
      expect(`${a.title} ${a.body}`).not.toMatch(/[—–]| - /)
      // Every update reads in all six languages, and in none of them with a dash.
      for (const lang of ['ar', 'fr', 'es', 'de', 'it']) {
        expect(a.i18n?.[lang]?.title, `${a.id} ${lang}`).toBeTruthy()
        expect(`${a.i18n[lang].title} ${a.i18n[lang].body}`).not.toMatch(/[—–]| - /)
      }
    }
  })
  it('rebuilds imported alerts in the reader language, on device', async () => {
    const { localizeAlert } = await import('./notifyInbox')
    const price = { tpl: { k: 'price', sym: 'BTC', below: true, target: '$60,000', hit: '$59,800' } }
    expect(localizeAlert(price, 'ar').title).toBe('BTC نزل تحت $60,000')
    expect(localizeAlert(price, 'ar').body).toContain('$59,800')
    expect(localizeAlert(price, 'en').title).toBe('BTC fell below $60,000')
    const t = (k) => (k === 'sig_rsi' ? (v) => `مؤشر ${v}` : null)
    const smart = { tpl: { k: 'smart', sym: 'ETH', n: 2, signals: [['sig_rsi', 28], 'Big news'] } }
    const out = localizeAlert(smart, 'ar', t, { 'Big news': 'خبر كبير' })
    expect(out.title).toBe('ETH: تنبيه بـ 2 إشارات')
    expect(out.body).toBe('مؤشر 28 · خبر كبير')
    expect(localizeAlert({ title: 'x' }, 'ar')).toBe(null)
    for (const lang of ['ar', 'fr', 'es', 'de', 'it']) expect(localizeAlert(price, lang).title).not.toMatch(/fell below/)
  })

  it('gives alerts imported before templates their template on the next backfill', async () => {
    const { importItems } = await import('./notifyInbox')
    const at = Date.now()
    importItems([{ key: 'pa:1', title: 'BTC fell below $1', channel: 'target', at }])
    expect(readInbox().find(x => x.id === 'imp-pa:1').tpl).toBeUndefined()
    importItems([{ key: 'pa:1', title: 'BTC fell below $1', channel: 'target', at, tpl: { k: 'price', sym: 'BTC', below: true, target: '$1', hit: '' } }])
    expect(readInbox().find(x => x.id === 'imp-pa:1').tpl.sym).toBe('BTC')
    expect(readInbox().filter(x => x.id === 'imp-pa:1').length).toBe(1)
  })

  it('only sends public headlines for translation, never alert text', () => {
    const bell = read('./components/NotificationBell.jsx')
    const effect = bell.slice(bell.indexOf('const [tr, setTr]'), bell.indexOf('const box = useRef'))
    expect(effect).toContain("n.channel === 'news' ? [n.title]")
    expect(effect).not.toMatch(/n\.body|tpl\.sym|tpl\.target/)
  })
})
