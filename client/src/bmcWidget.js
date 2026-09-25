// Makes the Buy Me a Coffee launcher (#bmc-wbtn, injected by the widget tag
// in index.html) draggable, like the chat button.
//
// The widget owns the element and its click handler, so this works from the
// outside: a drag starts only past a small threshold (a tap still opens the
// panel), the click that ends a drag is swallowed in the capture phase before
// the widget sees it, and the spot is remembered per device. Position is
// written as inline !important, which is the one thing that outranks the
// stylesheet's own placement rules for the launcher.

export const BMC_POS_KEY = 'wl_bmc_pos_v1'
const THRESHOLD = 6
const MARGIN = 8

/** Keep a w×h box at (x, y) fully inside a vw×vh viewport. */
export function clampToViewport(x, y, w, h, vw, vh) {
  return {
    x: Math.round(Math.min(Math.max(MARGIN, x), Math.max(MARGIN, vw - w - MARGIN))),
    y: Math.round(Math.min(Math.max(MARGIN, y), Math.max(MARGIN, vh - h - MARGIN))),
  }
}

function place(el, p) {
  el.style.setProperty('left', `${p.x}px`, 'important')
  el.style.setProperty('top', `${p.y}px`, 'important')
  el.style.setProperty('right', 'auto', 'important')
  el.style.setProperty('bottom', 'auto', 'important')
}

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(BMC_POS_KEY) || 'null')
    return p && isFinite(p.x) && isFinite(p.y) ? p : null
  } catch { return null }
}

export function makeDraggable(el) {
  if (!el || el.dataset.wlDrag) return
  el.dataset.wlDrag = '1'
  el.style.setProperty('touch-action', 'none', 'important')

  const fit = (p) => {
    const r = el.getBoundingClientRect()
    return clampToViewport(p.x, p.y, r.width || 64, r.height || 64, window.innerWidth, window.innerHeight)
  }
  const saved = load()
  if (saved) place(el, fit(saved))

  let start = null
  let moved = false
  let last = null
  let swallowClick = false

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return
    const r = el.getBoundingClientRect()
    start = { x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top }
    moved = false
  })
  window.addEventListener('pointermove', (e) => {
    if (!start) return
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return
    moved = true
    el.classList.add('wl-bmc-dragging')
    last = fit({ x: e.clientX - start.offX, y: e.clientY - start.offY })
    place(el, last)
  }, { passive: true })
  const end = () => {
    if (!start) return
    start = null
    el.classList.remove('wl-bmc-dragging')
    if (!moved) return
    swallowClick = true
    setTimeout(() => { swallowClick = false }, 350)
    try { localStorage.setItem(BMC_POS_KEY, JSON.stringify(last)) } catch {}
  }
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  // A drag ends in a click on the launcher; stop it before the widget toggles.
  window.addEventListener('click', (e) => {
    if (swallowClick && el.contains(e.target)) { e.stopImmediatePropagation(); e.preventDefault(); swallowClick = false }
  }, true)
  // A rotated or resized screen could leave a saved spot off-screen.
  window.addEventListener('resize', () => {
    const p = load()
    if (p) place(el, fit(p))
  })
}

/** Waits for the widget to inject its launcher, then makes it draggable. */
export function initBmcDrag() {
  if (typeof document === 'undefined') return
  const attach = () => {
    const el = document.getElementById('bmc-wbtn')
    if (el) { makeDraggable(el); return true }
    return false
  }
  if (attach()) return
  const mo = new MutationObserver(() => { if (attach()) mo.disconnect() })
  mo.observe(document.body, { childList: true })
  // The widget draws once, on load; stop watching if it never does.
  setTimeout(() => mo.disconnect(), 30000)
}
