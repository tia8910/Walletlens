// The notifications inbox behind the bell.
//
// Every notification the app shows is also written here, so the bell can list
// what was sent instead of opening the alerts page. Two writers:
//  • the page, through showLocalNotification (price, watchlist, smart and
//    portfolio alerts), straight into localStorage;
//  • the service worker, for server pushes that arrive with the app closed.
//    A worker has no localStorage, so it writes to IndexedDB and rings any
//    open window, which drains it. The page also drains on load.

export const INBOX_KEY = 'wl_notif_inbox'
export const INBOX_EVENT = 'wl-inbox'
export const INBOX_MAX = 50
const DB = 'wl-inbox', STORE = 'items'

export function readInbox() {
  try {
    const list = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

function writeInbox(list) {
  try { localStorage.setItem(INBOX_KEY, JSON.stringify(list.slice(0, INBOX_MAX))) } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(INBOX_EVENT)) } catch { /* no window */ }
}

/** Add one notification. Newest first; a repeat of the same tag replaces the old one. */
export function addToInbox({ title, body = '', url = '', channel = '', tag = '', at = Date.now() } = {}) {
  if (!title) return null
  const item = { id: `${at}-${Math.random().toString(36).slice(2, 7)}`, title: String(title), body: String(body || ''), url: String(url || ''), channel: String(channel || ''), tag: String(tag || ''), at, read: false }
  const rest = readInbox().filter(x => !(item.tag && x.tag === item.tag && x.title === item.title))
  writeInbox([item, ...rest])
  return item
}

export const unreadCount = (list = readInbox()) => list.filter(x => !x.read).length
export function markAllRead() { writeInbox(readInbox().map(x => ({ ...x, read: true }))) }
export function markRead(id) { writeInbox(readInbox().map(x => (x.id === id ? { ...x, read: true } : x))) }
export function clearInbox() { writeInbox([]) }

/** Move what the service worker stored while no window was open into the inbox. */
export function drainWorkerInbox() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(0)
  return new Promise((resolve) => {
    let req
    try { req = indexedDB.open(DB, 1) } catch { resolve(0); return }
    req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE, { autoIncrement: true }) } catch { /* exists */ } }
    req.onerror = () => resolve(0)
    req.onsuccess = () => {
      const db = req.result
      try {
        const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE)
        const all = st.getAll()
        all.onsuccess = () => {
          const items = (all.result || []).sort((a, b) => (a.at || 0) - (b.at || 0))
          items.forEach(addToInbox)
          st.clear()
          resolve(items.length)
        }
        all.onerror = () => resolve(0)
        tx.oncomplete = () => db.close()
      } catch { db.close(); resolve(0) }
    }
  })
}

/** Listen for pushes the worker relays while a window is open. Call once. */
export function listenToWorker() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
  navigator.serviceWorker.addEventListener('message', (e) => {
    // The worker has already stored the push; this is only the doorbell.
    if (e.data?.type === 'WL_PUSH') drainWorkerInbox()
  })
  drainWorkerInbox()
}

// ── Backfill ────────────────────────────────────────────────────────────────
// The inbox only hears about notifications sent after it shipped, so on first
// open it would be empty although the app has alerts on record. These are
// imported once each (by a stable key), in time order, read if older than a day.

const IMPORTED_KEY = 'wl_notif_imported'
const DAY = 86_400_000
const SIGNAL_TEXT = {
  saWhale: (usd, sym) => `Whale moved ${usd} ${sym} on chain`,
  saMomentum24: (m) => `${m} in 24h`,
  saMomentum1h: (m) => `${m} in 1h`,
  saVolume: (pct) => `Volume ${pct}% of market cap`,
}
const signalText = (d) => Array.isArray(d) ? (SIGNAL_TEXT[d[0]] ? SIGNAL_TEXT[d[0]](...d.slice(1)) : '') : String(d || '')
const money = (n) => (Number(n) >= 1 ? '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '$' + Number(n).toPrecision(4))
const readJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d } catch { return d } }

/** Turn the alerts the app already keeps into inbox items. Pure, for tests. */
export function collectExisting(now = Date.now()) {
  const out = []
  for (const a of readJson('wl_smart_alerts', [])) {
    if (!a?.coinSymbol || !a.firedAt) continue
    out.push({ key: `sa:${a.id}:${a.firedAt}`, title: `${a.coinSymbol}: ${a.signalCount || (a.signals || []).length} signal alert`, body: (a.signals || []).map(s => signalText(s.desc)).filter(Boolean).join(' · '), channel: 'smart', url: a.coinId ? `/asset/?id=${a.coinId}` : '', at: Date.parse(a.firedAt) })
  }
  const priceLike = (list, prefix) => {
    for (const a of list || []) {
      if (!a?.triggered || !a.triggeredAt) continue
      const sym = String(a.coin_symbol || a.coin_id || '').toUpperCase()
      out.push({ key: `${prefix}:${a.id}:${a.triggeredAt}`, title: `${sym} ${a.condition === 'below' ? 'fell below' : 'rose above'} ${money(a.targetPrice)}`, body: a.triggeredPrice ? `Price alert hit at ${money(a.triggeredPrice)}` : 'Price alert hit', channel: 'target', url: a.coin_id ? `/asset/?id=${a.coin_id}` : '', at: Date.parse(a.triggeredAt) })
    }
  }
  priceLike(readJson('walletlens_price_alerts', []), 'pa')
  priceLike(readJson('wl_watchlist_alerts', []), 'wa')
  return out.filter(x => Number.isFinite(x.at)).map(x => ({ ...x, read: now - x.at > DAY }))
}

