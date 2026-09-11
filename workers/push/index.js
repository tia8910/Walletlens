// WalletLens push service, on Cloudflare Workers.
//
// Replaces the Deno Deploy service of the same name. That one was suspended
// when the org exhausted its Free-plan KV Reads allowance, taking every other
// app in the org down with it — see README.md.
//
// What did NOT change, deliberately:
//   • notify-logic.js and markets.js are imported from push-api/ unchanged.
//     Every decision — thresholds, cooldowns, the win-back ladder, news
//     matching, the zakat reminder — is the same code, still unit-tested from
//     client/src/pushLogic.test.js. Nothing about WHEN to notify was rewritten
//     as part of moving WHERE it runs.
//   • the cron cadences, which are set by what the outbound quote call costs.
//   • the storage shape, and the endpoint-hash key.
//
// What changed: Deno KV → D1, Deno.cron → Cron Triggers, Deno.serve → fetch,
// and web-push → WebCrypto (webpush.js), which is the only genuinely new code.

import {
  asLang, assetUrl, bumpSent, copy, DEFAULT_PREFS, deliveryFor, localDayKey,
  pushTopic, sanitizeAlerts, sanitizePrefs, sanitizeSetup, sanitizeTz,
  sanitizeWatch, sanitizeZakatDue, trimZakatSent,
  normalizeSub as normalize,
} from '../../push-api/notify-logic.js'
import { accessToken, buildMessage, isDeadToken, FCM_ENDPOINT } from './fcm.js'
import { SubStore, endpointKey, tokenKey } from './store.js'
import { createJobs } from './jobs.js'
import { encryptPayload, vapidHeader } from './webpush.js'

// ── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://walletlens.live',
  'https://www.walletlens.live',
  'http://localhost:5173',
  'http://localhost:4173',
])
const PAGES_PREVIEW = /^https:\/\/([a-z0-9-]+\.)?walletlenslive1?\.pages\.dev$/

function corsHeaders(origin) {
  const allow = origin && (ALLOWED_ORIGINS.has(origin) || PAGES_PREVIEW.test(origin))
    ? origin
    : 'https://walletlens.live'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
}

const json = (obj, headers, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers })

// ── Endpoint validation ─────────────────────────────────────────────────────
// Only the real push services. A made-up endpoint stored here would be retried
// on every cron for ever, and the rejection is reported with the host so the
// app can say something better than silence.
const PUSH_HOSTS = [
  /\.googleapis\.com$/, /\.mozilla\.com$/, /\.mozaws\.net$/,
  /\.windows\.com$/, /\.microsoft\.com$/, /\.apple\.com$/,
]
function endpointHost(endpoint) {
  try { return new URL(endpoint).hostname } catch { return '' }
}
function isRealPushEndpoint(endpoint) {
  const host = endpointHost(endpoint)
  return !!host && PUSH_HOSTS.some(re => re.test(host))
}


// ── Delivery ────────────────────────────────────────────────────────────────
/**
 * Send one notification. Drops the subscription if the push service says the
 * endpoint is gone, which is the only way this table ever shrinks on its own.
 */
/**
 * Deliver over FCM, for a device whose subscription carries a token.
 *
 * A peer of the Web Push path below, not a replacement for it. The app renders
 * itself in a WebView now, and a WebView has no service worker, so the Web
 * Push subscription does not exist there. Every browser, desktop and iOS
 * home-screen install still uses Web Push and is untouched by this.
 */
/**
 * Record why a send was refused, on the row itself.
 *
 * Not persisted here. Every job that attempts a send goes on to write the row
 * in the same pass — checkMoves refreshes its price snapshot on essentially
 * every cycle, checkNews records the story whether or not it landed — so the
 * value rides out on a write that was happening anyway rather than costing a
 * D1 round trip per failure. A note lost to an isolate dying mid-run is an
 * acceptable price for that; the next failure writes another one.
 */
function noteError(sub, code, now) {
  sub.lastError = { at: now, code: String(code).slice(0, 160) }
}

