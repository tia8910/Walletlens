// Makes the Buy Me a Coffee launcher (#bmc-wbtn, injected by the widget tag
// in index.html) draggable, like the chat button, lets a long press hide it,
// and tags its message bubble so index.css can set it in the app's type.
//
// The widget owns the element and its click handler, so this works from the
// outside: a drag starts only past a small threshold (a tap still opens the
// panel), the click that ends a drag is swallowed in the capture phase before
// the widget sees it, and the spot is remembered per device. Position is
// written as inline !important, which is the one thing that outranks the
// stylesheet's own placement rules for the launcher.

export const BMC_POS_KEY = 'wl_bmc_pos_v1'
export const BMC_HIDDEN_KEY = 'wl_bmc_hidden_until'
const THRESHOLD = 6
const MARGIN = 8
const LONG_PRESS_MS = 550
// Hidden for a week, then it comes back once; the menu's coffee link is
// there in the meantime.
export const HIDE_MS = 7 * 24 * 3600 * 1000

export function isHidden(now = Date.now()) {
  try { return Number(localStorage.getItem(BMC_HIDDEN_KEY) || 0) > now } catch { return false }
}

export function hideWidget(now = Date.now()) {
  try { localStorage.setItem(BMC_HIDDEN_KEY, String(now + HIDE_MS)) } catch {}
  document.documentElement.classList.add('wl-bmc-hidden')
  document.querySelector('.wl-bmc-close')?.remove()
}

function removeClose() { document.querySelector('.wl-bmc-close')?.remove() }

/** The small ✕ a long press puts on the launcher's corner. */
function showClose(el) {
  removeClose()
  const r = el.getBoundingClientRect()
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'wl-bmc-close'
  b.setAttribute('aria-label', 'Hide the coffee button')
  b.textContent = '×'
  b.style.left = `${Math.max(4, Math.round(r.left) - 6)}px`
  b.style.top = `${Math.max(4, Math.round(r.top) - 6)}px`
  b.addEventListener('click', (e) => { e.stopPropagation(); hideWidget() })
  document.body.appendChild(b)
}

/**
 * The widget's message bubble has no id of its own. It is the positioned box
 * holding the tag's data-message text, so find that text and tag the box.
 */
