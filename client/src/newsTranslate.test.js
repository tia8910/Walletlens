import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from './LanguageContext'

const here = dirname(fileURLToPath(import.meta.url))

describe('news headlines are translated into every app language', () => {
  it('the translate endpoint accepts every language the app ships', () => {
    const src = readFileSync(join(here, '../../functions/api/translate.js'), 'utf8')
    const langs = [...src.match(/const LANGS = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map(m => m[1])
    for (const { code } of LANGUAGES) {
      if (code === 'en') continue
      expect(langs, `news for ${code}`).toContain(code)
    }
  })
})