async function sendViaFcm(env, store, sub, payload, { now }) {
  const { urgency, ttl } = deliveryFor(payload.channel)
  const token = sub.fcmToken
  if (!token) return false

  let account
  try {
    account = JSON.parse(env.FCM_SERVICE_ACCOUNT || '{}')
  } catch {
    console.warn('FCM_SERVICE_ACCOUNT is not valid JSON')
    return false
  }
  if (!account.project_id) {
    console.warn('FCM_SERVICE_ACCOUNT has no project_id; is the secret set?')
    noteError(sub, 'fcm not configured on the server', now)
    return false
  }

  try {
    const auth = await accessToken(account, now)
    const res = await fetch(FCM_ENDPOINT(account.project_id), {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildMessage({ token, payload, urgency, ttl })),
    })

    if (!res.ok) {
      const text = (await res.text()).slice(0, 300)
      // The FCM equivalent of Web Push's 404/410, and it matters for the same
      // reason: this is the only way the table ever shrinks on its own. A
      // reinstalled or wiped device would otherwise be sent to for ever.
      if (isDeadToken(res.status, text)) {
        await store.delete(await tokenKey(token))
        return false
      }
      console.warn('fcm rejected', res.status, text)
      noteError(sub, `fcm ${res.status} ${text}`, now)
      return false
    }

    sub.sent = bumpSent(sub.sent, now, sub.tz)
    sub.lastError = null
    return true
  } catch (e) {
    console.warn('fcm failed', String(e?.message || e).slice(0, 200))
    noteError(sub, `fcm ${String(e?.message || e)}`, now)
    return false
  }
}

/**
 * Exported as a test seam, in the same spirit as fcm.js's resetTokenCache.
 *
 * The transport decision is the one piece of delivery no other test could
 * reach: the jobs are tested against a stand-in sender, and the store is
 * tested without one. Between those two sat the question nobody was asking —
 * does a token-addressed device, loaded from a real scan, actually reach
 * Firebase — which is exactly where the crons' blindness to the Android app
 * lived.
 */
/**
 * The subrequest budget for one Worker invocation.
 *
 * Cloudflare allows 50 outbound subrequests per invocation on the Free plan,
 * and a cron pass spends them on everything: quote fetches, the news feed, the
 * FCM OAuth token, and one per notification delivered. Exceeding it does not
 * degrade — the next fetch throws "Too many subrequests by single Worker
 * invocation", which surfaced to users as a refused delivery.
 *
 * So sends draw from a counted budget and stop when it runs out, instead of
 * throwing. A subscriber who misses a pass is not skipped: nothing about their
 * state is written unless the send succeeded, so the next tick — a minute away
 * for targets and crypto, five for everything else — picks them up. Degrading
 * beats failing, and deferring by a minute is invisible.
 *
 * The reserve exists because the budget is shared with the fetches that already
 * happened before the first send, and those are not counted here. Leaving room
 * is cheaper than counting every call site.
 */
export const SUBREQUEST_LIMIT = 50
export const SUBREQUEST_RESERVE = 12

export function makeBudget(limit = SUBREQUEST_LIMIT - SUBREQUEST_RESERVE) {
  let left = limit
  return {
    get remaining() { return left },
    /** True while there is room for one more outbound call. */
    take() {
      if (left <= 0) return false
      left -= 1
      return true
    },
  }
}

export function makeSender(env, store, budget = null) {
  return async function send(sub, payload, { now = Date.now() } = {}) {
    // Out of budget: report not-sent rather than throwing. jobs.js already
    // treats a falsy return as "did not deliver" and leaves the subscriber's
    // channel state untouched, which is exactly the retry-next-tick behaviour
    // this needs — no extra bookkeeping.
    if (budget && !budget.take()) return false

    // One decision, two transports. Which one a device wants is a property of
    // the subscription, not of the notification — jobs.js has no idea either
    // exists and should not.
    if (sub.transport === 'fcm') return sendViaFcm(env, store, sub, payload, { now })

    const { urgency, ttl } = deliveryFor(payload.channel)
    const topic = pushTopic(payload.tag)
    const endpoint = sub.subscription?.endpoint
    if (!endpoint) return false

    try {
      const body = await encryptPayload(
        new TextEncoder().encode(JSON.stringify(payload)),
        sub.subscription.keys.p256dh,
        sub.subscription.keys.auth,
      )
      const auth = await vapidHeader({
        endpoint,
        subject: env.VAPID_SUBJECT || 'mailto:contact@walletlens.live',
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        now,
      })

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(ttl),
          Urgency: urgency,
          ...(topic ? { Topic: topic } : {}),
        },
        body,
      })

      if (res.status === 404 || res.status === 410) {
        await store.delete(await endpointKey(endpoint))
        return false
      }
      if (!res.ok) {
        const text = (await res.text()).slice(0, 200)
        console.warn('push rejected', res.status, text)
        noteError(sub, `webpush ${res.status} ${text}`, now)
        return false
      }
      sub.sent = bumpSent(sub.sent, now, sub.tz)
      sub.lastError = null
      return true
    } catch (e) {
      console.warn('push failed', String(e?.message || e).slice(0, 200))
      noteError(sub, `webpush ${String(e?.message || e)}`, now)
      return false
    }
  }
}

