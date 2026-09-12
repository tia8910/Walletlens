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
import { LANGUAGE_CODES } from './i18n'
import { loadDueDate as loadZakatDue } from './zakat'
import { usedFeature } from './featureUse'
import { isAndroidTWA, fireNativeIntent } from './nativeBridge'
import { PUSH_API } from './apiHosts.js'


// The server builds the notification text, so it has to be told which language
// to build it in — otherwise a user reading the app in Arabic still gets an
// English price alert on their lock screen. Read live rather than cached: the
// language can change after the subscription was created, and every sync
// re-sends it.
function currentLang() {
  try {
    const l = localStorage.getItem('wl_lang')
    // Checked against LANGUAGE_CODES, not a list written out here. This was a
    // hardcoded ['en', 'ar', 'fr', 'es'] and German and Italian were added to
    // the app afterwards — so those users picked their language, the app
    // switched, and every notification still arrived in English, because the
    // client refused to send a code the server had full copy for. Nothing
    // errored; the fallback did exactly what it was written to do.
    return LANGUAGE_CODES.includes(l) ? l : 'en'
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
/** Whether this device has already had its one welcome notification. */
const WELCOMED_KEY = 'wl_push_welcomed'
const ASK_KEY = 'wl_push_ask'

// Mirrors DEFAULT_PREFS in push-api/notify-logic.js. The server sanitizes
// whatever arrives, so a drift here is safe, but the toggles should show the
// same defaults the server would apply.
export const DEFAULT_PUSH_PREFS = {
  moves: true,
  levels: true,
  news: true,
  digest: true,
  retention: true,
  features: true,
  zakat: true,
  trend: true,
  newsMarket: true,
  hacks: true,
  academy: true,
  portfolio: true,
  movePct: 1,
}

export function isPushSupported() {
  // The app's own WebView has no service worker and therefore no PushManager,
  // so every check below fails there — and the toggle read "not supported" on
  // the one platform where notifications are most of the point. It supports
  // notifications perfectly well; it receives them over FCM instead, which is
  // a different transport rather than a missing capability.
  if (inAppShell()) return true

  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

/**
 * Whether this page runs inside the app's own WebView.
 *
 * Read straight off the bridge rather than through nativeShell.js, which
 * imports the backup code that imports half the app: this is called from
 * isPushSupported(), which runs during render.
 */
function inAppShell() {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    return !!(b && typeof b.shellVersion === 'function')
  } catch { return false }
}

/**
 * Whether the first-run welcome flow has finished.
 *
 * Read rather than imported: NativeOnboarding owns these keys, and push.js has
 * no business importing a component to ask a question about localStorage. An
 * unreadable store counts as "still onboarding" — the safe answer, since the
 * cost of not asking is a deferred prompt and the cost of asking is a system
 * dialog landing on top of a welcome flow.
 */
function onboardingFinished() {
  try {
    if (localStorage.getItem('wl_welcome_step_v2')) return false   // mid-flow
    return !!localStorage.getItem('wl_welcomed_v2')
  } catch { return false }
}

/**
 * Whether the OS will let the app post a notification, read synchronously.
 *
 * The same answer nativePush.nativeNotificationsAllowed() gives. Duplicated
 * here — three lines of it — because watchPermission() is synchronous and
 * cannot await a dynamic import, and because everything below has to keep
 * working if the bridge shim fails to load at all.
 */
function shellNotificationsAllowed() {
  try {
    const b = window.AndroidBridge
    return !!(b && typeof b.notificationsAllowed === 'function' && b.notificationsAllowed())
  } catch { return false }
}

/** Whether the push worker already knows this device's token. */
function shellRegistered() {
  try {
    const b = window.AndroidBridge
    return !!(b && typeof b.pushTokenSynced === 'function' && b.pushTokenSynced())
  } catch { return false }
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
      calendar: usedFeature('calendar'),
      alpha: usedFeature('alpha'),
      marketindex: usedFeature('marketindex'),
      grow: usedFeature('grow'),
      exportdata: !!localStorage.getItem('wl_exported_at'),
      transactions: usedFeature('transactions'),
      feargreed: usedFeature('feargreed'),
      risk: usedFeature('risk'),
    }
  } catch {
    // An unreadable store must not claim things are unconfigured — that would
    // aim every tip at someone who may already be using all of it.
    return {
      guardian: true, vision: true, watchlist: true, weekly: true,
      coinTargets: true, backup: true, applock: true, technicals: true,
      whales: true, academy: true, coach: true, rebalance: true,
      calendar: true, alpha: true, marketindex: true, grow: true,
      exportdata: true, transactions: true, feargreed: true, risk: true,
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

/**
 * Flag marking that the ask ledger has been given back its asks, once.
 *
 * The card used to be offered during the welcome flow, where a system dialog
 * lands on top of onboarding and the flow does not survive it. Every one of
 * those was recorded as an ask: three of them and the app never offers again,
 * and each one puts a WEEK between attempts. So the release that finally moved
 * the card to the dashboard would have arrived at devices with the budget
 * already spent — the fix would have shipped and changed nothing that anyone
 * could see for another seven days.
 *
 * Cleared once, keyed on a flag rather than a timestamp so it cannot repeat.
 * An opt-out is NOT touched: someone who turned notifications off in Settings
 * has decided, and this is about asks that were never really made.
 */
const ASK_RESET_KEY = 'wl_push_ask_reset_v1'

function readAsk() {
  try {
    if (!localStorage.getItem(ASK_RESET_KEY)) {
      localStorage.setItem(ASK_RESET_KEY, '1')
      localStorage.removeItem(ASK_KEY)
      return {}
    }
    return JSON.parse(localStorage.getItem(ASK_KEY) || '{}')
  } catch { return {} }
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
    if (!isPushSupported()) return false

    // Never during the welcome flow. The card is mounted behind onboardDone in
    // App.jsx, but that is one component's render condition and this is the
    // rule — asserted here so it holds for every caller, present and future.
    if (!onboardingFinished()) return false
    if (inAppShell()) {
      // Already allowed means autoEnablePush has it; VAPID is a Web Push key
      // and has nothing to say about whether to show the primer here.
      if (shellNotificationsAllowed()) return false
    } else {
      if (!VAPID_PUBLIC) return false
      if (Notification.permission !== 'default') return false
    }
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

// The text of whatever went wrong, short enough to sit in a settings hint.
// A category alone ("could not reach the server") cannot distinguish a phone
// with no signal from a server returning 500 without CORS headers, and those
// need opposite responses.
function detailOf(e) {
  const msg = String(e?.message || e || '').trim()
  return msg.slice(0, 120)
}

/**
 * The body of a /subscribe call.
 *
 * Every field except the subscription itself is enrichment: which assets to
 * watch, which features are already set up, the language. None of it is worth
 * failing a registration over, but building it inline meant a throw from any
 * one of them aborted the POST before it was made — and surfaced as a network
 * error, because that is where the exception landed. A device could then be
 * unable to register for a reason that had nothing to do with the network or
 * the server.
 */
function registrationPayload(sub) {
  return { subscription: sub.toJSON(), ...registrationFields() }
}

/**
 * Everything a subscription carries except its address.
 *
 * Shared, and that is the fix. The Web Push path built this list; the shell's
 * two registration paths each built their own, and one of them built almost
 * none of it — autoEnablePush sent `watch` and nothing else.
 *
 * That path is not an edge case in the Android app, it is the NORMAL one: the
 * shell holds POST_NOTIFICATIONS from launch, so by the time the page loads
 * permission is already granted and registration happens silently, with no
 * toggle ever touched. Every device that came that way is stored without:
 *
 *   alerts     so price targets are never armed on the server and never fire
 *   tz         so the daily brief, zakat, hacks, academy and the portfolio
 *              pulse are all evaluated against the wrong local clock
 *   zakatDue   so the zakat reminder has no date to count down to
 *   lang       so every notification arrives in English
 *   setup      so the feature tips cannot tell what is already configured
 *
 * The welcome notification still arrives, because that is addressed straight
 * to the token and needs none of this. Which is exactly why it looked like
 * "one notification and then silence".
 *
 * Every field is best-effort: a throw from any one of them must not abort a
 * registration, and an absent field leaves whatever the server already had.
 */
function registrationFields() {
  const safe = (fn, fallback) => { try { return fn() } catch { return fallback } }
  return {
    alerts: safe(readAlerts, []),
    watch: safe(() => resolveWatch(), []),
    setup: safe(featureSetup, {}),
    prefs: safe(getPushPrefs, DEFAULT_PUSH_PREFS),
    zakatDue: safe(loadZakatDue, null),
    lang: safe(currentLang, 'en'),
    tz: safe(currentTz, 0),
  }
}

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

  // In the shell there is no subscription object to find. "On" means the OS
  // will deliver and the server has the address — both, because either alone
  // is a toggle that reads On while nothing arrives.
  if (inAppShell()) return shellNotificationsAllowed() && shellRegistered()

  try { return !!(await getSubscription()) } catch { return false }
}

// Returns { ok } or throws an Error with a user-friendly message.
/**
 * Ask Android for POST_NOTIFICATIONS, from inside the tap that wants it.
 *
 * Two permissions govern one thing the user thinks of as one thing: the
 * Android app's own notification permission, and this origin's web
 * Notification permission. Granting either alone gets you nothing — the app
 * permission without a subscription is silence, and a subscription the app
 * cannot post is silence too.
 *
 * The app used to request the Android one on every cold start, before the user
 * had seen anything, and the web one only later when they found the switch.
 * Two dialogs for one decision, and the first bought nothing: the switch still
 * read Off afterwards, because nothing had subscribed.
 *
 * Now the native ask happens here, in the same gesture. keepSession because
 * this must not move the top frame — navigating to intent:// takes the Custom
 * Tab off its own origin and ends the TWA session, and losing the app is a
 * spectacular way to fail at turning notifications on. The iframe route cannot
 * report back, so the wait below is a fixed pause rather than a result: the
 * only thing that actually decides anything is requestPermission() after it,
 * which under TWA notification delegation resolves without a second dialog
 * once the app holds the permission.
 *
 * Best-effort throughout. On the web, on Android 12 and below, or if the
 * intent is dropped, this returns and the web prompt still runs — which is
 * exactly the behaviour that existed before.
 */
async function askNativeNotificationPermission() {
  if (!isAndroidTWA()) return
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') return
  try {
    if (!fireNativeIntent('walletlens://notification-permission', { keepSession: true })) return
  } catch { return }
  // Long enough for Android to start the activity and put the dialog up. The
  // user's answer takes as long as it takes; requestPermission() below is what
  // waits for the outcome.
  await new Promise(r => setTimeout(r, 400))
}

export async function enablePush() {
  if (!isPushSupported()) throw new Error('Push notifications aren’t supported on this device.')

  // In the app's own WebView the whole Web Push path below is unavailable and
  // asking for the browser permission is worse than useless: the dialog grants
  // something a WebView can never act on, and the user then meets Android's
  // own dialog for the permission that actually decides anything. Two asks,
  // one decision, and the first one buys nothing.
  if (inAppShell()) return enablePushInShell()

  if (!VAPID_PUBLIC) throw new Error('Push isn’t configured yet (missing key). Try again after the next update.')

  await askNativeNotificationPermission()

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

  // Roll back so isPushEnabled() doesn't report a half-registered state.
  const rollback = async () => { try { await sub.unsubscribe() } catch {} }

  let res
  try {
    res = await fetch(`${PUSH_API}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Reads from the transactions store, not from whatever page happened to
      // call this: turning push on from Settings must arm the movement and news
      // channels immediately, not at the next dashboard visit. Every field but
      // the subscription is best-effort — see registrationPayload.
      body: JSON.stringify(registrationPayload(sub)),
    })
  } catch (e) {
    await rollback()
    throw new Error(`Couldn’t reach the notification server. ${detailOf(e)}`)
  }
  if (!res.ok) {
    // A refusal, not an unreachable host. This branch used to print "couldn't
    // reach the notification server" and throw the status away, so a server
    // that answered 400 invalid_endpoint and a server that answered 503
    // store_unavailable produced the same sentence — and that sentence named
    // the network, which was the one thing working. The status and the
    // server's own error code are the whole diagnosis; they go on the screen.
    let body = {}
    try { body = await res.json() } catch { /* not JSON */ }
    await rollback()
    throw new Error(
      `The notification server refused this device (${res.status}${body?.error ? ` ${body.error}` : ''}).`
    )
  }
  try { localStorage.removeItem(OPTOUT_KEY) } catch {}
  sendWelcomePush()
  return { ok: true }
}

/**
 * watchPermission's shell half: poll the OS on every return to the app.
 *
 * A transition INTO allowed is the only one worth acting on, exactly as in the
 * browser path — re-registering on every app switch would put a request on the
 * network each time someone glanced at another app.
 */
function watchShellPermission(onChange) {
  let last = shellNotificationsAllowed()
  let stopped = false

  const check = async () => {
    if (stopped) return
    const now = shellNotificationsAllowed()
    if (now === last) return
    last = now
    if (!now) { onChange?.(false); return }
    try {
      const native = await import('./nativePush.js')
      await native.registerNativePush({ force: true, ...registrationFields() })
      if (!stopped) onChange?.(await isPushEnabled())
    } catch { /* nothing to repaint */ }
  }

  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', check)

  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', check)
  }
}

/**
 * The notification that proves the rest of them will arrive.
 *
 * Sent through the server on purpose, not raised locally. A local notification
 * would only prove this app can draw one; this exercises the whole path —
 * permission, token, the push worker, FCM, and the channel the app posts on —
 * which is the only part anyone actually doubts. It is also the only feedback
 * a user ever gets that "on" means anything, since the first real alert may be
 * days away.
 *
 * Never throws. Enabling notifications succeeded; a welcome that did not
 * arrive must not present itself as that having failed.
 */
async function sendWelcomePush() {
  // Once per device, ever.
  //
  // Fired from autoEnablePush as well as from the toggle, and that is the
  // point: when the OS permission is already granted — carried over from an
  // earlier install, say — nothing ever asks, push is registered silently, and
  // the user is given no sign at all that notifications are on. This is the
  // one thing that tells them.
  //
  // The flag is written BEFORE the send. A welcome that fails is not worth
  // retrying on every launch for ever, and the toggle in Settings can send a
  // test on demand.
  try {
    if (localStorage.getItem(WELCOMED_KEY)) return
    localStorage.setItem(WELCOMED_KEY, String(Date.now()))
  } catch { /* private mode: send it and accept the risk of a repeat */ }

  try { await sendTestPush() } catch { /* the toggle is on either way */ }
}

/**
 * Turn notifications on inside the app's own WebView.
 *
 * ONE DIALOG. Android's, for POST_NOTIFICATIONS, which is the only permission
 * that governs whether a notification from this app appears. There is no
 * browser permission to ask for here and no subscription to make — the address
 * is an FCM token the native side already holds.
 *
 * The wait is for a dialog, not a promise: the permission is requested by a
 * separate Activity and the answer lands in the app's own state rather than in
 * anything JavaScript can await. So this polls the bridge, briefly, and gives
 * up rather than hanging a toggle for ever. A user who takes longer than that
 * is not stuck — the permission is granted, and the next launch registers.
 */
async function enablePushInShell() {
  const native = await import('./nativePush.js')

  if (!native.nativeNotificationsAllowed()) {
    // Never mid-onboarding, whoever is asking.
    //
    // This is the last line of defence rather than the first: the primer is
    // already gated, but a system dialog is not a card that can be dismissed
    // and re-shown — it lands on top of the welcome flow, takes the focus, and
    // the flow does not survive it. Guarding at the point the dialog is raised
    // means no future caller can reintroduce that by accident.
    if (!onboardingFinished()) {
      throw new Error('Finish setting up WalletLens first.')
    }

    // Android stops showing the dialog after two refusals: the request returns
    // immediately, having displayed nothing. Firing it anyway is what made
    // tapping Enable do nothing — and then, because the attempt was counted as
    // a failed ask, the app stopped offering for a week. Settings is the only
    // route left, so offer that instead of a dialog that will never appear.
    if (native.nativeNotificationAskState() === 'blocked') {
      native.openNativeNotificationSettings()
      throw new Error('Turn notifications on for WalletLens in Settings — it’s open now.')
    }

    native.requestNativeNotificationPermission()

    const deadline = Date.now() + 30_000
    while (Date.now() < deadline && !native.nativeNotificationsAllowed()) {
      await new Promise(r => setTimeout(r, 300))
    }
    if (!native.nativeNotificationsAllowed()) {
      throw new Error('Allow notifications for WalletLens, then try again.')
    }
  }

  const res = await native.registerNativePush({ force: true, ...registrationFields() })
  if (!res.ok) {
    if (res.reason === 'no-token') {
      throw new Error('The app hasn’t finished setting up notifications yet. Try again in a moment.')
    }
    // "Couldn't reach the server" for every failure is what cost a whole
    // release to diagnose: the server was reached and REFUSED — it was running
    // a build that predated FCM support and rejected a subscription with no
    // Web Push endpoint — and the message sent everyone looking at the network
    // instead. A refusal and an unreachable host are different faults with
    // different fixes, and they say so now.
    if (res.reason?.startsWith('http-')) {
      throw new Error(`The notification server refused this device (${res.reason.slice(5)}). It may be running an older version — try again shortly.`)
    }
    // registerNativePush reports exactly one reason for a request that never
    // completed, and every other reason is something local. Collapsing them
    // into one sentence about the network is what kept this on the screen
    // while /health answered db: true, vapid: true from outside — both true,
    // about different things.
    if (res.reason === 'unreachable') {
      // Two faults, one exception text. registerNativePush follows a failure
      // with a plain GET that cannot preflight: if that answered, the device
      // reaches the server perfectly well and the registration was refused on
      // its way out of the browser — a CORS preflight or a connect-src — which
      // is ours to fix and has nothing to do with their connection.
      if (res.reachedServer) {
        throw new Error(
          `The notification server is reachable, but this device’s registration was blocked before it could be sent${res.detail ? ` (${res.detail})` : ''}. This is a fault on our side, not on your connection.`
        )
      }
      throw new Error(
        `Couldn’t reach the notification server — the request never completed.${res.detail ? ` (${res.detail})` : ''}`
      )
    }
    if (res.reason === 'payload') {
      // Nothing was sent. This used to be indistinguishable from the line
      // above, because the body was built inside the same try as the fetch.
      throw new Error(`This device’s registration could not be prepared${res.detail ? ` (${res.detail})` : ''}. This is a fault on our side.`)
    }
    if (res.reason === 'not-in-shell') {
      throw new Error('The app’s notification bridge isn’t available. Close WalletLens fully and reopen it.')
    }
    throw new Error(`Registering this device failed (${res.reason || 'unknown'}).`)
  }

  try { localStorage.removeItem(OPTOUT_KEY) } catch { /* private mode */ }

  // Not awaited: the toggle should flip the moment the server has the device,
  // and a welcome that takes a second to arrive must not hold the UI on a
  // spinner while it does.
  sendWelcomePush()
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
    if (!isPushSupported()) return { ok: false, reason: 'unsupported' }

    // The shell's version of the same idea, and the reasoning is identical:
    // register without prompting when the OS has already said yes, never
    // prompt from here. VAPID is not part of it — that key belongs to Web
    // Push, and requiring it would make this return 'unsupported' on the one
    // platform that needs it most.
    if (inAppShell()) {
      // In the native shell, notifications are delivered over FCM — no
      // service worker, no Web Push subscription.  The OS must have granted
      // POST_NOTIFICATIONS for anything to appear.
      if (!shellNotificationsAllowed()) {
        // The permission is NOT granted.  This is the FIRST thing the app does
        // after startup — ask the user for permission right away, rather than
        // silently giving up and waiting for them to discover a toggle buried
        // in Settings.
        try {
          const native = await import('./nativePush.js')
          native.requestNativeNotificationPermission()
        } catch { /* best effort */ }
        return { ok: false, reason: 'asking' }
      }
      if (localStorage.getItem(OPTOUT_KEY)) return { ok: false, reason: 'opted-out' }
      if (shellRegistered()) return { ok: false, reason: 'already-on' }
      const native = await import('./nativePush.js')
      const res = await native.registerNativePush(registrationFields())
      if (!res.ok) return { ok: false, reason: res.reason }
      // Registered without anyone being asked, because the OS permission was
      // already there. Without this the user has no way to know.
      sendWelcomePush()
      return { ok: true }
    }

    if (!VAPID_PUBLIC) return { ok: false, reason: 'unsupported' }
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

  // The shell's permission lives in Android, not in the page, and it changes
  // in places the page is never told about: the system dialog this app raises,
  // and Settings → Apps → Notifications, which the user may visit at any time.
  // Same shape as below — re-check when the app comes back to the foreground —
  // reading the OS rather than Notification.permission, which is not defined
  // here at all.
  if (inAppShell()) return watchShellPermission(onChange)

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
      if (!res.ok) return { ok: false, reason: 'status-http', httpStatus: res.status }
      status = await res.json()
    } catch (e) {
      return { ok: false, reason: 'status-unreachable', detail: detailOf(e) }
    }
    if (status.found) return { ok: false, reason: 'already-registered' }

    // The server has told us up front that it will not accept this endpoint.
    // Re-posting it every time the screen opens would just 400 forever, and
    // the user would keep reading "reconnecting…" at a repair that cannot
    // succeed. Say so instead.
    if (status.endpointOk === false) {
      return { ok: false, reason: 'endpoint-rejected', host: status.host || hostOf(sub.endpoint) }
    }

    let post
    try {
      post = await fetch(`${PUSH_API}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload(sub)),
      })
    } catch (e) {
      // Distinct from a failing /status on purpose. The two used to share one
      // reason, so "the read worked and the write did not" — which is the
      // shape of a server error, not of an unreachable host — was invisible.
      return { ok: false, reason: 'subscribe-unreachable', detail: detailOf(e) }
    }
    if (post.ok) return { ok: true, reason: 'repaired' }

    // A failed repair has to be distinguishable from one still running, or the
    // status line sits on "reconnecting…" forever at something that already
    // gave up. Carry the server's own reason through.
    let code = ''
    let host = ''
    let detail = ''
    try {
      const body = await post.json()
      code = String(body?.error || '')
      host = String(body?.host || '')
      detail = String(body?.detail || '')
    } catch { /* no JSON body */ }
    return { ok: false, reason: 'rejected', httpStatus: post.status, code, host, detail }
  } catch (e) {
    // Runs unattended; a network blip must never surface or throw.
    return { ok: false, reason: 'error', detail: detailOf(e) }
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
// Which failure was it?
//
// "reachable: false" used to cover two unrelated things: the server being
// unreachable, and the server answering perfectly to say its own store is
// broken. Those need different responses from the reader — one is their
// network, the other is ours — and telling someone to check their connection
// when the fault is a missing database binding costs them an evening.
async function faultOf(res) {
  try {
    const body = await res.json()
    if (body?.error) return body.error
  } catch { /* not JSON, fall through to the status code */ }
  return res.status >= 500 ? 'server_error' : 'http_' + res.status
}

/**
 * Ask the server about one address, and say what went wrong if it would not say.
 *
 * Split out so the fetch is the ONLY thing whose failure can be called a
 * network fault. Everything else pushStatus does -- reading a permission,
 * importing the native bridge, asking the service worker for a subscription --
 * used to sit inside the same try/catch, so a local exception in any of them
 * was reported as "can't reach the notification server" about a server that
 * had not been contacted at all. That sent the reader after their connection
 * while the fault was in their own tab, and it cost a round of diagnosis with
 * the worker verified healthy from the outside.
 */
async function askServer(query) {
  let res
  try {
    res = await fetch(`${PUSH_API}/status?${query}`)
  } catch (e) {
    // The request itself did not complete: no signal, DNS, CORS, a blocked
    // connect-src. The detail is the browser's own words and is the only thing
    // that distinguishes them from each other.
    return { reachable: false, serverFault: 'network', detail: detailOf(e) }
  }
  if (!res.ok) return { reachable: false, serverFault: await faultOf(res) }
  try {
    return { reachable: true, ...(await res.json()) }
  } catch (e) {
    // 200 with a body that is not JSON is a proxy or an error page, not the
    // push worker answering.
    return { reachable: false, serverFault: 'bad_body', detail: detailOf(e) }
  }
}

export async function pushStatus() {
  if (!isPushSupported()) return { supported: false }

  // Notification.permission does not exist in the app's WebView, and reading
  // it is what would throw before any of the rest of this ran.
  if (inAppShell()) {
    let permission = 'default'
    let token = ''
    try {
      permission = shellNotificationsAllowed() ? 'granted' : 'default'
      const native = await import('./nativePush.js')
      token = native.nativePushToken()
    } catch (e) {
      return { supported: true, reachable: false, serverFault: 'client_error', detail: detailOf(e) }
    }
    if (!token) return { supported: true, subscribed: false, permission }
    return {
      supported: true, subscribed: true, permission,
      ...(await askServer(`fcmToken=${encodeURIComponent(token)}`)),
    }
  }

  let sub
  let permission
  try {
    permission = Notification.permission
    sub = await getSubscription()
  } catch (e) {
    return { supported: true, reachable: false, serverFault: 'client_error', detail: detailOf(e) }
  }
  if (!sub) return { supported: true, subscribed: false, permission }
  return {
    supported: true, subscribed: true, permission,
    ...(await askServer(`endpoint=${encodeURIComponent(sub.endpoint)}`)),
  }
}

export async function syncAlerts() {
  // The Android app first, because for a long time it was not here at all.
  //
  // getSubscription() reads a service worker registration, and the app's
  // WebView has no service worker — so this function returned on its second
  // line on every Android device and the price targets a user set were never
  // sent to the server after the initial registration. The target channel was
  // simply dead in the app: targets were stored locally, drawn on the
  // dashboard, and never armed anywhere that could fire a notification.
  //
  // Re-registering rather than POSTing /alerts by token: the whole record
  // travels together that way, so an alert change cannot leave the rest of the
  // subscription behind the way this file's paths kept doing.
  try {
    const native = await import('./nativePush.js')
    if (native.usesNativePush()) {
      await native.registerNativePush({ force: true, ...registrationFields() })
      return
    }
  } catch { /* fall through to Web Push */ }

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

  // Inside the app's own WebView there is no Web Push subscription to find —
  // a WebView has no service worker, so getSubscription() below returns null
  // and this function would return having done nothing at all. That device
  // registers by token instead, and this is the same call for it: the watch
  // list, the setup flags and the preferences all travel with the address.
  //
  // Imported lazily so the browser bundle does not carry the bridge shim, and
  // so a fault in it cannot break the Web Push path underneath.
  try {
    const native = await import('./nativePush.js')
    if (native.usesNativePush()) {
      await native.registerNativePush({
        force: true,   // the watch list has changed; the server needs it
        ...registrationFields(),
        // After the spread: this is the list the caller's holdings produced,
        // which registrationFields() cannot see.
        watch,
      })
      return
    }
  } catch { /* fall through to Web Push */ }

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
    // Inside the app's own WebView there is no Web Push subscription —
    // getSubscription() returns null.  Send the FCM token instead so the
    // server knows this device is alive and the win-back ladder stays accurate.
    let address = {}
    if (inAppShell()) {
      const native = await import('./nativePush.js')
      const token = native.nativePushToken()
      if (!token) return
      address = { fcmToken: token }
    } else {
      const sub = await getSubscription()
      if (!sub) return
      address = { endpoint: sub.endpoint }
    }
    const res = await fetch(`${PUSH_API}/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...address, lang: currentLang(), tz: currentTz() }),
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
/**
 * Ask the server to send one notification to this device, now.
 *
 * The only thing that exercises delivery. Everything else — permission, the
 * subscription, the server's record of it — can be correct while the push
 * service still rejects what the server signs, and no channel firing on its
 * own schedule can tell you that within an hour.
 *
 * Reads the body rather than the status code. /test answers 200 with
 * `{ ok: false, detail }` when the send itself failed, so the old version
 * reported success for a notification that was never delivered.
 */
export async function sendTestPush() {
  // The address differs by transport. In the app's own WebView there is no
  // Web Push subscription to find, so this used to throw "Turn notifications
  // on first" at someone whose notifications were already on.
  let address
  if (inAppShell()) {
    const native = await import('./nativePush.js')
    const token = native.nativePushToken()
    if (!token) throw new Error('The app hasn’t finished setting up notifications yet.')
    address = { fcmToken: token }
  } else {
    const sub = await getSubscription()
    if (!sub) throw new Error('Turn notifications on first.')
    address = { endpoint: sub.endpoint }
  }

  let res
  try {
    res = await fetch(`${PUSH_API}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...address, lang: currentLang() }),
    })
  } catch (e) {
    throw new Error(`Couldn't reach the notification server. ${detailOf(e)}`)
  }

  let body = {}
  try { body = await res.json() } catch { /* no JSON body */ }

  if (!res.ok) {
    if (body?.error === 'unknown_subscription') {
      throw new Error('The server has no record of this device. Turn the switch off and on again.')
    }
    throw new Error(`The server refused the test (${res.status}${body?.error ? ` ${body.error}` : ''}).`)
  }
  if (body?.ok) return { ok: true }

  // Delivered to us, refused by the push service. This is the case worth
  // naming precisely — it is the only failure that leaves every other signal
  // in the app reading healthy.
  if (body?.gone) {
    throw new Error('This device\u2019s subscription has expired. Turn the switch off and on again.')
  }
  const code = body?.code ? ` (${body.code})` : ''
  throw new Error(`The push service rejected it${code}. ${body?.detail || ''}`.trim())
}

