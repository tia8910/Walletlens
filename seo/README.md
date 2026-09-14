# Disavow

Backlinks cannot be deleted. They are links on other people's sites. The only
lever is `disavow.txt`, which asks Google to ignore them.

**Start by checking whether you need it at all.** Search Console →
*Security & Manual Actions* → *Manual actions*. If that page says "No issues
detected", the honest answer is almost always to do nothing: Google already
ignores scraper and directory links, which is what a Domain Rating near zero
alongside hundreds of referring domains is telling you.

Use this only if there is a manual action, or if links were bought.

## Why the tool drops most rows

The risk is asymmetric. Disavowing a bad domain gains you nothing, because
Google discounts it already. Disavowing a good one throws away real equity,
silently, with no error and no way to tell it happened.

So:

- **nofollow rows are never disavowed.** They pass nothing, so listing them is
  pure risk for zero gain.
- a domain is proposed only if it matches a spam pattern **and** has at least
  one dofollow link.
- `KEEP` in `disavow.mjs` is never proposed — code hosts, app stores, real
  directories, press.

## Running it

```sh
# Ahrefs: Site Explorer → Backlinks → Export → CSV
# Search Console: Links → Top linking sites → Export
node seo/disavow.mjs backlinks.csv --out disavow.txt

# also list what was left alone, as comments, for review
node seo/disavow.mjs backlinks.csv --all
```

Read the output. Delete any line you recognise as a real site. Then upload at
<https://search.google.com/search-console/disavow-links>.

A file with zero lines is a normal and usually correct result.
