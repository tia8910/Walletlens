// Every WalletLens-operated backend host, in one place.
//
// These were spread across twenty-odd files as string literals, which made the
// move off Deno Deploy a search-and-replace where missing one site fails at
// runtime, in production, for whichever feature was missed.
//
// Three places cannot import this file: the `connect-src` in index.html, the
// same directive in public/_headers, and the cache list in public/sw.js. A CSP
// that has not been updated blocks every request to the new host, and the app
// breaks in a way whose console output points at the browser rather than at
// the change that caused it. apiHosts.test.js fails when those three fall out
// of step with the constants here, so the cutover cannot half-happen.
//
// To move a service: change the host here, run the tests, and do what they
// tell you.

export const VOICE_HOST = 'walletlens-voice.tarek-abdelhameed.workers.dev'
export const PUSH_HOST = 'walletlens-push.tarek-abdelhameed.workers.dev'

// The scheduled datasets — market, news, stocks, economy, the economic
// calendar and stock prices. These used to be static files the Pages build
// shipped, refreshed by four GitHub Actions cron jobs that committed JSON into
// client/public/. That made a price refresh a deploy and stopped dead the day
// Actions did, so they moved to a worker that fetches on its own schedule.
// Must match `name` in data-api/wrangler.toml.
export const DATA_HOST = 'walletlens-data.tarek-abdelhameed.workers.dev'

// The trailing slash on one and not the other is what the call sites already
// expected; both shapes are preserved so this change stays a pure refactor.
export const VOICE_API = `https://${VOICE_HOST}/`
export const PUSH_API = `https://${PUSH_HOST}`

export const DATA_API = `https://${DATA_HOST}`

/**
 * A scheduled dataset, by the filename it had when it was a static asset.
 *
 * Call sites used to fetch these same-origin ('/market.json'), so the names
 * are unchanged and only the origin moved. Keeping the filenames means the
 * service, the service worker and every call site still agree on one word.
 */
export const dataUrl = (name) => `${DATA_API}/${name}`

/** The voice service's CORS proxy, used for prices, logos and RSS. */
export const voiceProxy = (url) => `${VOICE_API}proxy?url=${encodeURIComponent(url)}`
