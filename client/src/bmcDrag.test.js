import { describe, it, expect, beforeEach } from 'vitest'
import { makeDraggable, clampToViewport, BMC_POS_KEY } from './bmcWidget'

// The launcher is the widget's element with the widget's click handler; the
// drag has to move it without ever letting a drag count as a tap.

const ev = (type, x, y, target = window) => target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }))

function launcher() {
  const el = document.createElement('div')
  el.id = 'bmc-wbtn'
  document.body.appendChild(el)
  let clicks = 0
  el.addEventListener('click', () => { clicks++ })
  return { el, clicks: () => clicks }
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear() })

describe('the coffee launcher drag', () => {
  it('keeps a tap a tap', () => {
    const { el, clicks } = launcher()
    makeDraggable(el)
    ev('pointerdown', 100, 100, el); ev('pointermove', 102, 101); ev('pointerup', 102, 101)
    el.click()
    expect(clicks()).toBe(1)
    expect(localStorage.getItem(BMC_POS_KEY)).toBeNull()
  })

  it('moves on a drag, swallows the click that ends it, and remembers the spot', () => {
    const { el, clicks } = launcher()
    makeDraggable(el)
    // Grabbed 20px into the button; it follows the finger by that offset.
    el.getBoundingClientRect = () => ({ left: 80, top: 80, width: 64, height: 64 })
    ev('pointerdown', 100, 100, el); ev('pointermove', 60, 220); ev('pointerup', 60, 220)
    el.click()
    expect(clicks()).toBe(0)
    expect(el.style.getPropertyValue('top')).toBe('200px')
    expect(el.style.getPropertyPriority('top')).toBe('important')
    expect(JSON.parse(localStorage.getItem(BMC_POS_KEY))).toEqual({ x: 40, y: 200 })
    el.click()
    expect(clicks()).toBe(1)
  })

  it('returns to the saved spot on the next load', () => {
    localStorage.setItem(BMC_POS_KEY, JSON.stringify({ x: 30, y: 300 }))
    const { el } = launcher()
    makeDraggable(el)
    expect(el.style.getPropertyValue('left')).toBe('30px')
    expect(el.style.getPropertyValue('bottom')).toBe('auto')
  })

  it('never leaves the screen', () => {
    expect(clampToViewport(-50, 5000, 64, 64, 390, 844)).toEqual({ x: 8, y: 772 })
    expect(clampToViewport(1000, -10, 64, 64, 390, 844)).toEqual({ x: 318, y: 8 })
  })
})
