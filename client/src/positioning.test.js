import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// WalletLens is positioned as an investment management app. "Tracker" stays as
// a secondary search term on the pages that rank for it, but the brand pages,
// the AI guide and the structured data lead with investment management.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')

describe('investment management positioning', () => {
  it('leads the site head and structured data', () => {
    const html = read('../index.html')
    expect(html).toMatch(/<title>WalletLens — Private Investment Management App<\/title>/)
    expect(html).toMatch(/"applicationSubCategory": "Investment Management/)
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    for (const b of blocks) expect(() => JSON.parse(b[1])).not.toThrow()
  })

  it('leads the AI guide, and says what WalletLens is not', () => {
    const llms = read('../public/llms.txt')
    expect(llms.split('\n').slice(0, 4).join(' ')).toMatch(/investment management app/)
    expect(llms).toMatch(/not\*\*: a broker, exchange, bank or licensed financial adviser/)
  })

  it('keeps the AI guide accurate', () => {
    const llms = read('../public/llms.txt')
    // Screenshots are read on the device (screenshotOcr.js), never by a cloud model.
    expect(llms).not.toMatch(/Claude vision/)
    // The repository link 404s while the account is flagged; do not send people to it.
    expect(llms).not.toMatch(/github\.com\/tia8910/)
  })

  it('has a page for the search it leads with, in the app, the sitemap and the build', () => {
    const pre = read('../scripts/prerender.mjs')
    expect(pre).toMatch(/write\('\/investment-management-app'/)
    expect(pre).toMatch(/path: '\/investment-management-app', changefreq/)
    expect(read('App.jsx')).toMatch(/<Route path="\/investment-management-app" element=\{<Landing \/>\} \/>/)
    const built = join(here, '../dist/investment-management-app/index.html')
    if (existsSync(built)) {
      const page = readFileSync(built, 'utf8')
      // Every FAQ answer in the structured data is also on the page.
      const ld = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
      const faq = ld.flat().find(x => x['@type'] === 'FAQPage')
      expect(faq.mainEntity.length).toBeGreaterThan(3)
      for (const q of faq.mainEntity) expect(page).toContain(`<h3>${q.name}</h3>`)
    }
  })
})
