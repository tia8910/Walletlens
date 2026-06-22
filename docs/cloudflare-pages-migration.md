# Migrating WalletLens from GitHub Pages → Cloudflare Pages

This guide moves hosting from GitHub Pages to **Cloudflare Pages** without
changing the domain (`walletlens.live`), so **SEO rankings and Search Console
history are unaffected** — no re-indexing, no canonical changes.

## Why migrate

GitHub Pages limitations we currently work around:

- **No custom response headers** → we built a separate Cloudflare Worker
  (`workers/security-headers/`) just to inject HSTS/CSP/etc.
- **`_headers` and `_redirects` are ignored** → our cache-control rules and the
  www→apex 301 redirect are *not actually applied* today.
- **Slower/finicky HTTPS cert provisioning** (the cause of a recent outage).

On Cloudflare Pages, `client/public/_headers` and `_redirects` work natively, so:

- The standalone security-headers Worker becomes **redundant** (delete after cutover).
- The www→apex redirect and all cache headers start actually working.
- Unlimited bandwidth + a faster global CDN.

The repo is already prepared: `_headers` now carries the full hardened CSP, and
`client/.node-version` pins Node 20 for the build.

---

## Step 1 — Put the domain on Cloudflare (if not already)

> This is also a prerequisite for the security-headers Worker, so you were
> heading here anyway.

1. Create a free Cloudflare account → **Add a site** → `walletlens.live`.
2. Cloudflare scans your existing DNS records. Review them.
3. Cloudflare gives you **two nameservers** (e.g. `xena.ns.cloudflare.com`).
4. In **Namecheap → Domain → Nameservers**, switch from "Namecheap BasicDNS"
   to **Custom DNS** and paste the two Cloudflare nameservers.
5. Wait for activation (usually 5–30 min, can take a few hours).

Once active, you manage all DNS in Cloudflare's dashboard.

---

## Step 2 — Create the Cloudflare Pages project

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize GitHub and select **`tia8910/Walletlens`**.
3. Production branch: **`main`**.
4. Build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | **None** (or *Vite*) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory (Advanced) | `client` |

   > Root directory `client` means Cloudflare installs from
   > `client/package-lock.json`, runs `npm run build` there (Vite build +
   > prerender), and publishes `client/dist`. `.node-version` (= 20) is read
   > from that root automatically.

5. Click **Save and Deploy**. The first build produces a preview URL like
   `walletlens.pages.dev` — **verify the whole site works there first**
   (dashboard, learn pages, blog, import/export pages).

---

## Step 3 — Attach the custom domain

1. In the Pages project → **Custom domains → Set up a custom domain**.
2. Add `walletlens.live` (apex). Cloudflare auto-creates the DNS record
   (CNAME-flattened to the Pages project) since the zone is now on Cloudflare.
3. Add `www.walletlens.live` too — our `_redirects` 301s it to the apex.
4. Cloudflare provisions the TLS cert automatically (fast, no manual step).

---

## Step 4 — Cutover & verify

1. Once the custom domain shows **Active**, load `https://walletlens.live` —
   it now serves from Cloudflare Pages.
2. Verify response headers (DevTools → Network → the document request):
   - `content-security-policy` present (the long hardened one)
   - `strict-transport-security`, `x-frame-options: DENY`,
     `x-content-type-options: nosniff`, `cross-origin-opener-policy`
   - `/assets/*` requests show `cache-control: ...immutable`
3. Verify `https://www.walletlens.live` 301-redirects to the apex.
4. Confirm a deep link works on hard refresh (e.g.
   `https://walletlens.live/learn/fear-and-greed-index/`).

---

## Step 5 — Decommission the old setup (only after cutover is verified)

1. **Security-headers Worker**: now redundant — `_headers` covers it. Remove the
   route binding in Cloudflare (or delete the Worker). The repo folder
   `workers/security-headers/` can be deleted in a later commit.
2. **GitHub Pages deploy**: disable the `Deploy to gh-pages` workflow
   (`.github/workflows/deploy.yml`) so the two hosts don't both build. Either
   delete the workflow or add `if: false` to the job. Optionally turn off Pages
   in **GitHub repo → Settings → Pages**.
3. The `CNAME` file written by the old workflow is harmless and can stay or go.

---

## Rollback

If anything misbehaves during Step 4, point the apex DNS record back to the
GitHub Pages IPs (`185.199.108–111.153`) and re-enable GitHub Pages. Because the
domain and content are unchanged, rollback is just a DNS record swap.

---

## Notes

- **`_redirects` SPA fallback** (`/* /index.html 200`): every real route is
  prerendered to its own HTML file, which Cloudflare serves directly; the
  fallback only catches client-only paths so direct loads never break.
- **Deno voice/AI endpoint** is unaffected — it stays on Deno Deploy and is
  already allow-listed in the CSP `connect-src`.
- **No SEO impact**: same domain, same URLs, same canonical tags. Search Console
  needs no changes.