async function readJson(req) {
  try { return await req.json() } catch { return {} }
}

// ── HTTP ────────────────────────────────────────────────────────────────────
async function handle(req, env, store) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  // Anything that is not a read may write a subscription, so the cached scan
  // is dropped here rather than beside each write — a cache whose correctness
  // depends on remembering to clear it is one that will eventually be wrong.
  if (req.method !== 'GET') store.invalidate()

  const url = new URL(req.url)
  const path = url.pathname
  const vapidReady = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

  if (path === '/' || path === '/health') {
    // Query the store, do not just claim to be up. Until this was here /health
    // returned ok:true with the D1 binding missing, because nothing on this
    // route touched the database — so the one failure most likely to follow a
    // redeploy was the one the health check could not see, and Settings said
    // "can't reach the notification server" about a server that was answering.
    const db = await store.probe()
    return json({
      ok: db.ok,
      db: db.ok,
      ...(db.ok ? {} : { dbError: db.error }),
      service: 'walletlens-push',
      runtime: 'cloudflare-workers',
      vapid: vapidReady,
      // The public half, deliberately: it ships in every client bundle
      // already, and without it a server key that no longer matches the one
      // clients subscribed with is undetectable from either side.
      vapidKey: env.VAPID_PUBLIC_KEY || '',
      // The channel roster of the RUNNING build, so deployment drift is
      // visible instead of guessed at. "Why do I only get price alerts" has
      // two possible answers -- the content channels have not fired yet
      // today, or the deployed worker predates them -- and they need
      // completely different responses. A short list here means the second.
      channels: Object.keys(DEFAULT_PREFS).filter(k => typeof DEFAULT_PREFS[k] === 'boolean').sort(),
      // The asset link shape this build produces. A price alert is only as
      // good as the page it opens, and the difference between the two shapes
      // is a working deep link and a 404 — but from outside there is no way
      // to tell which one a running worker emits until a notification fires
      // and somebody taps it. One request answers it instead.
      assetUrlSample: assetUrl({ coin_id: 'bitcoin' }),
      // What each cron is responsible for. A channel present above but absent
      // here is defined and never scheduled, which is its own failure mode.
      schedules: {
        '* * * * *': ['targets', 'moves-crypto'],
        '*/5 * * * *': ['moves', 'news'],
        '5 * * * *': ['daily (digest, retention, zakat, portfolio, academy, hacks, features)', 'trend'],
      },
    }, headers)
  }

  if (path === '/status') {
    const endpoint = url.searchParams.get('endpoint') ?? ''
    const fcmToken = url.searchParams.get('fcmToken') ?? ''
    if (!endpoint && !fcmToken) return json({ error: 'missing_endpoint' }, headers, 400)

    // endpointOk is a Web Push question — is this a push service we recognise —
    // and it has no meaning for a token. Reporting `false` for an FCM device
    // would light the "your browser cannot receive push" warning in Settings
    // on a device that is perfectly capable of it.
    const endpointOk = fcmToken ? true : isRealPushEndpoint(endpoint)

    const stored = fcmToken
      ? await store.get(await tokenKey(fcmToken))
      : await store.get(await endpointKey(endpoint))
    if (!stored) {
      return json({
        found: false, endpointOk,
        host: fcmToken ? 'fcm' : endpointHost(endpoint),
      }, headers)
    }

    const sub = normalize(stored)
    const now = Date.now()
    const day = localDayKey(now, sub.tz)
    return json({
      found: true,
      endpointOk,
      vapid: vapidReady,
      vapidKey: env.VAPID_PUBLIC_KEY || '',
      transport: sub.transport,
      watch: sub.watch.length,
      alerts: sub.alerts.length,
      prefs: sub.prefs,
      tz: sub.tz,
      lastSeen: sub.lastSeen,
      createdAt: sub.createdAt,
      sentToday: sub.sent?.day === day ? (sub.sent.n ?? 0) : 0,
      lastError: sub.lastError,
    }, headers)
  }

  if (req.method === 'POST' && path === '/subscribe') {
    const body = await readJson(req)

    // Two kinds of address now. A device inside the Android app's WebView has
    // an FCM token and no Web Push subscription — a WebView has no service
    // worker, so there is nothing to subscribe. Everything else is unchanged.
    const isFcm = body.transport === 'fcm'
    const fcmToken = isFcm ? String(body.fcmToken || '').trim() : ''
    const subscription = isFcm ? null : body.subscription

    if (isFcm) {
      // FCM tokens are long opaque strings. The length floor is not validation
      // so much as a guard against an empty or truncated one being stored as a
      // real address, which would look healthy on /status for ever and never
      // deliver anything.
      if (fcmToken.length < 20) return json({ error: 'missing_token' }, headers, 400)
    } else {
      if (!subscription?.endpoint) return json({ error: 'missing_subscription' }, headers, 400)
      if (!isRealPushEndpoint(subscription.endpoint)) {
        const host = endpointHost(subscription.endpoint)
        console.warn('rejected push endpoint host:', host || '(unparseable)')
        return json({ error: 'invalid_endpoint', host }, headers, 400)
      }
    }

    const k = isFcm ? await tokenKey(fcmToken) : await endpointKey(subscription.endpoint)
    const existing = await store.get(k)
    const now = Date.now()

    const stored = normalize({
      ...(existing ?? {}),
      subscription,
      transport: isFcm ? 'fcm' : 'webpush',
      fcmToken,
      alerts: body.alerts !== undefined ? sanitizeAlerts(body.alerts) : existing?.alerts,
      watch: body.watch !== undefined ? sanitizeWatch(body.watch) : existing?.watch,
      setup: { ...existing?.setup, ...sanitizeSetup(body.setup) },
      prefs: body.prefs !== undefined ? sanitizePrefs(body.prefs) : existing?.prefs,
      lang: asLang(body.lang) ?? existing?.lang,
      // An explicit null is meaningful — the year lapsed, or zakat was paid —
      // so it must be honoured rather than falling through the way an absent
      // field does.
      zakatDue: body.zakatDue !== undefined ? sanitizeZakatDue(body.zakatDue) : existing?.zakatDue,
      zakatSent: existing?.zakatSent,
      tz: body.tz !== undefined ? sanitizeTz(body.tz) : existing?.tz,
      createdAt: existing?.createdAt ?? now,
      lastSeen: now,   // subscribing happens in the app, so it is a visit
      retention: [],
    })
    await store.put(k, stored)
    return json({ ok: true, prefs: stored.prefs, watching: stored.watch.length }, headers)
  }

  if (req.method === 'POST' && path === '/alerts') {
    const body = await readJson(req)
    if (!body.endpoint && !body.fcmToken) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByAddress(body)
    if (!found) return json({ error: 'unknown_subscription' }, headers, 404)

    const nextAlerts = sanitizeAlerts(body.alerts)
    // Prune fired flags for alerts that no longer exist.
    const live = new Set(nextAlerts.map(a => String(a.id)))
    const fired = {}
    for (const [id, ts] of Object.entries(found.sub.fired ?? {})) if (live.has(id)) fired[id] = ts

    await store.put(found.key, {
      ...found.sub, alerts: nextAlerts, fired,
      lang: asLang(body.lang) ?? found.sub.lang,
    })
    return json({ ok: true, count: nextAlerts.length }, headers)
  }

  if (req.method === 'POST' && path === '/watch') {
    const body = await readJson(req)
    if (!body.endpoint && !body.fcmToken) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByAddress(body)
    if (!found) return json({ error: 'unknown_subscription' }, headers, 404)

    const sub = found.sub
    if (body.watch !== undefined) sub.watch = sanitizeWatch(body.watch)
    // Merged, not replaced: a partial snapshot must not blank out what an
    // earlier sync established.
    if (body.setup !== undefined) sub.setup = { ...sub.setup, ...sanitizeSetup(body.setup) }
    if (body.prefs !== undefined) sub.prefs = sanitizePrefs(body.prefs)
    if (body.zakatDue !== undefined) {
      const next = sanitizeZakatDue(body.zakatDue)
      // A new anniversary is a new set of reminders; keeping the old keys
      // would silence the first reminder of the new year.
      if (next !== sub.zakatDue) sub.zakatSent = []
      sub.zakatDue = next
    }
    if (body.tz !== undefined) sub.tz = sanitizeTz(body.tz)
    sub.lang = asLang(body.lang) ?? sub.lang
    sub.lastSeen = Date.now()   // reaching this endpoint means the app is open
    sub.retention = []

    await store.put(found.key, sub)
    return json({ ok: true, watching: sub.watch.length, prefs: sub.prefs }, headers)
  }

  if (req.method === 'POST' && path === '/seen') {
    const body = await readJson(req)
    if (!body.endpoint && !body.fcmToken) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByAddress(body)
    if (!found) return json({ error: 'unknown_subscription' }, headers, 404)
    await store.put(found.key, {
      ...found.sub,
      lastSeen: Date.now(),
      tz: body.tz !== undefined ? sanitizeTz(body.tz) : found.sub.tz,
      retention: [],   // the user came back; the ladder restarts
    })
    return json({ ok: true }, headers)
  }

  if (req.method === 'POST' && path === '/test') {
    const body = await readJson(req)
    if (!body.endpoint && !body.fcmToken) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByAddress(body)
    if (!found) return json({ error: 'unknown_subscription' }, headers, 404)
    const send = makeSender(env, store)
    const lang = asLang(body.lang) ?? found.sub.lang
    // Localised, like every other notification. This was hard-coded English,
    // which made the one notification whose whole job is to prove the feature
    // works arrive in the wrong language for most of the people it reassures.
    const ok = await send(found.sub, {
      channel: 'test',
      title: copy('welcomeTitle', lang)(),
      body: copy('welcomeBody', lang)(),
      tag: 'wl-test',
      url: '/settings',
      lang,
    })
    await store.put(found.key, found.sub)   // persist the sent counter
    return json({ ok }, headers, ok ? 200 : 502)
  }

  if (req.method === 'DELETE' && path === '/unsubscribe') {
    const body = await readJson(req)
    if (body.fcmToken) await store.delete(await tokenKey(body.fcmToken))
    else if (body.endpoint) await store.delete(await endpointKey(body.endpoint))
    return json({ ok: true }, headers)
  }

  return json({ error: 'not_found' }, headers, 404)
}

