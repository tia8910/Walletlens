import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import en from './i18n/en'

// English ships in the main bundle since it's the default language and the
// fallback for missing keys in every other table. The other three tables
// (~45 KB of source each) are dynamically imported one at a time, only for
// visitors who actually pick or default into that language — previously all
// four (~180 KB) loaded for every visitor via a single eager `i18n` chunk.
const LOADERS = {
  ar: () => import('./i18n/ar'),
  fr: () => import('./i18n/fr'),
  es: () => import('./i18n/es'),
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
  const [lang, setLang] = useState(() => {
    // Validate what comes out of storage: an unsupported code would resolve
    // every key to the English fallback while the UI claimed another language.
    const saved = localStorage.getItem('wl_lang')
    if (saved && SUPPORTED.has(saved)) return saved
    const browser = (navigator.language || navigator.userLanguage || '').toLowerCase()
    const match = LANGUAGES.find(l => browser.startsWith(l.code))
    return match ? match.code : 'en'
  })

  useEffect(() => {
    localStorage.setItem('wl_lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr'
  }, [lang])

  // Loaded non-English dictionaries, keyed by language code. `t()` falls
  // back to English for a language that hasn't finished loading yet, so
  // switching (or landing on a non-English browser locale) briefly shows
  // English strings until the small chunk arrives.
  const [dicts, setDicts] = useState({})
  const dictsRef = useRef(dicts)
  dictsRef.current = dicts

  useEffect(() => {
    if (lang === 'en' || dictsRef.current[lang]) return
    let cancelled = false
    LOADERS[lang]?.().then((mod) => {
      if (!cancelled) setDicts((prev) => ({ ...prev, [lang]: mod.default }))
    })
    return () => { cancelled = true }
  }, [lang])

  const t = useCallback((key) => {
    const dict = lang === 'en' ? en : dicts[lang]
    return dict?.[key] ?? en[key] ?? key
  }, [lang, dicts])

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
