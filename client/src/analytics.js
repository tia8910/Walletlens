// Thin wrapper around gtag so every file doesn't need the typeof guard.
// All events fire only when GA4 is loaded (gtag exists on window).

export function track(eventName, params = {}) {
  if (typeof gtag === 'function') {
    gtag('event', eventName, params)
  }
}
