import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// THE BUG: the review card and every widget sync were sent through a hidden
// iframe pointed at `intent://…`, and the app's own CSP said
// `frame-src https://accounts.google.com` — nothing else may load in a frame.
// Chrome blocked every one of them.
//
// Nothing threw. fireNativeIntent creates the iframe, records the attempt as
// 'iframe', and returns true; the block happens afterwards, in the browser, and
// is reported only as a console violation on a device nobody is looking at. So
// the web side said the intent was sent, the Settings diagnostics said the
// intent was sent, and no card ever appeared for anyone.
//
// This is the second time this exact shape of failure has hit this code path.
// The first was protocol launches being dropped because a TWA is Chrome rather
// than a WebView; the iframe was the fix for that one, and it went straight
// into a CSP that forbade it.
//
// The two CSPs are separate files and only one of them is what the deployed
// site actually serves, so both are checked.

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT = join(here, '..')
const read = (p) => readFileSync(join(CLIENT, p), 'utf8')

/**
 * The sources a directive allows, or the value of the directive CSP falls back
 * to when it is absent — frame-src falls back to child-src, then default-src.
 */
function frameSources(policy) {
  for (const directive of ['frame-src', 'child-src', 'default-src']) {
    const m = new RegExp(`${directive} ([^;]*)`).exec(policy)
    if (m) return m[1].trim().split(/\s+/)
  }
  return []
}

const POLICIES = [
  ['public/_headers', 'the header Cloudflare Pages actually serves'],
  ['index.html', 'the meta tag, which applies before the header on some paths'],
]

describe('CSP admits the native intent bridge', () => {
  for (const [file, why] of POLICIES) {
    it(`allows intent: in a frame — ${file} (${why})`, () => {
      const sources = frameSources(read(file))
      // `intent:` is a scheme source. Without it the iframe never loads and
      // both the review card and the widget sync are silently dropped.
      expect(sources).toContain('intent:')
    })
  }

  it('still confines frames to that and the Google sign-in origin', () => {
    // The point of the directive is that a frame cannot be pointed anywhere.
    // Widening it to '*' or dropping it would also make the test above pass.
    //
    // buymeacoffee was in here briefly for the support widget and is out
    // again: the widget's payment form was refused as a frame anyway, and the
    // header button that replaced it is a link, which frame-src does not
    // govern. Nothing needs the extra origins now, so they are gone rather
    // than left lying in the policy.
    for (const [file] of POLICIES) {
      const sources = frameSources(read(file))
      expect(sources).toEqual(['https://accounts.google.com', 'intent:'])
    }
  })

  it('is required because the bridge really does use an iframe', () => {
    // If the delivery mechanism ever stops being an iframe, the CSP entry is
    // dead weight — but so is this test, and it should be the thing that says
    // so rather than the entry quietly outliving its reason.
    const bridge = read('src/nativeBridge.js')
    expect(bridge).toMatch(/createElement\('iframe'\)/)
    expect(bridge).toMatch(/frame\.src = target/)
  })

  it('sends the automatic review ask down that path', () => {
    // reviewPrompt passes keepSession so the card lands over the running app
    // instead of relaunching it. That choice is what puts the ask behind
    // frame-src in the first place.
    expect(read('src/reviewPrompt.js')).toMatch(/\{ keepSession: true \}/)
  })

  it('sends every widget sync down that path too', () => {
    // Same blocked iframe, so the same CSP fix covers the widgets. Worth
    // asserting: "the widgets are empty" and "no review card" looked like two
    // unrelated complaints and were one bug.
    const widgets = read('src/nativeWidgets.js')
    // Matched to end of line: a `[^)]*` stops at the `)` inside
    // encodeURIComponent(...) and reports a false failure.
    const calls = widgets.match(/fireNativeIntent\(.*widget-sync.*$/gm) || []
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c).toContain('keepSession: true')
  })
})
