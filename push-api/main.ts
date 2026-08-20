// WalletLens push-notification API — Deno Deploy edition.
//
// Sends Web Push notifications to installed PWAs / TWAs even when the app is
// CLOSED. This is the piece the on-device Notification API can't do: the
// browser's foreground-only `new Notification()` never fires once the app is
// shut, so everything portfolioNotify.js knows about a user's portfolio only
// ever reaches someone who was already looking at the app.
//
// Five channels, each independently switchable in Settings:
//   • target    — a price the user asked to be told about        (they set it)
//   • move      — a holding swung past their threshold           (every 15 min)
//   • news      — breaking story naming an asset they hold       (every 20 min)
//   • digest    — one morning brief on their own clock           (hourly scan)
//   • retention — win-back ladder while the app goes unopened    (hourly scan)
//
// What it stores (Deno KV) — the privacy-minimal set required to push:
//   • the anonymous Web Push subscription (an endpoint URL + crypto keys —
//     no name, no email, no identity)
//   • the user's alert rules and the *identifiers* of the assets they track,
//     so the crons know what to watch. NO amounts, NO cost basis, NO portfolio
//     value, NO identity. The copy never needs them, so they never leave the
//     device.
//   • a last-seen timestamp and UTC offset, which is what makes "you have been
//     away 7 days" and "don't buzz me at 3am" possible at all.
//
// Decision rules (thresholds, quiet hours, the daily budget, the win-back
// ladder, news matching) live in notify-logic.js so they can be unit-tested
// from client/src/pushLogic.test.js — none of it is reachable from a browser,
// and getting it wrong means spamming every user at once.
//
// Deploy + VAPID + TWA notes: see push-api/README.md
//
// Endpoints:
//   POST   /subscribe    { subscription, alerts?, watch?, prefs?, lang?, tz? }
//   POST   /alerts       { endpoint, alerts, lang? }   → price-target rules
//   POST   /watch        { endpoint, watch, prefs?, tz?, lang? } → tracked assets
//   POST   /seen         { endpoint, tz? }             → "app opened" heartbeat
//   POST   /test         { endpoint, lang? }           → send a test push
//   DELETE /unsubscribe  { endpoint }                  → forget a sub

import webpush from "npm:web-push@3.6.7"
import {
  asLang, buildPayload, bumpQuota, copy, DEFAULT_PREFS, deliveryFor,
  DIGEST_MIN_PCT, dueRetentionStep, evaluateMove, fmtPct, fmtPrice,
  inQuietHours, isBreaking, localDayKey, localHour, matchArticle,
  MOVE_COOLDOWN_MS, NEWS_COOLDOWN_MS, pickHeadline, pruneSent, pushTopic,
  RETENTION_HOUR, RETENTION_MIN_PCT, sanitizeAlerts, sanitizePrefs, sanitizeTz,
  sanitizeWatch, shortHash, withinDailyBudget,
} from "./notify-logic.js"
import { assetKey, fetchCryptoQuotes, fetchNews, fetchQuotes, quoteFor } from "./markets.js"

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? ""
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? ""
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contact@walletlens.live"

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
} else {
  console.warn("VAPID keys missing — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env secrets.")
}

const kv = await Deno.openKv()

type Lang = "en" | "ar" | "fr" | "es"

interface WatchAsset { id: string; symbol: string; kind: "crypto" | "stock" | "metal" }
interface Prefs {
  moves: boolean; news: boolean; digest: boolean; retention: boolean
  movePct: number; quiet: boolean
}
interface PriceRef { price: number; ts: number }

