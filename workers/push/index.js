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
  asLang, bumpSent, DEFAULT_PREFS, deliveryFor, localDayKey,
  pushTopic, sanitizeAlerts, sanitizePrefs, sanitizeSetup, sanitizeTz,
  sanitizeWatch, sanitizeZakatDue, trimZakatSent,
} from '../../push-api/notify-logic.js'
import { SubStore, endpointKey } from './store.js'
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

/** Fill in whatever a record predating a field would be missing. */
function normalize(s = {}) {
  return {
    subscription: s.subscription,
    alerts: s.alerts ?? [],
    fired: s.fired ?? {},
    createdAt: s.createdAt ?? Date.now(),
    lang: s.lang,
    watch: s.watch ?? [],
    prefs: { ...DEFAULT_PREFS, ...(s.prefs ?? {}) },
    tz: sanitizeTz(s.tz),
    lastSeen: s.lastSeen ?? s.createdAt ?? Date.now(),
    ref: s.ref ?? {},
    moveFired: s.moveFired ?? {},
    lastPrice: s.lastPrice ?? {},
    lastLevel: s.lastLevel ?? {},
    zakatDue: sanitizeZakatDue(s.zakatDue),
    zakatSent: trimZakatSent(s.zakatSent),
    seenRef: s.seenRef ?? null,
    newsSent: s.newsSent ?? {},
    lastNewsAt: s.lastNewsAt ?? 0,
    digestDay: s.digestDay ?? '',
    retention: Array.isArray(s.retention) ? s.retention : [],
    setup: s.setup ?? {},
    featuresSent: Array.isArray(s.featuresSent) ? s.featuresSent : [],
    lastFeatureAt: s.lastFeatureAt ?? 0,
    sent: s.sent ?? { day: '', n: 0 },
  }
}

// ── Delivery ────────────────────────────────────────────────────────────────
/**
 * Send one notification. Drops the subscription if the push service says the
 * endpoint is gone, which is the only way this table ever shrinks on its own.
 */
function makeSender(env, store) {
  return async function send(sub, payload, { now = Date.now() } = {}) {
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
        console.warn('push rejected', res.status, (await res.text()).slice(0, 200))
        return false
      }
      bumpSent(sub, now)
      return true
    } catch (e) {
      console.warn('push failed', String(e?.message || e).slice(0, 200))
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
    return json({
      ok: true,
      service: 'walletlens-push',
      runtime: 'cloudflare-workers',
      vapid: vapidReady,
      // The public half, deliberately: it ships in every client bundle
      // already, and without it a server key that no longer matches the one
      // clients subscribed with is undetectable from either side.
      vapidKey: env.VAPID_PUBLIC_KEY || '',
    }, headers)
  }

  if (path === '/status') {
    const endpoint = url.searchParams.get('endpoint') ?? ''
    if (!endpoint) return json({ error: 'missing_endpoint' }, headers, 400)
    const endpointOk = isRealPushEndpoint(endpoint)

    const stored = await store.get(await endpointKey(endpoint))
    if (!stored) return json({ found: false, endpointOk, host: endpointHost(endpoint) }, headers)

    const sub = normalize(stored)
    const now = Date.now()
    const day = localDayKey(now, sub.tz)
    return json({
      found: true,
      endpointOk,
      vapid: vapidReady,
      vapidKey: env.VAPID_PUBLIC_KEY || '',
      watch: sub.watch.length,
      alerts: sub.alerts.length,
      prefs: sub.prefs,
      tz: sub.tz,
      lastSeen: sub.lastSeen,
      createdAt: sub.createdAt,
      sentToday: sub.sent?.day === day ? (sub.sent.n ?? 0) : 0,
    }, headers)
  }

  if (req.method === 'POST' && path === '/subscribe') {
    const body = await readJson(req)
    const subscription = body.subscription
    if (!subscription?.endpoint) return json({ error: 'missing_subscription' }, headers, 400)
    if (!isRealPushEndpoint(subscription.endpoint)) {
      const host = endpointHost(subscription.endpoint)
      console.warn('rejected push endpoint host:', host || '(unparseable)')
      return json({ error: 'invalid_endpoint', host }, headers, 400)
    }

    const k = await endpointKey(subscription.endpoint)
    const existing = await store.get(k)
    const now = Date.now()

    const stored = normalize({
      ...(existing ?? {}),
      subscription,
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
    if (!body.endpoint) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByEndpoint(body.endpoint)
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
    if (!body.endpoint) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByEndpoint(body.endpoint)
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
    if (!body.endpoint) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByEndpoint(body.endpoint)
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
    if (!body.endpoint) return json({ error: 'missing_endpoint' }, headers, 400)
    const found = await store.getByEndpoint(body.endpoint)
    if (!found) return json({ error: 'unknown_subscription' }, headers, 404)
    const send = makeSender(env, store)
    const lang = asLang(body.lang) ?? found.sub.lang
    const ok = await send(found.sub, {
      channel: 'test',
      title: 'WalletLens',
      body: 'Notifications are working.',
      tag: 'wl-test',
      url: '/settings',
      lang,
    })
    await store.put(found.key, found.sub)   // persist the sent counter
    return json({ ok }, headers, ok ? 200 : 502)
  }

  if (req.method === 'DELETE' && path === '/unsubscribe') {
    const body = await readJson(req)
    if (body.endpoint) await store.delete(await endpointKey(body.endpoint))
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
    return
  }
  if (cron === '5 * * * *') {
    await run('daily', () => jobs.checkDaily())
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
      console.error('request failed:', String(e?.message || e).slice(0, 300))
      return json({ error: 'internal' }, corsHeaders(req.headers.get('origin')), 500)
    }
  },

  async scheduled(event, env, ctx) {
    const store = new SubStore(env.DB)
    const jobs = createJobs({ store, send: makeSender(env, store) })
    ctx.waitUntil(runSchedule(event.cron, jobs))
  },
}
