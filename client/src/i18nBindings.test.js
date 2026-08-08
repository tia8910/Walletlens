import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A component that calls t() without binding it throws "t is not defined" the
// moment it renders. This is valid JavaScript, so the build stays green; it is
// also invisible to a browser smoke test unless that test happens to render
// the exact tab the component lives on. Both of those things happened: the
// crash shipped to a phone while the build passed and the Playwright sweep
// reported every route "clean", because the broken components sit on dashboard
// tabs the sweep never opened.
//
// Reading the source is the only check that covers every component whether or
// not anything renders it.

const SRC = dirname(fileURLToPath(import.meta.url))

function jsxFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) jsxFiles(p, out)
    else if (name.endsWith('.jsx')) out.push(p)
  }
  return out
}

// Matches `function Foo(` / `export default function Foo(` / `const Foo = memo(function`.
const COMPONENT = /^(?:export default )?function ([A-Z]\w*)\s*\(|^const ([A-Z]\w*) = memo\(function/gm
const BINDS_T = /const \{[^}]*\bt\b[^}]*\} = useLanguage\(\)/
// `t(` rather than `t('` on purpose. The first version of this test required a
// quote, so it saw t('adSellAt') but not t(p.labelKey) — and the one component
// left calling t() unbound in the whole tree, PillarBars, used exactly the
// second form. It renders once per holding in the Magic Indicator, so the
// narrower regex was passing while the Technicals page threw for every user
// who had an asset. The \b keeps sort(, sqrt(, lt( and friends out.
const CALLS_T = /\bt\(/

/** Every top-level component in a file, with the source that belongs to it. */
function components(src) {
  const heads = [...src.matchAll(COMPONENT)]
  return heads.map((m, i) => ({
    name: m[1] || m[2],
    body: src.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : src.length),
  }))
}

describe('t() bindings', () => {
  const files = jsxFiles(SRC)

  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('every file that calls t() imports useLanguage', () => {
    const missing = files.filter(f => {
      const src = readFileSync(f, 'utf8')
      return CALLS_T.test(src) && !src.includes('useLanguage')
    })
    expect(missing.map(f => f.slice(SRC.length + 1))).toEqual([])
  })

  it('every component that calls t() also binds it', () => {
    const unbound = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (!CALLS_T.test(src)) continue
      for (const c of components(src)) {
        if (CALLS_T.test(c.body) && !BINDS_T.test(c.body)) {
          unbound.push(`${f.slice(SRC.length + 1)} → ${c.name}`)
        }
      }
    }
    expect(unbound).toEqual([])
  })

  it('no callback shadows t while calling it', () => {
    // Settings.jsx bound the theme list item to `t`, and AssetDetail bound a
    // sell target to `t` inside a map that then called t('adSellAt') — which
    // throws "t is not a function" the moment a user has a target set.
    //
    // A callback parameter named `t` is only a bug when the body also calls
    // t('key'); plenty of files legitimately name a ticker or transaction `t`
    // at module scope where no translator exists to shadow. So the check is
    // narrow on purpose: flag the overlap, not the name.
    const bad = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\.\w+\(\s*\(?\s*t\s*\)?\s*=>\s*/g)) {
        let depth = 1
        let j = m.index + m[0].length
        for (; j < src.length && depth; j++) {
          if ('([{'.includes(src[j])) depth++
          else if (')]}'.includes(src[j])) depth--
        }
        const body = src.slice(m.index + m[0].length, j)
        if (CALLS_T.test(body)) {
          const line = src.slice(0, m.index).split('\n').length
          bad.push(`${f.slice(SRC.length + 1)}:${line}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})

// ── Native intents ──────────────────────────────────────────────────────────
// Navigating the top frame to a custom scheme takes the Custom Tab off its own
// origin, and inside the TWA that ends the session — the app vanishes with
// nothing in any log. nativeBridge.fireNativeIntent refuses to do it outside a
// real user gesture for that reason.
//
// The guard is worth nothing if a second file writes the navigation itself.
// BiometricLock did exactly that, and it was the worst possible place: the
// lock screen auto-prompts on mount, which is by definition not a gesture.
describe('native intent guard', () => {
  const files = jsxFiles(SRC).concat(
    ['nativeBridge.js', 'nativeWidgets.js'].map(f => join(SRC, f)),
  )

  it('only nativeBridge navigates to a walletlens:// or intent:// URL', () => {
    // File-scoped rather than line-scoped on purpose. The original bug read
    //   const url = 'walletlens://…'; window.location.href = url
    // so the scheme and the navigation were never on the same line, and a
    // line-matching version of this test passed while the bug was present.
    // Verified by reverting the fix: this catches it, the line-scoped one did
    // not.
    const offenders = []
    for (const f of files) {
      if (f.endsWith('nativeBridge.js')) continue
      const src = readFileSync(f, 'utf8')
      const code = src
        .split('\n')
        .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))   // drop comments discussing it
        .join('\n')
      const buildsScheme = /['"`](?:walletlens|intent):\/\//.test(code)
      const navigates = /location\.(href\s*=|assign\(|replace\()/.test(code)
      if (buildsScheme && navigates) {
        offenders.push(f.slice(SRC.length + 1))
      }
    }
    expect(offenders).toEqual([])
  })
})
