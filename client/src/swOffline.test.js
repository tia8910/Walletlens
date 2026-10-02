import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// The real public/sw.js, run with a fake network and cache, to pin what it
// answers a page load with when the connection is bad.
//
// THE BUG: /dashboard redirects to /dashboard/ on the host, so the precached
// shell was a redirected response. A redirected response cannot answer a page
// navigation, so whenever the network was slow or gone, the fallback served it
// and Android's WebView showed "Web page not available ... net::ERR_FAILED".

const here = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(here, '../public/sw.js'), 'utf8')
const ORIGIN = 'https://walletlens.live'

const keyOf = (k) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).pathname

/** A response that came through a redirect, the way the host serves /dashboard. */
function redirectedPage(html) {
  return {
    ok: true, redirected: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'text/html' }),
    blob: async () => new Blob([html], { type: 'text/html' }),
    clone() { return this },
  }
}

function load({ network, stored = {} }) {
  const store = new Map(Object.entries(stored))
  const handlers = {}
  const cache = {
    put: async (k, v) => { store.set(keyOf(k), v) },
    match: async (k) => store.get(keyOf(k)),
    keys: async () => [],
    delete: async () => true,
    add: async () => {},
  }
  const ctx = {
    self: {
      addEventListener: (type, fn) => { handlers[type] = fn },
      location: { origin: ORIGIN },
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
    caches: { open: async () => cache, match: async (k) => store.get(keyOf(k)), keys: async () => [], delete: async () => true },
    fetch: network,
    Response, Headers, Blob, URL, AbortSignal, Request,
    console, setTimeout, clearTimeout, Promise, JSON,
  }
  vm.createContext(ctx)
  vm.runInContext(SRC, ctx)
  return { handlers, store }
}

function navigate(handlers, path) {
  let answer
  handlers.fetch({
    request: { method: 'GET', url: ORIGIN + path, headers: new Headers({ accept: 'text/html' }) },
    respondWith: (p) => { answer = p },
  })
  return answer
}

const offline = async () => { throw new TypeError('Failed to fetch') }

describe('opening the app on a bad connection', () => {
  it('serves the saved app, cleaned of its redirect, instead of failing', async () => {
    const { handlers } = load({ network: offline, stored: { '/dashboard': redirectedPage('<html>app</html>') } })
    const res = await navigate(handlers, '/dashboard')
    expect(res.redirected).toBe(false)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<html>app</html>')
  })

  it('serves the saved app for a page never visited before', async () => {
    const { handlers } = load({ network: offline, stored: { '/dashboard': redirectedPage('<html>app</html>') } })
    const res = await navigate(handlers, '/coach')
    expect(res.redirected).toBe(false)
    expect(await res.text()).toBe('<html>app</html>')
  })

  it('with nothing saved, shows a page that reloads itself when the connection returns', async () => {
    const { handlers } = load({ network: offline })
    const res = await navigate(handlers, '/dashboard')
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/)
    const html = await res.text()
    expect(html).toMatch(/Can’t connect right now/)
    expect(html).toMatch(/location\.reload\(\)/)
    expect(html).toMatch(/addEventListener\('online'/)
  })

  it('saves the app shell clean when it installs, even though the host redirects it', async () => {
    const network = async (url) => (keyOf(url) === '/dashboard'
      ? redirectedPage('<html>shell</html>')
      : { ok: true, redirected: false, status: 200, headers: new Headers(), clone() { return this } })
    const { handlers, store } = load({ network })
    let done
    handlers.install({ waitUntil: (p) => { done = p } })
    await done
    const saved = store.get('/dashboard')
    expect(saved).toBeTruthy()
    expect(saved.redirected).toBe(false)
    expect(await saved.text()).toBe('<html>shell</html>')
    expect(store.has('/')).toBe(true)
  })
})