interface StoredSub {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  alerts: Array<{ id: string | number; coin_id: string; coin_symbol: string; condition: "above" | "below"; targetPrice: number }>
  fired: Record<string, number>
  createdAt: number
  /** The language the app was in when this device last talked to us. */
  lang?: Lang
  /** Identifiers only — see the privacy note at the top of the file. */
  watch: WatchAsset[]
  prefs: Prefs
  /** Minutes east of UTC, so the server can reason about the user's clock. */
  tz: number
  /** Last time the app was opened. Drives the whole retention ladder. */
  lastSeen: number
  /** Rolling movement baselines, keyed by assetKey(). */
  ref: Record<string, PriceRef>
  /** Per-asset movement cooldown, keyed by assetKey(). */
  moveFired: Record<string, number>
  /** Prices as of the user's last visit, for "since you were away" copy. */
  seenRef: { at: number; prices: Record<string, number> } | null
  /** Story hashes already pushed, pruned on every news run. */
  newsSent: Record<string, number>
  lastNewsAt: number
  /** Local day the morning brief last went out. */
  digestDay: string
  /** Win-back ladder steps already used; cleared when the user returns. */
  retention: number[]
  /** Shared daily budget across all automated channels. */
  quota: { day: string; n: number }
}

/**
 * Fill in everything a record predating a given field would be missing.
 * Subscriptions live for months, so every read goes through this rather than
 * assuming the shape that the current deploy happens to write.
 */
function normalize(s: Partial<StoredSub> & Pick<StoredSub, "subscription">): StoredSub {
  return {
    subscription: s.subscription,
    alerts: s.alerts ?? [],
    fired: s.fired ?? {},
    createdAt: s.createdAt ?? Date.now(),
    lang: s.lang,
    watch: s.watch ?? [],
    prefs: { ...DEFAULT_PREFS, ...(s.prefs ?? {}) } as Prefs,
    tz: sanitizeTz(s.tz),
    // An older record has no heartbeat; treating "subscribed" as "seen" stops
    // the ladder from firing all five steps at a long-standing user at once.
    lastSeen: s.lastSeen ?? s.createdAt ?? Date.now(),
    ref: s.ref ?? {},
    moveFired: s.moveFired ?? {},
    seenRef: s.seenRef ?? null,
    newsSent: s.newsSent ?? {},
    lastNewsAt: s.lastNewsAt ?? 0,
    digestDay: s.digestDay ?? "",
    retention: Array.isArray(s.retention) ? s.retention : [],
    quota: s.quota ?? { day: "", n: 0 },
  }
}

// ── Abuse guards ────────────────────────────────────────────────────────────
// Push endpoints must belong to a real browser push service — otherwise the
// cron becomes a free HTTP cannon aimed at attacker-chosen URLs.
const PUSH_HOST_ALLOW = [
  /(^|\.)fcm\.googleapis\.com$/,          // Chrome / Chromium
  /(^|\.)android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,  // Firefox
  /(^|\.)notify\.windows\.com$/,           // Edge legacy
  /(^|\.)push\.apple\.com$/,               // Safari
]
function isRealPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === "https:" && PUSH_HOST_ALLOW.some(re => re.test(u.hostname))
  } catch { return false }
}

// Best-effort per-IP rate limit (in-memory, per isolate — cheap first line).
const rlBuckets = new Map<string, { n: number; reset: number }>()
function rateLimited(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const b = rlBuckets.get(ip)
  if (!b || now > b.reset) { rlBuckets.set(ip, { n: 1, reset: now + windowMs }); return false }
  b.n++
  if (rlBuckets.size > 10_000) rlBuckets.clear()
  return b.n > max
}

// ── CORS (same allowlist style as voice-api) ────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "https://walletlens.live",
  "https://www.walletlens.live",
  "http://localhost:5173",
  "http://localhost:4173",
])
const PAGES_PREVIEW = /^https:\/\/([a-z0-9-]+\.)?walletlenslive1?\.pages\.dev$/
// TWA web views send the app's own origin; the Custom-Tab fallback sends the site origin.
function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && (ALLOWED_ORIGINS.has(origin) || PAGES_PREVIEW.test(origin))
}
function corsHeaders(origin: string | null): HeadersInit {
  const allow = isAllowedOrigin(origin) ? (origin as string) : "https://walletlens.live"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Vary": "Origin",
    "Content-Type": "application/json",
  }
}

