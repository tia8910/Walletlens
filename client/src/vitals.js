import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals'

function sendToGA(metric) {
  if (typeof window.gtag !== 'function') return
  window.gtag('event', metric.name, {
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    non_interaction: true,
  })
}

export function initVitals() {
  onCLS(sendToGA)
  onINP(sendToGA)
  onLCP(sendToGA)
  onFCP(sendToGA)
  onTTFB(sendToGA)
}
