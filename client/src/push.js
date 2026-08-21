// Web Push client — subscribes the device to server-sent notifications so
// alerts arrive even when WalletLens is closed.
//
// The on-device Notification API (portfolioNotify.js, Watchlist) only fires
// while the app is open, which makes it useless for the two things
// notifications actually exist to do: tell someone their holding just moved,
// and bring someone back who has stopped opening the app. This module
// registers a Push subscription with the push-api Deno service, which runs
// those checks on a cron and pushes.
//
// Privacy: what leaves the device is the anonymous push endpoint (a URL +
// keys, no identity), the alert rules the user set, and the *identifiers* of
// the assets they track — never amounts, cost basis or portfolio value. The
// server builds notification copy like "BTC moved +6.1% to $94,200", which
// needs the ticker and nothing else.

import { foldBalances } from './data/portfolio'
import { usedFeature } from './featureUse'
import { isAndroidTWA } from './nativeBridge'

const PUSH_API = 'https://walletlens-push.tia8910.deno.net'

// The server builds the notification text, so it has to be told which language
// to build it in — otherwise a user reading the app in Arabic still gets an
// English price alert on their lock screen. Read live rather than cached: the
// language can change after the subscription was created, and every sync
// re-sends it.
function currentLang() {
  try {
    const l = localStorage.getItem('wl_lang')
    return ['en', 'ar', 'fr', 'es'].includes(l) ? l : 'en'
  } catch { return 'en' }
}

// Minutes *east* of UTC, which is the sign convention the server reasons in.
// getTimezoneOffset() is the opposite (minutes behind UTC), and getting this
// backwards is how a quiet-hours window ends up buzzing people at 4am.
function currentTz() {
  try { return -new Date().getTimezoneOffset() } catch { return 0 }
}

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
const WL_ALERTS_KEY = 'wl_watchlist_alerts'
const PA_ALERTS_KEY = 'walletlens_price_alerts'  // Dashboard 'Alerts' tab store
const PREFS_KEY = 'wl_push_prefs'
const WATCH_CACHE_KEY = 'wl_push_watch'
const SEEN_PING_KEY = 'wl_push_seen_ts'
const OPTOUT_KEY = 'wl_push_optout'
const ASK_KEY = 'wl_push_ask'

// Mirrors DEFAULT_PREFS in push-api/notify-logic.js. The server sanitizes
// whatever arrives, so a drift here is safe, but the toggles should show the
// same defaults the server would apply.
export const DEFAULT_PUSH_PREFS = {
  moves: true,
  news: true,
  digest: true,
  retention: true,
  features: true,
  movePct: 5,
}

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

/**
 * Was this subscription created with the VAPID key we currently ship?
 *
 * Returns true when it cannot tell (older browsers don't expose
 * `options.applicationServerKey`), because discarding a working subscription
 * on a guess is worse than keeping a possibly-stale one.
 *
 * @param {PushSubscription} sub
 * @param {string} vapidPublic base64url public key
 */
export function subscriptionMatchesKey(sub, vapidPublic) {
  try {
    const raw = sub?.options?.applicationServerKey
    if (!raw || !vapidPublic) return true
    const existing = new Uint8Array(raw)
    const current = urlBase64ToUint8Array(vapidPublic)
    if (existing.length !== current.length) return false
    return existing.every((b, i) => b === current[i])
  } catch {
    return true
  }
}

function readAlerts() {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
  // Merge both alert stores; prefix ids so the two sequences can't collide.
  return [
    ...read(WL_ALERTS_KEY).map(a => ({ ...a, id: `wl-${a.id}` })),
    ...read(PA_ALERTS_KEY).filter(a => !a.triggered).map(a => ({ ...a, id: `pa-${a.id}` })),
  ].filter(a => a.coin_id && a.targetPrice > 0)
}

// ── Channel preferences ─────────────────────────────────────────────────────

export function getPushPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return { ...DEFAULT_PUSH_PREFS, ...saved }
  } catch { return { ...DEFAULT_PUSH_PREFS } }
}

/** Persist a partial preference change and push the new set to the server. */
export async function setPushPrefs(patch) {
  const next = { ...getPushPrefs(), ...patch }
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch {}
  await syncWatch()
  return next
}

