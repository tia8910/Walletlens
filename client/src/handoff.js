// Fetching the portfolio out of Chrome, once, when the app stops being Chrome.
//
// ── The situation ───────────────────────────────────────────────────────────
//
// Until 6.3 the Android app was a Trusted Web Activity: it rendered this site
// in a Custom Tab, which is to say it WAS Chrome, and every byte the app saved
// went into Chrome's storage for walletlens.live. From 6.3 the app renders the
// site in a WebView it owns, which is the whole point — the portfolio lives in
// the app, Android's backup covers it, and clearing Chrome cannot touch it.
//
// A WebView cannot read what Chrome stored. Different process, different
// sandbox, no API that crosses it. So on the day the shell ships, every
// existing install opens to an empty app with its portfolio sitting intact on
// the other side of a boundary.
//
// The vault is the way across — the app's own copy, which AppShellActivity
// reads on first run. But the vault has only been written since 6.2, and
// nobody is obliged to install 6.2 before 6.3: Play updates whatever is
// installed to whatever is newest. An install coming from 6.1 arrives with an
// empty vault.
//
// ── The way across ──────────────────────────────────────────────────────────
//
// Chrome can still be asked to open this page, and this page running in Chrome
// still has that storage. So the shell opens it once, in a Custom Tab, with
// ?wlhandoff=1. This module notices, and offers one button.
//
// It has to be a button. Writing the vault means firing a walletlens:// intent,
// and Chrome requires a user activation for an external protocol launch — an
// automatic attempt is simply dropped. That constraint turns out to be the
// right design anyway: moving someone's portfolio between two stores is not
// something to do silently behind a splash screen.
//
// ── Why this is plain DOM ───────────────────────────────────────────────────
//
// It runs before React, and deliberately. This screen is the only path a
// user's data has; it must not depend on the router resolving, the i18n
// dictionaries loading, onboarding deciding it has something to say, or any
// other part of the app booting correctly. It needs localStorage and a button.

import { saveVault } from './nativeVault'

/** The query parameter AppShellActivity opens this page with. */
export const HANDOFF_PARAM = 'wlhandoff'

/** Where to send the user back to when it is done. */
const RETURN_URL = 'walletlens://shell?handoff=done'

/**
 * Copy, in the languages the app ships.
 *
 * Read straight from localStorage rather than through i18n: the dictionaries
 * are code-split and loaded asynchronously, and this screen has to be on the
 * glass before anything async resolves. An unknown or missing code falls back
 * to English, exactly as the rest of the app does.
 */
const COPY = {
  en: {
    title: 'Move your portfolio into the app',
    body: 'The app now stores your data itself instead of leaving it in Chrome. Tap below to move it across — it only takes a moment, and you only have to do this once.',
    action: 'Move my data',
    working: 'Moving…',
    done: 'Done. Returning to the app…',
    failed: 'That didn’t work. You can close this and try again next time you open the app.',
    empty: 'There’s nothing here to move. Returning to the app…',
  },
  ar: {
    title: 'انقل محفظتك إلى التطبيق',
    body: 'أصبح التطبيق يحفظ بياناتك بنفسه بدلاً من تركها في كروم. اضغط بالأسفل لنقلها — لن يستغرق الأمر سوى لحظة، ولن تحتاج إلى تكراره.',
    action: 'انقل بياناتي',
    working: 'جارٍ النقل…',
    done: 'تم. جارٍ العودة إلى التطبيق…',
    failed: 'لم تنجح العملية. يمكنك الإغلاق والمحاولة في المرة القادمة.',
    empty: 'لا توجد بيانات لنقلها. جارٍ العودة إلى التطبيق…',
  },
  fr: {
    title: 'Déplacez votre portefeuille dans l’application',
    body: 'L’application conserve désormais vos données elle-même, au lieu de les laisser dans Chrome. Touchez ci-dessous pour les déplacer — c’est rapide, et à faire une seule fois.',
    action: 'Déplacer mes données',
    working: 'Déplacement…',
    done: 'Terminé. Retour à l’application…',
    failed: 'Cela n’a pas fonctionné. Fermez cette page et réessayez à la prochaine ouverture.',
    empty: 'Il n’y a rien à déplacer. Retour à l’application…',
  },
  es: {
    title: 'Mueve tu cartera a la aplicación',
    body: 'La aplicación ahora guarda tus datos por sí misma en lugar de dejarlos en Chrome. Toca abajo para moverlos: es cuestión de un momento y solo hay que hacerlo una vez.',
    action: 'Mover mis datos',
    working: 'Moviendo…',
    done: 'Listo. Volviendo a la aplicación…',
    failed: 'No ha funcionado. Puedes cerrar esto e intentarlo la próxima vez.',
    empty: 'No hay nada que mover. Volviendo a la aplicación…',
  },
  de: {
    title: 'Portfolio in die App übertragen',
    body: 'Die App speichert deine Daten jetzt selbst, statt sie in Chrome zu lassen. Tippe unten, um sie zu übertragen — das dauert nur einen Moment und ist nur einmal nötig.',
    action: 'Daten übertragen',
    working: 'Wird übertragen…',
    done: 'Fertig. Zurück zur App…',
    failed: 'Das hat nicht geklappt. Du kannst das hier schließen und es beim nächsten Öffnen erneut versuchen.',
    empty: 'Hier gibt es nichts zu übertragen. Zurück zur App…',
  },
  it: {
    title: 'Sposta il tuo portafoglio nell’app',
    body: 'Ora l’app conserva i tuoi dati da sé, invece di lasciarli in Chrome. Tocca qui sotto per spostarli: è questione di un attimo e va fatto una sola volta.',
    action: 'Sposta i miei dati',
    working: 'Spostamento…',
    done: 'Fatto. Ritorno all’app…',
    failed: 'Non ha funzionato. Puoi chiudere e riprovare alla prossima apertura.',
    empty: 'Non c’è nulla da spostare. Ritorno all’app…',
  },
}

