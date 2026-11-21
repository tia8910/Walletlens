// "/" is the static tour, which the Pages worker serves. When "/" comes back
// as the app shell instead (dev, `vite preview`, an offline service-worker
// fallback, a cache from before the switch), the app hops to "/" once and, on
// the way back, renders the React landing. The tour clears the flag.
//
// The decision is made once per page load and kept at module scope, not in a
// useState initializer. StaticHome renders a lazy component inside the route
// Suspense boundary, so its first mount suspends and React throws that
// uncommitted state away, running the initializer again on retry. The second
// run found the flag already consumed by the first, set it again and hopped:
// an endless reload loop, dozens of full page loads a second.
export const HOME_HOP = 'wl_home_hop'

let decision
export function shouldRenderHomeFallback(dev = false, storage = globalThis.sessionStorage) {
  if (decision !== undefined) return decision
  if (dev) return (decision = true)
  try {
    if (storage.getItem(HOME_HOP)) { storage.removeItem(HOME_HOP); return (decision = true) }
    storage.setItem(HOME_HOP, '1')
  } catch { return (decision = true) }
  return (decision = false)
}

// Tests only.
export function _resetHomeHop() { decision = undefined }
