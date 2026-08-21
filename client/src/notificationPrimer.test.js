// The web had no equivalent of the Android shell's launch prompt.
//
// NotificationPrimer returned early when the portfolio was empty, so a browser
// user who had not added a holding yet was never asked at all, and push simply
// stayed off with nothing on screen explaining why. On a fresh profile — every
// preview URL, every first visit — that was the only path there is.
//
// The component has no test harness here, so these read its source. That is
// weaker than rendering it, but it covers the two things that would silently
// undo the fix: the gate coming back, and the gate going without the copy that
// made removing it safe.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translations } from './i18n'

describe('the permission primer', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'components/NotificationPrimer.jsx'),
    'utf8',
  )

  it('does not refuse to ask an empty portfolio', () => {
    // The specific shape of the old gate: bail out before showing anything.
    expect(src).not.toMatch(/if\s*\(\s*watchFromStorage\(\)\.length\s*===\s*0\s*\)\s*return/)
  })

  it('says something different to an empty portfolio', () => {
    // Removing the gate without changing the copy would promise news about
    // holdings to someone who has none, which is the reason the gate existed.
    expect(src).toContain('npAskTitleEmpty')
    expect(src).toContain('npAskBodyEmpty')
    for (const lang of ['en', 'ar', 'fr', 'es']) {
      const table = translations[lang]
      expect(table.npAskTitleEmpty, lang).toBeTruthy()
      expect(table.npAskBodyEmpty, lang).toBeTruthy()
      expect(table.npAskBodyEmpty, lang).not.toBe(table.npAskBody)
    }
  })
})
