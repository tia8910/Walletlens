// The Academy's video lessons. Every video lives on the WalletLens YouTube
// channel; this file only says which lesson it teaches and which question
// follows it. A video plays once its YouTube link is filled in below, and
// stays hidden until then, so a lesson can be listed before it is uploaded.
//
// `hack` is an index into HACK_TEXT and `q` into QUESTION_TEXT, both already
// written in every app language: the lesson line under a video and the quiz
// after it come from there, so nothing here needs translating.
import { hacks, questions } from './academyContent'

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

// kind: story (a short with a lesson), hack (a short about one hack card),
// original (a long film), howto (a feature tutorial).
// lang: the language spoken or written in the video; 'all' has no words that need reading.
export const VIDEOS = [
  { key: 'stop-loss-skydive',  kind: 'story', lang: 'en', name: 'The Stop Loss Skydive',  emoji: '🪂', hack: 1,  q: 11, youtube: '' },
  { key: 'crash-sale',         kind: 'story', lang: 'en', name: 'The Crash Sale',         emoji: '🏷️', hack: 7,  q: 20, youtube: '' },
  { key: 'breakout-concert',   kind: 'story', lang: 'en', name: 'The Breakout Concert',   emoji: '🎸', hack: 11, q: 43, youtube: '' },
  { key: 'great-moonini',      kind: 'story', lang: 'en', name: 'The Great Moonini',      emoji: '🎩', hack: 16, q: 9,  youtube: '' },
  { key: 'fear-and-greed',     kind: 'story', lang: 'en', name: 'Fear and Greed',         emoji: '😱', hack: 17, q: 27, youtube: '' },
  { key: 'leverage-the-game',  kind: 'story', lang: 'en', name: 'Leverage: The Game',     emoji: '🎮', hack: 13, q: 13, youtube: '' },
  { key: 'panic-or-wait',      kind: 'story', lang: 'en', name: 'Panic or Wait 48h',      emoji: '⏳', hack: 8,  q: 21, youtube: '' },
  { key: 'patience-pays',      kind: 'story', lang: 'en', name: 'Patience Pays',          emoji: '🌱', hack: 15, q: 22, youtube: '' },
  { key: 'the-3am-pump',       kind: 'story', lang: 'en', name: 'The 3am Pump',           emoji: '🌙', hack: 5,  q: 18, youtube: '' },
  { key: 'one-that-got-away',  kind: 'story', lang: 'en', name: 'The One That Got Away',  emoji: '🎣', hack: 4,  q: 39, youtube: '' },
  { key: 'press-conference',   kind: 'story', lang: 'en', name: 'The Press Conference',   emoji: '🎤', hack: 4,  q: 38, youtube: '' },
  { key: '3am-100x-long',      kind: 'story', lang: 'en', name: '3am, 100x Long',         emoji: '💥', hack: 13, q: 12, youtube: '' },

  { key: 'hack-buy-in-thirds',   kind: 'hack', lang: 'en', name: 'Buy in thirds',                emoji: '🎯', hack: 0, q: 8,  youtube: '' },
  { key: 'hack-check-twice',     kind: 'hack', lang: 'en', name: 'Check prices twice a day',     emoji: '🕑', hack: 5, q: 18, youtube: '' },
  { key: 'hack-48-hour-rule',    kind: 'hack', lang: 'en', name: 'The 48 hour rule',             emoji: '⏳', hack: 8, q: 21, youtube: '' },
  { key: 'hack-take-profit',     kind: 'hack', lang: 'en', name: 'Take profit on the way up',    emoji: '💰', hack: 4, q: 39, youtube: '' },
  { key: 'hack-5-percent-rule',  kind: 'hack', lang: 'en', name: 'The 5% rule',                  emoji: '🧮', hack: 3, q: 12, youtube: '' },

  { key: 'chart-checks-today', kind: 'original', lang: 'en', name: 'Chart Checks Today',   emoji: '🎬', hack: 5, q: 18, wide: true, youtube: '' },
  { key: '12-investing-hacks', kind: 'original', lang: 'en', name: '12 Investing Hacks',   emoji: '💡', hack: 15, q: 10, wide: true, youtube: '' },

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

/** Lessons the quiz and badges count: everything that teaches, not the tutorials. */
export const isLesson = (v) => v.kind !== 'howto'

/**
 * The videos ready to play, for one app language: its own language first,
 * then English, then the rest. Each carries its lesson line and question.
 */
export function academyVideos(lang = 'en', list = VIDEOS) {
  const hk = hacks(lang)
  const qs = questions(lang)
  const rank = (v) => (v.lang === lang ? 0 : v.lang === 'en' || v.lang === 'all' ? 1 : 2)
  return list
    .map(v => ({ ...v, id: youtubeId(v.youtube) }))
    .filter(v => v.id)
    // Arabic tutorials are for Arabic readers; everyone else gets English ones.
    .filter(v => v.kind !== 'howto' || v.lang === lang || (v.lang === 'en' && lang !== 'ar') || v.lang === 'all')
    .map(v => ({ ...v, lesson: v.hack != null ? hk[v.hack] : null, question: v.q != null ? qs[v.q] : null }))
    .sort((a, b) => rank(a) - rank(b))
}

/** The video for a hack card, if one is ready. */
export const videoForHack = (index, list = VIDEOS) =>
  list.find(v => v.kind === 'hack' && v.hack === index && youtubeId(v.youtube)) || null
