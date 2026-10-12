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
