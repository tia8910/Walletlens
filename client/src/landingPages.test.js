import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLandings, LANDING_ROUTES, pathFor } from '../scripts/landings/build.mjs'
import { LANGS, ZAKAT, GUARDIAN } from '../scripts/landings/copy.mjs'

// The Zakat and Portfolio Guardian landing pages, six languages each. They are
// plain HTML written into dist/ at build time, so these pin what a crawler or
// an answer engine reads on first fetch.

const here = dirname(fileURLToPath(import.meta.url))
const pages = buildLandings()
const ldOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
const node = (ld, type) => ld['@graph'].find(n => n['@type'] === type)
const decode = s => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

describe('zakat and guardian landing pages', () => {
  it('builds 12 pages: both pages in every app language', () => {
    expect(LANGS).toEqual(['en', 'ar', 'fr', 'es', 'de', 'it'])
    expect(pages).toHaveLength(12)
    expect(LANDING_ROUTES).toContain('/zakat/')
    expect(LANDING_ROUTES).toContain('/ar/zakat/')
    expect(LANDING_ROUTES).toContain('/portfolio-guardian/')
    expect(LANDING_ROUTES).toContain('/de/portfolio-guardian/')
  })

  it.each(pages.map(p => [p.path, p]))('%s has its language, canonical and full hreflang cluster', (path, p) => {
    const { html, lang, page } = p
    expect(html).toContain(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`)
    expect(html).toContain(`<link rel="canonical" href="https://walletlens.live${path}">`)
    for (const l of LANGS) expect(html).toContain(`hreflang="${l}" href="https://walletlens.live${pathFor(page, l)}"`)
    expect(html).toContain(`hreflang="x-default" href="https://walletlens.live${pathFor(page, 'en')}"`)
    expect(html.match(/<h1>/g)).toHaveLength(1)
    const title = html.match(/<title>(.*?)<\/title>/)[1]
    expect(decode(title).length).toBeLessThanOrEqual(80)
    const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)[1])
    expect(desc.length).toBeGreaterThan(110)
    expect(desc.length).toBeLessThanOrEqual(200)
  })

  it.each(pages.map(p => [p.path, p]))('%s has structured data that matches the visible page', (path, { html }) => {
    const ld = ldOf(html)
    const faq = node(ld, 'FAQPage')
    const visible = [...html.matchAll(/<summary><h3>(.*?)<\/h3><\/summary><p>(.*?)<\/p>/g)].map(m => [decode(m[1]), decode(m[2])])
    expect(faq.mainEntity.map(q => [q.name, q.acceptedAnswer.text])).toEqual(visible)
    expect(visible.length).toBeGreaterThanOrEqual(5)
    const app = node(ld, 'WebApplication')
    expect(app.offers.price).toBe('0')
    expect(app.isAccessibleForFree).toBe(true)
    expect(node(ld, 'HowTo').step).toHaveLength(3)
    expect(node(ld, 'BreadcrumbList').itemListElement[1].item).toBe(`https://walletlens.live${path}`)
    expect(node(ld, 'WebPage').url).toBe(`https://walletlens.live${path}`)
  })

  it('states the real zakat rules in every language', () => {
    for (const l of LANGS) {
      const c = ZAKAT[l]
      const text = JSON.stringify(c).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      expect(text).toMatch(/85/)
      expect(text).toMatch(/595/)
      expect(text).toMatch(/2[.,٫]5/)
      expect(text).toMatch(/2[.,٫]577/)
    }
  })

  it('states how Guardian really behaves in every language', () => {
    for (const l of LANGS) {
      const text = JSON.stringify(GUARDIAN[l]).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      for (const n of ['30', '90', '180', '14', '500']) expect(text).toContain(n)
      expect(GUARDIAN[l].never).toHaveLength(3)
    }
  })

  it('keeps the copy free of dashes', () => {
    for (const c of [ZAKAT, GUARDIAN]) expect(JSON.stringify(c)).not.toMatch(/[—–]| - /)
  })

  it('links each CTA to the working tool', () => {
    const get = (p) => pages.find(x => x.path === p).html
    expect(get('/zakat/')).toContain('href="/zakat-calculator/" data-cta="zakat_hero"')
    expect(get('/ar/zakat/')).toContain('href="/ar/zakat-calculator/" data-cta="zakat_hero"')
    expect(get('/fr/portfolio-guardian/')).toContain('href="/guardian" data-cta="guardian_hero"')
    expect(get('/zakat/')).toContain('href="/portfolio-guardian/"')
    expect(get('/it/portfolio-guardian/')).toContain('href="/it/zakat/"')
  })

  it('keeps the Microsoft Store edition off pages that promote other stores', () => {
    for (const { html } of pages) {
      expect(html).toContain("location.replace('/dashboard' + location.search)")
      expect(html).toContain('apps.microsoft.com/detail/9pkvkn0p9dx2')
    }
  })

  it('shows a flag for every language and the platform badges', () => {
    for (const { html, page } of pages) {
      expect(html).toContain('<img class="fl" src="/flags/gb.svg"')
      expect(html).toContain('<img class="fl" src="/flags/sa.svg"')
      expect(html.match(/<svg class="fl"/g).length).toBeGreaterThanOrEqual(8)
      const list = html.match(/<ul class="langs">([\s\S]*?)<\/ul>/)[1]
      for (const l of LANGS) expect(list).toContain(`href="${pathFor(page, l)}" hreflang="${l}"`)
      const badges = html.match(/<div class="badges">([\s\S]*?)<\/div>/)[1]
      expect(badges.match(/class="badge"/g)).toHaveLength(4)
      for (const href of ['play.google.com/store/apps/details?id=live.walletlens.twa', 'apps.microsoft.com/detail/9pkvkn0p9dx2', '/chrome-extension/', '/dashboard']) expect(badges).toContain(href)
    }
    expect(existsSync(join(here, '../public/flags/gb.svg'))).toBe(true)
    expect(existsSync(join(here, '../public/flags/sa.svg'))).toBe(true)
  })

  it('is listed in llms.txt and the tour footer', () => {
    const llms = readFileSync(join(here, '../public/llms.txt'), 'utf8')
    expect(llms).toContain('https://walletlens.live/zakat/')
    expect(llms).toContain('https://walletlens.live/portfolio-guardian/')
    expect(llms).toContain('https://walletlens.live/ar/portfolio-guardian/')
    const tour = readFileSync(join(here, '../public/tour/index.html'), 'utf8')
    expect(tour).toContain('<a href="/zakat/">Zakat</a>')
    expect(tour).toContain('<a href="/portfolio-guardian/">Portfolio Guardian</a>')
  })

  it('is written into the build and the sitemap', () => {
    const dist = join(here, '../dist')
    if (!existsSync(join(dist, 'sitemap.xml'))) return
    const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8')
    for (const r of LANDING_ROUTES) {
      expect(sitemap).toContain(`<loc>https://walletlens.live${r}</loc>`)
      expect(existsSync(join(dist, r, 'index.html'))).toBe(true)
    }
  })
})
