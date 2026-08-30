import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Getting a file out of the app. In a browser that is an <a download> or
// navigator.share; the app's own WebView implements neither, and implements
// them by doing nothing rather than by throwing — which is how the backup
// export, the QR image and every share button became silent no-ops on the one
// platform where taking your data out is the promise the app makes.

const SRC = dirname(fileURLToPath(import.meta.url))

let mod
async function load() {
  vi.resetModules()
  mod = await import('./fileOut.js')
  return mod
}

const bridge = () => window.AndroidBridge

beforeEach(() => {
  delete window.AndroidBridge
  vi.restoreAllMocks()
})
afterEach(() => { delete window.AndroidBridge })

function installBridge(overrides = {}) {
  window.AndroidBridge = {
    saveFile: vi.fn(() => true),
    shareFile: vi.fn(() => true),
    shareText: vi.fn(() => true),
    ...overrides,
  }
}

describe('saving a file', () => {
  it('goes through the browser when there is no app', async () => {
    const { saveFile, savesThroughApp } = await load()
    expect(savesThroughApp()).toBe(false)

    const click = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      const el = realCreate(tag)
      if (tag === 'a') el.click = click
      return el
    })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()

    expect(await saveFile(new Blob(['hi'], { type: 'text/plain' }), 'a.txt')).toBe(true)
    expect(click).toHaveBeenCalled()
  })

  it('goes through the app when there is one', async () => {
    installBridge()
    const { saveFile, savesThroughApp } = await load()
    expect(savesThroughApp()).toBe(true)

    expect(await saveFile(new Blob(['hi'], { type: 'text/plain' }), 'a.txt')).toBe(true)

    const [name, mime, b64] = bridge().saveFile.mock.calls[0]
    expect(name).toBe('a.txt')
    expect(mime).toBe('text/plain')
    // base64, because a JavascriptInterface passes strings and nothing else.
    expect(atob(b64)).toBe('hi')
  })

  it('reports a refusal rather than claiming success', async () => {
    installBridge({ saveFile: vi.fn(() => false) })
    const { saveFile } = await load()
    expect(await saveFile(new Blob(['x']), 'a.txt')).toBe(false)
  })

  it('survives a bridge that throws', async () => {
    installBridge({ saveFile: vi.fn(() => { throw new Error('binder died') }) })
    const { saveFile } = await load()
    expect(await saveFile(new Blob(['x']), 'a.txt')).toBe(false)
  })
})

describe('sharing a file', () => {
  it('hands it to the app share sheet', async () => {
    installBridge()
    const { shareFile } = await load()
    expect(await shareFile(new Blob(['png'], { type: 'image/png' }), 'a.png', { text: 'hi' }))
      .toBe('shared')
    expect(bridge().shareFile.mock.calls[0][3]).toBe('hi')
  })

  it('saves the file when the share sheet cannot open', async () => {
    // The user is left holding the file rather than nothing at all.
    installBridge({ shareFile: vi.fn(() => false) })
    const { shareFile } = await load()
    expect(await shareFile(new Blob(['png']), 'a.png')).toBe('saved')
    expect(bridge().saveFile).toHaveBeenCalled()
  })

  it('treats a dismissed browser sheet as done, not as failure', async () => {
    // Backing out of the share sheet is a decision. Answering it by saving a
    // file the user did not ask for is the wrong reading of it.
    const { shareFile } = await load()
    navigator.share = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })))
    navigator.canShare = vi.fn(() => true)
    expect(await shareFile(new Blob(['png'], { type: 'image/png' }), 'a.png')).toBe('shared')
  })
})

describe('sharing text', () => {
  it('uses the app rather than a compose window', async () => {
    installBridge()
    const { shareText } = await load()
    expect(await shareText('hello', { title: 'T', url: 'https://walletlens.live' })).toBe(true)
    expect(bridge().shareText.mock.calls[0][0]).toContain('hello')
  })

  it('says no when there is nothing to share with', async () => {
    const { shareText } = await load()
    delete navigator.share
    expect(await shareText('hello')).toBe(false)
  })
})

describe('no call site does this by hand', () => {
  // Each of these was its own copy of "make a blob URL, click an anchor", and
  // each one silently stopped working in the shell. A new one would too.
  function sources(dir) {
    const out = []
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) { out.push(...sources(p)); continue }
      if (!/\.(js|jsx)$/.test(e) || e.includes('.test.')) continue
      if (e === 'fileOut.js') continue     // the one place allowed to
      out.push(p)
    }
    return out
  }

  it('never sets a.download itself', () => {
    const offenders = sources(SRC).filter(p =>
      /\.download\s*=/.test(
        readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')))
    expect(offenders.map(p => p.slice(SRC.length + 1)),
      'use saveFile from fileOut.js — an anchor download is inert in the app').toEqual([])
  })

  it('never calls navigator.share itself', () => {
    const offenders = sources(SRC).filter(p =>
      /navigator\.share\s*\(/.test(
        readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')))
    expect(offenders.map(p => p.slice(SRC.length + 1)),
      'use shareFile/shareText from fileOut.js — navigator.share is undefined in the app').toEqual([])
  })
})
