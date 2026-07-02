// WalletLens push-notification API — Deno Deploy edition.
//
// Sends Web Push notifications to installed PWAs / TWAs even when the app is
// CLOSED. This is the piece the on-device Notification API can't do: the
// browser's foreground-only `new Notification()` never fires once the app is
// shut, so price targets set by the user would silently never reach them.
//
// What it stores (Deno KV) — the privacy-minimal set required to push:
//   • the anonymous Web Push subscription (an endpoint URL + crypto keys —
//     no name, no email, no identity)
//   • the user's alert rules (e.g. BTC above 70000) so the cron knows what
//     to watch. NO portfolio, NO holdings, NO identity.
//
// A Deno.cron job polls prices every 10 min, evaluates each subscription's
// rules, and pushes when a target is crossed (once, then re-arms when price
// moves back across the line).
//
// Deploy + VAPID + TWA notes: see push-api/README.md
//
// Endpoints:
//   POST   /subscribe    { subscription, alerts? }  → store/refresh a sub
//   POST   /alerts       { endpoint, alerts }        → update rules for a sub
//   POST   /test         { endpoint }                → send a test push
//   DELETE /unsubscribe  { endpoint }                → forget a sub

import webpush from "npm:web-push@3.6.7"

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? ""
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? ""
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contact@walletlens.live"

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
} else {
  console.warn("VAPID keys missing — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env secrets.")
}

const kv = await Deno.openKv()

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

const MAX_ALERTS = 50
function sanitizeAlerts(raw: unknown): StoredSub["alerts"] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_ALERTS).flatMap(a => {
    const id = String(a?.id ?? "").slice(0, 40)
    const coin_id = String(a?.coin_id ?? "").slice(0, 80)
    const coin_symbol = String(a?.coin_symbol ?? "").slice(0, 20)
    const condition = a?.condition === "below" ? "below" as const : "above" as const
    const targetPrice = Number(a?.targetPrice)
    if (!id || !coin_id || !Number.isFinite(targetPrice) || targetPrice <= 0) return []
    return [{ id, coin_id, coin_symbol, condition, targetPrice }]
  })
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

interface StoredSub {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  alerts: Array<{ id: string | number; coin_id: string; coin_symbol: string; condition: "above" | "below"; targetPrice: number }>
  fired: Record<string, number>
  createdAt: number
}

