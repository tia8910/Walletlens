import { useEffect } from 'react'

// The v2 design is live: it is the app's only look, on /dashboard.
//
// It was previewed at /v2test first. That URL is kept as a redirect so old
// links and bookmarks still land on the dashboard. The switches below stay
// as the one place the app asks "is this the v2 layout", so the call sites
// read the same as they did during the preview.

export const V2_PATH = '/dashboard'
const PREVIEW_PATH = '/v2test'

const norm = (p) => (p || '').replace(/\/+$/, '') || '/'

/** The old preview URL, which now redirects to the dashboard. */
export const isV2Path = (pathname) => norm(pathname) === PREVIEW_PATH

/** Always on now that v2 is live. */
export function isV2Active() {
  return true
}

/** Where "Dashboard" goes. */
export const homePath = () => V2_PATH

/** Scopes every v2 style rule: they are all written under html.wl-v2. */
export function useV2Class(active) {
  useEffect(() => {
    document.documentElement.classList.toggle('wl-v2', active)
  }, [active])
}
