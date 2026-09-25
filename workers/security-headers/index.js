/**
 * Edge worker — security response headers
 *
 * DOES NOT OVERRIDE THE SITE'S OWN HEADERS
 * ---------------------------------------
 * The site has since moved to Cloudflare Pages, which DOES apply
 * client/public/_headers, including the full CSP. This worker used to replace
 * that CSP with the older copy below (frame-src 'none', no buymeacoffee, no
 * *.workers.dev), so on walletlens.live alone the Buy Me a Coffee widget's
 * script was refused and then its panel frame was blank, while every
 * *.pages.dev preview (which never passes through this worker) worked. Each
 * header below is now only a FALLBACK, added when the origin sent none, so
 * _headers stays the single source of truth.
 *
 * WHY THIS EXISTS
 * ---------------
 * walletlens.live is hosted on GitHub Pages, which serves a fixed set of
 * response headers and ignores the repo's `client/public/_headers` file
 * (that file format is Netlify/Cloudflare Pages only). As a result, a
 * Cloudflare Radar / security scan reports "Security headers · 0 found"
 * (no HSTS, X-Frame-Options, CSP-as-header, COOP, etc.).
 *
 * This worker sits in front of the static site (bound to the zone route
 * `walletlens.live/*`), fetches the GitHub Pages origin unchanged, and
 * re-emits the response with a hardened set of security headers attached.
 * `fetch(request)` inside a route-bound worker goes to the ORIGIN, not back
 * through the worker, so there is no proxy loop.
 *
 * DEPLOY: see workers/security-headers/README.md
 */

// CSP delivered as a real header. Mirrors the <meta http-equiv> CSP in
// client/index.html, plus `frame-ancestors 'none'` — which is IGNORED inside
// a meta tag and only takes effect as an HTTP header (clickjacking defense).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://static.ads-twitter.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.deno.net https://api.anthropic.com https://api.coingecko.com https://api.binance.com https://rest.coincap.io https://api.gold-api.com https://stooq.com https://*.stooq.com https://blockchain.info https://api.exchangerate.host https://open.er-api.com https://corsproxy.io https://api.allorigins.win https://cors.eu.org https://api.codetabs.com https://finnhub.io https://www.alphavantage.co https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://frankfurter.app https://api.frankfurter.app https://min-api.cryptocompare.com https://api.kraken.com https://api.coinpaprika.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.googletagmanager.com https://analytics.twitter.com https://t.co",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join('; ')

// Header set mirrors client/public/_headers so a future migration to a
// host that honors `_headers` produces identical output.
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(self), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Content-Security-Policy': CSP,
}

export default {
  async fetch(request) {
    // Pass the request straight through to the GitHub Pages origin.
    const response = await fetch(request)

    // Clone so headers are mutable (origin responses are immutable).
    const headers = new Headers(response.headers)
    // Only fill gaps: a header the origin already sends (Cloudflare Pages
    // sends all of these from client/public/_headers) is left exactly as is.
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(name)) headers.set(name, value)
    }
    // Drop server-identifying headers that leak the backend.
    headers.delete('X-GitHub-Request-Id')
    headers.delete('X-Served-By')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
