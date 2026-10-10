import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Chrome extension's page is a static file (public/chrome-extension/),
// served ahead of the SPA catch-all. Like the tour, it carries its own SEO, so
// these pin what a crawler or an AI assistant reads before any script runs.

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf8')
const html = read('../public/chrome-extension/index.html')
const markup = html.slice(0, html.lastIndexOf('<script>'))
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
const node = (type) => ld['@graph'].find(n => n['@type'] === type)
const STORE = 'https://chromewebstore.google.com/detail/walletlens-portfolio/ajmjdeobjjmabgonhaeaaehoepfafhbn'
const decode = s => s.replace(/&amp;/g, '&').replace(/<[^>]+>/g, '')

describe('the Chrome extension page', () => {
  it('has one h1, a short title, a snippet sized description and its own canonical', () => {
    expect(markup.match(/<h1[\s>]/g)).toHaveLength(1)
    const title = decode(html.match(/<title>([^<]+)<\/title>/)[1])
    expect(title).toMatch(/Chrome Extension/)
    expect(title.length).toBeLessThanOrEqual(60)
    const desc = decode(html.match(/<meta name="description" content="([^"]+)"/)[1])
    expect(desc.length).toBeGreaterThan(120)
    expect(desc.length).toBeLessThanOrEqual(160)
    expect(html).toContain('<link rel="canonical" href="https://walletlens.live/chrome-extension/">')
    expect(html).toContain('<meta property="og:url" content="https://walletlens.live/chrome-extension/">')
    expect(html).toMatch(/<meta name="robots" content="index, follow/)
  })

  it('answers "what is it" in plain HTML for search snippets and AI answers', () => {
    expect(markup).toMatch(/<h2 id="what-h">What is the WalletLens Chrome extension\?<\/h2>/)
    expect(markup).toMatch(/<p id="answer">The WalletLens Chrome extension is a free net worth and portfolio tracker/)
    expect(node('WebPage').speakable.cssSelector).toEqual(['h1', '#answer'])
    expect(markup).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}">/)
  })

  it('describes the extension, the install steps and the path in structured data', () => {
    const app = node('SoftwareApplication')
    expect(app.applicationCategory).toBe('BrowserApplication')
    expect(app.installUrl).toBe(STORE)
    expect(app.offers.price).toBe('0')
    expect(app).not.toHaveProperty('aggregateRating')
    expect(node('HowTo').step).toHaveLength(5)
    expect(markup.match(/<ol class="steps[^"]*">([\s\S]*?)<\/ol>/)[1].match(/<li>/g)).toHaveLength(5)
    expect(node('BreadcrumbList').itemListElement.at(-1).item).toBe('https://walletlens.live/chrome-extension/')
  })

  it('shows the same questions and answers on the page as in the FAQ data', () => {
    const faq = node('FAQPage').mainEntity
    expect(faq.length).toBeGreaterThanOrEqual(8)
    for (const q of faq) {
      expect(markup).toContain(`<h3>${q.name}</h3>`)
      expect(markup).toContain(q.acceptedAnswer.text)
    }
  })

  it('sends people to the store and to the app, and counts both', () => {
    expect(markup.split(`href="${STORE}"`).length - 1).toBeGreaterThanOrEqual(3)
    expect(markup).toContain('href="/dashboard/"')
    expect(html).toContain("page: 'chrome_extension'")
    expect(html).toContain("'extension_install_click'")
  })

  it('makes no claim the extension cannot back up', () => {
    const manifest = JSON.parse(read('../../extension/manifest.json'))
    expect(html).toContain(`"softwareVersion":"${manifest.version}"`)
    // Storage, alarms for the 15 minute check, notifications for alerts:
    // nothing that reads other sites, and the page names all three.
    expect(manifest.permissions).toEqual(['storage', 'alarms', 'notifications'])
    expect(manifest.permissions.every(x => html.includes(x))).toBe(true)
    expect(manifest.host_permissions.every(h => !/<all_urls>|\*:\/\/\*\//.test(h))).toBe(true)
    expect(html).not.toMatch(/\$20|USDT|ratingValue|reviewCount/)
  })
})

describe('the Chrome extension page is linked everywhere it should be', () => {
  it('is in the sitemap, llms.txt and the home page, and short names redirect to it', () => {
    expect(read('../scripts/prerender.mjs')).toContain("{ path: '/chrome-extension', changefreq: 'monthly', priority: '0.9' }")
    const llms = read('../public/llms.txt')
    expect(llms).toContain('https://walletlens.live/chrome-extension/')
    const tour = read('../public/tour/index.html')
    expect(tour).toContain('<a href="/chrome-extension/">Chrome extension</a>')
    const redirects = read('../public/_redirects')
    expect(redirects).toMatch(/^\/extension\s+\/chrome-extension\/ 301$/m)
    expect(redirects.indexOf('/chrome-extension/ 301')).toBeLessThan(redirects.indexOf('/* /index.html 200'))
  })

  it('is reached from the app: More and the Settings banner', () => {
    expect(read('components/InstallExtension.jsx')).toContain("export const EXTENSION_PAGE = '/chrome-extension/'")
    expect(read('components/InstallExtension.jsx')).toMatch(/href=\{EXTENSION_PAGE\}/)
    const more = read('pages/More.jsx')
    expect(more).toMatch(/isMsStore\(\) \? \[\] : \[\{ icon: 'globe', label: t\('chromeExtension'\), to: EXTENSION_PAGE, page: true \}\]/)
    expect(more).toContain('window.location.assign(l.to)')
    for (const l of ['en', 'ar', 'fr', 'es', 'de', 'it']) expect(read(`i18n/${l}.js`), l).toMatch(/chromeExtension: '/)
  })
})
