import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('./analytics', () => ({ track: vi.fn() }))
import { track } from './analytics'
import { parseReferrer, reportInstallReferrer } from './installReferrer'
import { playLink } from './components/StoreBadges'

const HERE = dirname(fileURLToPath(import.meta.url))
const ANDROID = join(HERE, '..', '..', 'walletlens_source/release_package/app')
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v) } } }
const bridge = (json) => ({ AndroidBridge: { installReferrer: () => json } })

describe('Play Install Referrer', () => {
  beforeEach(() => track.mockClear())

  it('reads the campaign fields of a referrer', () => {
    expect(parseReferrer('utm_source=walletlens.live&utm_medium=website&utm_campaign=tour')).toEqual({
      ref_source: 'walletlens.live', ref_medium: 'website', ref_campaign: 'tour', ref_content: '',
    })
    expect(parseReferrer('utm_source=google-play&utm_medium=organic').ref_medium).toBe('organic')
    expect(parseReferrer('')).toBeNull()
  })

  it('reports once, with the fields only, never the raw string', () => {
    const store = mem()
    const json = JSON.stringify({ referrer: 'utm_source=youtube&utm_campaign=academy', clickTs: 1, installTs: 2 })
    expect(reportInstallReferrer(bridge(json), store)).toBe(true)
    expect(track).toHaveBeenCalledWith('install_referrer', expect.objectContaining({ ref_source: 'youtube', ref_campaign: 'academy' }))
    expect(JSON.stringify(track.mock.calls[0][1])).not.toContain('installTs')
    reportInstallReferrer(bridge(json), store)
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('waits for Play to answer, and does nothing outside the app', () => {
    const store = mem()
    expect(reportInstallReferrer(bridge(''), store)).toBe(false)
    expect(reportInstallReferrer({}, store)).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })

  it('tags the site\'s Play links with where they were tapped', () => {
    const url = new URL(playLink('landing_hero'))
    expect(url.searchParams.get('id')).toBe('live.walletlens.twa')
    expect(url.searchParams.get('referrer')).toBe('utm_source=walletlens.live&utm_medium=website&utm_campaign=landing_hero')
  })

  it('the app reads it once from Play and offers it on the bridge', () => {
    expect(readFileSync(join(ANDROID, 'build.gradle'), 'utf8')).toMatch(/com\.android\.installreferrer:installreferrer:/)
    const java = (f) => readFileSync(join(ANDROID, 'src/main/java/live/walletlens/twa', f), 'utf8')
    expect(java('InstallReferrer.java')).toMatch(/if \(p\.getBoolean\(KEY_DONE, false\)\) return;/)
    expect(java('WalletLensApp.java')).toMatch(/InstallReferrer\.fetchOnce\(this\)/)
    expect(java('WalletLensBridge.java')).toMatch(/@JavascriptInterface\s+public String installReferrer\(\)/)
  })
})
