import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nextVersionCode, releaseBody, PACKAGE_NAME } from '../../scripts/play-publish.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const wf = readFileSync(join(ROOT, '.github/workflows/build-aab.yml'), 'utf8')

describe('publishing to Google Play', () => {
  it('picks one above the highest version code Play has seen anywhere', () => {
    const tracks = [
      { track: 'production', releases: [{ versionCodes: ['101'] }] },
      { track: 'internal', releases: [{ versionCodes: ['103', '102'] }] },
    ]
    expect(nextVersionCode(tracks, [{ versionCode: 104 }])).toBe(105)
    expect(nextVersionCode(tracks, [])).toBe(104)
    expect(nextVersionCode([], [])).toBe(1)
  })

  it('builds the release for a track, with notes capped at 500 characters', () => {
    const b = releaseBody({ track: 'internal', versionCode: 105, status: 'completed', versionName: '7.5', notes: 'x'.repeat(600) })
    expect(b.track).toBe('internal')
    expect(b.releases[0]).toMatchObject({ versionCodes: ['105'], status: 'completed', name: '7.5' })
    expect(b.releases[0].releaseNotes[0].text).toHaveLength(500)
    expect(() => releaseBody({ track: 'beta2', versionCode: 1 })).toThrow()
    expect(PACKAGE_NAME).toBe('live.walletlens.twa')
  })

  it('the build workflow asks Play for the version code and publishes last', () => {
    expect(wf).toMatch(/options: \[internal, alpha, beta, production, none\]/)
    expect(wf).toMatch(/node \.play\/play-publish\.mjs next-version/)
    expect(wf).toMatch(/versionCode \$\{\{ steps\.vc\.outputs\.code \}\}/)
    expect(wf.indexOf('- name: Publish to Google Play')).toBeGreaterThan(wf.indexOf('- name: Upload signed AAB'))
    // The key only ever arrives through env, never pasted into a script.
    expect(wf).toMatch(/PLAY_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON \}\}/)
    expect(wf).not.toMatch(/echo "\$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON/)
  })
})
