import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// versionCode is set in exactly one place and nothing verifies it, which has
// already cost a build: it sat at 41 while codes in the high 40s were in use,
// so every artifact from a clean clone was rejected by Play on upload. There
// is no bubblewrap twa-manifest.json to cross-check it against, and the number
// Play actually holds lives in the Console, not the repo.
//
// So this cannot verify the value is RIGHT. It can only hold the floor: 73 is
// in production, Play never accepts a duplicate or lower code, and a release
// build is worth more than the ten seconds this takes.

const gradle = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)),
       '../../walletlens_source/release_package/app/build.gradle'),
  'utf8',
)

const versionCode = Number(gradle.match(/^\s*versionCode\s+(\d+)/m)?.[1])

describe('the Android release is uploadable', () => {
  it('has a versionCode Play will accept', () => {
    // 73 was accepted for the current production release. Anything at or below
    // it is rejected at upload, after the build has already been made.
    expect(Number.isInteger(versionCode)).toBe(true)
    expect(versionCode).toBeGreaterThanOrEqual(74)
  })

  it('sets the version in one place only', () => {
    // Two versionCode lines means one of them is a lie, and the build picks
    // whichever the parser saw last.
    expect(gradle.match(/^\s*versionCode\s+\d+/gm)).toHaveLength(1)
  })

  it('still flags the unresolved versionName', () => {
    // Deliberately not asserting a value: versionName is user-visible on the
    // Play listing and the real string for release 73 is not recoverable from
    // this repo — only the Console has it. Guessing would put a wrong version
    // in front of every user, which is worse than a TODO that stays visible.
    // Remove this test in the commit that sets the real string.
    expect(gradle).toMatch(/TODO\(tarek\)[\s\S]{0,300}?versionName/)
  })

  it('keeps notification delegation switched on', () => {
    // The whole channel-routing fix hangs off DelegationService being bound by
    // Chrome. enableNotifications false silently disables the service in the
    // manifest, and web push falls back to arriving as "Chrome".
    expect(gradle).toMatch(/enableNotifications:\s*true/)
  })
})
