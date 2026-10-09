import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('footer links', () => {
  it('render the footer on public pages only', () => {
    expect(read('App.jsx')).toMatch(/\{\(isLanding \|\| location\.pathname\.replace\(\/\\\/\+\$\/, ''\) === '\/terms'\) && <AppFooter \/>\}/)
  })
  it('live in More → About WalletLens', () => {
    const more = read('pages/More.jsx')
    for (const to of ['/about', '/faq', '/blog', '/privacy', '/terms']) expect(more).toContain(`to: '${to}'`)
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) expect(read(`i18n/${l}.js`)).toContain('nlAboutGroup:')
  })
})
