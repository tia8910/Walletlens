import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { makeDraggable, clampToViewport, BMC_POS_KEY, BMC_HIDDEN_KEY, HIDE_MS, isHidden, tagMessage, panelIsOpen, syncPanel, widgetReady, watchReady } from './bmcWidget'

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

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); document.documentElement.classList.remove('wl-bmc-hidden') })
afterEach(() => { vi.useRealTimers() })

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

describe('hiding it with a long press', () => {
  it('shows an ✕ after a long press, and that press does not open the panel', () => {
    vi.useFakeTimers()
    const { el, clicks } = launcher()
    makeDraggable(el)
    ev('pointerdown', 100, 100, el)
    vi.advanceTimersByTime(600)
    ev('pointerup', 100, 100)
    el.click()
    expect(clicks()).toBe(0)
    expect(document.querySelector('.wl-bmc-close')).not.toBeNull()
  })

  it('hides the widget for a week when the ✕ is tapped', () => {
    vi.useFakeTimers()
    const { el } = launcher()
    makeDraggable(el)
    ev('pointerdown', 100, 100, el); vi.advanceTimersByTime(600); ev('pointerup', 100, 100)
    document.querySelector('.wl-bmc-close').click()
    expect(document.documentElement.classList.contains('wl-bmc-hidden')).toBe(true)
    expect(document.querySelector('.wl-bmc-close')).toBeNull()
    const until = Number(localStorage.getItem(BMC_HIDDEN_KEY))
    expect(isHidden(until - 1)).toBe(true)
    expect(isHidden(until + 1)).toBe(false)
    expect(until - Date.now()).toBeLessThanOrEqual(HIDE_MS)
  })

  it('puts the ✕ away on a tap elsewhere, and a short tap never shows it', () => {
    vi.useFakeTimers()
    const { el } = launcher()
    makeDraggable(el)
    ev('pointerdown', 100, 100, el); vi.advanceTimersByTime(200); ev('pointerup', 100, 100)
    vi.advanceTimersByTime(600)
    expect(document.querySelector('.wl-bmc-close')).toBeNull()
    ev('pointerdown', 100, 100, el); vi.advanceTimersByTime(600); ev('pointerup', 100, 100)
    ev('pointerdown', 5, 5, document.body)
    expect(document.querySelector('.wl-bmc-close')).toBeNull()
  })
})

describe('the message bubble', () => {
  it('finds the box holding the tag message and tags it', () => {
    const tag = document.createElement('script')
    tag.dataset.name = 'BMC-Widget'
    tag.dataset.message = 'WalletLens is an independent project built to help people'
    document.body.appendChild(tag)
    const box = document.createElement('div')
    box.style.position = 'fixed'
    box.innerHTML = '<p>WalletLens is an independent project built to help people track</p>'
    document.body.appendChild(box)
    expect(tagMessage()).toBe(box)
    expect(box.classList.contains('wl-bmc-msg')).toBe(true)
  })
})

describe('the panel open state', () => {
  // The fit-to-screen sizing applies only while this says open; if it read a
  // closed panel as open, the chevron would appear to do nothing.
  const frame = (css) => { const f = document.createElement('iframe'); f.style.cssText = css; document.body.appendChild(f); return f }
  it('reads every way the widget can close it as closed', () => {
    for (const css of ['height: 0px; opacity: 1', 'opacity: 0', 'visibility: hidden', 'display: none', 'transform: scale(0)', 'width: 0px']) {
      expect(panelIsOpen(frame(css)), css).toBe(false)
    }
  })
  it('reads the open panel as open', () => {
    expect(panelIsOpen(frame('height: calc(100% - 120px); opacity: 1; visibility: visible'))).toBe(true)
    expect(panelIsOpen(null)).toBe(false)
  })
  it('reads a panel closed by a class from the widget stylesheet as closed', () => {
    const style = document.createElement('style')
    style.textContent = '.bmc-closed { height: 0px; opacity: 0; }'
    document.head.appendChild(style)
    const f = frame('height: 600px')
    f.className = 'bmc-closed'
    expect(syncPanel(f)).toBe(false)
    expect(document.documentElement.classList.contains('wl-bmc-open')).toBe(false)
    f.className = ''
    expect(syncPanel(f)).toBe(true)
    expect(document.documentElement.classList.contains('wl-bmc-open')).toBe(true)
    style.remove()
  })
})

describe('when the widget appears', () => {
  const tx = JSON.stringify([{ id: 1, coin_id: 'bitcoin', amount: 1 }])
  it('waits for onboarding to finish and an asset to be added', () => {
    expect(widgetReady()).toBe(false)
    localStorage.setItem('crypto_tracker_transactions', tx)
    expect(widgetReady()).toBe(false)                      // not onboarded yet
    localStorage.setItem('wl_welcomed_v2', '1')
    localStorage.setItem('wl_welcome_step_v2', '2')
    expect(widgetReady()).toBe(false)                      // mid onboarding
    localStorage.removeItem('wl_welcome_step_v2')
    expect(widgetReady()).toBe(true)
    localStorage.setItem('crypto_tracker_transactions', '[]')
    expect(widgetReady()).toBe(false)                      // no assets
  })

  it('shows it once both are true, without a reload', () => {
    vi.useFakeTimers()
    document.documentElement.classList.remove('wl-bmc-ready')
    localStorage.setItem('wl_welcomed_v2', '1')
    watchReady(1000)
    expect(document.documentElement.classList.contains('wl-bmc-ready')).toBe(false)
    localStorage.setItem('crypto_tracker_transactions', tx)
    vi.advanceTimersByTime(1000)
    expect(document.documentElement.classList.contains('wl-bmc-ready')).toBe(true)
  })
})
