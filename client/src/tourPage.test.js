import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// /tour/ is a static page (public/tour/index.html), served as a file ahead of
// the SPA catch-all. It carries its own SEO, so these pin what a crawler or
// an AI assistant reads before any script runs.

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../public/tour/index.html'), 'utf8')
const markup = html.slice(0, html.lastIndexOf('<script>'))
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
const node = (type) => ld['@graph'].find(n => n['@type'] === type)

describe('the tour page', () => {
  it('has one h1, a canonical URL and a description', () => {
    expect(markup.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/walletlens\.live\/tour\/">/)
    const desc = html.match(/<meta name="description" content="([^"]+)"/)[1]
    expect(desc.length).toBeGreaterThan(80)
    expect(desc.length).toBeLessThanOrEqual(260)
  })

  it('answers "what is WalletLens" in plain HTML, with a dated footer', () => {
    expect(markup).toMatch(/<h2 id="h-what">What is WalletLens\?<\/h2>/)
    expect(markup).toMatch(/<p id="answer"><b>WalletLens is a free net worth tracker<\/b>/)
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
  })

  it('loads only what the site CSP allows: self-hosted fonts, no font CDN', () => {
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    expect(html).toMatch(/url\('\/fonts\/sora-latin\.woff2'\)/)
  })

  it('has no placeholder links and no mockup labels', () => {
    expect(html).not.toMatch(/href="#"/)
    expect(html.toLowerCase()).not.toMatch(/mockup/)
  })

  it('is listed in the sitemap and in llms.txt', () => {
    expect(readFileSync(join(here, '../scripts/prerender.mjs'), 'utf8')).toMatch(/\{ path: '\/tour',/)
    expect(readFileSync(join(here, '../public/llms.txt'), 'utf8')).toMatch(/https:\/\/walletlens\.live\/tour\//)
  })
})