// ── Price fetch (server-side; no CORS limits) ───────────────────────────────
async function fetchPrices(coinIds: string[]): Promise<Record<string, number>> {
  if (!coinIds.length) return {}
  const out: Record<string, number> = {}
  // CoinGecko simple price — batches all ids in one request.
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinIds.join(","))}&vs_currencies=usd`
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
    if (r.ok) {
      const j = await r.json()
      for (const id of coinIds) if (j[id]?.usd != null) out[id] = Number(j[id].usd)
    }
  } catch (e) {
    console.error("price fetch failed:", e)
  }
  return out
}

// ── Send one push; drop the sub if the endpoint is gone (404/410) ───────────
async function sendPush(stored: StoredSub, payload: Record<string, unknown>): Promise<boolean> {
  try {
    await webpush.sendNotification(stored.subscription as never, JSON.stringify(payload))
    return true
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode
    if (code === 404 || code === 410) {
      const k = await endpointKey(stored.subscription.endpoint)
      await kv.delete(["sub", k])
    } else {
      console.error("push send error:", code, e)
    }
    return false
  }
}

// ── Cron: evaluate every subscription's rules, push on crossing ─────────────
async function checkAlerts() {
  const subs: Array<{ key: Deno.KvKey; value: StoredSub }> = []
  for await (const e of kv.list<StoredSub>({ prefix: ["sub"] })) subs.push({ key: e.key, value: e.value })
  if (!subs.length) return

  const ids = new Set<string>()
  for (const { value } of subs) for (const a of value.alerts ?? []) if (a.coin_id) ids.add(a.coin_id)
  const prices = await fetchPrices([...ids])
  if (!Object.keys(prices).length) return

  for (const { key, value } of subs) {
    const fired = value.fired ?? {}
    let changed = false
    for (const a of value.alerts ?? []) {
      const p = prices[a.coin_id]
      if (p == null) continue
      const hit = a.condition === "above" ? p >= a.targetPrice : p <= a.targetPrice
      const id = String(a.id)
      if (hit && !fired[id]) {
        const dir = a.condition === "above" ? "🚀" : "🔻"
        await sendPush(value, {
          title: `${dir} ${a.coin_symbol} hit your target`,
          body: `${a.coin_symbol} is ${a.condition} $${a.targetPrice} — now $${p}.`,
          tag: `price-${id}`,
          url: "/watchlist",
        })
        fired[id] = Date.now()
        changed = true
      } else if (!hit && fired[id]) {
        // Price moved back across the line — re-arm so it can fire again.
        delete fired[id]
        changed = true
      }
    }
    if (changed) await kv.set(key, { ...value, fired })
  }
}

// Deno Deploy runs this on schedule even with no traffic. Every 10 minutes.
Deno.cron("wl-check-alerts", "*/10 * * * *", checkAlerts)

// ── HTTP handler ────────────────────────────────────────────────────────────
async function readJson(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json() } catch { return {} }
}

Deno.serve(async (req, info) => {
  const origin = req.headers.get("origin")
  const headers = corsHeaders(origin)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers })

  const ip = req.headers.get("cf-connecting-ip")
    || (info as { remoteAddr?: { hostname?: string } })?.remoteAddr?.hostname
    || "unknown"
  if (req.method !== "GET" && rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers })
  }

  const url = new URL(req.url)
  const path = url.pathname

  if (path === "/" || path === "/health") {
    return new Response(JSON.stringify({ ok: true, service: "walletlens-push", vapid: !!VAPID_PUBLIC }), { headers })
  }

  if (req.method === "POST" && path === "/subscribe") {
    const body = await readJson(req)
    const subscription = body.subscription as StoredSub["subscription"] | undefined
    if (!subscription?.endpoint) {
      return new Response(JSON.stringify({ error: "missing_subscription" }), { status: 400, headers })
    }
    if (!isRealPushEndpoint(subscription.endpoint)) {
      return new Response(JSON.stringify({ error: "invalid_endpoint" }), { status: 400, headers })
    }
    const k = await endpointKey(subscription.endpoint)
    const existing = (await kv.get<StoredSub>(["sub", k])).value
    const stored: StoredSub = {
      subscription,
      alerts: body.alerts !== undefined ? sanitizeAlerts(body.alerts) : existing?.alerts ?? [],
      fired: existing?.fired ?? {},
      createdAt: existing?.createdAt ?? Date.now(),
    }
    await kv.set(["sub", k], stored)
    return new Response(JSON.stringify({ ok: true }), { headers })
  }

  if (req.method === "POST" && path === "/alerts") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (!endpoint) return new Response(JSON.stringify({ error: "missing_endpoint" }), { status: 400, headers })
    const k = await endpointKey(endpoint)
    const existing = (await kv.get<StoredSub>(["sub", k])).value
    if (!existing) return new Response(JSON.stringify({ error: "unknown_subscription" }), { status: 404, headers })
    const nextAlerts = sanitizeAlerts(body.alerts)
    // Prune fired flags for alerts that no longer exist.
    const liveIds = new Set(nextAlerts.map(a => String(a.id)))
    const fired: Record<string, number> = {}
    for (const [id, ts] of Object.entries(existing.fired ?? {})) if (liveIds.has(id)) fired[id] = ts
    await kv.set(["sub", k], { ...existing, alerts: nextAlerts, fired })
    return new Response(JSON.stringify({ ok: true, count: nextAlerts.length }), { headers })
  }

  if (req.method === "POST" && path === "/test") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (!endpoint) return new Response(JSON.stringify({ error: "missing_endpoint" }), { status: 400, headers })
    const k = await endpointKey(endpoint)
    const existing = (await kv.get<StoredSub>(["sub", k])).value
    if (!existing) return new Response(JSON.stringify({ error: "unknown_subscription" }), { status: 404, headers })
    const ok = await sendPush(existing, {
      title: "🔔 WalletLens notifications are on",
      body: "You'll now get price-target alerts even when the app is closed.",
      tag: "wl-test",
      url: "/watchlist",
    })
    return new Response(JSON.stringify({ ok }), { headers })
  }

  if (req.method === "DELETE" && path === "/unsubscribe") {
    const body = await readJson(req)
    const endpoint = body.endpoint as string | undefined
    if (endpoint) await kv.delete(["sub", await endpointKey(endpoint)])
    return new Response(JSON.stringify({ ok: true }), { headers })
  }

  return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers })
})
