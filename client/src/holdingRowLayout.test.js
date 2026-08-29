import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A holdings row is `checkbox | icon | [ticker + badge] | [value + P&L pill]`.
//
// THE BUG: the row was nowrap and the value block was flex-shrink: 0, so every
// pixel of shortfall landed on the ticker — the one element still allowed to
// shrink. On a 360px screen AVAX rendered as "A" and USDT as "U…", beside a
// perfectly intact "L1" badge and a perfectly intact price. The rule's own
// comment called this the ticker truncating "before the badge ever wraps",
// which is exactly what happened; it just took the ticker down to a single
// character to achieve it.
//
// The widest element is the P&L pill ("▲ $730.00 (+24.57%)") and none of its
// numbers can be dropped, so the fix is for the value block to take its own
// line when both do not fit, rather than for the row's identity to disappear.
//
// This is the second time a flex row in this app has eaten a label down to one
// character — see settingsLayout.test.js for the first.

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'index.css'), 'utf8')

/**
 * The value a property actually resolves to for a selector.
 *
 * Per PROPERTY, not per block, and that distinction is why this helper exists.
 * `.dvx-holding-meta strong` is declared four times: colour and font, then the
 * layout rule, then a font-size tweak, then a global `overflow-wrap:
 * break-word` safeguard. Taking the last block and asserting against it fails
 * on a rule that is perfectly correct — the later blocks simply do not mention
 * flex, so they do not override it.
 *
 * Last-declaration-wins is still the point: these blocks share specificity, so
 * a check for "the file contains this declaration anywhere" would pass while a
 * later one quietly won.
 */
function resolved(selector, property) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const blocks = [...css.matchAll(new RegExp(`(^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))]
  expect(blocks.length, `no rule found for ${selector}`).toBeGreaterThan(0)
  let value = null
  for (const b of blocks) {
    const m = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(b[2])
    if (m) value = m[1].trim()
  }
  return value
}

describe('the holdings row shows every asset in full', () => {
  it('never lets the ticker give up space', () => {
    // flex-shrink 0. Without it the ticker is the row's shock absorber.
    expect(resolved('.dvx-holding-meta strong', 'flex')).toBe('0 0 auto')
  })

  it('keeps the ticker on one line despite the global break-word safeguard', () => {
    // A later rule applies `overflow-wrap: break-word` to this selector among
    // many others. That is what removes an element's min-content floor and lets
    // it collapse to a single character — the same mechanism that ate a
    // settings label, documented in settingsLayout.test.js.
    //
    // nowrap is what makes it inert here, so it is asserted rather than
    // assumed: without it, capping flex alone would not be enough.
    expect(resolved('.dvx-holding-meta strong', 'white-space')).toBe('nowrap')
  })

  it('bounds the ticker by a width, not by whatever is left over', () => {
    // max-width is the guard against a malformed symbol. It has to be wide
    // enough that no real ticker reaches it — 12ch clears AVAX, USDT, XAU and
    // anything else an asset is plausibly called.
    const m = /(\d+)ch/.exec(resolved('.dvx-holding-meta strong', 'max-width') || '')
    expect(m, 'ticker needs a max-width ceiling').not.toBeNull()
    expect(Number(m[1])).toBeGreaterThanOrEqual(8)
  })

  it('wraps the row instead of compressing it', () => {
    // The escape valve. Without wrap, capping the ticker above just moves the
    // overflow somewhere else instead of removing it.
    expect(resolved('.dvx-holding-line1', 'flex-wrap')).toBe('wrap')
  })

  it('keeps the value hard right once it has wrapped', () => {
    // space-between has nothing to push against on a line holding one item, so
    // a wrapped value block would drift left without this.
    expect(resolved('.dvx-holding-valblock', 'margin-left')).toBe('auto')
  })

  it('keeps the badges unshrinkable, which was never the problem', () => {
    // Named so a future reader does not "balance" the row by letting badges
    // shrink instead. A half-rendered "L1" is not an improvement.
    expect(css).toMatch(
      /\.dvx-holding-meta \.dvx-cat-badge, \.dvx-holding-meta \.dvx-stable-badge \{ flex-shrink: 0; \}/,
    )
  })
})