// ── Holdings → watch list ───────────────────────────────────────────────────

/**
 * Reduce portfolio holdings to the identifiers the server needs to watch them.
 *
 * Cash and real estate are dropped: neither has a market price worth
 * interrupting someone about, and sending them would mean handing over rows
 * that say nothing useful in return.
 *
 * @param {Array<{coin_id?:string, coin_symbol?:string}>} holdings
 * @returns {Array<{id:string, symbol:string, kind:string}>}
 */
export function toWatchAssets(holdings) {
  if (!Array.isArray(holdings)) return []
  const out = []
  const seen = new Set()

  for (const h of holdings) {
    const rawId = String(h?.coin_id || h?.id || '').trim().toLowerCase()
    const symbol = String(h?.coin_symbol || h?.symbol || '').trim().toUpperCase()
    if (!rawId && !symbol) continue

    let kind = 'crypto'
    let id = rawId

    if (rawId.startsWith('metal:') || ['xau', 'xag', 'xpt', 'xpd'].includes(symbol.toLowerCase())) {
      kind = 'metal'
      id = rawId.replace(/^metal:/, '') || symbol.toLowerCase()
    } else if (rawId.startsWith('stock:') || rawId.startsWith('xstock:')) {
      kind = 'stock'
      id = rawId.replace(/^x?stock:/, '') || symbol.toLowerCase()
    } else if (rawId.startsWith('cash:') || rawId.startsWith('fiat:') || rawId.startsWith('real:')) {
      continue
    }

    if (!id) id = symbol.toLowerCase()
    if (!id || !symbol) continue
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id, symbol, kind })
  }
  return out
}

function readCachedWatch() {
  try { return JSON.parse(localStorage.getItem(WATCH_CACHE_KEY) || '[]') } catch { return [] }
}

/**
 * Derive the watch list straight from the stored transactions.
 *
 * The whole point of server push is that it works with the app closed, which
 * means the server has to already know the holdings — so learning them can't
 * depend on the user having rendered the dashboard first. Someone who adds
 * holdings and then turns notifications on from Settings would otherwise be
 * subscribed to nothing at all, and would keep getting silence until their
 * next dashboard visit.
 *
 * Sold-out positions are dropped: a zero balance has nothing to notify about.
 */
export function watchFromStorage() {
  try {
    const txs = JSON.parse(localStorage.getItem('crypto_tracker_transactions') || '[]')
    const balances = foldBalances(txs)
    return toWatchAssets(
      Object.entries(balances)
        .filter(([, b]) => (Number(b.amount) || 0) > 0)
        .map(([coin_id, b]) => ({ coin_id, coin_symbol: b.symbol })),
    )
  } catch { return [] }
}

/** Best available view of what to watch, whatever the caller had to hand. */
function resolveWatch(holdings) {
  if (holdings !== undefined) return toWatchAssets(holdings)
  const derived = watchFromStorage()
  // The cache is the last resort: it can only be staler than the store it was
  // built from, but it is better than telling the server to watch nothing.
  return derived.length ? derived : readCachedWatch()
}

// ── Which features are set up ───────────────────────────────────────────────
/**
 * A four-boolean snapshot of what the user has configured, so the server can
 * tell them about a feature they are not using yet.
 *
 * These are facts about *setup*, not behaviour: "Guardian is not registered",
 * not "opened Guardian and left". That distinction is the whole licence for
 * this to exist — configuration state justifies one tip, usage telemetry would
 * be a different product with different obligations, and none is collected.
 *
 * Only booleans leave the device. Not the Guardian contact, not the goal
 * amounts, not the watchlist contents.
 */
