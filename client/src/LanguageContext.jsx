import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { translations } from './i18n'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('wl_lang')
    if (saved) return saved
    const browser = (navigator.language || navigator.userLanguage || '').toLowerCase()
    return browser.startsWith('ar') ? 'ar' : 'en'
  })

  useEffect(() => {
    localStorage.setItem('wl_lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const t = useCallback((key) => {
    return translations[lang]?.[key] ?? translations.en[key] ?? key
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t, isRtl: lang === 'ar' }), [lang, setLang, t])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
