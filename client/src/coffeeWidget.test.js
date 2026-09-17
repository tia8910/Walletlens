import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Buy Me a Coffee floating widget, and the CSP that decides whether it
// runs at all.
//
// A third-party script under a strict CSP fails in the worst possible way: the
// browser refuses it, the console logs a violation nobody is looking at, and
// the page renders perfectly with the widget simply absent. There is no error
// state to notice. So the hosts are asserted rather than assumed.
//
// Two copies of the policy have to agree. The meta tag in index.html applies
// when the file is opened directly or served by something that sends no
// header; public/_headers is what Cloudflare Pages actually sends, and a
// served header wins. Widening one and forgetting the other produces a widget
// that works locally and is invisible in production.

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../index.html'), 'utf8')
const headers = readFileSync(join(here, '../public/_headers'), 'utf8')

/** The value of one CSP directive, from whichever policy is passed in. */
function directive(policy, name) {
  const m = policy.match(new RegExp(`(?:^|[;\\s])${name}\\s([^;]*)`))
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

const metaCsp = html.match(/http-equiv="Content-Security-Policy" content="([\s\S]*?)"/)[1]
const headerCsp = headers.match(/Content-Security-Policy:\s*([^\n]*)/)[1]

describe('the widget is on the page', () => {
  it('loads the script from this origin, not the blocked CDN', () => {
    // cdnjs.buymeacoffee.com fails in 14ms on the target network — refused
    // before it leaves the machine, by the filtering resolver that
    // functions/api/icon.js documents. Same relay, same reason.
    expect(html).toContain('src="/api/bmc"')
    expect(html).not.toContain('src="https://cdnjs.buymeacoffee.com')
    expect(html).toContain('data-name="BMC-Widget"')
  })

  it('the relay is wired into the worker bundle', () => {
    // functions/ is not compiled by a direct upload; only _worker.js is. A
    // function that is not in this map does not exist in production.
    const entry = readFileSync(join(here, '../scripts/pages-worker-entry.js'), 'utf8')
    expect(entry).toContain("'/api/bmc': bmc")
    expect(entry).toContain("import * as bmc from '../../functions/api/bmc.js'")
  })

  it('the relay is not an open proxy', () => {
    const fn = readFileSync(join(here, '../../functions/api/bmc.js'), 'utf8')
    expect(fn).toContain("const UPSTREAM = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js'")
    // No caller-supplied target anywhere in it.
    expect(fn).not.toMatch(/searchParams\.get|params\./)
  })

  it('points at the right account', () => {
    // A wrong data-id renders a working widget that pays someone else.
    expect(html).toContain('data-id="Walletlens"')
  })

  it('keeps the message and placement it was configured with', () => {
    // Kept byte for byte as Buy Me a Coffee generated it, trailing space and
    // all, so a diff against their snippet is empty.
    expect(html).toContain('data-message="Loved walletlens.live? Built solo and kept free. A coffee helps keep it going. "')
    expect(html).toContain('data-y_margin="18"')
    expect(html).toContain('data-position="Right"')
    expect(html).toContain('data-color="#40DCA5"')
  })

  it('/diag can tell why it is missing', () => {
    // Three causes look identical on screen: not deployed, refused by the CSP,
    // or drawn behind the bottom nav. Guessing between them cost several
    // rounds, so the page reports which one it is.
    const diag = readFileSync(join(here, 'pages/Diagnostics.jsx'), 'utf8')
    expect(diag).toContain("'support widget'")
    expect(diag).toContain('script[data-name="BMC-Widget"]')
    expect(diag).toContain('old build deployed')
    // It reports what the relay actually said instead of guessing between
    // "unreachable" and "blocked by CSP", which cost two rounds.
    expect(diag).toContain('/api/bmc')
    expect(diag).toContain('relay served')
  })
})

describe('the CSP lets it run', () => {
  const NEEDED = {
    'script-src': ['https://cdnjs.buymeacoffee.com'],
    'frame-src': ['https://www.buymeacoffee.com', 'https://buymeacoffee.com'],
    'connect-src': ['https://cdnjs.buymeacoffee.com', 'https://www.buymeacoffee.com'],
  }

  for (const [name, hosts] of Object.entries(NEEDED)) {
    it.each(hosts)(`meta ${name} allows %s`, (host) => {
      expect(directive(metaCsp, name)).toContain(host)
    })
    it.each(hosts)(`served ${name} allows %s`, (host) => {
      expect(directive(headerCsp, name)).toContain(host)
    })
  }

  it('the two policies agree on every buymeacoffee host', () => {
    // The failure this exists for: widen one, ship, and the widget is missing
    // in production only.
    const hosts = (policy) => [...policy.matchAll(/https:\/\/[\w.-]*buymeacoffee\.com/g)]
      .map(m => m[0]).sort()
    expect(hosts(metaCsp)).toEqual(hosts(headerCsp))
    expect(hosts(metaCsp).length).toBeGreaterThan(0)
  })
})

describe('what it replaced', () => {
  it('the in-app support button is gone, not left alongside it', () => {
    // Two support asks on one screen is one too many, and a dead component is
    // worse than none.
    const src = readFileSync(join(here, 'App.jsx'), 'utf8')
    expect(src).not.toContain('CoffeeButton')
    expect(readFileSync(join(here, 'index.css'), 'utf8')).not.toContain('wl-coffee')
  })
})