export function featureSetup() {
  const read = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k) || fallback) } catch { return JSON.parse(fallback) }
  }
  try {
    return {
      guardian: !!read('wl_guardian', 'null')?.active,
      vision: (read('vision_buckets', '[]') || []).length > 0,
      watchlist: (read('wl_watchlist', '[]') || []).length > 0,
      weekly: !!localStorage.getItem('wl_weekly_email'),
      // Per-asset take-profit / stop-loss ladders, which are a different
      // feature from the price alerts counted by alertCount.
      coinTargets: Object.keys(read('crypto_tracker_coin_targets', '{}') || {}).length > 0,
      // A Drive file id only exists once a backup has actually been written.
      backup: !!localStorage.getItem('wl_drive_file_id'),
      // The app's own lock. A privacy-first tracker whose data sits unlocked
      // on the device is the gap most worth one sentence.
      // `true` also when we are not in the Android app, because the tip is
      // read as "already set up" and stays silent. App Lock exists only in
      // the app, and a notification telling a browser user to switch on a
      // Settings row that is not there is worse than no tip at all.
      applock: !isAndroidTWA() || localStorage.getItem('wl_biometric_enabled') === '1',
      // Pages someone has opened at least once — see featureUse.js. Without
      // these, a tip about Technicals or Whales is a guess about whether they
      // have already found it.
      technicals: usedFeature('technicals'),
      whales: usedFeature('whales'),
      academy: usedFeature('academy'),
      coach: usedFeature('coach'),
      rebalance: usedFeature('rebalance'),
    }
  } catch {
    // An unreadable store must not claim things are unconfigured — that would
    // aim every tip at someone who may already be using all of it.
    return {
      guardian: true, vision: true, watchlist: true, weekly: true,
      coinTargets: true, backup: true, applock: true, technicals: true,
      whales: true, academy: true, coach: true, rebalance: true,
    }
  }
}

// ── Asking for permission ───────────────────────────────────────────────────
// A two-step ask: the app explains first, and only calls requestPermission()
// if the user says yes.
//
// The browser dialog is one-shot and unforgiving — "Block" is permanent, the
// prompt cannot be raised again, and the user is left with a Settings path they
// will never walk. So the expensive question is only asked of people who have
// already said yes to the cheap one. Declining our own card costs nothing and
// can be asked again another day.

/** Max times the in-app card is shown before we stop asking for good. */
const MAX_ASKS = 3
/** Gap between asks — long enough that a "not now" is genuinely respected. */
const ASK_GAP_MS = 7 * 24 * 60 * 60 * 1000

function readAsk() {
  try { return JSON.parse(localStorage.getItem(ASK_KEY) || '{}') } catch { return {} }
}

/**
 * Whether to show the in-app permission card right now.
 *
 * Never true once the browser has been asked: 'granted' means autoEnablePush()
 * has it covered, and 'denied' means the decision is out of our hands and no
 * amount of asking will change it.
 */
export function shouldAskPush() {
  try {
    if (!isPushSupported() || !VAPID_PUBLIC) return false
    if (Notification.permission !== 'default') return false
    if (localStorage.getItem(OPTOUT_KEY)) return false
    const { n = 0, ts = 0 } = readAsk()
    if (n >= MAX_ASKS) return false
    return Date.now() - ts >= ASK_GAP_MS
  } catch { return false }
}

/** Record that the card was shown and dismissed, so the next ask waits. */
export function noteAskShown() {
  try {
    const { n = 0 } = readAsk()
    localStorage.setItem(ASK_KEY, JSON.stringify({ n: n + 1, ts: Date.now() }))
  } catch {}
}

// ── Subscription lifecycle ──────────────────────────────────────────────────

// Host of a push endpoint, for reporting a rejection the user can act on.
function hostOf(endpoint) {
  try { return new URL(endpoint).hostname } catch { return '' }
}

