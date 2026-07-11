// ── Soul: mood-aware greeting ──────────────────────────────────────────────
// One short, human line at the top of the dashboard that reacts to how the day
// is actually going. The app should *feel* something when you do: genuine
// celebration on green days, calm when flat, real empathy on red ones — never
// a robotic "Portfolio: +0.4%". Bilingual (en/ar) to match the rest of the app.
// Pure function, no side effects, safe to call on every render.

function timeBand(hour) {
  if (hour < 5)  return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 22) return 'evening'
  return 'night'
}

const HELLO = {
  en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Still up' },
  ar: { morning: 'صباح الخير',   afternoon: 'مساء الخير',     evening: 'مساء الخير',   night: 'سهرة سعيدة' },
}

// Tone buckets keyed by the day's move. Each has a couple of lines so the
// greeting quietly changes day to day while staying stable within a day.
const LINES = {
  bigup: {
    emoji: 'rocket',
    en: ["your portfolio's flying today.", 'huge green day — enjoy it.'],
    ar: ['محفظتك تطير اليوم.', 'يوم أخضر كبير — استمتع به.'],
  },
  up: {
    emoji: 'sprout',
    en: ['green on the board — nice.', 'up today. small wins add up.'],
    ar: ['أخضر اليوم — جميل.', 'ارتفاع اليوم. المكاسب الصغيرة تتراكم.'],
  },
  calm: {
    emoji: 'sun',
    en: ['markets are quiet — a good day to plan.', 'steady today. zoom out and breathe.'],
    ar: ['السوق هادئ — يوم مناسب للتخطيط.', 'ثبات اليوم. تنفّس وفكّر على المدى البعيد.'],
  },
  down: {
    emoji: 'droplet',
    en: ['a little red today — it happens.', "down a touch. you've seen worse."],
    ar: ['بعض الأحمر اليوم — هذا وارد.', 'انخفاض بسيط. مررت بما هو أصعب.'],
  },
  bigdown: {
    emoji: 'waves',
    en: ["rough day — zoom out, you're in this for the long game.", 'red everywhere. breathe; this passes.'],
    ar: ['يوم صعب — انظر بعيداً، أنت مستثمر طويل الأمد.', 'أحمر في كل مكان. تنفّس؛ سيمرّ.'],
  },
}

function toneFor(pct) {
  if (pct >= 5)  return 'bigup'
  if (pct >= 1)  return 'up'
  if (pct <= -5) return 'bigdown'
  if (pct <= -1) return 'down'
  return 'calm'
}

// Returns { hello, line, emoji, tone } — never throws.
export function getSoulGreeting({ dayChangePct = 0, hour = new Date().getHours(), lang = 'en' } = {}) {
  const L = lang === 'ar' ? 'ar' : 'en'
  const pct = Number.isFinite(dayChangePct) ? dayChangePct : 0
  const tone = toneFor(pct)
  const bucket = LINES[tone]
  const arr = bucket[L] || bucket.en
  // Rotate by calendar day so the line feels alive but doesn't flicker on refresh.
  const idx = Math.floor(Date.now() / 86_400_000) % arr.length
  return { hello: HELLO[L][timeBand(hour)], line: arr[idx], emoji: bucket.emoji, tone }
}
