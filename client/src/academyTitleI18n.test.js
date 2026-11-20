import { describe, it, expect } from 'vitest'
import { academyVideos, cleanTitle } from './data/academyVideos.js'
import { TITLE_I18N } from './data/academyTitleI18n.js'
import synced from './data/academyVideoLinks.js'
import { academyCopy } from './data/academyCopy.js'

describe('Academy titles in the reader\'s language', () => {
  it('has every app language for every channel video', () => {
    for (const v of synced.extras) {
      for (const l of ['en', 'fr', 'es', 'de', 'it']) expect(TITLE_I18N[v.youtube]?.[l], `${v.youtube} ${l}`).toBeTruthy()
    }
  })
  it('shows the translation, and the Arabic original to Arabic readers', () => {
    const id = 'TJQl0_GZEkw'
    expect(academyVideos('en').find(v => v.id === id).name).toBe('6 things never to do with your money if you want to win')
    expect(academyVideos('ar').find(v => v.id === id).name).toMatch(/حاجات/)
  })
  it('keeps RSI and MACD as written inside an Arabic title', () => {
    expect(cleanTitle('المؤشرات وRSI وMACD')).toBe('المؤشرات وRSI وMACD')
    expect(cleanTitle('STOP CHASING PUMPS')).toBe('Stop chasing pumps')
  })
  it('tells non-Arabic readers where YouTube\'s dubbed audio is', () => {
    for (const l of ['en', 'fr', 'es', 'de', 'it']) expect(academyCopy(l).dubNote).toBeTruthy()
    expect(academyCopy('ar').dubNote).toBe('')
  })
})
