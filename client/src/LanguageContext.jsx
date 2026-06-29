import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { en } from './i18n.en'

const LanguageContext = createContext(null)

// Module-level locale cache — Arabic is fetched at most once per session.
const locales = { en }

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('wl_lang')
    if (saved) return saved
    const browser = (navigator.language || navigator.userLanguage || '').toLowerCase()
    return browser.startsWith('ar') ? 'ar' : 'en'
  })

  // Tracks when the Arabic chunk has been resolved into `locales`.
  const [arLoaded, setArLoaded] = useState(() => !!locales.ar)

  useEffect(() => {
    localStorage.setItem('wl_lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  // Lazy-load Arabic translations the first time the language is set to Arabic.
  // English is always statically imported; Arabic only loads on demand, saving
  // ~16 KB of JS for English-speaking users who never switch language.
  useEffect(() => {
    if (lang === 'ar' && !locales.ar) {
      import('./i18n.ar').then(m => {
        locales.ar = m.ar
        setArLoaded(true)
      })
    }
  }, [lang])

  const t = useCallback((key) => {
    const dict = locales[lang] || locales.en
    return dict?.[key] ?? locales.en[key] ?? key
  }, [lang, arLoaded]) // arLoaded causes t() to recompute once Arabic resolves

  const value = useMemo(() => ({ lang, setLang, t, isRtl: lang === 'ar' }), [lang, t])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
