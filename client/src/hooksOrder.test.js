import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * No hook may sit below an early return.
 *
 * React counts hooks per render and requires the same count every time. A
 * guard placed above a hook makes that count depend on data, and the second
 * render throws "Rendered more hooks than during the previous render" —
 * minified React error #310, which surfaces as an error card, not a warning.
 *
 * Both instances this was written for were live:
 *
 *   PortfolioHeatmap  `if (!cells.length) return null` sat above the treemap
 *                     memo, so an empty portfolio ran six hooks and a filled
 *                     one ran seven. It took the dashboard down.
 *
 *   CoinLogo          the non-crypto branch returned above six hooks, so a
 *                     logo whose coinId moved between a stock and a coin at
 *                     the same tree position changed its own hook count.
 *
 * The fix is always one of two shapes: move the guard below every hook, or
 * split the component so the branch lives in a wrapper that calls none.
 */

const SRC = dirname(fileURLToPath(import.meta.url))

const HOOK = /\buse(State|Effect|Memo|Callback|Ref|Context|Reducer|LayoutEffect|ImperativeHandle|Transition|DeferredValue|Id|SyncExternalStore)\s*\(/
const TOP_DECL = /^(export\s+)?(default\s+)?(const|let|var|function|class)\b/

// Body statements sit at two spaces in this codebase, so "indent 2" means
// component top level and anything deeper is inside a callback or a block.
const GUARD_OPENS = /^ {2}(if|else)\b/
const RETURN_AT_2 = /^ {2}(if\s*\(.*\)\s*)?return\b/
const RETURN_AT_4 = /^ {4}return\b/

function violations(source) {
  const lines = source.split('\n')
  const starts = lines.map((l, i) => (TOP_DECL.test(l) ? i : -1)).filter((i) => i >= 0)
  starts.push(lines.length)

  const found = []
  for (let b = 0; b < starts.length - 1; b++) {
    const block = lines.slice(starts[b], starts[b + 1])
    let early = null
    let inGuard = false

    for (let j = 0; j < block.length; j++) {
      const line = block[j]
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
      const indent = line.trim() ? line.length - trimmed.length : null

      if (indent === 2) {
        // An if/else at body level opens a guard whose returns exit the
        // component. A line carrying => is a callback, not a guard.
        inGuard = GUARD_OPENS.test(line) && !line.includes('=>')
        if (early === null && RETURN_AT_2.test(line)) early = j
      }
      if (early === null && indent === 4 && inGuard && RETURN_AT_4.test(line)) early = j

      if (early !== null && j > early && indent === 2 && HOOK.test(line)) {
        found.push(
          `line ${starts[b] + j + 1}: ${trimmed.slice(0, 70)}` +
          `  (after early return on line ${starts[b] + early + 1})`,
        )
      }
    }
  }
  return found
}

function jsxFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...jsxFiles(p))
    else if (name.endsWith('.jsx')) out.push(p)
  }
  return out
}

describe('hook ordering', () => {
  it('no hook is called below an early return', () => {
    const bad = []
    for (const file of jsxFiles(SRC)) {
      for (const v of violations(readFileSync(file, 'utf8'))) {
        bad.push(`${relative(SRC, file)}: ${v}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('catches the shape that took the dashboard down', () => {
    const sample = [
      'const Broken = memo(function Broken({ items }) {',
      '  const rows = useMemo(() => items, [items])',
      '',
      '  if (!rows.length) return null',
      '',
      '  const layout = useMemo(() => rows.map(Boolean), [rows])',
      '  return <div>{layout.length}</div>',
      '})',
    ].join('\n')
    expect(violations(sample)).toHaveLength(1)
    expect(violations(sample)[0]).toContain('useMemo')
  })

  it('does not flag a return inside a callback', () => {
    const fine = [
      'const Fine = memo(function Fine({ ref }) {',
      '  useEffect(() => {',
      '    if (!ref.current) return',
      '    ref.current.focus()',
      '  }, [ref])',
      '',
      '  const value = useMemo(() => 1, [])',
      '  return <div>{value}</div>',
      '})',
    ].join('\n')
    expect(violations(fine)).toEqual([])
  })
})