// ── Cron dispatch ───────────────────────────────────────────────────────────
// One scheduled handler for all three schedules, dispatching on which fired.
// Each job is isolated: one throwing must not cancel the others, because they
// serve different channels and a news outage is not a reason to stop price
// alerts.
export async function runSchedule(cron, jobs) {
  const run = async (name, fn) => {
    try { await fn() } catch (e) {
      console.error(`cron ${name} failed:`, String(e?.message || e).slice(0, 300))
    }
  }

  if (cron === '* * * * *') {
    await run('targets', () => jobs.checkTargets())
    // Crypto every minute: one batched request however many coins are held.
    await run('moves-crypto', () => jobs.checkMoves({ kinds: ['crypto'], refreshSeen: false }))
    return
  }
  if (cron === '*/5 * * * *') {
    // Everything else — stocks cost one request per symbol — plus news.
    await run('moves', () => jobs.checkMoves())
    await run('news', () => jobs.checkNews())
    // main carried a 'data-refresh' step here that poked the data worker from
    // this cron, because that worker had no triggers of its own. It is dropped
    // rather than merged, for three separate reasons: `env` is not in scope in
    // runSchedule (the reference threw on every pass and was swallowed by
    // run()'s catch, so it had never once worked); the replacement data worker
    // serves no /__refresh route, only /__health; and it does not need poking
    // anyway, since it carries its own */15 cron AND serve() refreshes any
    // dataset it finds past its maxAge while answering a request.
    return
  }
  if (cron === '5 * * * *') {
    await run('daily', () => jobs.checkDaily())
    // Hourly is the right cadence for a seven-day window, and it rides this
    // schedule rather than adding a fourth: the account is at the Workers Free
    // cron-trigger limit.
    await run('trend', () => jobs.checkTrend())
    return
  }
  console.warn('unrecognised cron schedule:', cron)
}

export default {
  async fetch(req, env) {
    const store = new SubStore(env.DB)
    try {
      return await handle(req, env, store)
    } catch (e) {
      const msg = String(e?.message || e)
      console.error('request failed:', msg.slice(0, 300))
      // A missing D1 binding surfaces here as a TypeError on `undefined`,
      // because SubStore accepts undefined at construction and only throws
      // when a route reaches the database. Reported as its own status and
      // reason rather than a blanket 500: the app can then say the server's
      // store is unavailable instead of claiming it cannot be reached, which
      // sent everyone looking at their own connection.
      const noStore = !env.DB || /prepare|of undefined|no such table/i.test(msg)
      return json(
        noStore ? { error: 'store_unavailable' } : { error: 'internal' },
        corsHeaders(req.headers.get('origin')),
        noStore ? 503 : 500,
      )
    }
  },

  async scheduled(event, env, ctx) {
    const store = new SubStore(env.DB)
    // One budget per invocation, so the crons that fan out the most (moves and
    // news at */5, the daily channels at :05) cannot spend the platform's whole
    // subrequest allowance before they start delivering.
    const jobs = createJobs({ store, send: makeSender(env, store, makeBudget()) })
    ctx.waitUntil(runSchedule(event.cron, jobs))
  },
}
