import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// In Arabic the ticker's row starts at the right edge and runs off to the
// left. Scrolling it left, as in English, carried every tip out of view and
// left an empty bar beside an English "BEARISH" badge.
const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'components/SentimentTicker.jsx'), 'utf8')

describe('sentiment ticker in right-to-left languages', () => {
  it('scrolls the other way when the page is right to left', () => {
    expect(src).toMatch(/const dir = isRtl \? 1 : -1/)
    expect(src).toMatch(/posRef\.current \+= 0\.6 \* dir/)
  })

  it('translates the mood badge instead of printing English', () => {
    expect(src).not.toMatch(/'BEARISH'|'BULLISH'|'NEUTRAL'/)
    for (const lang of ['en', 'ar', 'fr', 'es', 'de', 'it']) {
      const file = readFileSync(join(here, `i18n/${lang}.js`), 'utf8')
      for (const k of ['stLblBull', 'stLblBear', 'stLblNeutral']) expect(file, `${lang} ${k}`).toMatch(new RegExp(`${k}:`))
    }
  })
})
