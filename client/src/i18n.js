// Combined view of every language's translation table.
//
// Runtime code should NOT import this module: it statically pulls in all
// four language tables (~180 KB of source), defeating the point of the
// per-language split in ./i18n/*.js. LanguageContext loads English eagerly
// and the other tables via dynamic import, one at a time, on demand.
//
// This file exists for tooling that legitimately needs every table at once
// (the translation-coverage test, scripts, etc.).
import en from './i18n/en'
import ar from './i18n/ar'
import fr from './i18n/fr'
import es from './i18n/es'

export const translations = { en, ar, fr, es }
