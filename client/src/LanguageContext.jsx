import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import en from './i18n/en'

// English loads synchronously — it's the default for the large majority of
// visitors and the fallback `t()` reaches for on any missing/unloaded key.
// The other three tables (ar/fr/es) are ~35 KB gzip apiece; loading all four
// up front on every route (including the SEO landing pages, where almost
// nobody switches language) used to cost ~140 KB gzip of eagerly-fetched JS
// before first paint on every single page load. Loading them only when a
// visitor actually picks that language keeps that cost off everyone else's
// critical path. Module-level cache so a language fetched once (in this tab)
// never re-fetches on a later switch back to it.
const cache = { en }
function loadLanguage(code) {
  if (cache[code]) return Promise.resolve(cache[code])
  return import(`./i18n/${code}.js`).then(m => { cache[code] = m.default; return m.default })
}

/**
 * The languages the picker offers.
 *
 * `native` is what the button shows: someone looking for Arabic is looking for
 * العربية, not the word "Arabic" in a script they may not read. rtl is a
 * property of the language, not a hard-coded === 'ar' check, so adding Hebrew
 * or Farsi later is one row here rather than a hunt through the codebase.
 */
// The flag is decoration, never the label.
//
// Flags are countries and these are languages, and the two do not line up:
// Arabic is spoken across twenty-odd countries and belongs to none of them,
// Spanish is far more spoken in the Americas than in Spain, and English could
// as easily be 🇺🇸. Every entry therefore carries its own name in its own
// script, which is what people actually recognise, and the flag sits beside it
// as a visual anchor rather than replacing it.
//
// `native` is the accessible label and the thing to keep if a surface can only
// show one of the two.
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English',  flag: '🇬🇧', rtl: false },
  { code: 'ar', label: 'Arabic',  native: 'العربية',  flag: '🇸🇦', rtl: true  },
  { code: 'fr', label: 'French',  native: 'Français', flag: '🇫🇷', rtl: false },
  { code: 'es', label: 'Spanish', native: 'Español',  flag: '🇪🇸', rtl: false },
  // German, Italian and Simplified Chinese are next, and are deliberately not
  // listed until their content is complete. Adding a code here is what makes a
  // language real everywhere at once — the Academy, the privacy policy, the
  // terms, the lock-screen notifications — and the suite in legal.test.js and
  // academyContent.test.js fails loudly for any language in this list that is
  // missing a single one of them. That is the right rule: a half-translated
  // privacy policy is worse than an English one, because the reader cannot
  // tell which parts they are missing.
  //
  // For 'zh', use the bare code rather than 'zh-CN': the browser match below
  // is a prefix test, so 'zh' catches zh-CN, zh-SG and zh-Hans alike.
  // Traditional would need its own entry and its own translations.
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

  // Fetch the picked language's table the moment it's needed. Until it
  // resolves, t() below reads whatever is cached (English, at minimum) so the
  // UI never breaks — it just briefly shows English for a language that
  // hasn't finished loading, then re-renders once `loaded` ticks.
  const [loaded, setLoaded] = useState(0)
  useEffect(() => {
    if (cache[lang]) return
    let cancelled = false
    loadLanguage(lang).then(() => { if (!cancelled) setLoaded(n => n + 1) })
    return () => { cancelled = true }
  }, [lang])

  const t = useCallback((key) => {
    const table = cache[lang] || cache.en
    return table[key] ?? cache.en[key] ?? key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, loaded])

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
