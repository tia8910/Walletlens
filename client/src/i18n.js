// The four language tables live in ./i18n/{en,ar,fr,es}.js — split out so
// LanguageContext can statically import only `en` (the default and the
// fallback) and lazy-load the other three on demand, instead of shipping the
// whole ~140 KB gzip translation table on every single page load regardless
// of which language the visitor reads. This module still assembles the full
// `translations` table synchronously, because completeness tests
// (i18n.test.js) and non-component callers (translator(), below) need every
// language available without an await.
import en from './i18n/en'
import ar from './i18n/ar'
import fr from './i18n/fr'
import es from './i18n/es'

export const translations = { en, ar, fr, es }

/**
 * A translator for code that runs outside React.
 *
 * Notifications are the reason this exists. They are assembled in plain
 * modules — portfolioNotify, the alert pollers, the service worker's peers —
 * where there is no component to call useLanguage() from, so every one of them
 * was hard-coded English regardless of the language the user picked.
 *
 * Reads the same `wl_lang` key LanguageProvider writes, so the two can never
 * disagree, and falls back to English exactly as the context does. Call it at
 * the moment you need a string rather than caching the result: the user can
 * change language between one notification and the next.
 */
export function translator() {
  let lang = 'en'
  try {
    const saved = localStorage.getItem('wl_lang')
    if (saved && translations[saved]) lang = saved
  } catch { /* storage blocked — English is a fine answer */ }
  return (key) => translations[lang]?.[key] ?? translations.en[key] ?? key
}
