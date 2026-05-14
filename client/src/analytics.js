// Thin wrapper around gtag — automatically adds current page_path to every event
// so GA4 can filter/segment events by page (Explore → add dimension "Event parameter: page").

export function track(eventName, params = {}) {
  if (typeof gtag === 'function') {
    gtag('event', eventName, {
      page: window.location.pathname,
      ...params,
    })
  }
}
