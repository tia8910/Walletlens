import { useEffect, useState } from 'react'
import { track } from '../analytics'
import { isMsStore } from '../msStore'
import { useLanguage } from '../LanguageContext'
import { EXTENSION_URL, EXTENSION_PAGE, ChromeIcon } from './InstallExtension'

// A small toolbar that offers the browser extension to someone who opens
// walletlens.live in a desktop Chromium browser without it.
//
// The extension's content script marks the page (<html data-wl-ext="2.0.1">)
// the moment it runs, so anyone who already has it never sees the bar. It waits
// a moment before showing, because content scripts run at document_idle, and it
// still disappears if the mark arrives later. Closing it, or clicking through to
// the store, keeps it away for 30 days.

export const EXT_BAR_KEY = 'wl_ext_bar'
export const EXT_MARK = 'data-wl-ext'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000
const DELAY_MS = 2500

const COPY = {
  en: { title: 'Your net worth in the toolbar', sub: 'Add WalletLens to {b}. Free, no account, one click away.', add: 'Add to {b}', more: 'Learn more', close: 'Not now' },
  ar: { title: 'ثروتك في شريط المتصفح', sub: 'أضف WalletLens إلى {b}. مجاني وبدون حساب وبنقرة واحدة.', add: 'أضف إلى {b}', more: 'اعرف المزيد', close: 'ليس الآن' },
  fr: { title: 'Votre patrimoine dans la barre d’outils', sub: 'Ajoutez WalletLens à {b}. Gratuit, sans compte, à un clic.', add: 'Ajouter à {b}', more: 'En savoir plus', close: 'Plus tard' },
  es: { title: 'Tu patrimonio en la barra de herramientas', sub: 'Añade WalletLens a {b}. Gratis, sin cuenta, a un clic.', add: 'Añadir a {b}', more: 'Más información', close: 'Ahora no' },
  de: { title: 'Dein Vermögen in der Symbolleiste', sub: 'Füge WalletLens zu {b} hinzu. Kostenlos, ohne Konto, einen Klick entfernt.', add: 'Zu {b} hinzufügen', more: 'Mehr erfahren', close: 'Nicht jetzt' },
  it: { title: 'Il tuo patrimonio nella barra degli strumenti', sub: 'Aggiungi WalletLens a {b}. Gratis, senza account, a un clic.', add: 'Aggiungi a {b}', more: 'Scopri di più', close: 'Non ora' },
}

/** The browser's name when it can install from the Chrome Web Store, else null. */
export function chromiumDesktop(win) {
  const nav = win?.navigator
  if (!nav) return null
  const ua = nav.userAgent || ''
  // Phones and tablets cannot install extensions from the store.
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || nav.userAgentData?.mobile) return null
  if (!/Chrome\//.test(ua) || /Firefox\//.test(ua)) return null
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (nav.brave) return 'Brave'
  return 'Chrome'
}

/** Whether the bar may be offered at all: browser, window, mark and snooze. */
export function shouldOfferExtension(win, now = Date.now()) {
  try {
    if (!win || isMsStore()) return false
    if (!chromiumDesktop(win)) return false
    const mm = win.matchMedia
    // An installed app window has no toolbar of its own to pin anything to,
    // and a coarse pointer or a narrow window is a touch device in disguise.
    if (mm && (mm('(display-mode: standalone)').matches || mm('(display-mode: window-controls-overlay)').matches)) return false
    if (mm && !mm('(pointer: fine)').matches) return false
    if ((win.innerWidth || 0) < 900) return false
    if (win.document?.documentElement?.hasAttribute(EXT_MARK)) return false
    const until = Number(win.localStorage?.getItem(EXT_BAR_KEY) || 0)
    return !(until > now)
  } catch { return false }
}

export default function ExtensionToolbar() {
  const { lang } = useLanguage()
  const [show, setShow] = useState(false)
  const [browser] = useState(() => (typeof window === 'undefined' ? null : chromiumDesktop(window)))

  useEffect(() => {
    if (!shouldOfferExtension(window)) return
    const root = document.documentElement
    const timer = setTimeout(() => {
      if (!shouldOfferExtension(window)) return
      setShow(true)
      track('extension_bar_view', { browser })
    }, DELAY_MS)
    // The extension can mark the page after the bar is already up.
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      if (root.hasAttribute(EXT_MARK)) { setShow(false); clearTimeout(timer) }
    })
    mo?.observe(root, { attributes: true, attributeFilter: [EXT_MARK] })
    return () => { clearTimeout(timer); mo?.disconnect() }
  }, [browser])

  if (!show || !browser) return null
  const c = COPY[lang] || COPY.en
  const b = (s) => s.replace('{b}', browser)
  const snooze = () => { try { localStorage.setItem(EXT_BAR_KEY, String(Date.now() + SNOOZE_MS)) } catch { /* private mode */ } setShow(false) }

  return (
    <div className="wl-extbar" role="dialog" aria-label={c.title} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <span className="wl-extbar-icon"><ChromeIcon size={26} /></span>
      <div className="wl-extbar-text">
        <b>{c.title}</b>
        <span>{b(c.sub)} <a href={EXTENSION_PAGE} onClick={() => track('extension_page_click', { source: 'toolbar_bar' })}>{c.more}</a></span>
      </div>
      <a className="wl-extbar-add" href={EXTENSION_URL} target="_blank" rel="noopener noreferrer"
        onClick={() => { track('extension_install_click', { source: 'toolbar_bar', browser, can_install: true }); snooze() }}>
        {b(c.add)}
      </a>
      <button type="button" className="wl-extbar-close" aria-label={c.close} title={c.close}
        onClick={() => { track('extension_bar_dismiss', { browser }); snooze() }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}
