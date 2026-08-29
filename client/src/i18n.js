import en from './i18n/en.js'

/**
 * Translation dictionaries, code-split by language.
 *
 * `en` is bundled eagerly — it is the default for the large majority of
 * visitors and the fallback every other language reads through for a
 * missing key, so it must always be available synchronously. The other five
 * are each ~90 KB of strings that only the sliver of visitors using them
 * ever need; loading all six up front added most of a megabyte of JS to
 * every single page load, including the English landing page.
 * `loadLanguage` fetches one on demand and caches it here.
 *
 * Every language the picker offers needs an entry below. A code with no
 * loader silently falls back to English, which looks like a translation bug
 * rather than a missing line here — LanguageContext.test.js checks the two
 * lists against each other for that reason.
 */
export const translations = { en }

const loaders = {
  ar: () => import('./i18n/ar.js').then(m => m.default),
  fr: () => import('./i18n/fr.js').then(m => m.default),
  es: () => import('./i18n/es.js').then(m => m.default),
  de: () => import('./i18n/de.js').then(m => m.default),
  it: () => import('./i18n/it.js').then(m => m.default),
}

/**
 * Every language a dictionary exists for, English included.
 *
 * Exported because `Object.keys(translations)` is no longer the answer: it
 * holds only what has been loaded so far, which at module-evaluation time is
 * English alone. The parity suite used to derive its language list that way,
 * and code-splitting turned all 25 of its cases into zero without failing —
 * a translation table could then go missing half its keys with the suite
 * still green.
 */
export const LANGUAGE_CODES = ['en', ...Object.keys(loaders)]

export async function loadLanguage(lang) {
  if (translations[lang]) return translations[lang]
  const load = loaders[lang]
  if (!load) return translations.en
  const dict = await load()
  translations[lang] = dict
  return dict
}

// Test-only convenience: translation-parity suites need every language's
// dictionary loaded synchronously up front, unlike the app itself, which
// only ever needs the current one.
export async function loadAllLanguages() {
  await Promise.all(Object.keys(loaders).map(loadLanguage))
}

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
 *
 * If the saved language's dictionary hasn't been loaded yet (e.g. a
 * notification fires before LanguageProvider's own load finishes), this
 * falls back to English for that call — LanguageProvider triggers the load
 * on mount, so in practice the dictionary is almost always already cached
 * here by the time a notification needs it.
 */
export function translator() {
  let lang = 'en'
  try {
    const saved = localStorage.getItem('wl_lang')
    if (saved && (translations[saved] || loaders[saved])) lang = saved
  } catch { /* storage blocked — English is a fine answer */ }
  const dict = translations[lang] || translations.en
  return (key) => dict[key] ?? translations.en[key] ?? key
}
