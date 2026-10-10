import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The home page is a static file (public/tour/index.html) that the Pages
// worker serves at /, ahead of the SPA catch-all. It carries its own SEO, so these pin what a crawler or
// an AI assistant reads before any script runs.

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../public/tour/index.html'), 'utf8')
const markup = html.slice(0, html.lastIndexOf('<script>'))
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
const node = (type) => ld['@graph'].find(n => n['@type'] === type)

describe('the tour page', () => {
  it('has one h1, the home page as its canonical URL and a description', () => {
    expect(markup.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/walletlens\.live\/">/)
    expect(html).toMatch(/<meta property="og:url" content="https:\/\/walletlens\.live\/">/)
    const desc = html.match(/<meta name="description" content="([^"]+)"/)[1]
    expect(desc.length).toBeGreaterThan(80)
    expect(desc.length).toBeLessThanOrEqual(260)
  })

  it('answers "what is WalletLens" in plain HTML, with a dated footer', () => {
    expect(markup).toMatch(/<h2 id="h-what">What is WalletLens\?<\/h2>/)
    expect(markup).toMatch(/<p id="answer">WalletLens is the free app that turns everything you own into one live number/)
    expect(markup).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}">/)
    expect(node('WebPage').dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps the FAQPage structured data identical to the visible FAQ', () => {
    const visible = [...markup.matchAll(/<summary>([^<]+)<\/summary><p>([^<]+)<\/p>/g)]
      .map(([, q, a]) => [q, a].map(t => t.replace(/&quot;/g, '"').replace(/&amp;/g, '&')))
    const schema = node('FAQPage').mainEntity.map(e => [e.name, e.acceptedAnswer.text])
    expect(visible.length).toBeGreaterThanOrEqual(5)
    expect(schema).toEqual(visible)
  })

  it('describes the app, its price and where to install it', () => {
    const app = node('SoftwareApplication')
    expect(app.offers.price).toBe('0')
    expect(app.featureList.length).toBeGreaterThanOrEqual(10)
    expect(node('MobileApplication').installUrl).toMatch(/play\.google\.com\/store\/apps\/details\?id=live\.walletlens\.twa/)
    const windows = ld['@graph'].find(n => n.name === 'WalletLens for Windows')
    expect(windows.installUrl).toBe('https://apps.microsoft.com/detail/9pkvkn0p9dx2')
    expect(app.operatingSystem).toMatch(/Windows/)
    expect(app.downloadUrl).toContain('https://apps.microsoft.com/detail/9pkvkn0p9dx2')
  })

  it('shows the Microsoft Store badge next to Google Play and Chrome', () => {
    const badges = markup.match(/<a class="ms-badge" href="https:\/\/apps\.microsoft\.com\/detail\/9pkvkn0p9dx2"[^>]*>/g)
    expect(badges).toHaveLength(1)
    expect(badges[0]).toContain('data-cta="end_msstore"')
    expect(markup).toContain('<span><small>Get it from</small><b>Microsoft</b></span>')
    expect(markup).toContain('data-cta="answer_msstore" rel="noopener">Windows</a>')
    expect(html).toContain('data-cta="film_msstore"')
  })

  it('loads only what the site CSP allows: self-hosted fonts, no font CDN', () => {
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    expect(html).toMatch(/url\('\/fonts\/sora-latin\.woff2'\)/)
  })

  it('states the six app languages the app actually ships', () => {
    const src = readFileSync(join(here, 'LanguageContext.jsx'), 'utf8')
    const codes = [...src.slice(src.indexOf('export const LANGUAGES'), src.indexOf(']', src.indexOf('export const LANGUAGES'))).matchAll(/code: '(\w+)'/g)].map(m => m[1])
    expect(node('SoftwareApplication').inLanguage).toEqual(codes)
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
    expect(markup).toMatch(new RegExp(`<p id="answer">[^<]*in ${words[codes.length]} languages\\.</p>`))
    expect(markup).toMatch(new RegExp(`<dt>Languages</dt><dd>.*data-count="${codes.length}"`))
  })

  it('has no placeholder links and no mockup labels', () => {
    expect(html.toLowerCase()).not.toMatch(/wallet address/)
    expect(html).not.toMatch(/href="#"/)
    expect(html.toLowerCase()).not.toMatch(/mockup/)
  })

  it('is the home page: served at /, and /tour/ is not listed as a page of its own', () => {
    // /tour/ canonicalises to /, so the sitemap must not offer it separately.
    expect(readFileSync(join(here, '../scripts/prerender.mjs'), 'utf8')).not.toMatch(/\{ path: '\/tour',/)
    expect(readFileSync(join(here, '../public/llms.txt'), 'utf8')).not.toMatch(/walletlens\.live\/tour/)
    expect(readFileSync(join(here, '../vite.config.js'), 'utf8')).toMatch(/include: \[\n\s+'\/api\/\*',[\s\S]*?\n\s+'\/',\n/)
  })

  it('is installable: links the manifest and registers the service worker', () => {
    // / serves this page, so PWABuilder and browsers read the manifest from here.
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest">/)
    expect(html).toMatch(/navigator\.serviceWorker\.register\('\/sw\.js'\)/)
  })

  it('clears the hop flag the app sets when it sends its own "/" links here', () => {
    expect(html).toMatch(/sessionStorage\.removeItem\('wl_home_hop'\)/)
    const app = readFileSync(join(here, 'App.jsx'), 'utf8')
    expect(app).toMatch(/<Route path="\/" element=\{<StaticHome \/>\} \/>/)
    expect(app).toMatch(/const HOME_HOP = 'wl_home_hop'/)
  })
})

describe('the tour page keeps its h1 while the film plays', () => {
  it('has a fixed h1 outside the film, and scene captions are h2', () => {
    expect(markup).toMatch(/<h1 class="vh">WalletLens: unique investment manager and net worth tracker/)
    expect(markup).toMatch(/<div class="cap" id="cap"><h2>/)
    // The film no longer turns a caption into a second, changing h1.
    expect(html).not.toMatch(/replace\('<h2>', '<h1>'\)/)
  })
  it('has a title under 61 characters and a description under 161', () => {
    const title = html.match(/<title>([^<]+)<\/title>/)[1].replace(/&amp;/g, '&')
    expect(title.length).toBeLessThanOrEqual(60)
    const desc = html.match(/<meta name="description" content="([^"]+)"/)[1]
    expect(desc.length).toBeLessThanOrEqual(160)
    expect(desc).not.toMatch(/90 seconds/)
    expect(desc).toMatch(/6 languages/)
  })
})
