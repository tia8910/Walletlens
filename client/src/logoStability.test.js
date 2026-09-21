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
    const body = onLoad.slice(0, onLoad.indexOf('\n  }\n'))
    expect(body).toMatch(/const src = el\?\.currentSrc \|\| el\?\.src \|\| ''/)
    expect(body).toMatch(/rememberResolved\(logoKey, src\)/)
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

describe('the ladder does not advance past a load that never started', () => {
  it('does not lazy-load a 36px icon', () => {
    // Below the fold a lazy image does not begin fetching until it is scrolled
    // to, while the advance timer starts at mount. The timer wins, every
    // stage is skipped in turn, and the row ends on the letter badge — which
    // is why the logo only came back after opening an asset and returning,
    // the one thing that remounts the row while it is in view.
    expect(logo).not.toMatch(/loading: 'lazy'/)
  })

  it('stops the clock while the app is in the background', () => {
    // A hidden document throttles timers and defers image loads, so the timer
    // would advance past stages the browser never attempted.
    const eff = logo.slice(logo.indexOf('const arm = () => {'))
    expect(eff.slice(0, eff.indexOf('\n    }'))).toMatch(/if \(document\.hidden\) return/)
  })

  it('re-arms the clock when the app comes back', () => {
    expect(logo).toMatch(/const onVisible = \(\) => \{ if \(!document\.hidden\) arm\(\) \}/)
  })

  it('rebuilds an exhausted ladder on return, instead of waiting for a remount', () => {
    const eff = logo.slice(logo.indexOf('const retriesRef = useRef(0)'))
    const body = eff.slice(0, eff.indexOf('}, [stageIdx, STAGES.length])'))
    expect(body).toMatch(/if \(stageIdx < STAGES\.length\) return/)
    expect(body).toMatch(/setStageIdx\(0\)/)
  })

  it('bounds that retry, so a logo-less asset does not re-walk six CDNs forever', () => {
    expect(logo).toMatch(/const MAX_RETRIES = 2/)
    expect(logo).toMatch(/retriesRef\.current >= MAX_RETRIES/)
  })
})

describe('a dark logo gets something to sit on', () => {
  it('measures the ink rather than keeping a list of coin ids', () => {
    // A list is wrong the moment a project restyles its logo.
    expect(logo).toMatch(/function measureInk\(img\)/)
    expect(logo).toMatch(/0\.2126 \* data\[i\] \+ 0\.7152 \* data\[i \+ 1\] \+ 0\.0722 \* data\[i \+ 2\]/)
  })

  it('ignores the transparent ground when averaging', () => {
    const fn = logo.slice(logo.indexOf('function measureInk'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/if \(a < 32\) continue/)
  })

  it('leaves the icon alone when it cannot tell', () => {
    // A tainted canvas or a browser without one returns null, and guessing
    // "dark" on no evidence would put a white disc behind every logo.
    const fn = logo.slice(logo.indexOf('function measureInk'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/return null/)
    expect(logo).toMatch(/if \(ink === null\) return/)
  })

  it('caches the verdict per URL, so it is paid once per icon', () => {
    expect(logo).toMatch(/const DARK_KEY = 'wl_logo_dark'/)
    expect(logo).toMatch(/const known = DARKNESS\[src\]/)
    expect(logo).toMatch(/if \(typeof known === 'boolean'\) \{ setNeedsPlate\(known\); return \}/)
  })

  it('applies the plate on the first frame for an icon already judged', () => {
    // Otherwise a known-dark mark flashes unreadable until its own onLoad runs.
    expect(logo).toMatch(/const plate = needsPlate \|\| DARKNESS\[stageSrc\] === true/)
  })

  it('paints the disc behind every image stage, not just the first', () => {
    expect(logo).not.toMatch(/<img \{\.\.\.common\} src=/)
    expect(logo.match(/<img \{\.\.\.withPlate\} src=/g).length).toBeGreaterThanOrEqual(6)
  })

  it('is a background, so a logo that fills its own circle hides it', () => {
    // The row's class already rounds the icon, so this needs no padding and
    // changes nothing for an opaque icon.
    expect(logo).toMatch(/style: \{ \.\.\.\(common\.style \|\| \{\}\), background: '#fff' \}/)
  })
})
