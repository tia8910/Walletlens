import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { translations, loadLanguage } from './i18n'

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

/**
 * Resolves the boot language from storage/browser alone, with no React and no
 * translation chunk involved. main.jsx calls this before the first render to
 * decide whether to await that language's chunk (see loadLanguage in i18n.js)
 * so the app never mounts mid-language-swap; exported here so the two checks
 * can't drift apart.
 */
export function detectInitialLang() {
  // Validate what comes out of storage: an unsupported code would resolve
  // every key to the English fallback while the UI claimed another language.
  try {
    const saved = localStorage.getItem('wl_lang')
    if (saved && SUPPORTED.has(saved)) return saved
  } catch { /* storage blocked — fall through to browser detection */ }
  const browser = (navigator.language || navigator.userLanguage || '').toLowerCase()
  const match = LANGUAGES.find(l => browser.startsWith(l.code))
  return match ? match.code : 'en'
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const firstRun = useRef(true)
  const [lang, setLang] = useState(detectInitialLang)
  // English ships in the main bundle; the other three languages are separate
  // chunks fetched on demand (see i18n.js). `ready` mirrors whether the
  // current language's strings are actually in memory yet — main.jsx already
  // awaits the boot language before the first render, so this only flips
  // visibly on a manual mid-session language switch.
  const [ready, setReady] = useState(() => !!translations[lang])

  useEffect(() => {
    if (translations[lang]) { setReady(true); return }
    setReady(false)
    let cancelled = false
    loadLanguage(lang).then(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [lang])

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

  const t = useCallback((key) => {
    return translations[lang]?.[key] ?? translations.en[key] ?? key
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ready` isn't
    // read above; it's a version bump so `t`'s identity (and therefore the
    // memoized context value) changes once a lazily-loaded language lands.
  }, [lang, ready])

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