// ── KV helpers ──────────────────────────────────────────────────────────────
// Key a subscription by a stable hash of its endpoint URL.
async function endpointKey(endpoint: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 24)
}

async function allSubs(): Promise<Array<{ key: Deno.KvKey; sub: StoredSub }>> {
  const out: Array<{ key: Deno.KvKey; sub: StoredSub }> = []
  for await (const e of kv.list<StoredSub>({ prefix: ["sub"] })) {
    if (e.value?.subscription?.endpoint) out.push({ key: e.key, sub: normalize(e.value) })
  }
  return out
}

// ── Sending ─────────────────────────────────────────────────────────────────

/**
 * Raw send; drops the subscription if the endpoint is gone (404/410).
 *
 * Urgency and TTL are per-channel and are what make a closed phone behave.
 * Left at the library defaults, every message goes out at normal urgency with
 * a four-week TTL: Chrome sits on it until the device leaves Doze, and a phone
 * that was off for days is then told about a price target crossed last week.
 * See CHANNEL_DELIVERY.
 */
async function sendPush(sub: StoredSub, payload: Record<string, unknown>): Promise<boolean> {
  const { urgency, ttl } = deliveryFor(payload.channel as string)
  const topic = pushTopic(payload.tag as string)
  try {
    await webpush.sendNotification(sub.subscription as never, JSON.stringify(payload), {
      urgency,
      TTL: ttl,
      // Coalesces queued messages for an offline device, so unlocking shows the
      // current state of an asset rather than a scrollback of it.
      ...(topic ? { topic } : {}),
    })
    return true
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode
    if (code === 404 || code === 410) {
      await kv.delete(["sub", await endpointKey(sub.subscription.endpoint)])
    } else {
      console.error("push send error:", code, e)
    }
    return false
  }
}

/**
 * The two guards that protect the notification permission itself: the user's
 * overnight quiet hours, and one shared daily budget across every automated
 * channel. Exposed separately so a cron can check *before* it starts marking
 * work as done — the news pass in particular must not tick a queue of stories
 * off as "sent" while it is silently unable to send any of them.
 */
function canDeliver(sub: StoredSub, now: number): boolean {
  if (sub.prefs.quiet && inQuietHours(now, sub.tz)) return false
  return withinDailyBudget(sub.quota, now, sub.tz)
}

/**
 * Send, subject to those guards. `urgent` is for price targets only — the user
 * asked for that specific notification by name, so it outranks both.
 *
 * Mutates `sub.quota` on success; the caller is responsible for persisting.
 */
async function deliver(
  sub: StoredSub,
  payload: Record<string, unknown>,
  { urgent = false, now = Date.now() } = {},
): Promise<boolean> {
  if (!urgent && !canDeliver(sub, now)) return false
  const ok = await sendPush(sub, payload)
  if (ok && !urgent) sub.quota = bumpQuota(sub.quota, now, sub.tz)
  return ok
}

// ── Channel: price targets the user set ─────────────────────────────────────
// Unchanged in behaviour: fire once on crossing, re-arm when price crosses back.
async function checkTargets() {
  const subs = await allSubs()
  if (!subs.length) return

  const ids = new Set<string>()
  for (const { sub } of subs) for (const a of sub.alerts) if (a.coin_id) ids.add(a.coin_id)
  if (!ids.size) return

  const quotes = await fetchCryptoQuotes([...ids])
  if (!Object.keys(quotes).length) return

  for (const { key, sub } of subs) {
    let changed = false
    for (const a of sub.alerts) {
      const p = quotes[a.coin_id]?.price
      if (p == null) continue
      const hit = a.condition === "above" ? p >= a.targetPrice : p <= a.targetPrice
      const id = String(a.id)
      if (hit && !sub.fired[id]) {
        const dir = a.condition === "above" ? "🚀" : "🔻"
        await deliver(sub, buildPayload({
          channel: "target",
          title: copy("targetTitle", sub.lang)(dir, a.coin_symbol),
          body: copy("targetBody", sub.lang)(a.coin_symbol, a.condition, a.targetPrice, p),
          tag: `price-${id}`,
          sym: a.coin_symbol,
        }), { urgent: true })
        sub.fired[id] = Date.now()
        changed = true
      } else if (!hit && sub.fired[id]) {
        delete sub.fired[id]
        changed = true
      }
    }
    if (changed) await kv.set(key, sub)
  }
}