async function getSubscription() {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/**
 * Whether the switch in Settings should read On.
 *
 * The opt-out flag is part of the answer, not a separate concern. Reading only
 * the browser subscription produced a state the user cannot get out of:
 * disablePush() writes the opt-out and THEN unsubscribes, so if that
 * unsubscribe fails — or anything re-creates the subscription afterwards — the
 * switch reads On while every automatic path (autoEnablePush, ensureRegistered)
 * correctly refuses to touch an opted-out device. On screen that is a switch
 * that is on, channels that are on, and total silence, with nothing the user
 * can press to change it.
 *
 * Answering false here puts the contradiction back where the user can resolve
 * it: the switch reads Off, matching what they asked for, and turning it on
 * runs enablePush(), which clears the flag and re-registers.
 */
export async function isPushEnabled() {
  if (!isPushSupported()) return false
  try {
    if (localStorage.getItem(OPTOUT_KEY)) return false
  } catch { /* storage blocked — fall through to the subscription */ }
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
  // A subscription is cryptographically bound to the VAPID key it was created
  // with. If that key is ever rotated, the push service rejects everything the
  // server signs for this device — and because getSubscription() still returns
  // the old object, re-enabling would happily reuse it and the device would
  // stay permanently silent with no error anywhere. Drop it and start over.
  if (sub && !subscriptionMatchesKey(sub, VAPID_PUBLIC)) {
    try { await sub.unsubscribe() } catch { /* replaced below regardless */ }
    sub = null
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }

  const res = await fetch(`${PUSH_API}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      alerts: readAlerts(),
      // Read from the transactions store, not from whatever page happened to
      // call this: turning push on from Settings must arm the movement and
      // news channels immediately, not at the next dashboard visit.
      watch: resolveWatch(),
      setup: featureSetup(),
      prefs: getPushPrefs(),
      lang: currentLang(),
      tz: currentTz(),
    }),
  })
  if (!res.ok) {
    // Roll back so isPushEnabled() doesn't report a half-registered state.
    try { await sub.unsubscribe() } catch {}
    throw new Error('Couldn’t reach the notification server. Please try again.')
  }
  try { localStorage.removeItem(OPTOUT_KEY) } catch {}
  return { ok: true }
}

/**
 * Turn push on by itself, without prompting, when permission already exists.
 *
 * In the Android app this is the normal path: the shell asks for
 * POST_NOTIFICATIONS at launch (NotificationPermissionActivity), so by the time
 * the web layer loads, permission is already granted. Making someone find a
 * toggle in Settings to switch on what they just approved at the system level
 * is asking the same question twice.
 *
 * Deliberately never calls requestPermission(). An unprompted permission dialog
 * on page load is the one move that can lose the capability permanently — a
 * denial is sticky and there is no second chance to ask. Someone who has not
 * been asked yet gets the toggle; someone who already said yes gets it on.
 *
 * Also never re-enables after an explicit opt-out: turning it off in Settings
 * has to stay off, or the toggle is a lie.
 */
export async function autoEnablePush() {
  try {
    if (!isPushSupported() || !VAPID_PUBLIC) return { ok: false, reason: 'unsupported' }
    if (Notification.permission !== 'granted') return { ok: false, reason: 'not-granted' }
    if (localStorage.getItem(OPTOUT_KEY)) return { ok: false, reason: 'opted-out' }
    if (await getSubscription()) return { ok: false, reason: 'already-on' }
    await enablePush()
    return { ok: true }
  } catch {
    // Best-effort by definition — nobody asked for this to happen, so it must
    // never surface an error or block startup.
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Run `autoEnablePush()` again if notification permission is granted later.
 *
 * The startup call in App.jsx fires once, so permission granted at any point
 * after that — in the browser prompt, in the primer card, or in Android's own
 * app settings — left push unsubscribed until the next cold start. From the
 * user's side that reads as the switch being broken: they allowed
 * notifications, came back, and the toggle was still off. It was telling the
 * truth; nothing had subscribed.
 *
 * Two triggers, because neither is reliable alone:
 *
 *   permissions change   the correct signal, but the Permissions API is
 *                        missing in some WebViews and its change event is not
 *                        dependable inside a TWA
 *   returning to the tab the fallback, and the one that catches a change made
 *                        in Android settings, which happens entirely outside
 *                        the page
 *
 * @param {(enabled: boolean) => void} [onChange] called after each attempt
 *   with the resulting subscription state, so a toggle can repaint itself
 * @returns {() => void} teardown
 */
export function watchPermission(onChange) {
  if (typeof window === 'undefined' || !isPushSupported()) return () => {}

  let last = Notification.permission
  let stopped = false

  const settle = async () => {
    if (stopped) return
    await autoEnablePush()
    if (stopped) return
    try { onChange?.(await isPushEnabled()) } catch { /* nothing to repaint */ }
  }

  const check = () => {
    const now = Notification.permission
    // Only act on a transition into `granted`. Re-running on every visibility
    // change would hit the network on every app switch for no reason.
    if (now === last) return
    last = now
    if (now === 'granted') settle()
    else onChange?.(false)
  }

  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', check)

  let status = null
  try {
    navigator.permissions?.query?.({ name: 'notifications' }).then(s => {
      if (stopped) return
      status = s
      s.addEventListener('change', check)
    }).catch(() => { /* unsupported: the visibility fallback covers it */ })
  } catch { /* older browsers throw rather than reject */ }

  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', check)
    try { status?.removeEventListener('change', check) } catch { /* already gone */ }
  }
}

export async function disablePush() {
  // Remember the choice before doing the work: autoEnablePush() would
  // otherwise switch it straight back on at the next app open.
  try { localStorage.setItem(OPTOUT_KEY, '1') } catch {}
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
/**
 * Re-register a device the server has forgotten.
 *
 * This is the failure mode that looks perfectly healthy from inside the app.
 * The switch reads On whenever the BROWSER holds a subscription, and
 * autoEnablePush() returns early on `already-on` for exactly that reason — so
 * once the server loses its record (a KV reset, a rotated VAPID key, a
 * /subscribe that never landed), nothing ever re-registers. The switch reads
 * On, every channel reads on, and not one notification can be delivered,
 * because there is nothing on the server to deliver to.
 *
 * Re-POSTs the subscription the browser already has. Does not prompt, does not
 * create a second subscription, and does nothing at all when the user has
 * explicitly opted out.
 *
 * @returns {Promise<{ok: boolean, reason: string, httpStatus?: number,
 *   code?: string, host?: string}>} `ok` when a repair was performed, and in
 *   every case a `reason` — the point of this function is that the caller can
 *   tell a repair that succeeded from one that was refused, from one that was
 *   never attempted. It used to answer a bare boolean, which made "still
 *   trying" and "gave up" the same value and left the status line reading
 *   "reconnecting…" at something that had already failed.
 */
export async function ensureRegistered() {
  try {
    if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
    if (!VAPID_PUBLIC) return { ok: false, reason: 'no-key' }
    if (Notification.permission !== 'granted') return { ok: false, reason: 'not-granted' }
    try {
      if (localStorage.getItem(OPTOUT_KEY)) return { ok: false, reason: 'opted-out' }
    } catch { /* storage blocked; treat as not opted out */ }

    const sub = await getSubscription()
    if (!sub) return { ok: false, reason: 'no-subscription' }

    // Re-posting a subscription bound to a retired VAPID key is the worst
    // version of this bug, not a repair: /status then reports found:true, the
    // readout says everything is healthy, and the push service still rejects
    // every message the server signs. Replacing it means creating a new
    // subscription, which this function deliberately does not do — that is
    // enablePush()'s job, and it belongs behind a deliberate action rather
    // than an unattended startup call. Report it and let the user act.
    if (!subscriptionMatchesKey(sub, VAPID_PUBLIC)) {
      return { ok: false, reason: 'key-rotated' }
    }

    let status
    try {
      const res = await fetch(`${PUSH_API}/status?endpoint=${encodeURIComponent(sub.endpoint)}`)
      if (!res.ok) return { ok: false, reason: 'unreachable', httpStatus: res.status }
      status = await res.json()
    } catch {
      return { ok: false, reason: 'unreachable' }
    }
    if (status.found) return { ok: false, reason: 'already-registered' }

    // The server has told us up front that it will not accept this endpoint.
    // Re-posting it every time the screen opens would just 400 forever, and
    // the user would keep reading "reconnecting…" at a repair that cannot
    // succeed. Say so instead.
    if (status.endpointOk === false) {
      return { ok: false, reason: 'endpoint-rejected', host: status.host || hostOf(sub.endpoint) }
    }

    const post = await fetch(`${PUSH_API}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        alerts: readAlerts(),
        watch: resolveWatch(),
        setup: featureSetup(),
        prefs: getPushPrefs(),
        lang: currentLang(),
        tz: currentTz(),
      }),
    })
    if (post.ok) return { ok: true, reason: 'repaired' }

    // A failed repair has to be distinguishable from one still running, or the
    // status line sits on "reconnecting…" forever at something that already
    // gave up. Carry the server's own reason through.
    let code = ''
    let host = ''
    try {
      const body = await post.json()
      code = String(body?.error || '')
      host = String(body?.host || '')
    } catch { /* no JSON body */ }
    return { ok: false, reason: 'rejected', httpStatus: post.status, code, host }
  } catch {
    // Runs unattended; a network blip must never surface or throw.
    return { ok: false, reason: 'error' }
  }
}

