import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A logo that has been on screen must never turn back into initials.
//
// Two things made it do that. The Dashboard replaced its whole coinImages map
// with each refresh's result, so a partial response left `image` undefined for
// the assets it did not carry — and CoinLogo restarted its fallback ladder
// whenever `image` changed, including from a URL to undefined. The ladder then
// re-ran without its best stage, walked CDNs the device may not reach, and
// settled on the generated letter badge, where it stayed for the session.

const here = dirname(fileURLToPath(import.meta.url))
const logo = readFileSync(join(here, 'components/CoinLogo.jsx'), 'utf8')
const dash = readFileSync(join(here, 'pages/Dashboard.jsx'), 'utf8')

describe('a logo that loaded stays loaded', () => {
  it('records the URL that actually rendered', () => {
    const onLoad = logo.slice(logo.indexOf('const onLoad = (e)'))
    expect(onLoad.slice(0, onLoad.indexOf('\n  }'))).toMatch(/rememberResolved\(logoKey, el\?\.currentSrc \|\| el\?\.src/)
  })

  it('starts the ladder from that URL, ahead of every guess', () => {
    const stages = logo.slice(logo.indexOf('const STAGES = useMemo'))
    const list = stages.slice(0, stages.indexOf('].filter(Boolean)'))
    expect(list.indexOf('resolved ?')).toBeLessThan(list.indexOf('image    &&'))
    expect(list.indexOf('resolved ?')).toBeLessThan(list.indexOf('jsdelivr:'))
  })

  it('keeps it across restarts, so logos are there in the first frame', () => {
    expect(logo).toMatch(/const RESOLVED_KEY = 'wl_logo_resolved'/)
    expect(logo).toMatch(/localStorage\.setItem\(RESOLVED_KEY/)
    // And survives a device that cannot store it at all.
    expect(logo).toMatch(/catch \{ RESOLVED = \{\} \}/)
  })

  it('does not restart the ladder just because the URL went away', () => {
    const eff = logo.slice(logo.indexOf('const assetRef = useRef'))
    const body = eff.slice(0, eff.indexOf('}, [image, sym, coinId])'))
    expect(body).toMatch(/if \(!changedAsset && !image\) return/)
  })

  it('still restarts it for a different asset', () => {
    const eff = logo.slice(logo.indexOf('const assetRef = useRef'))
    expect(eff.slice(0, eff.indexOf('}, [image, sym, coinId])'))).toMatch(/const changedAsset = assetRef\.current !== id/)
  })
})

describe('the image map is folded, not replaced', () => {
  it('merges every result into what is already held', () => {
    expect(dash).toMatch(/const mergeCoinImages = useCallback/)
    expect(dash).toMatch(/api\.getCoinImages\(ids\)\.then\(mergeCoinImages\)/)
    expect(dash).not.toMatch(/setCoinImages\(imgs \|\| \{\}\)/)
  })

  it('never writes an empty url over a real one', () => {
    const fn = dash.slice(dash.indexOf('const mergeCoinImages'))
    expect(fn.slice(0, fn.indexOf('\n  }, []'))).toMatch(/Object\.keys\(next\)\.filter\(k => next\[k\]\)/)
  })

  it('paints from the persisted cache before the network call returns', () => {
    expect(dash).toMatch(/const url = getCachedCoinImage\(id\)/)
    const load = dash.slice(dash.indexOf('const cachedLogos = {}'))
    expect(load.indexOf('mergeCoinImages(cachedLogos)')).toBeLessThan(load.indexOf('api.getCoinImages(ids)'))
  })

  it('leaves setCoinImages with no caller that assigns', () => {
    for (const m of dash.matchAll(/setCoinImages\(([^)]*)\)/g)) {
      expect(m[1].trim(), `setCoinImages(${m[1]}) bypasses the merge`).toMatch(/^prev =>/)
    }
  })
})
