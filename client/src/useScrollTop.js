import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Start a new page at the top.
 *
 * A browser scrolls to the top when you follow a link because it is loading a
 * new document. A single page app is not loading anything: React Router swaps
 * the tree and the window keeps whatever offset it had. So tapping a holding
 * near the bottom of a long dashboard opened the asset page already scrolled
 * past its chart and its numbers, landing on the sell target and the footer.
 * It read as the page opening upside down.
 *
 * Three rules, and each one is the reason a naive scrollTo(0, 0) on every
 * location change is wrong:
 *
 *   POP is left alone.  Back and forward are the one case where the old offset
 *   is the right answer: someone returning to the dashboard wants the holding
 *   they tapped, not the top of the page. The browser's own scroll restoration
 *   handles it, and scrolling here would fight it.
 *
 *   A hash wins.  #section means "put me at that element", which is the
 *   opposite of the top.
 *
 *   Only the pathname counts.  A query change is a filter or a tab on the page
 *   you are already reading, and yanking that to the top loses your place.
 */
export function shouldScrollTop({ pathname, prev, hash, navigationType }) {
  if (navigationType === 'POP') return false
  if (hash) return false
  return pathname !== prev
}

export default function useScrollTop() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  // Seeded with the first pathname so the very first render does not scroll:
  // a deep link or a reload should land wherever the browser put it.
  const prev = useRef(pathname)

  useEffect(() => {
    const go = shouldScrollTop({ pathname, prev: prev.current, hash, navigationType })
    prev.current = pathname
    if (!go) return
    // 'instant', not 'smooth'. A smooth scroll on a route change animates the
    // outgoing page's content past you on the way up, which looks like the app
    // scrolled somewhere on its own.
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }
    catch { window.scrollTo(0, 0) }
  }, [pathname, hash, navigationType])
}