/**
 * What the SERVER holds for this device, not what the client believes it sent.
 *
 * The two can differ, and every real cause of "notifications are on and
 * nothing arrives" lives in that gap: a subscription the server never stored,
 * an empty watch list (the movement pass skips those outright), a spent daily
 * budget, or a channel switched off on one side only. None of it is visible
 * from the app, which is why silence and correct-but-quiet looked identical.
 *
 * @returns {Promise<object|null>} the server's view, or null if unreachable
 */
export async function pushStatus() {
  try {
    if (!isPushSupported()) return { supported: false }
    const sub = await getSubscription()
    if (!sub) return { supported: true, subscribed: false, permission: Notification.permission }
    const res = await fetch(`${PUSH_API}/status?endpoint=${encodeURIComponent(sub.endpoint)}`)
    if (!res.ok) return { supported: true, subscribed: true, permission: Notification.permission, reachable: false }
    const server = await res.json()
    return {
      supported: true,
      subscribed: true,
      permission: Notification.permission,
      reachable: true,
      ...server,
    }
  } catch {
    return { supported: true, reachable: false }
  }
}

export async function syncAlerts() {
  try {
    const sub = await getSubscription()
    if (!sub) return
    await fetch(`${PUSH_API}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, alerts: readAlerts(), lang: currentLang() }),
    }).catch(() => {})
  } catch { /* best-effort */ }
}

/**
 * Tell the server which assets to watch and which channels are on.
 *
 * Call with holdings whenever the portfolio changes; call with nothing to
 * re-send the cached list after a preferences change. Always caches the list
 * locally first, so enabling push later can arm the channels straight away.
 */
export async function syncWatch(holdings) {
  const watch = resolveWatch(holdings)
  try { localStorage.setItem(WATCH_CACHE_KEY, JSON.stringify(watch)) } catch {}

  try {
    const sub = await getSubscription()
    if (!sub) return
    await fetch(`${PUSH_API}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        watch,
        setup: featureSetup(),
        prefs: getPushPrefs(),
        lang: currentLang(),
        tz: currentTz(),
      }),
    }).catch(() => {})
  } catch { /* best-effort */ }
}

