import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Claims the product makes about itself, checked against the whole source tree
// rather than against the files I happened to know about.
//
// The advertising claim was fixed three times before this test existed, and
// each fix was followed by finding it somewhere else: Terms §8, then the FAQ,
// then About — which carries its own duplicate of the FAQ array — and then two
// more copies inside the prerendered JSON-LD, which is the version Google
// reads. A test that names specific files cannot catch the next duplicate. A
// scan can.
//
// Add a rule here whenever a factual claim about the product turns out to be
// stated in more than one place.

const SRC = dirname(fileURLToPath(import.meta.url))
const CLIENT = dirname(SRC)

const SEARCH_DIRS = [SRC, join(CLIENT, 'scripts')]
const EXTS = ['.js', '.jsx', '.mjs', '.html']

function sourceFiles(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (EXTS.some(e => name.endsWith(e)) && !name.endsWith('.test.js')) out.push(p)
  }
  return out
}

const FILES = sourceFiles(SEARCH_DIRS[0]).concat(sourceFiles(SEARCH_DIRS[1]))

/** Every file whose text matches, as repo-relative paths. */
function filesMatching(re) {
  return FILES
    .filter(f => re.test(readFileSync(f, 'utf8')))
    .map(f => relative(CLIENT, f))
}

describe('claims the product makes about itself', () => {
  it('scans a real set of files', () => {
    // Guards the guard: a broken path would make every check below pass
    // vacuously, which is the failure mode of a scanning test.
    expect(FILES.length).toBeGreaterThan(50)
  })

  it('nowhere claims the app is funded by advertising', () => {
    // There is no ad script and no ad slot. The only AdSense artefact is the
    // site-verification meta tag in index.html, which serves a different
    // purpose and is allowed by the exception below.
    expect(filesMatching(/sustained by[^.]{0,40}advertis/i)).toEqual([])
    expect(filesMatching(/funded by[^.]{0,40}advertis/i)).toEqual([])
  })

  it('mentions AdSense only in the verification tag and in comments explaining it', () => {
    const offenders = FILES.filter(f => {
      const src = readFileSync(f, 'utf8')
      return src.split('\n').some(line => {
        if (!/AdSense/i.test(line)) return false
        if (/google-adsense-account/.test(line)) return false      // the meta tag itself
        if (/^\s*(\/\/|\/\*|\*|<!--)/.test(line.trim())) return false // a comment about it
        return true
      })
    }).map(f => relative(CLIENT, f))
    expect(offenders).toEqual([])
  })

  it('does not promise features behind a paywall', () => {
    // The other half of the same claim: "free" is load-bearing for this
    // product and appears in the store listing.
    expect(filesMatching(/premium (tier|plan|subscription) (is )?available/i)).toEqual([])
  })
})
