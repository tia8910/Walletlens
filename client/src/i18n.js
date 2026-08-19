import en from './i18nData/en'
import ar from './i18nData/ar'
import fr from './i18nData/fr'
import es from './i18nData/es'

// Split into one module per language (src/i18nData/*.js) so LanguageContext can
// import only the active language on first render instead of shipping all four
// translation tables (~130 KB gzipped) to every visitor regardless of locale.
// This aggregate stays for code that legitimately needs every table at once:
// translator() below, and the translation-coverage tests.
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