/**
 * Does the server sign with the same VAPID key this build subscribes with?
 *
 * A mismatch is total, silent failure: the push service rejects every message
 * the server signs, while the subscription, the server's record and every
 * switch in Settings all read correct. The public half is public by
 * definition — it ships in this bundle — so comparing it costs nothing.
 *
 * Returns null when it cannot tell, which must not be reported as a problem.
 */
export function vapidKeyMatches(serverKey) {
  if (!serverKey || !VAPID_PUBLIC) return null
  return serverKey === VAPID_PUBLIC
}

/**
 * Re-arms the server's watch list whenever the portfolio changes, no matter
 * which page the change happened on.
 *
 * The Dashboard's syncWatch() only fires while the Dashboard is mounted. Add
 * or remove a holding from the Transactions page, a trade sheet, or an import
 * and the Dashboard is unmounted — so the server keeps watching the OLD asset
 * list, and a newly added asset stays silent until the next Dashboard visit.
 *
 * This listens for the same wl:portfolio-updated event driveAutoBackup uses
 * and re-syncs the watch list from storage, so a price channel turns on for a
 * new holding immediately rather than whenever the user next lands somewhere.
 */
let _watchSyncBound = false
export function bindWatchSync() {
  if (_watchSyncBound || typeof window === 'undefined') return () => {}
  _watchSyncBound = true
  const onUpdated = () => {
    // Reads holdings from storage; works whether or not the Dashboard is up.
    const watch = watchFromStorage()
    if (!watch.length) return
    const cache = readCachedWatch()
    const same = cache.length === watch.length &&
      cache.every((a, i) => a.id === watch[i].id && a.kind === watch[i].kind)
    if (same) return
    syncWatch()
  }
  window.addEventListener('wl:portfolio-updated', onUpdated)
  return () => { window.removeEventListener('wl:portfolio-updated', onUpdated) }
}
