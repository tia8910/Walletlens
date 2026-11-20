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

// The same ±0.5% line the hero's mood ring uses, so the words and the colour
// never disagree about what kind of day it is.
function toneFor(pct) {
  if (pct >= 5)    return 'bigup'
  if (pct >= 0.5)  return 'up'
  if (pct <= -5)   return 'bigdown'
  if (pct <= -0.5) return 'down'
  return 'calm'
}

/**
 * What moved the portfolio today, biggest first: each holding's own dollar
 * move over 24 hours (value now minus value a day ago), from the same 24h
 * change the hero's day figure is built on.
 */
export function dayDrivers(holdings = []) {
  const out = []
  for (const h of Array.isArray(holdings) ? holdings : []) {
    const p = Number(h?.pct24h)
    const v = Number(h?.value)
    if (!Number.isFinite(p) || !(v > 0) || p <= -100) continue
    const usd = v - v / (1 + p / 100)
    if (Math.abs(usd) < 0.005) continue
    out.push({ sym: String(h.coin_symbol || h.coin_id || '').toUpperCase(), usd, pct: p, id: h.coin_id })
  }
  return out.sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd))
}

const f1 = (n) => Math.abs(n).toFixed(1)
const names = (list, L) => list.length === 1 ? list[0] : `${list[0]} ${L === 'ar' ? 'و' : 'and'} ${list[1]}`

/**
 * The line itself, built from the day: how much, who did it, and whether the
 * market (BTC) moved the same way. Returns null when there is nothing to
 * explain, so the caller falls back to the plain greeting.
 */
export function soulLine({ pct = 0, drivers = [], btcPct = null, onlyBtc = false, lang = 'en' } = {}) {
  const L = lang === 'ar' ? 'ar' : 'en'
  if (!Number.isFinite(pct) || !drivers.length) return null
  const tone = toneFor(pct)
  const total = drivers.reduce((s, d) => s + d.usd, 0)
  if (tone === 'calm') {
    const maxMove = Math.max(...drivers.map(d => Math.abs(d.pct)))
    if (maxMove < 1) {
      return L === 'ar'
        ? `ثبات اليوم (${pct >= 0 ? '+' : '-'}${f1(pct)}%). لم يتحرك أي من أصولك أكثر من 1%. يوم مناسب للتخطيط.`
        : `Flat today (${pct >= 0 ? '+' : '-'}${f1(pct)}%). Nothing you hold moved more than 1%. A quiet day to plan.`
    }
    return L === 'ar'
      ? `ثبات اليوم. المكاسب والخسائر عوّضت بعضها.`
      : `Flat today. Gains and losses cancelled each other out.`
  }
  const up = pct > 0
  // The holdings that carried the day's direction, while they still carry a
  // real share of it (a fifth or more of the total move).
  const same = drivers.filter(d => (d.usd > 0) === up)
  const lead = same.filter((d, i) => i === 0 || Math.abs(d.usd) >= Math.abs(total) * 0.2).slice(0, 2).map(d => d.sym)
  let line = L === 'ar'
    ? `${up ? 'ارتفاع' : 'انخفاض'} ${f1(pct)}% اليوم.${lead.length ? ` ${names(lead, L)} ${lead.length > 1 ? 'صنعا' : 'صنع'} معظمه.` : ''}`
    : `${up ? 'Up' : 'Down'} ${f1(pct)}% today.${lead.length ? ` ${names(lead, L)} did most of it.` : ''}`
  if (Number.isFinite(btcPct) && !onlyBtc) {
    if (up) {
      const diff = pct - btcPct
      if (Math.abs(diff) < 0.5) line += L === 'ar' ? ' بنفس وتيرة BTC.' : ' In step with BTC.'
      else if (diff > 0) line += L === 'ar' ? ` متقدم على BTC بـ ${f1(diff)}%.` : ` You are ${f1(diff)}% ahead of BTC.`
      else line += L === 'ar' ? ` BTC كان أفضل: ${btcPct >= 0 ? '+' : '-'}${f1(btcPct)}%.` : ` BTC did better, ${btcPct >= 0 ? '+' : '-'}${f1(btcPct)}%.`
    } else if (btcPct <= -1) {
      line += L === 'ar' ? ` BTC منخفض ${f1(btcPct)}% أيضاً، إنه السوق وليس أنت فقط.` : ` BTC is down ${f1(btcPct)}% too, so this is the market, not just you.`
    } else if (btcPct >= 0.5) {
      line += L === 'ar' ? ' BTC مرتفع اليوم، فهذا الانخفاض خاص بمحفظتك.' : ' BTC is up today, so this one is yours.'
    }
  }
  return line
}

// Returns { hello, line, emoji, tone } — never throws. With `drivers` the line
// explains the day; without, it falls back to the short mood lines above.
export function getSoulGreeting({ dayChangePct = 0, hour = new Date().getHours(), lang = 'en', drivers = null, btcPct = null, onlyBtc = false } = {}) {
  const L = lang === 'ar' ? 'ar' : 'en'
  const pct = Number.isFinite(dayChangePct) ? dayChangePct : 0
  const tone = toneFor(pct)
  const bucket = LINES[tone]
  const arr = bucket[L] || bucket.en
  // Rotate by calendar day so the line feels alive but doesn't flicker on refresh.
  const idx = Math.floor(Date.now() / 86_400_000) % arr.length
  let line = arr[idx]
  try {
    const explained = drivers ? soulLine({ pct, drivers, btcPct, onlyBtc, lang }) : null
    if (explained) line = explained
  } catch { /* keep the mood line */ }
  return { hello: HELLO[L][timeBand(hour)], line, emoji: bucket.emoji, tone, explained: !!drivers }
}
