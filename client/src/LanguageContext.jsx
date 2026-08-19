import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import en from './i18nData/en'
import ar from './i18nData/ar'

// en and ar are the two languages the app actually markets (see the
// WebApplication structured data's `inLanguage`), so they ship in the main
// bundle for a same-tick first render with no language flash. fr and es are
// newer additions fetched on demand — only visitors who pick or were saved on
// one of them pay for their ~30 KB gzipped table, and only after the initial
// paint.
const EAGER = { en, ar }
const LAZY_LOADERS = {
  fr: () => import('./i18nData/fr').then(m => m.default),
  es: () => import('./i18nData/es').then(m => m.default),
}

/**
 * The languages the picker offers.
 *
 * `native` is what the button shows: someone looking for Arabic is looking for
 * العربية, not the word "Arabic" in a script they may not read. rtl is a
 * property of the language, not a hard-coded === 'ar' check, so adding Hebrew
 * or Farsi later is one row here rather than a hunt through the codebase.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English',  rtl: false },
  { code: 'ar', label: 'Arabic',  native: 'العربية',  rtl: true  },
  { code: 'fr', label: 'French',  native: 'Français', rtl: false },
  { code: 'es', label: 'Spanish', native: 'Español',  rtl: false },
]

const RTL = new Set(LANGUAGES.filter(l => l.rtl).map(l => l.code))
const SUPPORTED = new Set(LANGUAGES.map(l => l.code))

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const firstRun = useRef(true)
  const [lang, setLang] = useState(() => {
    // Validate what comes out of storage: an unsupported code would resolve
    // every key to the English fallback while the UI claimed another language.
    const saved = localStorage.getItem('wl_lang')
    if (saved && SUPPORTED.has(saved)) return saved
    const browser = (navigator.language || navigator.userLanguage || '').toLowerCase()
    const match = LANGUAGES.find(l => browser.startsWith(l.code))
    return match ? match.code : 'en'
  })

  // Table for the active language: available synchronously for en/ar, fetched
  // on demand for fr/es. Falls back to English until a lazy table resolves, so
  // switching to (or loading a saved) fr/es briefly shows English rather than
  // blocking the first render on a network round-trip.
  const [table, setTable] = useState(() => EAGER[lang] ?? null)

  useEffect(() => {
    localStorage.setItem('wl_lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr'

    // Two things outside this document render text and cannot read the choice
    // for themselves: the Android shell, which sends the lock-screen
    // notifications, and the push server, which builds price alerts. Both are
    // told here so a language change takes effect on the next notification
    // instead of the next portfolio sync.
    //
    // Skipped on the first run — the picker fires this effect on mount too,
    // and neither side needs to hear a language it was already given.
    if (firstRun.current) { firstRun.current = false; return }
    import('./nativeWidgets').then(m => m.syncLanguage?.()).catch(() => {})
    import('./push').then(m => m.syncAlerts?.()).catch(() => {})
  }, [lang])

  useEffect(() => {
    if (EAGER[lang]) { setTable(EAGER[lang]); return }
    let cancelled = false
    LAZY_LOADERS[lang]?.().then(dict => { if (!cancelled) setTable(dict) })
    return () => { cancelled = true }
  }, [lang])

  const t = useCallback((key) => {
    return table?.[key] ?? EAGER.en[key] ?? key
  }, [table])

  const value = useMemo(() => ({ lang, setLang, t, isRtl: RTL.has(lang) }), [lang, t])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
