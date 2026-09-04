// WalletLens data API — Deno Deploy edition.
//
// Fetches the app's six public datasets on a schedule and serves them,
// replacing four GitHub Actions cron jobs: update-market, update-news,
// update-economy-calendar and update-stock-prices.
//
// WHY THE SHAPE CHANGED
// Each of those fetched a public feed, wrote JSON into client/public/,
// committed it and pushed. The data only reached users after a site rebuild
// and redeploy — so a price refresh was a deploy, the data lived in git, and
// the whole chain stopped the moment Actions did. On 2026-09-02 it did: the
// GitHub account was flagged, Actions was disabled, and all four froze with no
// error and no notification, while the app went on serving two-day-old prices
// because the staleness was baked into files that had already shipped.
//
// Here a refresh is a KV write. Nothing is built, nothing is committed, and
// the data keeps flowing with GitHub unavailable indefinitely.
//
// NOTHING HERE IS SECRET. Every byte this stores and serves is public market
// data, so the service needs no environment variables and no auth. That is
// also why deploying it by CLI rather than from Git costs nothing: there is no
// secret to wire up in the dashboard afterwards.
//
// The decisions worth arguing about — the cadence table, what counts as
// stale, and the rule that a failed fetch never overwrites good data — are in
// core.js, where they are unit-tested without a KV.

import {
  CHUNK_BYTES, DATASETS, health, joinChunks, serve, splitChunks, sweep,
} from "./core.js"

const kv = await Deno.openKv()

// ── The store ────────────────────────────────────────────────────────────
//
// Deno KV caps a value at 64 KiB. market.json is 250 KB and news.json is
// already 61 KB and grows with its feeds, so a payload is split across
// numbered chunk keys under a version id, with a small meta record naming the
// version and the chunk count.
//
// Chunks are written BEFORE the meta that points at them. A reader therefore
// sees either the old version whole or the new version whole — never half of
// each, which is what writing in place would give on a payload this size.

const GET_MANY_MAX = 10 // Deno KV's own cap on keys per getMany

type Meta = { version: string; chunks: number; updated: string; count: number }

const metaKey = (name: string) => ["data", name, "meta"]
const chunkKey = (name: string, version: string, i: number) => ["data", name, version, i]

const store = {
  async read(name: string): Promise<unknown | null> {
    const meta = await kv.get<Meta>(metaKey(name))
    if (!meta.value) return null
    const { version, chunks } = meta.value

    const parts: string[] = []
    for (let i = 0; i < chunks; i += GET_MANY_MAX) {
      const keys = []
      for (let j = i; j < Math.min(i + GET_MANY_MAX, chunks); j++) {
        keys.push(chunkKey(name, version, j))
      }
      // deno-lint-ignore no-explicit-any
      const got = await kv.getMany<any[]>(keys)
      for (const entry of got) {
        // A missing chunk means this version was half-collected. Treat the
        // payload as absent rather than parse a truncated body — the caller
        // then refetches, which is the path a cold store already takes.
        if (typeof entry.value !== "string") return null
        parts.push(entry.value)
      }
    }
    try {
      return JSON.parse(joinChunks(parts))
    } catch {
      return null
    }
  },

  // deno-lint-ignore no-explicit-any
  async write(name: string, payload: any): Promise<void> {
    const chunks = splitChunks(JSON.stringify(payload), CHUNK_BYTES)
    const version = crypto.randomUUID().slice(0, 8)

    for (let i = 0; i < chunks.length; i++) {
      await kv.set(chunkKey(name, version, i), chunks[i])
    }

    const previous = (await kv.get<Meta>(metaKey(name))).value
    await kv.set(metaKey(name), {
      version,
      chunks: chunks.length,
      updated: payload.updated,
      count: payload.count ?? 0,
    } satisfies Meta)

    // Only now is the old version unreachable, so collecting it cannot strand
    // a reader mid-read. A failure here leaks a few keys and nothing else.
    if (previous) {
      for (let i = 0; i < previous.chunks; i++) {
        await kv.delete(chunkKey(name, previous.version, i)).catch(() => {})
      }
    }
  },
}

// Every fifteen minutes. This is a staleness sweep, not a fetch — each dataset
// carries its own maxAge and most ticks do nothing but read meta records, so
// the frequency costs almost nothing and buys prompt retries when an upstream
// feed is briefly down. The four workflows this replaces carried six cron
// expressions between them; a missed refresh there waited up to six hours for
// its slot to come round again.
Deno.cron("wl-data-sweep", "*/15 * * * *", () => sweep(store))

Deno.serve(async (req) => {
  const name = new URL(req.url).pathname.replace(/^\//, "")

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    })
  }

  if (name === "__health") return health(store)
  if (!DATASETS[name]) return new Response("Not found", { status: 404 })
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 })
  }
  return serve(store, name)
})
