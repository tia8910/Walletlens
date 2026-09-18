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
    expect(sync).toMatch(/writeKey\(LAST_HASH, await fingerprint\(await snapshotSignature\(\)\)\)/)
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

// The bug that made all of the above do nothing.
//
// generateBackupCode() puts `ts: Date.now()` in the payload, so it returns a
// different string on every call. Every change check hashed that string, which
// meant "has anything changed?" answered yes forever: autoBackup's skip never
// matched and re-uploaded the whole file every sweep, and autoRestore read the
// device as dirty and chose 'conflict' instead of pulling. The symptom was a
// trade added on one device never appearing on the other.
describe('change detection compares content, not the moment it was asked', () => {
  it('the snapshot signature leaves the wall clock out', () => {
    const core = readFileSync(join(here, 'backupCore.js'), 'utf8')
    const fn = core.slice(core.indexOf('async function buildSnapshot'), core.indexOf('export async function generateBackupCode'))
    expect(fn).not.toMatch(/Date\.now\(\)/)
    expect(fn).toContain('const payload = { v: 3, txs: compactTxs, ws }')
  })

  it('the stamp is still written into the backup itself', () => {
    // applyBackupCode reads it back to say when a backup was made.
    const core = readFileSync(join(here, 'backupCore.js'), 'utf8')
    expect(core).toContain('JSON.stringify({ ...payload, ts: Date.now() })')
    expect(core).toMatch(/when: parsed\.ts \? new Date\(parsed\.ts\) : null/)
  })

  it.each([
    ['the backup skip', /const hash = await fingerprint\(await snapshotSignature\(\)\)/],
    ['the dirty check', /return \(await fingerprint\(await snapshotSignature\(\)\)\) !== stamped/],
    ['the restore stamp', /writeKey\(LAST_HASH, await fingerprint\(await snapshotSignature\(\)\)\)/],
  ])('%s hashes the signature', (_name, pattern) => {
    expect(sync).toMatch(pattern)
  })

  it('nothing hashes the timestamped code any more', () => {
    // The shape of the original bug, in case it is reintroduced.
    expect(sync).not.toMatch(/fingerprint\(code\)/)
  })
})

// The bug that made all of the above do nothing.
//
// generateBackupCode() put `ts: Date.now()` in the payload, so it returned a
// different string on every call. Every change check hashed that string, so
// "has anything changed?" answered yes forever: autoBackup's skip never
// matched and re-uploaded the whole file every sweep, and autoRestore read the
// device as dirty and chose 'conflict' instead of pulling. The symptom was a
// trade added on one device never reaching the other.
describe('change detection compares content, not the moment it was asked', () => {
  const core = readFileSync(join(here, 'backupCore.js'), 'utf8')

  it('the snapshot signature leaves the wall clock out', () => {
    const fn = core.slice(core.indexOf('async function buildSnapshot'),
                          core.indexOf('export async function generateBackupCode'))
    expect(fn).not.toMatch(/Date\.now\(\)/)
    expect(fn).toContain('const payload = { v: 3, txs: compactTxs, ws }')
  })

  it('the stamp is still written into the backup itself', () => {
    // applyBackupCode reads it back to say when a backup was made.
    expect(core).toContain('JSON.stringify({ ...payload, ts: Date.now() })')
    expect(core).toMatch(/when: parsed\.ts \? new Date\(parsed\.ts\) : null/)
  })

  it.each([
    ['the backup skip', /const hash = await fingerprint\(await snapshotSignature\(\)\)/],
    ['the dirty check', /return \(await fingerprint\(await snapshotSignature\(\)\)\) !== stamped/],
    ['the restore stamp', /writeKey\(LAST_HASH, await fingerprint\(await snapshotSignature\(\)\)\)/],
  ])('%s hashes the signature', (_name, pattern) => {
    expect(sync).toMatch(pattern)
  })

  it('nothing hashes the timestamped code any more', () => {
    expect(sync).not.toMatch(/fingerprint\(code\)/)
  })
})

describe('the one-minute budget', () => {
  it('uploads within five seconds of a trade', () => {
    expect(sched).toContain('const AFTER_CHANGE_MS = 5 * 1000')
  })

  it('the other device notices within thirty', () => {
    expect(sched).toContain('const PULL_MS = 30 * 1000')
  })

  it('leaves a hidden tab alone', () => {
    // It gets a foreground check the instant it comes back, so polling a
    // sleeping phone every 30s is battery spent for nothing.
    expect(sched).toMatch(/why === 'poll' && typeof document !== 'undefined' && document\.hidden/)
  })
})
