import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canInstall, promptInstall } from './pwaInstall'

// The install offer is captured once and shared by the top bar and the menu,
// because on phones the top bar hides its shortcut to keep the wordmark whole.

const here = dirname(fileURLToPath(import.meta.url))

describe('the shared install offer', () => {
  it('is empty until the browser offers installing, then prompts once', async () => {
    expect(canInstall()).toBe(false)
    const e = new Event('beforeinstallprompt')
    e.prompt = vi.fn()
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
    expect(canInstall()).toBe(true)
    expect(await promptInstall('menu')).toBe('accepted')
    expect(e.prompt).toHaveBeenCalledOnce()
    expect(canInstall()).toBe(false)
  })

  it('is offered from the menu, and the top bar drops its shortcut on phones', () => {
    const app = readFileSync(join(here, 'App.jsx'), 'utf8')
    const menu = app.slice(app.indexOf('const DrawerV2'), app.indexOf('// ── Memoized app footer'))
    expect(menu).toMatch(/canInstallApp && <Row icon=\{V2_ICONS\.install\}/)
    expect(readFileSync(join(here, 'v2.css'), 'utf8')).toMatch(/html\.wl-v2 \.wl-topbar-install \{ display: none !important; \}/)
  })
})
