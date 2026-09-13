/**
 * Cloudflare Workers entry point for the data service.
 *
 * Every decision lives in core.js — the cadence table, what counts as stale,
 * and the rule that a failed fetch keeps the previous value. This file is the
 * runtime binding: Workers KV for storage, scheduled() for the sweep, fetch()
 * for serving. main.ts is the same thing for Deno Deploy.
 *
 * NO CHUNKING HERE. Deno KV caps a value at 64 KiB, which is why main.ts
 * splits payloads across numbered keys; Workers KV allows 25 MB, so
 * market.json's 250 KB goes in whole and the store stays a two-line object.
 *
 * NO SECRETS. Every byte this stores and serves is public market data, so
 * there is nothing to configure after `wrangler deploy` beyond the KV binding.
 */

import { DATASETS, health, serve, sweep } from './core.js'

const key = (name) => `data:${name}`

function storeFor(env) {
  return {
    async read(name) {
      try {
        return await env.DATA.get(key(name), 'json')
      } catch (e) {
        // A KV read failing is not a reason to serve nothing: the caller
        // treats null as a miss and refetches upstream.
        console.warn(`kv read failed for ${name}: ${e}`)
        return null
      }
    },
    async write(name, payload) {
      await env.DATA.put(key(name), JSON.stringify(payload))
    },
  }
}

export default {
  /**
   * Refresh whatever is due.
   *
   * Every dataset is attempted on every tick; the staleness check inside
   * refresh() is what makes that cheap, and it means one failing feed never
   * blocks the others.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const results = await sweep(storeFor(env))
      const did = results.filter((r) => r.updated)
      if (did.length) {
        console.log('refreshed:', did.map((r) => `${r.name}(${r.count})`).join(' '))
      }
    })())
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const name = url.pathname.replace(/^\//, '')

    // The app is on walletlens.live and this is on workers.dev, so every one
    // of these is cross-origin. GETs of a public JSON file are CORS-simple, so
    // no preflight is sent in practice — but answering one costs nothing and
    // saves a debugging session if a header is ever added to the client.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    if (name === '__health') return health(storeFor(env))
    if (!DATASETS[name]) return new Response('Not found', { status: 404 })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    // ctx.waitUntil lets a stale dataset be answered now and refreshed after
    // the response is sent, instead of the reader waiting for eight RSS feeds.
    // ?force=1 rebuilds now instead of waiting out maxAge, which is what makes
    // a fix to how a dataset is built take effect on deploy rather than hours
    // later. core.js holds it to FORCE_MIN_AGE so it cannot be used to hammer
    // the upstreams.
    const force = url.searchParams.get('force') === '1'
    return serve(storeFor(env), name, Date.now(), {
      waitUntil: (p) => ctx.waitUntil(p),
      force,
    })
  },
}
