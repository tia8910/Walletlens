import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The dashboard blanking and redrawing on reopen was never the holdings list.
//
// reg.update() runs every time the app becomes visible, so after a deploy the
// new worker took control within a moment of someone reopening the app — and
// controllerchange reloaded the page there and then. A reload is a blank
// screen and a full redraw, arriving at the exact moment the user is looking
// at the list they expect to still be there.

const here = dirname(fileURLToPath(import.meta.url))
const main = readFileSync(join(here, 'main.jsx'), 'utf8')
const sw = main.slice(main.indexOf("if ('serviceWorker' in navigator && basename === '/')"))

describe('picking up a new deploy', () => {
  it('never reloads while the app is on screen', () => {
    const handler = sw.slice(sw.indexOf("addEventListener('controllerchange'"))
    const body = handler.slice(0, handler.indexOf('\n  })'))
    expect(body).toMatch(/if \(document\.visibilityState === 'hidden'\) reloadForUpdate\(\)/)
    expect(body).toMatch(/else pendingReload = true/)
    // The old behaviour, which must not come back.
    expect(body).not.toMatch(/^\s*(refreshing = true|window\.location\.reload)/m)
  })

  it('takes the deferred reload the next time the app is put away', () => {
    expect(sw).toMatch(/if \(pendingReload && document\.visibilityState === 'hidden'\) reloadForUpdate\(\)/)
  })

  it('still reloads only once', () => {
    const fn = sw.slice(sw.indexOf('function reloadForUpdate'))
    expect(fn.slice(0, fn.indexOf('\n  }'))).toMatch(/if \(refreshing\) return/)
  })

  it('still skips the first-ever install, which has no old bundle to leave', () => {
    expect(sw).toMatch(/if \(!hadController \|\| refreshing\) return/)
  })

  it('keeps the recovery path that makes deferring safe', () => {
    // A deferred build only matters if it asks for a chunk this deployment no
    // longer has. That failure is caught and reloaded at the top of the file,
    // which is the one moment a reload is the honest thing to do.
    expect(main).toMatch(/if \(CHUNK_ERR_PATTERNS\.some\(p => msg\.includes\(p\)\)\) chunkReload\(\)/)
    expect(main).toMatch(/if \(e\.data\?\.type === 'CHUNK_404'\) chunkReload\(\)/)
  })
})
