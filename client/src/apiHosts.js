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
export const NANSEN_HOST = 'walletlens-nansen.tarek-abdelhameed.workers.dev'

// The scheduled datasets — market, news, stocks, economy, the economic
// calendar and stock prices. These used to be static files the Pages build
// shipped, refreshed by four GitHub Actions cron jobs that committed JSON into
// client/public/. That made a price refresh a deploy and stopped dead the day
// Actions did, so they moved to a worker that fetches on its own schedule.
// Must match `name` in data-api/wrangler.toml.
export const DATA_HOST = 'walletlens-data.tarek-abdelhameed.workers.dev'

// Holds the Google OAuth client_secret and exchanges an authorization code for
// tokens. The browser never talks to it directly — see DRIVE_API below.
export const DRIVE_AUTH_HOST = 'walletlens-drive-auth.tarek-abdelhameed.workers.dev'

// The app's own origin, and the one the browser is told to talk to.
//
// Every client request used to go to a *.workers.dev hostname. A connection
// check run from the app showed all three of them — push, and the data worker
// used as a CONTROL — failing with "Failed to fetch" on a device where the
// site itself loaded fine and the price strip was full. The strip was no
// evidence: fetchStaticStockPrices and _loadStaticMarket both swallow their
// error and return null, and the callers fall through to CoinGecko and Yahoo
// directly, so the datasets had been failing silently for as long as this and
// only news — which has no fallback — ever showed it.
//
// workers.dev is heavily abused for phishing and sits on a good number of DNS
// and ISP blocklists. A machine that deploys the worker resolves it; a phone
// on a filtered resolver does not, and the failure is indistinguishable from
// every other cause of a TypeError. Nothing in the app can fix that, and no
// amount of CORS work was ever going to.
//
// So the browser talks to the site, which it plainly reaches, and the Pages
// Worker carries the request the rest of the way. It also makes every one of
// these same-origin: no CORS, no preflight, no allowlist.
//
// The canonical origin, for the callers that have no page to ask: push-api
// builds dataset URLs from inside the push Worker, and a Worker has no
// `location` to read.
export const CANONICAL_ORIGIN = 'https://walletlens.live'

/**
 * The origin the browser talks to: whichever one it is already on.
 *
 * This was the literal 'https://walletlens.live', and "same-origin" was true
 * only on the one deployment that happens to be served there. Everywhere else
 * — every Pages preview, every branch deploy — the app fetched its own
 * datasets and its own CORS proxy ACROSS origins, and walletlens.live answers
 * /* with `Cross-Origin-Resource-Policy: same-origin` and no
 * `Access-Control-Allow-Origin`. So the browser refused every response: no
 * market.json, no news, no proxy, no prices. "PRICES OFFLINE" on a build whose
 * backend was working perfectly, and unreproducible on production by
 * construction.
 *
 * Nothing needed to be cross-origin. Every deployment ships dist/_worker.js
 * and dist/_routes.json, so /market.json, /news.json and /api/* are served by
 * that deployment's OWN worker, which then reaches the upstream services
 * server-side where neither CORS nor a DNS blocklist applies. Asking our own
 * origin for them is both correct and strictly cheaper.
 *
 * Only origins that carry that worker qualify. A Vite dev server on http does
 * not, a native shell on file:// or a custom scheme does not, and pointing
 * either at itself would name paths that 404 — so they fall back to canonical,
 * which is what they have always used.
 */
export function resolveSiteOrigin(loc = typeof location === 'undefined' ? null : location) {
  if (!loc) return CANONICAL_ORIGIN
  const { protocol, hostname, origin } = loc
  if (protocol !== 'https:') return CANONICAL_ORIGIN
  // walletlens.live itself, and the Pages project's preview deployments.
  if (hostname === 'walletlens.live' || hostname.endsWith('.pages.dev')) return origin
  return CANONICAL_ORIGIN
}

export const SITE_ORIGIN = resolveSiteOrigin()

// The trailing slash on one and not the other is what the call sites already
// expected; both shapes are preserved so this change stays a pure refactor.
// Through the site, for the same reason as everything else here: screenshot
// import, RSS import and two coin-logo fallbacks all post to this worker, and
// on a device that cannot resolve workers.dev none of them ever left the page.
// The trailing slash is load-bearing — voiceProxy() appends 'proxy?url='.
export const VOICE_API = `${SITE_ORIGIN}/api/voice/`

// Routed by workers/push/wrangler.toml. The prefix is stripped worker-side, so
// /api/push/subscribe reaches the same handler as /subscribe does on the
// workers.dev subdomain, which stays live for deploys and health checks.
export const PUSH_API = `${SITE_ORIGIN}/api/push`

// The six dataset routes on this zone have been live since 8551b22f — see
// data-api/wrangler.toml. dataUrl() simply never used them.
//
// Absolute, not a relative path: push-api/markets.js calls dataUrl() from
// inside the push Worker, where a relative URL has no origin to resolve
// against and fetch throws.
export const DATA_API = SITE_ORIGIN

// Routed through the site for the same reason as the rest: an OAuth code
// posted to workers.dev from a filtered device never arrives, and the only
// thing the user sees is "Sign-in did not complete".
export const DRIVE_API = `${SITE_ORIGIN}/api/drive`

// Google Drive's own API, through the site. A fallback, not the path:
// googleDrive.js calls www.googleapis.com directly and only comes here when
// that fails, which on a healthy network is never.
export const GDRIVE_API = `${SITE_ORIGIN}/api/gdrive`

// The content type every write to our own services sends.
//
// Not a lie about the body — it is JSON, and the workers parse it with
// req.json(), which reads the body text and does not consult this header.
// It is what stops the request needing PERMISSION to be sent.
//
// A cross-origin POST is only exempt from a CORS preflight when its content
// type is one of three safelisted values, and 'application/json' is not among
// them. So every write preflighted: an OPTIONS that has to be answered
// correctly, be allowed by the page's connect-src, and be understood by the
// browser, before the real request is even attempted. Every GET this app makes
// is already a simple request, which is why reads worked from inside the
// Android WebView while registering a device failed with a bare "Failed to
// fetch" — the POST was refused on its way out and there is no console in a
// WebView to see why.
//
// 'text/plain' is safelisted, so the preflight disappears and with it every
// way a preflight can go wrong.
export const SIMPLE_JSON = 'text/plain;charset=UTF-8'


/**
 * A scheduled dataset, by the filename it had when it was a static asset.
 *
 * Call sites used to fetch these same-origin ('/market.json'), so the names
 * are unchanged and only the origin moved. Keeping the filenames means the
 * service, the service worker and every call site still agree on one word.
 */
export const dataUrl = (name) => `${DATA_API}/${name}`

// Nansen's on-chain API, through a stateless proxy that holds the key.
//
// NOT routed through the site like everything above it, because
// workers/nansen/wrangler.toml declares no route on this zone, only the
// workers.dev subdomain. Pointing this at SITE_ORIGIN would name a path that
// does not exist. Nothing in the client calls it yet, so it costs nothing to
// leave as main has it; the day something does, it needs a route first or it
// will fail on exactly the filtered networks the rest of this file works
// around.
export const NANSEN_API = `https://${NANSEN_HOST}`

/** The voice service's CORS proxy, used for prices, logos and RSS. */
export const voiceProxy = (url) => `${VOICE_API}proxy?url=${encodeURIComponent(url)}`
