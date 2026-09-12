import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The strip was a row of identical neutral chips. The only thing that said
// anything was the percentage at the end, and a 12% move looked exactly like a
// 0.1% one. Worse, it repainted the same numbers every minute with nothing to
// mark the moment a price actually changed, so a live feed and a frozen one
// were indistinguishable.

const here = dirname(fileURLToPath(import.meta.url))
const ticker = readFileSync(join(here, 'components/PriceTicker.jsx'), 'utf8')
const css = readFileSync(join(here, 'index.css'), 'utf8')

describe('a chip says which way and how far', () => {
  it('puts the direction on the chip, not only on the percentage', () => {
    expect(ticker).toMatch(/const dir = pending \? 'flat' : up \? 'up' : 'down'/)
    expect(ticker).toMatch(/className=\{`tick tick--\$\{dir\} tick--\$\{tier\}/)
  })

  it('grades the tint by how big the move is', () => {
    expect(ticker).toMatch(/const tier = mag >= 5 \? 'strong' : mag >= 1 \? 'mid' : 'soft'/)
    for (const t of ['soft', 'mid', 'strong']) {
      expect(css, `up/${t}`).toContain(`.tick--up.tick--${t}`)
      expect(css, `down/${t}`).toContain(`.tick--down.tick--${t}`)
    }
  })

  it('makes no claim about an asset it has no price for', () => {
    // change: null is "not known yet", and must not read as a flat day.
    expect(ticker).toMatch(/const mag = pending \? 0 : Math\.abs\(t\.change\)/)
    expect(css).toMatch(/\.tick--flat \{ background: rgba\(255, 255, 255, 0\.05\); \}/)
  })
})

describe('a chip reacts when its price moves', () => {
  it('flashes on the change, not on the day’s direction', () => {
    // A coin that is down but ticking up flashes green for that tick, which is
    // what a trading screen does.
    const eff = ticker.slice(ticker.indexOf('const next = {}'))
    expect(eff.slice(0, eff.indexOf('}, [items])'))).toMatch(/next\[it\.name\] = it\.price > was \? 'up' : 'down'/)
  })

  it('does not flash the first time it sees a price', () => {
    const eff = ticker.slice(ticker.indexOf('const next = {}'))
    expect(eff.slice(0, eff.indexOf('}, [items])'))).toMatch(/if \(was != null && was !== it\.price\)/)
  })

  it('clears the flash before the next poll', () => {
    // The strip polls every 60s; a flash that outlived it would be permanent.
    expect(ticker).toMatch(/setTimeout\(\(\) => setFlashes\(\{\}\), 1100\)/)
    expect(css).toMatch(/\.tick--flash-up\s+\{ animation: tickFlashUp 1s ease-out; \}/)
  })

  it('does not leave a timer running when the strip unmounts', () => {
    expect(ticker).toMatch(/useEffect\(\(\) => \(\) => clearTimeout\(flashTimer\.current\), \[\]\)/)
  })

  it('keeps the colour and drops the movement under reduced motion', () => {
    // The colour is the information; the animation is decoration.
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .tick {'))
    const block = rm.slice(0, rm.indexOf('\n}'))
    expect(block).toMatch(/\.tick--flash-up, \.tick--flash-down \{ animation: none; \}/)
    expect(block).not.toMatch(/background/)
  })

  it('is legible on the light theme too', () => {
    expect(css).toMatch(/\[data-wl-light\] \.tick--up\.tick--strong/)
    expect(css).toMatch(/\[data-wl-light\] \.tick--flat/)
  })
})