// ── Channel: a holding moved sharply ────────────────────────────────────────
// Also the cron that maintains `seenRef`, the price snapshot taken just after
// the user's last visit — the retention copy needs it, and this is the only
// job that already has fresh quotes for every watched asset in hand.
async function checkMoves() {
  const subs = await allSubs()
  const watching = subs.filter(s => s.sub.watch.length)
  if (!watching.length) return

  const assets = new Map<string, WatchAsset>()
  for (const { sub } of watching) {
    for (const a of sub.watch) assets.set(`${a.kind}:${a.id}:${a.symbol}`, a)
  }
  const quotes = await fetchQuotes([...assets.values()])
  if (!Object.keys(quotes).length) return

  const now = Date.now()

  for (const { key, sub } of watching) {
    let changed = false

    // Refresh the "last visit" price snapshot when the user has been back
    // since it was taken. Captured here rather than on /seen so the heartbeat
    // stays a fast write with no upstream call on the request path.
    if (!sub.seenRef || sub.seenRef.at < sub.lastSeen) {
      const prices: Record<string, number> = {}
      for (const a of sub.watch) {
        const q = quoteFor(quotes, a)
        if (q) prices[assetKey(a)] = q.price
      }
      if (Object.keys(prices).length) {
        sub.seenRef = { at: sub.lastSeen, prices }
        changed = true
      }
    }

    for (const a of sub.watch) {
      const q = quoteFor(quotes, a)
      if (!q) continue
      const k = assetKey(a)

      const { fire, changePct, nextRef } = evaluateMove({
        price: q.price,
        ref: sub.ref[k],
        thresholdPct: sub.prefs.movePct,
        now,
        lastFired: sub.moveFired[k] ?? 0,
        cooldownMs: MOVE_COOLDOWN_MS,
      })

      // A crossing we can't send yet — asleep, or out of budget — must keep its
      // old baseline. Rebasing here would swallow an 8% overnight move: by
      // morning the reference would say it had already been accounted for and
      // the user would never hear about it.
      const deliverable = !fire || (sub.prefs.moves && canDeliver(sub, now))
      if (deliverable && nextRef !== sub.ref[k]) { sub.ref[k] = nextRef as PriceRef; changed = true }
      if (!fire || !sub.prefs.moves) continue

      const up = changePct > 0
      const sent = await deliver(sub, buildPayload({
        channel: "move",
        title: copy("moveTitle", sub.lang)(a.symbol, fmtPct(changePct), up),
        body: copy("moveBody", sub.lang)(a.symbol, fmtPct(changePct), fmtPrice(q.price), up),
        tag: `move-${k}`,
        sym: a.symbol,
      }), { now })
      if (sent) { sub.moveFired[k] = now; changed = true }
    }

    // Assets the user has since removed would otherwise keep their baselines
    // forever, growing the record on every portfolio edit.
    const live = new Set(sub.watch.map(assetKey))
    for (const k of Object.keys(sub.ref)) if (!live.has(k)) { delete sub.ref[k]; changed = true }
    for (const k of Object.keys(sub.moveFired)) if (!live.has(k)) { delete sub.moveFired[k]; changed = true }

    if (changed) await kv.set(key, sub)
  }
}

