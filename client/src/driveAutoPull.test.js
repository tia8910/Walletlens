import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decideAutoPull } from './driveSync'

// Bringing another device's trades down automatically.
//
// The whole feature rests on one claim: a device whose data is byte-identical
// to what it last uploaded cannot lose anything by replacing it with a newer
// copy, because the local copy IS the backup. Every rule below exists to make
// sure that claim holds before anything is downloaded.

const here = dirname(fileURLToPath(import.meta.url))
const sync = readFileSync(join(here, 'driveSync.js'), 'utf8')
const sched = readFileSync(join(here, 'driveAutoBackup.js'), 'utf8')

describe('when it is safe to pull', () => {
  it('pulls when Drive is newer and this device is unchanged', () => {
    expect(decideAutoPull({ localDirty: false, remoteAt: 2000, lastBackupAt: 1000 })).toBe('pull')
  })

  it('never pulls when this device has its own edits', () => {
    // The case that would silently delete a trade somebody just made.
    expect(decideAutoPull({ localDirty: true, remoteAt: 2000, lastBackupAt: 1000 })).toBe('conflict')
  })

  it('does nothing when this device wrote the newest copy', () => {
    expect(decideAutoPull({ localDirty: false, remoteAt: 1000, lastBackupAt: 2000 })).toBe('none')
    expect(decideAutoPull({ localDirty: false, remoteAt: 1000, lastBackupAt: 1000 })).toBe('none')
  })

  it('does nothing when there is no backup at all', () => {
    expect(decideAutoPull({ localDirty: false, remoteAt: 0, lastBackupAt: 0 })).toBe('none')
  })

  it('treats a device that never uploaded as unsafe, not as empty', () => {
    // localChangedSinceBackup() returns true when no fingerprint is stamped,
    // so a fresh device with local data lands here rather than on 'pull'.
    expect(decideAutoPull({ localDirty: true, remoteAt: 2000, lastBackupAt: 0 })).toBe('conflict')
  })
})

describe('the safety rails in the implementation', () => {
  it('reads dirty as true when no fingerprint was ever stamped', () => {
    expect(sync).toMatch(/const stamped = readKey\(LAST_HASH\)\s*\n\s*if \(!stamped\) return true/)
  })

  it('reads dirty as true when the snapshot cannot be taken', () => {
    // A throw must not read as "nothing changed here".
    const fn = sync.slice(sync.indexOf('export async function localChangedSinceBackup'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/catch \{\s*\n\s*return true/)
  })

  it('checks timestamps before hashing the portfolio', () => {
    // Most polls should cost one metadata call and nothing else.
    const fn = sync.slice(sync.indexOf('export async function autoRestore'))
    expect(fn.indexOf('decideAutoPull({ localDirty: false')).toBeLessThan(fn.indexOf('localChangedSinceBackup()'))
  })

  it('never raises a sign-in from the background', () => {
    const fn = sync.slice(sync.indexOf('export async function autoRestore'))
    expect(fn).toContain('getAccessToken({ interactive: false })')
  })
})

describe('restoring leaves the device in step', () => {
  it('stamps the fingerprint of what it applied, not just the time', () => {
    // Without this a restored device reads as permanently changed: autoBackup
    // re-uploads the copy it just downloaded and autoRestore never pulls again.
    expect(sync).toMatch(/writeKey\(LAST_HASH, await fingerprint\(code\)\)/)
  })

  it('tells the app to re-read, and cannot ping-pong doing it', () => {
    const fn = sync.slice(sync.indexOf('export async function autoRestore'))
    expect(fn).toContain("window.dispatchEvent(new Event('wl:portfolio-updated'))")
    // autoBackup's own fingerprint check is what makes the echo a no-op.
    expect(sync).toContain("if (hash === readKey(LAST_HASH)) return { ok: false, reason: 'unchanged' }")
  })
})

describe('when it runs', () => {
  it('checks the moment a device comes to the foreground', () => {
    // Put the phone down, pick up the laptop, the trade is already there.
    expect(sched).toContain("pull('foreground')")
  })

  it('polls on an interval and on open as well', () => {
    expect(sched).toContain("pullTimer = setInterval(() => pull('poll'), PULL_MS)")
    expect(sched).toContain("run('open'); pull('open')")
  })

  it('does not let a slow upload swallow the poll', () => {
    // Separate latches: sharing one would mean a long backup hides the check
    // that would have noticed the other device.
    expect(sched).toMatch(/let pulling = false/)
    expect(sched).toMatch(/if \(pulling \|\| !canAutoBackup\(\)\) return/)
  })

  it('tears the poll down with everything else', () => {
    expect(sched).toContain('clearInterval(pullTimer)')
  })
})
