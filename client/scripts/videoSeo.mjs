// The Academy's videos as search engines and AI assistants read them: the
// /youtube page as a full lesson index (every video with the lesson it
// teaches, in words), schema.org VideoObject data for each one, and a section
// for llms.txt. Pure functions over the video catalog, used by prerender.mjs.
//
// No thumbnail image is put on the page: the app never fetches from YouTube
// before someone presses play, and this page keeps that. The thumbnail address
// is named in the structured data only, which a browser does not load.
import { academyVideos, youtubeId, COURSES, inLang, watchUrl, videoUrl } from '../src/data/academyVideos.js'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Every playable video once, English catalog order, with its lesson where it has one. */
export function seoVideos(list) {
  const seen = new Set()
  return academyVideos('en', list).filter(v => youtubeId(v.youtube) && !seen.has(v.id) && seen.add(v.id))
}

/** What a video teaches, in a sentence or two: its lesson, or what kind of video it is. */
export function videoDescription(v) {
  if (v.lesson) return `${v.lesson.title}. ${v.lesson.body}`.replace(/\s+/g, ' ').trim()
  if (v.lang === 'ar') return `${v.name}. درس قصير عن الاستثمار وإدارة المخاطر من أكاديمية WalletLens.`
  if (v.kind === 'howto') return `${v.name}. A short tutorial on using WalletLens, the free and private investment management app.`
  return `${v.name}. ${v.kind === 'original' ? 'A full episode' : 'A short lesson'} on investing habits and risk from the WalletLens Academy.`
}

/** schema.org VideoObject for one video. Null without a publish date, which the type requires. */
export function videoObject(v, origin) {
  if (!v.added) return null
  return {
    '@type': 'VideoObject',
    name: v.name,
    description: videoDescription(v),
    thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    uploadDate: `${v.added}T00:00:00Z`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
    url: watchUrl(v.id),
    inLanguage: v.lang === 'ar' ? 'ar' : 'en',
    isFamilyFriendly: true,
    publisher: { '@type': 'Organization', name: 'WalletLens', url: `${origin}/` },
  }
}

const item = (v) => `<article${v.lang === 'ar' ? ' lang="ar" dir="rtl"' : ''}>
<h3>${esc(v.name)}</h3>
${v.lesson ? `<p><strong>${esc(v.lesson.title)}.</strong> ${esc(v.lesson.body)}</p>` : ''}
<p><a href="${esc(videoUrl(v.key))}">${v.lang === 'ar' ? 'شاهد داخل التطبيق' : 'Watch in WalletLens'}</a> · <a href="${esc(watchUrl(v.id))}">${v.lang === 'ar' ? 'شاهد على يوتيوب' : 'Watch on YouTube'}</a></p>
</article>`

/** The /youtube page: body HTML and JSON-LD for the whole catalog. */
export function videoHub({ origin, list } = {}) {
  const all = seoVideos(list)
  const en = all.filter(v => v.lang !== 'ar')
  const ar = all.filter(v => v.lang === 'ar')
  const inCourse = (id) => en.filter(v => v.course === id && v.kind !== 'howto' && v.kind !== 'original')
  const placed = new Set(COURSES.flatMap(c => inCourse(c.id).map(v => v.key)))
  const films = en.filter(v => v.kind === 'original')
  const howtos = en.filter(v => v.kind === 'howto')
  const more = en.filter(v => !placed.has(v.key) && v.kind !== 'original' && v.kind !== 'howto')
  const sec = (title, sub, vs) => (vs.length ? `<section>\n<h2>${esc(title)}</h2>\n${sub ? `<p>${esc(sub)}</p>\n` : ''}${vs.map(item).join('\n')}\n</section>` : '')

  const bodyHtml = `
<h1>Free investing video lessons</h1>
<p>${all.length} short videos from the WalletLens Academy on investing mindset, risk, and buying and selling: each one teaches a single habit, in under a minute for the shorts. They are free, need no account, and play inside WalletLens or on YouTube.</p>
<p><a href="https://www.youtube.com/@walletlens?sub_confirmation=1">Subscribe on YouTube</a> · <a href="https://www.youtube.com/@walletlens">Open the channel</a> · <a href="/academy">Open the Academy</a></p>
${COURSES.map(c => sec(inLang(c.name, 'en'), inLang(c.sub, 'en'), inCourse(c.id))).join('\n')}
${sec('Full episodes', 'Longer films that tell one story start to finish.', films)}
${sec('More short lessons', '', more)}
${sec('How WalletLens works', 'Short tutorials on the app itself.', howtos)}
${ar.length ? `<section lang="ar" dir="rtl">\n<h2>دروس بالعربية</h2>\n<p>قصص قصيرة وحلقات كاملة بالعربية عن المال والمخاطر وأشهر عمليات الاحتيال في التاريخ.</p>\n${ar.map(item).join('\n')}\n</section>` : ''}
<p><a href="/dashboard">Open WalletLens free</a> · <a href="/blog">Read the blog</a> · <a href="/faq">FAQ</a></p>
`
  const objects = all.map(v => videoObject(v, origin)).filter(Boolean)
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'WalletLens Academy video lessons',
      numberOfItems: objects.length,
      itemListElement: objects.map((o, i) => ({ '@type': 'ListItem', position: i + 1, item: o })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Video lessons', item: `${origin}/youtube/` },
      ],
    },
  ]
  return { bodyHtml, jsonLd, count: all.length }
}

/** The "## Video lessons" section of llms.txt: each lesson with what it teaches. */
export function llmsVideoSection({ origin, list } = {}) {
  const all = seoVideos(list)
  const lines = all.map(v => `- [${v.name}](${watchUrl(v.id)})${v.lang === 'ar' ? ' (Arabic)' : ''}: ${v.lesson ? `${v.lesson.title}. ${v.lesson.body}`.replace(/\s+/g, ' ') : (v.kind === 'original' ? 'Full episode.' : v.kind === 'howto' ? 'App tutorial.' : 'Short lesson.')}`)
  return `## Video lessons\n\nFree short video lessons on investing mindset, risk, and buying and selling, from the WalletLens Academy. Index with every lesson in words: ${origin}/youtube/ . Channel: https://www.youtube.com/@walletlens\n\n${lines.join('\n')}\n`
}