export function tagMessage(root = document.body) {
  const msg = document.querySelector('script[data-name="BMC-Widget"]')?.dataset.message
  if (!msg || !root) return null
  const probe = msg.slice(0, 24)
  // The element whose own text holds the message (a plain scan; the widget's
  // markup is small and this runs only a handful of times).
  // Only what the widget added: the app (#root) is never searched.
  const holders = [...root.children]
    .filter(c => c.id !== 'root' && c.tagName !== 'SCRIPT')
    .flatMap(c => [c, ...c.querySelectorAll('*')])
    .filter(e => [...e.childNodes].some(c => c.nodeType === 3 && c.nodeValue.includes(probe)))
  for (const holder of holders) {
    let box = holder
    for (let up = box; up && up !== document.body; up = up.parentElement) {
      const pos = getComputedStyle(up).position
      if (pos === 'fixed' || pos === 'absolute') { box = up; break }
    }
    box.classList.add('wl-bmc-msg')
    return box
  }
  return null
}

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
  let pressTimer = null
  const clearPress = () => { clearTimeout(pressTimer); pressTimer = null }

  // A long press is for the ✕, not the phone's own menu.
  el.addEventListener('contextmenu', (e) => e.preventDefault())

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return
    const r = el.getBoundingClientRect()
    start = { x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top }
    moved = false
    clearPress()
    pressTimer = setTimeout(() => {
      pressTimer = null
      if (!start || moved) return
      showClose(el)
      // The release that follows is not a tap.
      swallowClick = true
      setTimeout(() => { swallowClick = false }, 1500)
    }, LONG_PRESS_MS)
  })
  // Any press elsewhere puts the ✕ away again.
  window.addEventListener('pointerdown', (e) => {
    if (!el.contains(e.target) && !e.target?.closest?.('.wl-bmc-close')) removeClose()
  }, true)
  window.addEventListener('pointermove', (e) => {
    if (!start) return
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return
    moved = true
    clearPress()
    removeClose()
    el.classList.add('wl-bmc-dragging')
    last = fit({ x: e.clientX - start.offX, y: e.clientY - start.offY })
    place(el, last)
  }, { passive: true })
  const end = () => {
    clearPress()
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

/**
 * Open and close, owned here. The widget's own close did not work inside the
 * app (the chevron did nothing, twice, for reasons its third-party code does
 * not let us see), so after the widget has opened its panel once, every
 * later tap on the launcher is caught before the widget sees it and the panel
 * is shown or hidden here instead:
 *
 *   html.wl-bmc-open    the panel is showing (v2.css sizes it to the screen)
 *   html.wl-bmc-closed  it is hidden again (index.css hides it and puts the
 *                       cup back on the launcher, which the widget left on
 *                       its chevron)
 *
 * The widget keeps the iframe loaded, so reopening is instant.
 */
export function ownToggle(el) {
  if (!el || el.dataset.wlToggle) return
  el.dataset.wlToggle = '1'
  const root = document.documentElement
  let openedOnce = false
  let open = false
  const set = (v) => {
    open = v
    root.classList.toggle('wl-bmc-open', v)
    root.classList.toggle('wl-bmc-closed', !v && openedOnce)
  }
  window.addEventListener('click', (e) => {
    if (!el.contains(e.target)) return
    if (!openedOnce) { openedOnce = true; set(true); return }   // the widget opens it
    e.stopImmediatePropagation()
    e.preventDefault()
    set(!open)
  }, true)
  return { isOpen: () => open }
}

/**
 * The widget asks for support, so it waits until the app has earned it:
 * the welcome flow is finished and at least one asset has been added. Until
 * then html lacks .wl-bmc-ready and index.css keeps the widget hidden. An
 * unreadable store counts as not ready.
 */
export function widgetReady() {
  try {
    if (localStorage.getItem('wl_welcome_step_v2')) return false      // mid onboarding
    if (!localStorage.getItem('wl_welcomed_v2')) return false
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    return Array.isArray(txs) && txs.length > 0
  } catch { return false }
}

/** Keeps html.wl-bmc-ready current; stops checking once it is ready. */
export function watchReady(intervalMs = 3000) {
  const check = () => {
    const ready = widgetReady()
    document.documentElement.classList.toggle('wl-bmc-ready', ready)
    return ready
  }
  if (check()) return
  // Onboarding and the first asset both happen in this tab, which fires no
  // storage event, so look again every few seconds (a localStorage read).
  const id = setInterval(() => { if (check()) clearInterval(id) }, intervalMs)
  window.addEventListener('storage', check)
}

/** Waits for the widget to inject its launcher, then makes it draggable. */
export function initBmcDrag() {
  if (typeof document === 'undefined') return
  watchReady()
  if (isHidden()) document.documentElement.classList.add('wl-bmc-hidden')
  let tagged = false
  const attach = () => {
    const el = document.getElementById('bmc-wbtn')
    if (el) { makeDraggable(el); ownToggle(el) }
    if (!tagged) tagged = !!tagMessage()
    return !!el && tagged && !!document.getElementById('bmc-iframe')
  }
  if (attach()) return
  // The widget adds its launcher on load and its bubble a moment later.
  const mo = new MutationObserver(() => { if (attach()) mo.disconnect() })
  mo.observe(document.body, { childList: true })
  // The bubble's text can land inside a box that already exists, which a
  // body-level observer never sees, so look again a few times as well.
  for (const ms of [1000, 3000, 6000, 12000]) setTimeout(attach, ms)
  setTimeout(() => mo.disconnect(), 30000)
}
