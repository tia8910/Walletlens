#!/usr/bin/env node
/**
 * Turn a backlink export into a Google disavow file — conservatively.
 *
 * READ THIS BEFORE USING IT.
 *
 * Backlinks cannot be deleted. They are links on other people's sites, and the
 * only lever you have is disavow.txt, which asks Google to ignore them. Google
 * says most sites should never submit one, and the reason is asymmetric risk:
 * disavowing a bad domain gains you approximately nothing, because Google
 * already ignores it, while disavowing a good one silently throws away real
 * equity with no warning and no error message.
 *
 * So this tool is deliberately reluctant. It drops far more than it keeps:
 *
 *   - nofollow links are never included. They pass nothing already, so
 *     disavowing them is pure risk for zero gain. On the profile this was
 *     written for that is 89% of the rows.
 *   - a domain is only proposed when it matches a spam pattern below AND the
 *     link is dofollow.
 *   - anything on KEEP is never proposed, whatever the export says.
 *
 * Usage:
 *   node seo/disavow.mjs <export.csv> [--out disavow.txt] [--all]
 *
 * Takes an Ahrefs backlink export or a Search Console links export. Column
 * names differ between them and between Ahrefs plans, so the header is matched
 * loosely rather than pinned.
 *
 *   --all   also list domains that matched nothing, as comments, so you can
 *           review them by hand. They are NOT disavowed.
 *
 * The output is a proposal. Read it, delete anything you recognise as a real
 * site, and only then upload it at
 * https://search.google.com/search-console/disavow-links
 */

import { readFileSync, writeFileSync } from 'node:fs'

// Never disavow these, whatever a heuristic thinks. Directories, app stores,
// code hosts and press that legitimately link to a product like this one.
const KEEP = [
  'github.com', 'github.io', 'gitlab.com', 'npmjs.com', 'news.ycombinator.com',
  'reddit.com', 'producthunt.com', 'play.google.com', 'apple.com',
  'wikipedia.org', 'medium.com', 'dev.to', 'stackoverflow.com', 'x.com',
  'twitter.com', 'linkedin.com', 'facebook.com', 'youtube.com',
  'coingecko.com', 'coinmarketcap.com', 'trustpilot.com', 'g2.com',
  'capterra.com', 'alternativeto.net', 'slant.co', 'saashub.com',
]

// Signals of a link that exists because a machine made it, not a person.
const SPAM = [
  { re: /\b(seo|backlink|linkbuild|pagerank|domainauthority)\b/i, why: 'seo-farm' },
  { re: /\b(casino|poker|betting|porn|escort|pharma|viagra|replica)\b/i, why: 'adult-gambling-pharma' },
  { re: /\b(freedownload|crack|warez|nulled|torrent)\b/i, why: 'warez' },
  { re: /\b(statvoo|websiteoutlook|siteprice|worthofweb|hypestat|urlrate|rank(check|ing)?tool)\b/i, why: 'site-appraisal' },
  { re: /\b(directory|listing|submit|addurl|weblinks)\d*\./i, why: 'link-directory' },
  { re: /\.(xyz|top|icu|buzz|click|link|work|loan|gq|cf|tk|ml)$/i, why: 'throwaway-tld' },
]

/** Split a CSV line, respecting quotes. Exports quote anchor text with commas. */
function splitCsv(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ }
      else quoted = !quoted
    } else if (c === ',' && !quoted) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const find = (headers, ...names) =>
  headers.findIndex((h) => names.some((n) => h.toLowerCase().includes(n)))

function registrable(host) {
  // Not a public-suffix implementation. Good enough to group obvious mirrors,
  // and the output is reviewed by a person before it is submitted.
  const parts = host.replace(/^www\./, '').split('.')
  if (parts.length <= 2) return parts.join('.')
  const twoLevel = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/i.test(parts.slice(-2).join('.'))
  return parts.slice(twoLevel ? -3 : -2).join('.')
}

function main() {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('usage: node seo/disavow.mjs <export.csv> [--out disavow.txt] [--all]')
    process.exit(1)
  }
  const outPath = (args.includes('--out') && args[args.indexOf('--out') + 1]) || 'disavow.txt'
  const showAll = args.includes('--all')

  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
  const headers = splitCsv(lines[0])
  const iUrl = find(headers, 'referring page url', 'source url', 'referring page', 'url')
  const iType = find(headers, 'nofollow', 'type', 'link type', 'rel')
  if (iUrl < 0) {
    console.error(`could not find a URL column in: ${headers.join(' | ')}`)
    process.exit(1)
  }

  const domains = new Map()   // registrable domain → { dofollow, total, why }
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line)
    const raw = cells[iUrl]
    if (!raw) continue
    let host
    try { host = new URL(raw).hostname } catch { continue }
    const dom = registrable(host)

    const typeCell = iType >= 0 ? (cells[iType] || '').toLowerCase() : ''
    // Treat a row as dofollow only when nothing says otherwise. Exports spell
    // this several ways, and the safe default here is "do not disavow".
    const nofollow = /nofollow|ugc|sponsored|true/.test(typeCell)

    const rec = domains.get(dom) || { dofollow: 0, total: 0, why: null }
    rec.total++
    if (!nofollow) rec.dofollow++
    if (!rec.why) {
      const hit = SPAM.find((s) => s.re.test(dom) || s.re.test(raw))
      if (hit) rec.why = hit.why
    }
    domains.set(dom, rec)
  }

  const kept = []
  const proposed = []
  const ignored = []
  for (const [dom, rec] of [...domains].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (KEEP.some((k) => dom === k || dom.endsWith(`.${k}`))) { kept.push(dom); continue }
    // The two conditions that matter, and both must hold.
    if (rec.why && rec.dofollow > 0) proposed.push([dom, rec])
    else ignored.push([dom, rec])
  }

  const out = [
    '# Disavow proposal — REVIEW BEFORE UPLOADING.',
    '#',
    '# Generated by seo/disavow.mjs. Every line below is a guess made by a',
    '# regex. Delete anything you recognise as a real site: disavowing a good',
    '# domain costs you real equity and Google will not tell you it happened.',
    '#',
    `# export      ${file}`,
    `# domains     ${domains.size}`,
    `# proposed    ${proposed.length}  (spam pattern AND at least one dofollow link)`,
    `# not listed  ${ignored.length}  (nofollow only, or no spam signal — these pass nothing or look legitimate)`,
    `# never listed ${kept.length}  (on the keep-list)`,
    '#',
    '# If Search Console shows no manual action against this site, the correct',
    '# number of lines below is usually zero. Google already ignores this.',
    '',
    ...proposed.map(([dom, rec]) => `# ${rec.why}, ${rec.dofollow}/${rec.total} dofollow\ndomain:${dom}`),
  ]

  if (showAll) {
    out.push('', '# ── Not proposed, for review. These are NOT disavowed. ──')
    for (const [dom, rec] of ignored) {
      out.push(`# ${dom}  (${rec.dofollow}/${rec.total} dofollow${rec.why ? `, ${rec.why}` : ''})`)
    }
  }

  writeFileSync(outPath, out.join('\n') + '\n')
  console.log(`${domains.size} domains → ${proposed.length} proposed, ${ignored.length} left alone, ${kept.length} on the keep-list`)
  console.log(`written to ${outPath}`)
  if (proposed.length === 0) {
    console.log('\nNothing matched. That is the common and usually correct outcome.')
  }
}

main()