/** Merge items into the inbox once each, keeping it newest first. */
export function importItems(items) {
  const seen = new Set(readJson(IMPORTED_KEY, []))
  const fresh = items.filter(x => x.key && !seen.has(x.key))
  if (!fresh.length) return 0
  const list = readInbox()
  for (const x of fresh) {
    seen.add(x.key)
    list.push({ id: `imp-${x.key}`, title: String(x.title), body: String(x.body || ''), url: String(x.url || ''), channel: String(x.channel || ''), tag: x.key, at: x.at, read: !!x.read, ...(x.i18n ? { i18n: x.i18n } : {}) })
  }
  list.sort((a, b) => b.at - a.at)
  try { localStorage.setItem(IMPORTED_KEY, JSON.stringify([...seen].slice(-400))) } catch { /* private mode */ }
  writeInbox(list)
  return fresh.length
}

/** Fill the inbox from alerts on record and from notifications still showing in the system tray. */
export async function backfillInbox() {
  let n = importItems(collectExisting())
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration()
      const shown = reg?.getNotifications ? await reg.getNotifications() : []
      n += importItems(shown.map(x => ({ key: `tray:${x.tag || ''}:${x.timestamp}:${x.title}`, title: x.title, body: x.body, url: x.data?.url || '', channel: x.data?.channel || '', at: x.timestamp || Date.now() })))
    }
  } catch { /* no worker */ }
  return n
}

// ── Feeds: WalletLens updates and market news ───────────────────────────────
// announcements.json is the app's own news: new features and updates, written
// by hand and published with the site. news.json is the market news the app
// already fetches; the bell takes the headlines about what you hold.

export const FEED_CHANNELS = new Set(['news', 'feature', 'update', 'tip'])
const WEEK = 7 * DAY

/** WalletLens announcements as inbox items. Unread for a week after release. */
export function collectAnnouncements(json, now = Date.now(), lang = 'en') {
  return (json?.items || []).filter(a => a?.id && a.title).map(a => {
    const at = Date.parse(a.date || '') || now
    const t = a.i18n?.[lang] || {}
    return { key: `ann:${a.id}`, title: t.title || a.title, body: t.body || a.body || '', i18n: a.i18n || null, channel: FEED_CHANNELS.has(a.kind) ? a.kind : 'update', url: a.url || '', at, read: now - at > WEEK }
  }).slice(0, 12)
}

/** The coins someone holds, as words to look for in a headline. */
export function heldWords() {
  const words = new Set()
  for (const tx of readJson('crypto_tracker_transactions', [])) {
    const sym = String(tx?.coin_symbol || '').trim()
    const id = String(tx?.coin_id || '').trim()
    if (sym.length >= 2) words.add(sym.toUpperCase())
    if (id.length >= 4 && !id.includes('-')) words.add(id.toLowerCase())
  }
  return [...words]
}

/** Headlines about held coins (up to 4 from two days), plus the two newest of the last 12 hours. */
export function collectNews(articles, words = [], now = Date.now()) {
  const fresh = (articles || []).filter(a => a?.title && a.link).map(a => ({ a, at: Date.parse(a.pubDate || a.isoDate || '') || 0 }))
    .filter(x => x.at && now - x.at < 2 * DAY).sort((x, y) => y.at - x.at)
  const about = (title) => words.find(w => (w === w.toUpperCase() ? new RegExp(`\\b${w.replace(/[^A-Z0-9]/g, '')}\\b`) : new RegExp(`\\b${w}\\b`, 'i')).test(title))
  const picked = new Map()
  for (const x of fresh) { const w = about(x.a.title); if (w && picked.size < 4) picked.set(x.a.link, { ...x, w }) }
  for (const x of fresh.filter(x => now - x.at < DAY / 2).slice(0, 2)) if (!picked.has(x.a.link)) picked.set(x.a.link, x)
  return [...picked.values()].map(({ a, at, w }) => ({
    key: `news:${a.link}`, title: a.title, body: [w ? (w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)) : '', a.source || ''].filter(Boolean).join(' · ') || 'Market news',
    channel: 'news', url: a.link, at, read: now - at > DAY / 4,
  }))
}

let lastFeedFetch = 0
/** Fetch both feeds at most every 15 minutes per page and import what is new. */
export async function fetchFeeds({ force = false, fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), base = '', lang = 'en' } = {}) {
  if (!fetchImpl || (!force && Date.now() - lastFeedFetch < 15 * 60_000)) return 0
  lastFeedFetch = Date.now()
  const get = (name) => fetchImpl(`${base}/${name}?t=${Math.floor(Date.now() / 900_000)}`).then(r => (r.ok ? r.json() : null)).catch(() => null)
  const [ann, news] = await Promise.all([get('announcements.json'), get('news.json')])
  return importItems([...collectAnnouncements(ann, Date.now(), lang), ...collectNews(news?.articles, heldWords())])
}
