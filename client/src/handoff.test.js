import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The one-time migration out of Chrome. This is the only path an existing
// user's portfolio has across the switch from a TWA to the app's own WebView,
// so the cases below are all "does the data survive" wearing different hats.

const SRC = dirname(fileURLToPath(import.meta.url))
const JAVA = join(
  SRC, '..', '..', 'walletlens_source/release_package/app/src/main/java/live/walletlens/twa',
)
const java = (f) => readFileSync(join(JAVA, f), 'utf8')

const saveVault = vi.fn(async () => ({ ok: true, bytes: 10 }))
vi.mock('./nativeVault', () => ({ saveVault: (...a) => saveVault(...a) }))

let mod
async function load(search) {
  vi.resetModules()
  delete window.location
  window.location = { search, href: 'https://walletlens.live/dashboard' + search }
  mod = await import('./handoff.js')
  return mod
}

describe('the handoff out of Chrome', () => {
  beforeEach(() => {
    saveVault.mockClear()
    saveVault.mockResolvedValue({ ok: true, bytes: 10 })
    localStorage.clear()
    document.body.innerHTML = ''
  })
  afterEach(() => { document.body.innerHTML = '' })

  const withHoldings = () => localStorage.setItem(
    'crypto_tracker_transactions', JSON.stringify([{ id: 1, symbol: 'BTC' }]))

  it('does nothing on an ordinary page load', async () => {
    const m = await load('')
    expect(m.mountHandoff()).toBe(false)
    expect(document.body.textContent).toBe('')
  })

  it('takes the page over when the app asks for it', async () => {
    withHoldings()
    const m = await load('?wlhandoff=1')
    expect(m.mountHandoff()).toBe(true)
    expect(document.querySelector('[data-wl-handoff]')).toBeTruthy()
    expect(document.querySelector('button')).toBeTruthy()
  })

  it('writes the vault when the button is tapped', async () => {
    withHoldings()
    const m = await load('?wlhandoff=1')
    m.mountHandoff()
    document.querySelector('button').click()
    await vi.waitFor(() => expect(saveVault).toHaveBeenCalled())

    // inApp, because detection in a Custom Tab rests on Chrome turning
    // EXTRA_REFERRER into a document referrer. If any build does not, this is
    // the user's one migration opportunity failing silently.
    expect(saveVault).toHaveBeenCalledWith({ inApp: true })
  })

  it('does not claim success when the write failed', async () => {
    withHoldings()
    saveVault.mockResolvedValue({ ok: false, reason: 'no-activation' })
    const m = await load('?wlhandoff=1')
    m.mountHandoff()
    document.querySelector('button').click()

    // The button comes back, rather than the screen saying done and returning
    // to an app that is still empty.
    await vi.waitFor(() => expect(document.querySelector('button').disabled).toBe(false))
    expect(document.body.textContent).not.toMatch(/Done/)
  })

  it('offers nothing to move when there is nothing to move', async () => {
    const m = await load('?wlhandoff=1')
    m.mountHandoff()
    expect(document.querySelector('button')).toBeNull()
    expect(saveVault).not.toHaveBeenCalled()
  })

  it('treats an unreadable store as full, not empty', async () => {
    // Sending the user back with "nothing to move" because JSON.parse threw
    // once would end the only chance their portfolio has.
    localStorage.setItem('crypto_tracker_transactions', '{not json')
    const m = await load('?wlhandoff=1')
    m.mountHandoff()
    expect(document.querySelector('button')).toBeTruthy()
  })

  it('speaks the language the user picked', async () => {
    withHoldings()
    localStorage.setItem('wl_lang', 'ar')
    const m = await load('?wlhandoff=1')
    m.mountHandoff()
    expect(document.body.textContent).toMatch(/انقل/)
  })

  it('falls back to English for a language it has no copy for', async () => {
    withHoldings()
    localStorage.setItem('wl_lang', 'zz')
    const m = await load('?wlhandoff=1')
    m.mountHandoff()
    expect(document.body.textContent).toMatch(/Move my data/)
  })
})

describe('the native side of the handoff', () => {
  it('only offers it to an install that was updated', () => {
    // A first install has nothing in Chrome to fetch, and sending a new user
    // out to a browser before they have seen the app is the worst possible
    // first screen.
    const src = java('AppShellActivity.java')
    expect(src).toMatch(/lastUpdateTime\s*-\s*info\.firstInstallTime/)
  })

  it('counts the attempt before making it', () => {
    // Counted after would mean a Custom Tab that throws, or a user who
    // dismisses it, reopens a browser on every single launch for ever.
    const src = java('AppShellActivity.java')
    const put = src.indexOf('KEY_HANDOFF_TRIES, tries + 1')
    const launch = src.indexOf('tab.launchUrl')
    expect(put).toBeGreaterThan(-1)
    expect(launch).toBeGreaterThan(-1)
    expect(put, 'the try must be recorded before the tab opens').toBeLessThan(launch)
  })

  it('sends the referrer the page needs to believe it', () => {
    // Without EXTRA_REFERRER the page sees an ordinary browser tab, decides it
    // is not in the app, and the button does nothing at all.
    expect(java('AppShellActivity.java')).toMatch(/EXTRA_REFERRER/)
  })

  it('stops once the vault has something in it', () => {
    const src = java('AppShellActivity.java')
    expect(src).toMatch(/DataVaultActivity\.read\(this\)/)
  })
})
