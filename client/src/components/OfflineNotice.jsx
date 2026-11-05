import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'

// A slim notice while the device has no connection. Without it, prices sat
// at "Fetching…" or "$0.00 today" with nothing to say why. Holdings, costs
// and everything typed in are on the device and keep working; only live
// prices, news and videos wait for the connection. It goes away by itself
// when the connection returns.

export const OFFLINE_COPY = {
  en: { msg: 'You’re offline. Your portfolio is safe on this device; prices update when you reconnect.', back: 'Back online' },
  ar: { msg: 'أنت غير متصل. محفظتك محفوظة على هذا الجهاز، وتتحدث الأسعار عند عودة الاتصال.', back: 'عاد الاتصال' },
  fr: { msg: 'Vous êtes hors ligne. Votre portefeuille reste sur cet appareil ; les prix se mettent à jour à la reconnexion.', back: 'De nouveau en ligne' },
  es: { msg: 'Estás sin conexión. Tu cartera sigue en este dispositivo; los precios se actualizan al reconectar.', back: 'Conexión restablecida' },
  de: { msg: 'Du bist offline. Dein Portfolio bleibt auf diesem Gerät; die Kurse aktualisieren sich, sobald du wieder online bist.', back: 'Wieder online' },
  it: { msg: 'Sei offline. Il tuo portafoglio resta su questo dispositivo; i prezzi si aggiornano quando torni online.', back: 'Di nuovo online' },
}

const BACK_MS = 2500

export default function OfflineNotice() {
  const { lang } = useLanguage()
  const [state, setState] = useState(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'off' : 'on'))

  useEffect(() => {
    let t = null
    const off = () => { clearTimeout(t); setState('off') }
    const on = () => { setState(s => (s === 'off' ? 'back' : s)); clearTimeout(t); t = setTimeout(() => setState('on'), BACK_MS) }
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    return () => { clearTimeout(t); window.removeEventListener('offline', off); window.removeEventListener('online', on) }
  }, [])

  if (state === 'on') return null
  const c = OFFLINE_COPY[lang] || OFFLINE_COPY.en
  return (
    <div className={`wl-offline ${state}`} role="status" aria-live="polite" dir={lang === 'ar' ? 'rtl' : undefined}>
      <span className="wl-offline-dot" aria-hidden="true" />
      <span>{state === 'off' ? c.msg : c.back}</span>
    </div>
  )
}
