// Finds the videos on the WalletLens YouTube channel and links them to the
// Academy catalog, so a video uploaded to the channel shows in the app, in the
// bell and in a push without anyone pasting a link. Run by the Update Videos
// workflow; safe to run by hand: `node scripts/sync-youtube.mjs`.
//
// The public channel feed needs no API key. It lists the newest 15 videos, so
// what was found before is kept and only new videos are added.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_VIDEOS } from '../src/data/academyVideos.js'

const here = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(here, '../src/data/academyVideoLinks.js')
const HANDLE = 'https://www.youtube.com/@walletlens'

/** Lowercase letters and digits only, Arabic kept, so "The Crash Sale!" finds "the crash sale". */
export const norm = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Entries from the channel feed: id, title, description, published day, and whether it is a Short. */
export function parseFeed(xml) {
  const out = []
  for (const [, e] of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const pick = (re) => (re.exec(e) || [])[1] || ''
    const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    const id = pick(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)
    if (!id) continue
    out.push({
      id,
      title: unescape(pick(/<title>([\s\S]*?)<\/title>/)),
      description: unescape(pick(/<media:description>([\s\S]*?)<\/media:description>/)),
      added: pick(/<published>(\d{4}-\d{2}-\d{2})/),
      short: /\/shorts\//.test(pick(/<link rel="alternate" href="([^"]+)"/)),
    })
  }
  return out
}

/**
 * Which catalog entry a video is. A `wl:key` tag in the description decides;
 * otherwise the catalog name must appear in the title (or the title in the
 * name, for a title shortened on upload), or one of its `alt` titles. Longest
 * name wins, so "3am, 100x Long" is not taken for "The 3am Pump".
 */
export function matchVideo(video, catalog = BASE_VIDEOS) {
  const tag = /\bwl:([a-z0-9-]+)/i.exec(video.description || '')?.[1]
  if (tag && catalog.some(v => v.key === tag)) return tag
  const t = norm(video.title)
  if (!t) return null
  // The longest matching name across every entry, its own and its alternatives.
  let best = null
  for (const v of catalog) {
    for (const name of [v.name, ...(v.alt || [])]) {
      const n = norm(name)
      if (n && (t.includes(n) || (t.length >= 8 && n.includes(t))) && (!best || n.length > best.len)) best = { key: v.key, len: n.length }
    }
  }
  return best?.key || null
}

/** Merge feed entries into the saved links. Returns the new state and what was added. */
export function merge(state, entries, catalog = BASE_VIDEOS) {
  const next = { channelId: state.channelId || '', links: { ...state.links }, extras: [...(state.extras || [])] }
  const known = new Set([...Object.values(next.links).map(l => l.youtube), ...next.extras.map(x => x.youtube)])
  const added = []
  for (const e of entries) {
    if (known.has(e.id)) continue
    const key = matchVideo(e, catalog)
    if (key && !next.links[key]) {
      next.links[key] = { youtube: e.id, added: e.added }
    } else {
      next.extras.push({
        key: `yt-${e.id}`, kind: e.short ? 'story' : 'original', name: e.title.slice(0, 80), emoji: '🎬',
        lang: /[؀-ۿ]/.test(e.title) ? 'ar' : 'en', youtube: e.id, added: e.added, ...(e.short ? {} : { wide: true }),
      })
    }
    known.add(e.id)
    added.push(key || `yt-${e.id}`)
  }
  return { next, added }
}

const render = (s) => readFileSync(FILE, 'utf8').replace(/export default \{[\s\S]*$/, `export default ${JSON.stringify(s, null, 2)}\n`)

// A browser's headers, and consent already given, so YouTube serves the real
// page to the workflow's runner instead of a consent screen.
const HEADERS = { 'accept-language': 'en', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', cookie: 'CONSENT=YES+1; SOCS=CAI' }

/**
 * The channel's own id from its page. The canonical link and externalId name
 * this channel; a bare "channelId" can belong to another channel shown on the
 * page, which made the feed 404.
 */
export function channelIdFrom(page) {
  const m = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(page)
    || /"externalId":"(UC[\w-]{22})"/.exec(page)
    || /<meta itemprop="identifier" content="(UC[\w-]{22})"/.exec(page)
    || /"browseId":"(UC[\w-]{22})"/.exec(page)
  return m?.[1] || ''
}

/** Video ids on a channel tab, newest first, each once. */
export function videoIdsFrom(page) {
  return [...new Set([...String(page).matchAll(/"videoId":"([\w-]{11})"/g)].map(m => m[1]))]
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The newest videos when the feed is down: the ids on the channel's Shorts and
 * Videos tabs, each checked with oEmbed to be ours and to give its title.
 */
async function fromChannelPages() {
  const out = []
  for (const tab of ['shorts', 'videos']) {
    const res = await fetch(`${HANDLE}/${tab}`, { headers: HEADERS })
    if (!res.ok) continue
    for (const id of videoIdsFrom(await res.text()).slice(0, 15)) {
      if (out.some(e => e.id === id)) continue
      const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/${tab === 'shorts' ? 'shorts/' : 'watch?v='}${id}`)}`)
      if (!o.ok) continue
      const meta = await o.json()
      if (!/@walletlens\b/i.test(meta.author_url || '')) continue
      out.push({ id, title: meta.title || '', description: '', added: today(), short: tab === 'shorts' })
    }
  }
  return out
}

/** The channel feed, by channel and then by its uploads playlist. Null when neither answers. */
async function fromFeed(channelId) {
  if (!channelId) return null
  for (const q of [`channel_id=${channelId}`, `playlist_id=UU${channelId.slice(2)}`]) {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?${q}`, { headers: HEADERS })
    if (res.ok) return parseFeed(await res.text())
    console.log(`feed ${q}: HTTP ${res.status}`)
  }
  return null
}

async function main() {
  const { default: state } = await import(`${FILE}?t=${Date.now()}`)
  let channelId = state.channelId
  if (!channelId) {
    const page = await (await fetch(HANDLE, { headers: HEADERS })).text()
    channelId = channelIdFrom(page)
    console.log(`channel id: ${channelId || 'not found'}`)
  }
  let entries = await fromFeed(channelId)
  if (!entries) {
    entries = await fromChannelPages()
    console.log(`read the channel pages instead: ${entries.length} videos`)
    if (!entries.length) throw new Error('found no videos on ' + HANDLE)
  }
  const { next, added } = merge({ ...state, channelId }, entries)
  if (!added.length && state.channelId === channelId) { console.log(`No new videos (${entries.length} found).`); return }
  writeFileSync(FILE, render(next), 'utf8')
  console.log(`Linked ${added.length}: ${added.join(', ') || '(channel id only)'}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(e => { console.error(e.message); process.exit(1) })
}