// A heartbeat this cheap can afford to be throttled hard: the win-back ladder
// works in days, so one ping every six hours is more than enough resolution,
// and it keeps app opens from turning into a request per launch.
const SEEN_THROTTLE_MS = 6 * 60 * 60 * 1000

/**
 * Tell the server the app was opened. This is the single fact the entire
 * re-engagement ladder rests on — without it the server cannot distinguish a
 * daily user from someone who left a month ago, and would nag both.
 */
export async function pingSeen({ force = false } = {}) {
  try {
    const last = parseInt(localStorage.getItem(SEEN_PING_KEY) || '0', 10)
    if (!force && Date.now() - last < SEEN_THROTTLE_MS) return
  } catch { /* fall through and ping */ }

  try {
    const sub = await getSubscription()
    if (!sub) return
    const res = await fetch(`${PUSH_API}/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, lang: currentLang(), tz: currentTz() }),
    }).catch(() => null)
    // Only record the ping if it landed; a failed one should be retried on the
    // next open rather than silently starting a six-hour blackout.
    if (res?.ok) { try { localStorage.setItem(SEEN_PING_KEY, String(Date.now())) } catch {} }
  } catch { /* best-effort */ }
}

// Fire a one-off test push to confirm delivery works end-to-end.
//
// No longer wired to a button — a "send test" control in Settings is a
// developer tool shown to every user forever, and once push is on the real
// notifications are the proof it works. Kept as a diagnostic that can be
// called from devtools while the /test endpoint exists.
export async function sendTestPush() {
  const sub = await getSubscription()
  if (!sub) throw new Error('Enable notifications first.')
  const res = await fetch(`${PUSH_API}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, lang: currentLang() }),
  })
  if (!res.ok) throw new Error('Test push failed.')
  return { ok: true }
}