// ── Channel: breaking news about something they hold ────────────────────────
async function checkNews() {
  const subs = (await allSubs()).filter(s => s.sub.prefs.news && s.sub.watch.length)
  if (!subs.length) return

  const now = Date.now()
  const articles = (await fetchNews()).filter(a => isBreaking(a, now))
  if (!articles.length) return

  for (const { key, sub } of subs) {
    // One story per window: a busy news day should not become a news feed on
    // the lock screen.
    if (now - sub.lastNewsAt < NEWS_COOLDOWN_MS) continue
    // Checked before the loop, not inside it: marking stories as seen while
    // unable to send any would quietly consume the whole queue overnight and
    // leave nothing to show in the morning.
    if (!canDeliver(sub, now)) continue

    const pruned = pruneSent(sub.newsSent, now, 48 * 60 * 60 * 1000)
    let changed = Object.keys(pruned).length !== Object.keys(sub.newsSent).length
    sub.newsSent = pruned

    for (const article of articles) {
      const h = shortHash(article.link)
      if (sub.newsSent[h]) continue
      const asset = matchArticle(article, sub.watch)
      if (!asset) continue

      const sent = await deliver(sub, buildPayload({
        channel: "news",
        title: copy("newsTitle", sub.lang)(asset.symbol),
        body: copy("newsBody", sub.lang)(article.title),
        tag: `news-${h}`,
        sym: asset.symbol,
      }), { now })

      // Recorded either way. A story that reached the send stage has had its
      // turn; re-offering it hours later would push a stale headline.
      sub.newsSent[h] = now
      changed = true
      if (sent) { sub.lastNewsAt = now; break }
    }

    if (changed) await kv.set(key, sub)
  }
}

// ── Channels: morning brief + win-back ladder ───────────────────────────────
// Runs hourly and picks out the subscriptions whose *local* clock has just
// reached the send hour, which is how a single cron serves every timezone.
const DIGEST_HOUR = 9

async function checkDaily() {
  const subs = await allSubs()
  if (!subs.length) return

  const now = Date.now()
  const due = subs.filter(({ sub }) => {
    const h = localHour(now, sub.tz)
    return (h === DIGEST_HOUR && sub.prefs.digest) || (h === RETENTION_HOUR && sub.prefs.retention)
  })
  if (!due.length) return

  // One quote fetch for the union, rather than one per subscription.
  const assets = new Map<string, WatchAsset>()
  for (const { sub } of due) for (const a of sub.watch) assets.set(`${a.kind}:${a.id}:${a.symbol}`, a)
  const quotes = assets.size ? await fetchQuotes([...assets.values()]) : {}

  for (const { key, sub } of due) {
    const hour = localHour(now, sub.tz)
    let changed = false

    // — Morning brief —
    // The 09:00 slot is permission to go looking for a reason, not a reason.
    // On a flat day this sends nothing: a notification whose content is
    // "markets are calm" spends the user's attention to tell them nothing, and
    // teaches them to swipe the next one away unread.
    const today = localDayKey(now, sub.tz)
    if (hour === DIGEST_HOUR && sub.prefs.digest && sub.digestDay !== today && sub.watch.length) {
      const headline = pickHeadline(
        sub.watch.flatMap(a => {
          const q = quoteFor(quotes, a)
          return q ? [{ symbol: a.symbol, pct: q.change24h }] : []
        }),
        DIGEST_MIN_PCT,
      )

      if (headline) {
        await deliver(sub, buildPayload({
          channel: "digest",
          title: copy("digestTitle", sub.lang)(),
          body: copy("digestBody", sub.lang)(
            headline.symbol, fmtPct(headline.pct), headline.pct > 0, sub.watch.length,
          ),
          tag: "digest",
        }), { now })
      }
      // Either way the day has been evaluated — checking again at 10:00 would
      // just be the same question with a staler answer, and a brief that
      // arrives in the afternoon is not a morning brief.
      sub.digestDay = today
      changed = true
    }

    // — Win-back ladder —
    if (hour === RETENTION_HOUR && sub.prefs.retention) {
      const step = dueRetentionStep({ lastSeen: sub.lastSeen, now, sentSteps: sub.retention })
      if (step) {
        // Being away is not a reason to be interrupted — something having
        // happened while away is. "BTC is up 9% since your last visit" earns
        // the tap; "we miss you" is the app talking about itself.
        //
        // With no headline this sends nothing AND does not burn the step, so
        // the nudge waits for a day worth nudging about rather than being
        // spent on a quiet one. A portfolio that never moves never nags.
        const mover = pickHeadline(
          sub.watch.flatMap(a => {
            const q = quoteFor(quotes, a)
            const base = sub.seenRef?.prices?.[assetKey(a)]
            if (!q || !base || base <= 0) return []
            return [{ symbol: a.symbol, pct: ((q.price - base) / base) * 100 }]
          }),
          RETENTION_MIN_PCT,
        )
        if (!mover) { if (changed) await kv.set(key, sub); continue }

        const body = copy("retentionMoverBody", sub.lang)(
          mover.symbol, fmtPct(mover.pct), mover.pct > 0,
        )

        const sent = await deliver(sub, buildPayload({
          channel: "retention",
          title: copy("retentionTitle", sub.lang)(step),
          body,
          tag: `winback-${step}`,
        }), { now })
        // Only burn the step if it actually went out. Unlike the morning brief,
        // a win-back nudge is not tied to a particular day — tomorrow is a
        // perfectly good time to try it again.
        if (sent) { sub.retention = [...sub.retention, step]; changed = true }
      }
    }

    if (changed) await kv.set(key, sub)
  }
}

