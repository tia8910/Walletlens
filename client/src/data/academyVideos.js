// The Academy's video lessons. Every video lives on the WalletLens YouTube
// channel; this file says which course it belongs to, which lesson it
// teaches and which part of the app puts the lesson to work. A video plays
// once its YouTube link is known, and stays hidden until then.
//
// `hack` is an index into HACK_TEXT, already written in every app language:
// the lesson line and the takeaway under a video come from there.
import { hacks } from './academyContent.js'
import synced from './academyVideoLinks.js'

export const YT_CHANNEL = 'https://www.youtube.com/@walletlens'
export const YT_SUBSCRIBE = `${YT_CHANNEL}?sub_confirmation=1`

/** The 11 character id from a YouTube link of any shape, or from a bare id. */
export function youtubeId(link) {
  const s = String(link || '').trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(s)
  return m ? m[1] : ''
}

/** The privacy-enhanced player: no cookies are set until the viewer presses play. */
export const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`

// Links are found automatically: the Update Videos workflow reads the
// channel's feed every two hours and writes academyVideoLinks.js, which is
// merged in below. A link set here by hand wins. `added` is the day it went
// live ('YYYY-MM-DD'): for a week after it the video is announced as new, in
// the bell and by push.
//
// kind: story (a short with a lesson), hack (a short about one hack card),
// original (a long film), howto (a feature tutorial).
// course: mindset | risk | trading, the shelf it sits on. act: the app screen
// its "Try it in WalletLens" button opens (ACTIONS below).
// lang: the language spoken or written in the video; 'all' has no words that need reading.
// alt: other titles the video was uploaded under, so the channel sync still finds it.
// poster: the painted scene for its tile (academyCopy.js POSTERS) when the video's own colours call for one.
export const BASE_VIDEOS = [
  { key: 'stop-loss-skydive',  kind: 'story', lang: 'en', name: 'The Stop Loss Skydive',  emoji: '🪂', hack: 1,  course: 'risk', act: 'signals', youtube: '' },
  { key: 'crash-sale',         kind: 'story', lang: 'en', name: 'The Crash Sale',         emoji: '🏷️', hack: 7,  course: 'trading', act: 'alerts', youtube: '' },
  { key: 'breakout-concert',   kind: 'story', lang: 'en', name: 'The Breakout Concert',   emoji: '🎸', hack: 11, course: 'trading', act: 'signals', youtube: '' },
  { key: 'great-moonini',      kind: 'story', lang: 'en', name: 'The Great Moonini',      emoji: '🎩', hack: 16, course: 'risk', act: 'coach', youtube: '' },
  { key: 'fear-and-greed',     kind: 'story', lang: 'en', name: 'Fear and Greed',         emoji: '😱', hack: 17, course: 'mindset', act: 'feargreed', youtube: '' },
  { key: 'leverage-the-game',  kind: 'story', lang: 'en', name: 'Leverage: The Game',     emoji: '🎮', hack: 13, course: 'risk', act: 'coach', youtube: '' },
  { key: 'panic-or-wait',      kind: 'story', lang: 'en', name: 'Panic or Wait 48h',      emoji: '⏳', hack: 8,  course: 'mindset', act: 'coach', youtube: '' },
  { key: 'patience-pays',      kind: 'story', lang: 'en', name: 'Patience Pays',          emoji: '🎣', poster: 'sunset', hack: 15, course: 'mindset', act: 'alerts', youtube: '', alt: ['paper hands vs the patient one'] },
  { key: 'the-3am-pump',       kind: 'story', lang: 'en', name: 'The 3am Pump',           emoji: '🌙', hack: 5,  course: 'mindset', act: 'alerts', youtube: '' },
  { key: 'one-that-got-away',  kind: 'story', lang: 'en', name: 'The One That Got Away',  emoji: '🎣', hack: 4,  course: 'trading', act: 'signals', youtube: '' },
  { key: 'press-conference',   kind: 'story', lang: 'en', name: 'The Press Conference',   emoji: '🎤', hack: 4,  course: 'trading', act: 'signals', youtube: '' },
  { key: '3am-100x-long',      kind: 'story', lang: 'en', name: '3am, 100x Long',         emoji: '💥', hack: 13, course: 'risk', act: 'signals', youtube: '' },

  { key: 'hack-buy-in-thirds',   kind: 'hack', lang: 'en', name: 'Buy in thirds',                emoji: '🎯', hack: 0, course: 'trading', act: 'alerts', youtube: '' },
  { key: 'hack-check-twice',     kind: 'hack', lang: 'en', name: 'Check prices twice a day',     emoji: '🕑', hack: 5, course: 'mindset', act: 'alerts', youtube: '' },
  { key: 'hack-48-hour-rule',    kind: 'hack', lang: 'en', name: 'The 48 hour rule',             emoji: '⏳', hack: 8, course: 'mindset', act: 'coach', youtube: '' },
  { key: 'hack-take-profit',     kind: 'hack', lang: 'en', name: 'Take profit on the way up',    emoji: '💰', hack: 4, course: 'trading', act: 'signals', youtube: '' },
  { key: 'hack-5-percent-rule',  kind: 'hack', lang: 'en', name: 'The 5% rule',                  emoji: '🧮', hack: 3, course: 'risk', act: 'rebalance', youtube: '' },

  { key: 'chart-checks-today', kind: 'original', lang: 'en', name: 'Chart Checks Today',   emoji: '🎬', hack: 5, wide: true, course: 'mindset', act: 'alerts', youtube: '' },
  { key: '12-investing-hacks', kind: 'original', lang: 'en', name: '12 Investing Hacks',   emoji: '💡', hack: 15, wide: true, course: 'trading', act: 'coach', youtube: '' },

  { key: 'howto-five-apps',      kind: 'howto', lang: 'en', name: 'Your money is in 5 different apps',  emoji: '📱', youtube: '' },
  { key: 'howto-screenshot',     kind: 'howto', lang: 'en', name: 'Stop typing your portfolio by hand', emoji: '📸', youtube: '' },
  { key: 'howto-say-trades',     kind: 'howto', lang: 'en', name: 'Say your trades',                    emoji: '🎙️', youtube: '' },
  { key: 'howto-decision',       kind: 'howto', lang: 'en', name: 'Buy, sell or hold?',                 emoji: '🧭', youtube: '' },
  { key: 'howto-signals',        kind: 'howto', lang: 'en', name: 'Signals that show their track record', emoji: '📈', youtube: '' },
  { key: 'howto-ten-years',      kind: 'howto', lang: 'en', name: 'Where will you be in 10 years?',     emoji: '🔭', youtube: '' },
  { key: 'howto-private',        kind: 'howto', lang: 'en', name: 'No account. No bank link. No catch.', emoji: '🔒', youtube: '' },
  { key: 'howto-six-places',     kind: 'howto', lang: 'en', name: 'Your money in 6 places, one number', emoji: '🧩', youtube: '' },
  { key: 'howto-ar-all-assets',  kind: 'howto', lang: 'ar', name: 'أموالك موزعة على ٥ تطبيقات',          emoji: '📱', youtube: '' },
  { key: 'howto-ar-import',      kind: 'howto', lang: 'ar', name: 'توقف عن كتابة محفظتك يدوياً',          emoji: '📸', youtube: '' },
  { key: 'howto-ar-news',        kind: 'howto', lang: 'ar', name: 'أخبار الأسواق العالمية بالعربية',      emoji: '📰', youtube: '' },
  { key: 'howto-ar-decision',    kind: 'howto', lang: 'ar', name: 'أشتري، أبيع أم أنتظر؟',               emoji: '🧭', youtube: '' },
  { key: 'howto-ar-guardian',    kind: 'howto', lang: 'ar', name: 'حارس المحفظة: خريطة الكنز',            emoji: '🗺️', youtube: '' },
  { key: 'howto-ar-zakat',       kind: 'howto', lang: 'ar', name: 'الزكاة في محادثة العائلة',              emoji: '🌙', youtube: '' },
]

/** The catalog with the channel's videos linked in, plus any the catalog does not name. */
export const VIDEOS = [
  ...BASE_VIDEOS.map(v => (v.youtube || !synced.links?.[v.key] ? v : { ...v, ...synced.links[v.key] })),
  ...(synced.extras || []),
]

/** Lessons that count toward progress: everything that teaches, not the tutorials. */
export const isLesson = (v) => v.kind !== 'howto'

// The shelves the lessons sit on, in order, with their names in every language.
export const COURSES = [
  { id: 'mindset', name: { en: 'Mindset', ar: 'العقلية', fr: 'État d’esprit', es: 'Mentalidad', de: 'Denkweise', it: 'Mentalità' },
    sub: { en: 'Patience, fear and the urge to act', ar: 'الصبر والخوف والرغبة في التصرف', fr: 'La patience, la peur et l’envie d’agir', es: 'Paciencia, miedo y las ganas de actuar', de: 'Geduld, Angst und der Drang zu handeln', it: 'Pazienza, paura e la voglia di agire' } },
  { id: 'risk', name: { en: 'Risk', ar: 'المخاطر', fr: 'Le risque', es: 'Riesgo', de: 'Risiko', it: 'Rischio' },
    sub: { en: 'Losing small so you can stay in', ar: 'خسارة صغيرة لتبقى في السوق', fr: 'Perdre peu pour rester dans la partie', es: 'Perder poco para seguir en el juego', de: 'Klein verlieren, um dabei zu bleiben', it: 'Perdere poco per restare in gioco' } },
  { id: 'trading', name: { en: 'Buying and selling', ar: 'الشراء والبيع', fr: 'Acheter et vendre', es: 'Comprar y vender', de: 'Kaufen und verkaufen', it: 'Comprare e vendere' },
    sub: { en: 'Entries, exits and taking profit', ar: 'الدخول والخروج وجني الأرباح', fr: 'Entrées, sorties et prises de bénéfices', es: 'Entradas, salidas y toma de ganancias', de: 'Einstiege, Ausstiege und Gewinnmitnahmen', it: 'Entrate, uscite e prese di profitto' } },
]

// Where "Try it in WalletLens" goes after a lesson, and what it says.
export const ACTIONS = {
  alerts:    { path: '/dashboard', state: { tab: 'alerts' }, label: { en: 'Set a price alert, then close the chart', ar: 'ضع تنبيه سعر ثم أغلق الرسم البياني', fr: 'Créez une alerte de prix, puis fermez le graphique', es: 'Crea una alerta de precio y cierra el gráfico', de: 'Preisalarm setzen, dann den Chart schließen', it: 'Imposta un avviso di prezzo e chiudi il grafico' } },
  signals:   { path: '/technicals', label: { en: 'See the stop and targets in Signals', ar: 'شاهد وقف الخسارة والأهداف في الإشارات', fr: 'Voir le stop et les objectifs dans Signaux', es: 'Ver el stop y los objetivos en Señales', de: 'Stop und Ziele in Signale ansehen', it: 'Vedi stop e obiettivi in Segnali' } },
  coach:     { path: '/coach', label: { en: 'Ask the Coach about your portfolio', ar: 'اسأل المدرب عن محفظتك', fr: 'Interrogez le Coach sur votre portefeuille', es: 'Pregunta al Coach por tu cartera', de: 'Den Coach zu deinem Portfolio fragen', it: 'Chiedi al Coach del tuo portafoglio' } },
  feargreed: { path: '/fear-and-greed-index', label: { en: 'Check today’s Fear and Greed', ar: 'تحقق من مؤشر الخوف والطمع اليوم', fr: 'Voir la peur et l’avidité du jour', es: 'Mira el miedo y la codicia de hoy', de: 'Heutige Angst und Gier ansehen', it: 'Guarda paura e avidità di oggi' } },
  rebalance: { path: '/rebalancing-calculator', label: { en: 'Check how your portfolio is split', ar: 'تحقق من توزيع محفظتك', fr: 'Vérifiez la répartition de votre portefeuille', es: 'Revisa cómo se reparte tu cartera', de: 'Prüfe die Aufteilung deines Portfolios', it: 'Controlla come è diviso il tuo portafoglio' } },
}

/** A course or action text in `lang`, English when missing. */
export const inLang = (table, lang) => table?.[lang] || table?.en || ''

/**
 * The videos ready to play, for one app language: its own language first,
 * then English, then the rest. Each carries its lesson (title and takeaway).
 */
export function academyVideos(lang = 'en', list = VIDEOS) {
  const hk = hacks(lang)
  const rank = (v) => (v.lang === lang ? 0 : v.lang === 'en' || v.lang === 'all' ? 1 : 2)
  return list
    .map(v => ({ ...v, id: youtubeId(v.youtube) }))
    .filter(v => v.id)
    // Arabic tutorials are for Arabic readers; everyone else gets English ones.
    .filter(v => v.kind !== 'howto' || v.lang === lang || (v.lang === 'en' && lang !== 'ar') || v.lang === 'all')
    .map(v => ({ ...v, lesson: v.hack != null ? hk[v.hack] : null }))
    .sort((a, b) => rank(a) - rank(b))
}

/** The video for a hack card, if one is ready. */
export const videoForHack = (index, list = VIDEOS) =>
  list.find(v => v.kind === 'hack' && v.hack === index && youtubeId(v.youtube)) || null

// ── New videos ──────────────────────────────────────────────────────────────
// Shared by the bell (on the device) and the push worker (on the server), so
// both announce the same videos for the same week.

export const NEW_VIDEO_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** The day a video went live, as a timestamp, or NaN when it has no date. */
export const addedAt = (v) => Date.parse(`${v.added || ''}T00:00:00Z`)

/**
 * Linked videos added in the last week, newest first, minus those already
 * announced (`sent`, a list of keys). A tutorial in another language than the
 * reader's is left out, as on the Watch tab.
 */
export function newVideos({ now = Date.now(), sent = [], lang = 'en', list = VIDEOS } = {}) {
  const done = new Set(sent)
  return academyVideos(lang, list)
    .filter(v => !done.has(v.key))
    .filter(v => { const at = addedAt(v); return at <= now && now - at < NEW_VIDEO_DAYS * DAY_MS })
    .sort((a, b) => addedAt(b) - addedAt(a))
}

/** Where a notification about one video opens: that video, playing. */
export const videoUrl = (key) => `/academy?video=${encodeURIComponent(key)}`

// What the announcement says, in the bell and in the push, per language.
const NOTICE = {
  en: { one: (name) => `🎬 New in the Academy: ${name}`, many: (n) => `🎬 ${n} new lessons in the Academy`, tutorial: 'A short video on how it works' },
  ar: { one: (name) => `🎬 جديد في الأكاديمية: ${name}`, many: (n) => `🎬 ${n} دروس جديدة في الأكاديمية`, tutorial: 'فيديو قصير يشرح طريقة الاستخدام' },
  fr: { one: (name) => `🎬 Nouveau dans l’Académie : ${name}`, many: (n) => `🎬 ${n} nouvelles leçons dans l’Académie`, tutorial: 'Une courte vidéo pour comprendre comment ça marche' },
  es: { one: (name) => `🎬 Nuevo en la Academia: ${name}`, many: (n) => `🎬 ${n} lecciones nuevas en la Academia`, tutorial: 'Un vídeo corto sobre cómo funciona' },
  de: { one: (name) => `🎬 Neu in der Akademie: ${name}`, many: (n) => `🎬 ${n} neue Lektionen in der Akademie`, tutorial: 'Ein kurzes Video, wie es funktioniert' },
  it: { one: (name) => `🎬 Novità nell’Academy: ${name}`, many: (n) => `🎬 ${n} nuove lezioni nell’Academy`, tutorial: 'Un breve video su come funziona' },
}
export const VIDEO_NOTICE = NOTICE

/** Title and body announcing one video, in `lang`. The body is its lesson. */
export function videoNotice(v, lang = 'en') {
  const c = NOTICE[lang] || NOTICE.en
  const lesson = v.hack != null ? hacks(lang)[v.hack]?.title : ''
  return { title: c.one(v.name), body: lesson || c.tutorial }
}

/** One push for everything new: the video itself when there is one, a count otherwise. */
export function videoPush(list, lang = 'en') {
  if (!list.length) return null
  if (list.length === 1) return { ...videoNotice(list[0], lang), url: videoUrl(list[0].key), tag: `video-${list[0].key}` }
  const c = NOTICE[lang] || NOTICE.en
  return { title: c.many(list.length), body: list.slice(0, 3).map(v => v.name).join(' · '), url: '/academy', tag: `videos-${list.map(v => v.key).sort().join('.').slice(0, 60)}` }
}

/** The linked videos, as published at /academy-videos.json for the push worker. */
export const publishedVideos = (list = VIDEOS) =>
  list.filter(v => youtubeId(v.youtube)).map(({ key, kind, lang, name, emoji, hack, course, act, youtube, added, wide }) => ({ key, kind, lang, name, emoji, hack, course, act, youtube, added, ...(wide ? { wide } : {}) }))

// ── What to watch ───────────────────────────────────────────────────────────
// `watched` is a set of keys (academyProgress.js keeps it on the device).

/** The lessons in the order a course reads them: originals, then by course. */
export function lessonOrder(lang = 'en', list = VIDEOS) {
  const all = academyVideos(lang, list).filter(isLesson)
  const byCourse = COURSES.flatMap(c => all.filter(v => v.kind !== 'original' && v.course === c.id))
  const rest = all.filter(v => v.kind !== 'original' && !COURSES.some(c => c.id === v.course))
  return [...all.filter(v => v.kind === 'original'), ...byCourse, ...rest]
}

/** The newest lesson on the channel, by the day it went live. */
export function newestLesson(lang = 'en', list = VIDEOS) {
  const all = academyVideos(lang, list).filter(isLesson)
  return [...all].sort((a, b) => (addedAt(b) || 0) - (addedAt(a) || 0))[0] || null
}

/**
 * What Home offers: the newest lesson while it is unwatched, then the next
 * unwatched one in course order, and nothing once every lesson is watched.
 */
export function homeLesson(watched = new Set(), lang = 'en', list = VIDEOS) {
  const newest = newestLesson(lang, list)
  if (!newest) return null
  if (!watched.has(newest.key)) return { video: newest, isNew: true }
  const next = lessonOrder(lang, list).find(v => !watched.has(v.key))
  return next ? { video: next, isNew: false } : null
}
