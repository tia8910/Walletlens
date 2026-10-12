import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import { readInbox, unreadCount, markAllRead, markRead, clearInbox, listenToWorker, backfillInbox, INBOX_EVENT } from '../notifyInbox'

// The bell in the top bar: the notifications the app has sent, newest first,
// with an unread count. The alerts page is one tap further, at the bottom.

const COPY = {
  en: { title: 'Notifications', empty: 'No notifications yet', emptySub: 'Price, watchlist and smart alerts you receive will show up here.', readAll: 'Mark all read', clear: 'Clear', settings: 'Alert settings', now: 'now', m: 'm', h: 'h', d: 'd' },
  ar: { title: 'الإشعارات', empty: 'لا توجد إشعارات بعد', emptySub: 'ستظهر هنا تنبيهات الأسعار وقائمة المتابعة والتنبيهات الذكية التي تصلك.', readAll: 'تعليم الكل كمقروء', clear: 'مسح', settings: 'إعدادات التنبيهات', now: 'الآن', m: 'د', h: 'س', d: 'ي' },
  fr: { title: 'Notifications', empty: 'Aucune notification', emptySub: 'Vos alertes de prix, de liste de suivi et intelligentes apparaîtront ici.', readAll: 'Tout marquer comme lu', clear: 'Effacer', settings: 'Réglages des alertes', now: 'maint.', m: 'min', h: 'h', d: 'j' },
  es: { title: 'Notificaciones', empty: 'Aún no hay notificaciones', emptySub: 'Aquí verás las alertas de precio, de tu lista y las inteligentes.', readAll: 'Marcar todo como leído', clear: 'Borrar', settings: 'Ajustes de alertas', now: 'ahora', m: 'min', h: 'h', d: 'd' },
  de: { title: 'Benachrichtigungen', empty: 'Noch keine Benachrichtigungen', emptySub: 'Preis, Watchlist und Smart Alerts erscheinen hier.', readAll: 'Alle als gelesen', clear: 'Leeren', settings: 'Alarm Einstellungen', now: 'jetzt', m: 'Min', h: 'Std', d: 'T' },
  it: { title: 'Notifiche', empty: 'Ancora nessuna notifica', emptySub: 'Qui compariranno gli avvisi di prezzo, della watchlist e smart.', readAll: 'Segna tutto come letto', clear: 'Cancella', settings: 'Impostazioni avvisi', now: 'ora', m: 'min', h: 'h', d: 'g' },
}

const ICON = {
  target: '🎯', move: '📈', level: '📊', zakat: '🌙', smart: '⚡', news: '📰', digest: '☀️', whale: '🐋', portfolio: '💼', watchlist: '👀',
}
const iconFor = (ch = '') => ICON[ch] || Object.entries(ICON).find(([k]) => ch.includes(k))?.[1] || '🔔'

function ago(at, c) {
  const s = Math.max(0, (Date.now() - at) / 1000)
  if (s < 60) return c.now
  if (s < 3600) return `${Math.floor(s / 60)}${c.m}`
  if (s < 86400) return `${Math.floor(s / 3600)}${c.h}`
  return `${Math.floor(s / 86400)}${c.d}`
}

let listening = false

export default function NotificationBell({ alertsPath, label }) {
  const { lang } = useLanguage()
  const c = COPY[lang] || COPY.en
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(readInbox)
  const box = useRef(null)

  useEffect(() => {
    const sync = () => setItems(readInbox())
    window.addEventListener(INBOX_EVENT, sync)
    window.addEventListener('storage', sync)
    // Listen first, then fill: the import writes synchronously, and an event
    // fired before the listener exists is lost, leaving the bell empty.
    if (!listening) { listening = true; listenToWorker() }
    backfillInbox().then(sync)
    return () => { window.removeEventListener(INBOX_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const unread = unreadCount(items)
  const go = (to) => {
    setOpen(false)
    if (!to) return
    try {
      const u = new URL(to, window.location.origin)
      if (u.origin === window.location.origin) navigate(u.pathname + u.search + u.hash)
      else window.open(u.href, '_blank', 'noopener')
    } catch { /* not a link */ }
  }

  return (
    <div className="wl-bell-wrap" ref={box}>
      <button
        className="wl-topbar-x wl-topbar-bell"
        onClick={() => { if (!open) { setItems(readInbox()); backfillInbox().then(() => setItems(readInbox())) } setOpen(o => !o); track('notifications_open', { source: 'topbar', unread }) }}
        title={label} aria-label={unread ? `${label} (${unread})` : label} aria-expanded={open} aria-haspopup="dialog"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unread > 0 && <span className="wl-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="wl-bell-panel" role="dialog" aria-label={c.title} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="wl-bell-head">
            <b>{c.title}</b>
            {items.length > 0 && (
              <span>
                {unread > 0 && <button type="button" onClick={markAllRead}>{c.readAll}</button>}
                <button type="button" onClick={clearInbox}>{c.clear}</button>
              </span>
            )}
          </div>
          {items.length === 0 ? (
            <div className="wl-bell-empty"><div className="wl-bell-empty-ic">🔔</div><b>{c.empty}</b><p>{c.emptySub}</p></div>
          ) : (
            <ul className="wl-bell-list">
              {items.map(n => (
                <li key={n.id}>
                  <button type="button" className={n.read ? '' : 'unread'} onClick={() => { markRead(n.id); track('notification_inbox_click', { channel: n.channel }); go(n.url) }}>
                    <span className="wl-bell-ic" aria-hidden="true">{iconFor(n.channel)}</span>
                    <span className="wl-bell-txt"><b>{n.title}</b>{n.body && <small>{n.body}</small>}</span>
                    <time>{ago(n.at, c)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="wl-bell-foot" onClick={() => { setOpen(false); navigate(alertsPath.path, { state: alertsPath.state }) }}>{c.settings} ›</button>
        </div>
      )}
    </div>
  )
}