// Deno Deploy runs these on schedule even with no traffic.
Deno.cron("wl-check-alerts", "*/10 * * * *", checkTargets)
Deno.cron("wl-check-moves", "*/15 * * * *", checkMoves)
Deno.cron("wl-check-news", "*/20 * * * *", checkNews)
Deno.cron("wl-daily", "5 * * * *", checkDaily)

// ── HTTP handler ────────────────────────────────────────────────────────────
async function readJson(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json() } catch { return {} }
}

function json(body: unknown, headers: HeadersInit, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

/** Load the subscription an endpoint-bearing request refers to. */
async function loadByEndpoint(endpoint: string): Promise<{ k: string; sub: StoredSub } | null> {
  const k = await endpointKey(endpoint)
  const existing = (await kv.get<StoredSub>(["sub", k])).value
  return existing ? { k, sub: normalize(existing) } : null
}

Deno.serve(async (req, info) => {
  const origin = req.headers.get("origin")
  const headers = corsHeaders(origin)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })

  const ip = req.headers.get("cf-connecting-ip")
    || (info as { remoteAddr?: { hostname?: string } })?.remoteAddr?.hostname
    || "unknown"
  if (req.method !== "GET" && rateLimited(ip)) {
    return json({ error: "rate_limited" }, headers, 429)
  }

  const path = new URL(req.url).pathname

  if (path === "/" || path === "/health") {
    return json({ ok: true, service: "walletlens-push", vapid: !!VAPID_PUBLIC }, headers)
  }

  if (req.method === "POST" && path === "/subscribe") {
    const body = await readJson(req)
    const subscription = body.subscription as StoredSub["subscription"] | undefined
    if (!subscription?.endpoint) return json({ error: "missing_subscription" }, headers, 400)
    if (!isRealPushEndpoint(subscription.endpoint)) return json({ error: "invalid_endpoint" }, headers, 400)

    const k = await endpointKey(subscription.endpoint)
    const prev = (await kv.get<StoredSub>(["sub", k])).value
    const existing = prev ? normalize(prev) : null
    const now = Date.now()

    const stored = normalize({
      ...(existing ?? {}),
      subscription,
      alerts: body.alerts !== undefined ? sanitizeAlerts(body.alerts) : existing?.alerts,
      watch: body.watch !== undefined ? sanitizeWatch(body.watch) as WatchAsset[] : existing?.watch,
      prefs: body.prefs !== undefined
        ? sanitizePrefs(body.prefs) as Prefs
        : existing?.prefs,
      lang: asLang(body.lang) as Lang | undefined ?? existing?.lang,
      tz: body.tz !== undefined ? sanitizeTz(body.tz) : existing?.tz,
      createdAt: existing?.createdAt ?? now,
      // Subscribing happens in the app, so it is by definition a visit.
      lastSeen: now,
      retention: [],
    })
    await kv.set(["sub", k], stored)
    return json({ ok: true, prefs: stored.prefs, watching: stored.watch.length }, headers)
  }

  if (req.method === "POST" && path === "/alerts") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (!endpoint) return json({ error: "missing_endpoint" }, headers, 400)
    const found = await loadByEndpoint(endpoint)
    if (!found) return json({ error: "unknown_subscription" }, headers, 404)

    const nextAlerts = sanitizeAlerts(body.alerts)
    // Prune fired flags for alerts that no longer exist.
    const liveIds = new Set(nextAlerts.map(a => String(a.id)))
    const fired: Record<string, number> = {}
    for (const [id, ts] of Object.entries(found.sub.fired)) if (liveIds.has(id)) fired[id] = ts
    // Alert edits also refresh the language, so switching language in Settings
    // reaches the server without needing a re-subscribe.
    await kv.set(["sub", found.k], {
      ...found.sub,
      alerts: nextAlerts,
      fired,
      lang: asLang(body.lang) ?? found.sub.lang,
    })
    return json({ ok: true, count: nextAlerts.length }, headers)
  }

  // The portfolio side of the contract: which assets to watch, which channels
  // are on, and the device clock. Sent whenever holdings or settings change.
  if (req.method === "POST" && path === "/watch") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (!endpoint) return json({ error: "missing_endpoint" }, headers, 400)
    const found = await loadByEndpoint(endpoint)
    if (!found) return json({ error: "unknown_subscription" }, headers, 404)

    const sub = found.sub
    if (body.watch !== undefined) sub.watch = sanitizeWatch(body.watch) as WatchAsset[]
    if (body.prefs !== undefined) sub.prefs = sanitizePrefs(body.prefs) as Prefs
    if (body.tz !== undefined) sub.tz = sanitizeTz(body.tz)
    sub.lang = asLang(body.lang) as Lang | undefined ?? sub.lang
    // Reaching this endpoint means the app is open.
    sub.lastSeen = Date.now()
    sub.retention = []

    await kv.set(["sub", found.k], sub)
    return json({ ok: true, watching: sub.watch.length, prefs: sub.prefs }, headers)
  }

  // Heartbeat. The single fact the win-back ladder is built on, kept as a
  // separate tiny endpoint so the app can ping it on every open.
  if (req.method === "POST" && path === "/seen") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (!endpoint) return json({ error: "missing_endpoint" }, headers, 400)
    const found = await loadByEndpoint(endpoint)
    if (!found) return json({ error: "unknown_subscription" }, headers, 404)

    await kv.set(["sub", found.k], {
      ...found.sub,
      lastSeen: Date.now(),
      tz: body.tz !== undefined ? sanitizeTz(body.tz) : found.sub.tz,
      lang: asLang(body.lang) ?? found.sub.lang,
      // Coming back resets the ladder, so a future lapse starts from step one.
      retention: [],
    })
    return json({ ok: true }, headers)
  }

  if (req.method === "POST" && path === "/test") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (!endpoint) return json({ error: "missing_endpoint" }, headers, 400)
    const found = await loadByEndpoint(endpoint)
    if (!found) return json({ error: "unknown_subscription" }, headers, 404)

    const lang = asLang(body.lang) as Lang | undefined ?? found.sub.lang
    if (lang !== found.sub.lang) await kv.set(["sub", found.k], { ...found.sub, lang })
    // A test the user just asked for must arrive even at midnight.
    const ok = await sendPush(found.sub, buildPayload({
      channel: "test",
      title: copy("testTitle", lang)(),
      body: copy("testBody", lang)(),
      tag: "wl-test",
    }))
    return json({ ok }, headers)
  }

  if (req.method === "DELETE" && path === "/unsubscribe") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (endpoint) await kv.delete(["sub", await endpointKey(endpoint)])
    return json({ ok: true }, headers)
  }

  return json({ error: "not_found" }, headers, 404)
})
