# SEO & Reputation Remediation — walletlens.live

Action plan to clean up the toxic backlink profile and clear the
false "scam/phishing" flags. Work top to bottom.

## Context

- Domain is **new (~26 days)** → low DR/DA and avg position ~80 are *normal*.
  Rankings improve with time + real content. Don't panic about the numbers.
- The real issue is **221 spam backlinks** (PBN + casino/crypto anchors). This
  junk profile is almost certainly why IPQS/ScamAdviser flagged the site.
- The fix is the same whether the links came from a paid service or a
  negative-SEO attack: **disavow them in Google.**

---

## 1. Disavow toxic backlinks (highest priority)

1. **Set up Google Search Console** for `walletlens.live`
   - https://search.google.com/search-console → Add property → Domain
   - Verify with the DNS TXT record they give you (add it at your domain registrar).
2. **Export your backlinks**
   - Search Console → *Links* → *Top linking sites* → Export, and/or
   - Ahrefs backlink export (free checker shows a sample; trial gives the full list).
3. **Fill in `marketing/disavow.txt`** — add a `domain:` line for every spam
   referring domain. Three confirmed ones are already seeded in that file.
4. **Upload** at https://search.google.com/search-console/disavow-links
   - Select the `walletlens.live` property → *Upload disavow list*.
   - Re-uploading replaces the old file, so keep `disavow.txt` as the master copy.

> Effect is gradual — Google reprocesses links over days/weeks as it re-crawls.

## 2. Stop adding bad links

- Cancel any "SEO backlinks / DA boost / traffic" service if one was purchased.
- Never buy backlinks again — it's the fastest way to a manual penalty.

## 3. Dispute the false "scam/phishing" flags

Once disavowed, submit corrections so the bad reputation data gets refreshed:

- **IPQualityScore (root cause — most tools pull from it):**
  https://www.ipqualityscore.com/ → report the domain as a false positive.
- **ScamAdviser:** open the walletlens.live report → "Is this your business?" /
  dispute → submit SSL, contact info, and that it's a *read-only tracker*.
- **Google Safe Browsing** (if ever flagged):
  https://safebrowsing.google.com/safebrowsing/report_error/

When describing the site anywhere, always frame it as:
> "Privacy-first portfolio **tracker** — no wallet connection, no custody,
> no transactions. All data stays on the user's device."

## 4. Build legitimate signals (ongoing)

- Real content (the blog/recaps already help), genuine social shares.
- A few quality links from real crypto/finance sites beat 1000 PBN links.
- Patience: a 26-day domain ranking at position 80 is expected; months of
  consistent content move it up.

---

*No code changes fix this — it's entirely off-site reputation. The on-page SEO
(sitemap, RSS, llms.txt, prerendered pages, meta tags) is already in place.*
