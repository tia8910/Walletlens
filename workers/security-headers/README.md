# Security-headers edge worker

GitHub Pages serves `walletlens.live` but **cannot set custom HTTP response
headers** — it ignores the repo's `client/public/_headers` file (that format is
Netlify / Cloudflare Pages only). Because of this, a security scan of the live
site reports **“Security headers · 0 found”**: no HSTS, `X-Frame-Options`,
`X-Content-Type-Options`, CSP-as-header, COOP, etc.

This worker fixes that finding. It sits in front of the static site, fetches the
unchanged GitHub Pages origin, and re-emits the response with a hardened header
set (mirroring `client/public/_headers`, plus a real `Content-Security-Policy`
header that includes `frame-ancestors 'none'` — which only works as a header,
not as a `<meta>` tag).

## One-time setup

This is the only part that can’t be done from the repo — it needs your
Cloudflare account, because the domain must be **proxied** through Cloudflare for
the worker route to run.

1. **Add `walletlens.live` to Cloudflare** (Add Site → free plan) and switch the
   domain’s nameservers to the two Cloudflare gives you.
2. Recreate the existing GitHub Pages DNS records and set them to **Proxied**
   (orange cloud):
   - `A  walletlens.live → 185.199.108.153`
   - `A  walletlens.live → 185.199.109.153`
   - `A  walletlens.live → 185.199.110.153`
   - `A  walletlens.live → 185.199.111.153`
   - `CNAME  www → tia8910.github.io`
   - Keep all other records (Deno, etc.) as-is.
3. SSL/TLS mode → **Full (strict)** so the edge↔GitHub hop stays HTTPS.

## Deploy

```bash
cd workers/security-headers
npx wrangler login        # once
npx wrangler deploy
```

`wrangler.toml` already binds the worker to `walletlens.live/*` and
`www.walletlens.live/*`.

## Verify

```bash
curl -sI https://walletlens.live/ | grep -iE \
  'strict-transport|x-frame|x-content-type|content-security|referrer|permissions-policy|cross-origin'
```

All headers above should now be present, and a re-scan will report a non-zero
“Security headers” count.

## Alternative (no worker)

If you’d rather not run a worker, the same result is achievable with a Cloudflare
**Rules → Transform Rules → Modify Response Header** rule (Add, static, one entry
per header). The worker is committed here so the config lives in version control.
