// Web Push client — subscribes the device to server-sent notifications so
// price-target alerts arrive even when WalletLens is closed.
//
// The on-device Notification API (portfolioNotify.js, Watchlist) only fires
// while the app is open. This module registers a Push subscription with the
// push-api Deno service, which evaluates alert rules on a cron and pushes.
//
// Privacy: the only thing leaving the device is the anonymous push endpoint
// (a URL + keys, no identity) and the alert rules the user explicitly set.

const PUSH_API = 'https://walletlens-push.tia8910.deno.net'
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
const WL_ALERTS_KEY = 'wl_watchlist_alerts'
const PA_ALERTS_KEY = 'walletlens_price_alerts'  // Dashboard 'Alerts' tab store

export function isPushSupported() {
  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

// VAPID public key is base64url; the PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function readAlerts() {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
  // Merge both alert stores; prefix ids so the two sequences can't collide.
  return [
    ...read(WL_ALERTS_KEY).map(a => ({ ...a, id: `wl-${a.id}` })),
    ...read(PA_ALERTS_KEY).filter(a => !a.triggered).map(a => ({ ...a, id: `pa-${a.id}` })),
  ].filter(a => a.coin_id && a.targetPrice > 0)
}

async function getSubscription() {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function isPushEnabled() {
  if (!isPushSupported()) return false
  try { return !!(await getSubscription()) } catch { return false }
}

// Returns { ok } or throws an Error with a user-friendly message.
export async function enablePush() {
  if (!isPushSupported()) throw new Error('Push notifications aren’t supported on this device.')
  if (!VAPID_PUBLIC) throw new Error('Push isn’t configured yet (missing key). Try again after the next update.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Allow notifications for WalletLens in your browser, then try again.')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }

  const res = await fetch(`${PUSH_API}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), alerts: readAlerts() }),
  })
  if (!res.ok) {
    // Roll back so isPushEnabled() doesn't report a half-registered state.
    try { await sub.unsubscribe() } catch {}
    throw new Error('Couldn’t reach the notification server. Please try again.')
  }
  return { ok: true }
}

export async function disablePush() {
  try {
    const sub = await getSubscription()
    if (sub) {
      await fetch(`${PUSH_API}/unsubscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
      await sub.unsubscribe()
    }
  } catch { /* best-effort */ }
  return { ok: true }
}

// Push the device's current alert rules to the server. Call after the user
// adds/edits/removes a watchlist alert so the cron stays in sync. No-op when
// push isn't enabled.
export async function syncAlerts() {
  try {
    const sub = await getSubscription()
    if (!sub) return
    await fetch(`${PUSH_API}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, alerts: readAlerts() }),
    }).catch(() => {})
  } catch { /* best-effort */ }
}

// Fire a one-off test push to confirm delivery works end-to-end.
export async function sendTestPush() {
  const sub = await getSubscription()
  if (!sub) throw new Error('Enable notifications first.')
  const res = await fetch(`${PUSH_API}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  if (!res.ok) throw new Error('Test push failed.')
  return { ok: true }
}
