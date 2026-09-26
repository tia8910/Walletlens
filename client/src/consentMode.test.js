import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../index.html'), 'utf8')

/** Runs the inline consent script against a stub gtag and returns what it set. */
function consentFor({ twa }) {
  const start = html.indexOf('window.dataLayer = window.dataLayer')
  const end = html.indexOf("gtag('js', new Date());", start)
  const script = html.slice(start, end)
  const calls = []
  const localStorage = { getItem: (k) => (k === 'wl_twa' && twa ? '1' : null) }
  const dataLayer = []
  const window = { dataLayer }
  // eslint-disable-next-line no-new-func
  new Function('window', 'localStorage', 'dataLayer', `${script}; return 0`)
    .call(null, window, localStorage, dataLayer)
  for (const args of window.dataLayer) calls.push(Array.from(args))
  return calls.filter(c => c[0] === 'consent' && c[1] === 'default').map(c => c[2])
}

describe('Google Ads consent mode', () => {
  it('measures ad conversions on the website', () => {
    const global = consentFor({ twa: false }).find(d => !d.region)
    expect(global).toMatchObject({ ad_storage: 'granted', ad_user_data: 'granted', analytics_storage: 'granted' })
  })

  it('never personalises ads, anywhere', () => {
    for (const d of [...consentFor({ twa: false }), ...consentFor({ twa: true })]) {
      expect(d.ad_personalization).toBe('denied')
    }
  })

  it('stays off in the Google Play app', () => {
    const global = consentFor({ twa: true }).find(d => !d.region)
    expect(global).toMatchObject({ ad_storage: 'denied', ad_user_data: 'denied' })
  })

  it('stays off in the EEA, UK and Switzerland without a consent banner', () => {
    const eea = consentFor({ twa: false }).find(d => d.region)
    expect(eea).toMatchObject({ ad_storage: 'denied', ad_user_data: 'denied' })
    for (const cc of ['DE', 'FR', 'IT', 'ES', 'NL', 'GB', 'CH', 'NO']) expect(eea.region).toContain(cc)
  })

  it('is disclosed in the privacy policy', () => {
    const privacy = readFileSync(join(here, 'legal/privacy.js'), 'utf8')
    expect(privacy).toMatch(/Google Ads conversion measurement is enabled/)
    expect(privacy).toMatch(/not used for personalised advertising/)
  })
})

describe('Google Ads tag', () => {
  it('configures AW-18295184733 on the website, through the existing gtag.js', () => {
    expect(html).toMatch(/if \(!inPlayApp\) gtag\('config', 'AW-18295184733'\)/)
    // One loader only: the Ads id rides the gtag.js already on the page.
    expect(html.match(/googletagmanager\.com\/gtag\/js/g)).toHaveLength(1)
  })

  it('is allowed by the CSP', () => {
    const headers = readFileSync(join(here, '../public/_headers'), 'utf8')
    const csp = headers.split('\n').find(l => l.includes('Content-Security-Policy'))
    for (const host of ['https://www.googleadservices.com', 'https://googleads.g.doubleclick.net', 'https://www.google.com']) {
      expect(csp).toContain(host)
    }
    // No frame is admitted for it: the td.doubleclick.net iframe serves
    // remarketing, which stays off (ad_personalization denied).
    expect(csp).not.toMatch(/frame-src [^;]*doubleclick/)
  })
})
