import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from './LanguageContext'

// The notifications the Android shell sends are the only WalletLens text a
// user reads without opening the app, and they were English no matter which
// language they had chosen — the copy was string literals inside
// PeriodicUpdateWorker.java.
//
// It now reads res/values*/notification_copy.xml, three pairs of parallel
// string-arrays, with the URLs left in Java so there is one copy of each
// rather than four. Nothing in the toolchain checks that those arrays stay the
// same length: Android silently returns a shorter array, and the worker would
// pair a title with the wrong body and deep link. There is no Java test
// harness here, so this reads the XML directly.

const SRC = dirname(fileURLToPath(import.meta.url))
const ANDROID = join(SRC, '..', '..', 'walletlens_source/release_package/app/src/main')
const RES = join(ANDROID, 'res')
const WORKER = join(ANDROID, 'java/live/walletlens/twa/PeriodicUpdateWorker.java')

const LANGS = LANGUAGES.map(l => l.code)
const SETS = ['hack', 'academy', 'feature']

const resFile = (lang) =>
  join(RES, lang === 'en' ? 'values' : `values-${lang}`, 'notification_copy.xml')

/** Item counts for every string-array in a resource file, by array name. */
function arrays(xml) {
  const out = {}
  for (const m of xml.matchAll(/<string-array name="([^"]+)">([\s\S]*?)<\/string-array>/g)) {
    out[m[1]] = [...m[2].matchAll(/<item>([\s\S]*?)<\/item>/g)].map(i => i[1])
  }
  return out
}

/** Lengths of the URL arrays still declared in Java. */
function javaUrlCounts() {
  const java = readFileSync(WORKER, 'utf8')
  const out = {}
  for (const m of java.matchAll(/private static final String\[\] (\w+)_URLS = \{([\s\S]*?)\};/g)) {
    out[m[1].toLowerCase()] = [...m[2].matchAll(/"https:\/\/[^"]+"/g)].length
  }
  return out
}

describe('Android notification copy', () => {
  it('ships a resource file for every language the picker offers', () => {
    // A missing file is not a build error — Android falls back to values/ —
    // so adding a language to LANGUAGES would silently leave its
    // notifications in English.
    const missing = LANGS.filter(l => !existsSync(resFile(l)))
    expect(missing).toEqual([])
  })

  for (const lang of LANGS) {
    it(`${lang}: titles, bodies and URLs are the same length`, () => {
      const a = arrays(readFileSync(resFile(lang), 'utf8'))
      const urls = javaUrlCounts()
      for (const set of SETS) {
        const titles = a[`notif_${set}_titles`]
        const bodies = a[`notif_${set}_bodies`]
        expect(titles, `notif_${set}_titles missing in ${lang}`).toBeTruthy()
        expect(bodies.length, `${set} bodies vs titles in ${lang}`).toBe(titles.length)
        expect(urls[set], `${set} URLs vs titles in ${lang}`).toBe(titles.length)
      }
    })

    it(`${lang}: no entry is empty`, () => {
      const a = arrays(readFileSync(resFile(lang), 'utf8'))
      const blank = []
      for (const [name, items] of Object.entries(a)) {
        items.forEach((v, i) => { if (!v.trim()) blank.push(`${name}[${i}]`) })
      }
      expect(blank).toEqual([])
    })

    if (lang !== 'en') {
      it(`${lang}: bodies are actually translated`, () => {
        // A copy-paste of the English file would pass every check above.
        const en = arrays(readFileSync(resFile('en'), 'utf8'))
        const tr = arrays(readFileSync(resFile(lang), 'utf8'))
        const same = []
        for (const set of SETS) {
          const key = `notif_${set}_bodies`
          en[key].forEach((v, i) => { if (v === tr[key][i]) same.push(`${key}[${i}]`) })
        }
        expect(same).toEqual([])
      })
    }
  }

  it('the worker reads the arrays instead of hard-coded English', () => {
    const java = readFileSync(WORKER, 'utf8')
    expect(java).toContain('R.array.notif_hack_titles')
    expect(java).toContain('R.array.notif_academy_titles')
    expect(java).toContain('R.array.notif_feature_titles')
    // The old literal tables must be gone, not merely unused.
    expect(java).not.toMatch(/String\[\]\[\]\s+(HACKS|ACADEMY|FEATURES)\s*=/)
  })

  it('the worker overrides the locale rather than trusting the device', () => {
    // An English phone can be running WalletLens in Arabic. Reading
    // getResources() directly would follow the phone, not the choice.
    const java = readFileSync(WORKER, 'utf8')
    expect(java).toContain('createConfigurationContext')
    expect(java).toContain('LangPrefs.KEY_LANG')
  })

  it('LangPrefs only accepts the languages the picker offers', () => {
    const prefs = readFileSync(join(ANDROID, 'java/live/walletlens/twa/LangPrefs.java'), 'utf8')
    const listed = prefs.match(/Arrays\.asList\(([^)]*)\)/)[1]
      .split(',').map(s => s.trim().replace(/"/g, ''))
    expect(listed.sort()).toEqual([...LANGS].sort())
  })

  it('the web sends the language on the widget-sync payload', () => {
    const widgets = readFileSync(join(SRC, 'nativeWidgets.js'), 'utf8')
    expect(widgets).toContain('lang: currentLang()')
    expect(widgets).toMatch(/export function syncLanguage/)

    const sync = readFileSync(join(ANDROID, 'java/live/walletlens/twa/WidgetSyncActivity.java'), 'utf8')
    expect(sync).toContain('LangPrefs.set(ctx, j.optString("lang", null))')
  })

  it('picking a language tells the shell and the push server right away', () => {
    const ctx = readFileSync(join(SRC, 'LanguageContext.jsx'), 'utf8')
    expect(ctx).toContain('syncLanguage')
    expect(ctx).toContain('syncAlerts')
  })
})