function copy() {
  let lang = 'en'
  try { lang = localStorage.getItem('wl_lang') || 'en' } catch { /* private mode */ }
  return COPY[lang] || COPY.en
}

/** Whether this page was opened by the app to hand its data over. */
export function isHandoff(search) {
  try {
    const s = search ?? (typeof location !== 'undefined' ? location.search : '')
    return new URLSearchParams(s).get(HANDOFF_PARAM) === '1'
  } catch { return false }
}

/** Whether there is anything worth moving. */
function hasSomething() {
  try {
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    const ws = JSON.parse(localStorage.getItem('crypto_tracker_wallets') || '[]')
    return (Array.isArray(txs) && txs.length > 0) || (Array.isArray(ws) && ws.length > 0)
  } catch {
    // Unreadable is not empty. Sending the user back with "nothing to move"
    // when the store merely failed to parse once would end the one chance
    // their data has.
    return true
  }
}

function goBack() {
  try { location.href = RETURN_URL } catch { /* the user can close the tab */ }
}

/**
 * Draw the handoff screen. Returns true if it took over the page.
 *
 * Call before mounting the app: when this returns true nothing else should
 * render, because this tab exists for one purpose and is about to close.
 */
export function mountHandoff(root = typeof document !== 'undefined' ? document.body : null) {
  if (!root || !isHandoff()) return false

  const t = copy()

  const wrap = document.createElement('div')
  wrap.setAttribute('data-wl-handoff', '')
  wrap.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'display:flex', 'flex-direction:column', 'justify-content:center',
    'gap:20px', 'padding:32px 24px',
    'background:#071A0C', 'color:#f4f7f4',
    'font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'text-align:center',
  ].join(';')

  const h = document.createElement('h1')
  h.textContent = t.title
  h.style.cssText = 'margin:0;font-size:24px;line-height:1.25;font-weight:650'

  const p = document.createElement('p')
  p.textContent = t.body
  p.style.cssText = 'margin:0;opacity:.82;max-width:34ch;align-self:center'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = t.action
  btn.style.cssText = [
    'align-self:center', 'min-width:220px', 'padding:15px 24px',
    'border:0', 'border-radius:14px', 'cursor:pointer',
    'background:#25d366', 'color:#04220d',
    'font:inherit', 'font-weight:700', 'font-size:17px',
  ].join(';')

  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  status.style.cssText = 'margin:0;min-height:1.5em;opacity:.75;font-size:14px'

  wrap.append(h, p, btn, status)
  root.appendChild(wrap)

  // Nothing to move: say so and leave, rather than showing a button whose only
  // possible outcome is an empty vault.
  if (!hasSomething()) {
    btn.remove()
    status.textContent = t.empty
    setTimeout(goBack, 1200)
    return true
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true
    btn.style.opacity = '.6'
    status.textContent = t.working

    // Called from inside the click, not after an await: Chrome's user
    // activation for an external protocol launch does not survive one.
    const res = await saveVault({ inApp: true })

    if (!res.ok) {
      status.textContent = t.failed
      btn.disabled = false
      btn.style.opacity = '1'
      return
    }

    // The intent went out through a hidden iframe, which cannot report back —
    // so this is "sent", not "stored", and the pause is for Android to start
    // the activity and write the file before the app reads it.
    status.textContent = t.done
    setTimeout(goBack, 900)
  })

  return true
}
