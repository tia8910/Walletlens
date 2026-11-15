import { useEffect, useRef } from 'react'

// Keeps a bottom sheet with a text field above the on-screen keyboard.
//
// A sheet pinned to the bottom of the screen sits behind the keyboard while
// someone types, so they cannot see what they write (reported from the
// Android app's Send feedback sheet).
//  - A browser shrinks the visual viewport for the keyboard: the visible
//    area is measured and the sheet docked inside it.
//  - The Android app draws the keyboard over the page and tells the page
//    nothing: there, on a touch device, the sheet docks to the top part of
//    the screen for as long as one of its fields has focus.
//
// Returns props for the sheet element. Docked, it carries the class
// `kb-dock` and the variables --kb-vvh (visible height) and --kb-vvt (top).

/** The share of the screen the Android keyboard leaves free, at most. */
export const KEYBOARD_FREE = 0.56

const isField = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|file)$/i.test(el.type || '')) || el.isContentEditable)

/** Where to dock, from the window and visual viewport sizes; null for no dock. Pure, for the test. */
export function dockFor({ full, vvHeight, vvTop = 0, typing, touch }) {
  const shrunk = vvHeight != null && full - vvHeight - vvTop > 120
  if (shrunk) return { height: Math.round(vvHeight), top: Math.round(vvTop) }
  if (typing && touch) return { height: Math.round(full * KEYBOARD_FREE), top: 0 }
  return null
}

export default function useKeyboardDock() {
  const ref = useRef(null)
  const typing = useRef(false)
  const fitRef = useRef(() => {})

  useEffect(() => {
    const vv = window.visualViewport
    const touch = !!window.matchMedia?.('(pointer: coarse)').matches
    const fit = () => {
      const el = ref.current
      if (!el) return
      const d = dockFor({ full: window.innerHeight, vvHeight: vv?.height, vvTop: vv?.offsetTop, typing: typing.current, touch })
      el.classList.toggle('kb-dock', !!d)
      if (d) {
        el.style.setProperty('--kb-vvh', `${d.height}px`)
        el.style.setProperty('--kb-vvt', `${d.top}px`)
        // The field being typed in stays in view inside the docked sheet.
        const f = document.activeElement
        if (f && el.contains(f) && isField(f)) requestAnimationFrame(() => f.scrollIntoView?.({ block: 'nearest' }))
      }
    }
    fitRef.current = fit
    // A field focused on open (autoFocus) docks at once.
    if (isField(document.activeElement) && ref.current?.contains(document.activeElement)) typing.current = true
    fit()
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit)
    return () => { vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit) }
  }, [])

  const onFocus = (e) => { if (isField(e.target)) { typing.current = true; fitRef.current() } }
  // Moving from one field to the next blurs then focuses: wait, then look at
  // what has focus. Late enough that a tap on a button lands before the
  // sheet moves back.
  const onBlur = () => setTimeout(() => {
    const a = document.activeElement
    typing.current = !!(a && ref.current?.contains(a) && isField(a))
    fitRef.current()
  }, 300)

  return { ref, onFocus, onBlur }
}
