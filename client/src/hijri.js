// Hijri (Islamic) calendar support for the Zakat calculator.
//
// Zakat's whole timing system is lunar: the hawl is one Hijri year, and the
// due date is the Hijri anniversary of the day wealth first reached nisab.
// Doing that on Gregorian dates drifts ~11 days a year, which after a decade
// is a whole month off.
//
// No library. `Intl.DateTimeFormat` with the `islamic-umalqura` calendar has
// shipped in every browser we support for years, and Umm al-Qura is the civil
// calendar of Saudi Arabia — the one most zakat guidance is written against.
// It is a tabular calendar, so it can differ by a day from a local moon
// sighting; that is stated in the UI rather than papered over.
//
// Intl converts Gregorian → Hijri only. Going the other way is a search:
// estimate with the mean Hijri year, then walk the few days to the answer.

const MEAN_HIJRI_YEAR_DAYS = 354.367
const DAY_MS = 86400000

let _fmt = null
function fmt() {
  if (!_fmt) {
    _fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
    })
  }
  return _fmt
}

/** True when this runtime can actually do the conversion. */
export function hijriSupported() {
  try {
    const h = toHijri(new Date(Date.UTC(2024, 0, 1)))
    return h.y > 1400 && h.y < 1500 && h.m >= 1 && h.m <= 12
  } catch { return false }
}

/**
 * Gregorian Date → { y, m, d } in the Umm al-Qura calendar.
 * Read in UTC: a zakat due date is a calendar day, not an instant.
 */
export function toHijri(date) {
  const parts = fmt().formatToParts(date)
  const get = (type) => {
    const p = parts.find(x => x.type === type)
    if (!p) throw new Error('hijri: missing ' + type)
    // The year part can carry an era suffix in some ICU builds ("1445 AH").
    return parseInt(String(p.value).replace(/[^0-9]/g, ''), 10)
  }
  const y = get('year'), m = get('month'), d = get('day')
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error('hijri: unparseable conversion')
  }
  return { y, m, d }
}

/** Days in a Hijri month — 29 or 30, whichever Umm al-Qura says for that year. */
export function hijriMonthLength(y, m) {
  // Day 30 exists iff converting it back lands on the same month.
  const guess = fromHijri({ y, m, d: 30 }, { clamp: false })
  if (guess) {
    const back = toHijri(guess)
    if (back.y === y && back.m === m && back.d === 30) return 30
  }
  return 29
}

/**
 * { y, m, d } → the Gregorian Date at UTC midnight, or null if that Hijri date
 * does not exist (day 30 of a 29-day month) and clamping is off.
 *
 * Estimate then search. The estimate is never more than a couple of days out,
 * so the window is small and fixed — no unbounded loop.
 */
export function fromHijri({ y, m, d }, { clamp = true } = {}) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 30) return null

  // Anchor: 1 Muharram 1445 AH = 19 July 2023 CE.
  const ANCHOR_MS = Date.UTC(2023, 6, 19)
  const ANCHOR_HY = 1445
  const est = ANCHOR_MS
    + Math.round(((y - ANCHOR_HY) * MEAN_HIJRI_YEAR_DAYS + (m - 1) * 29.53 + (d - 1)) * DAY_MS)

  for (let off = -5; off <= 5; off++) {
    const cand = new Date(est + off * DAY_MS)
    const h = toHijri(cand)
    if (h.y === y && h.m === m && h.d === d) {
      return new Date(Date.UTC(cand.getUTCFullYear(), cand.getUTCMonth(), cand.getUTCDate()))
    }
  }
  if (!clamp) return null
  // Day 30 of a 29-day month: the anniversary falls on the last day there is.
  if (d > 29) return fromHijri({ y, m, d: 29 }, { clamp: false })
  return null
}

/**
 * The same Hijri day, `n` Hijri years later, as a Gregorian Date.
 *
 * This is the zakat due date: hawl starts the day wealth reaches nisab, and
 * falls due on that date's Hijri anniversary. Clamped, because 30 Dhul-Hijjah
 * does not exist in every year and zakat is still owed in those years.
 */
export function addHijriYears(date, n = 1) {
  const h = toHijri(date)
  return fromHijri({ y: h.y + n, m: h.m, d: h.d })
}

export const HIJRI_MONTHS = [
  'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula',
  'Jumada al-Akhirah', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal',
  'Dhul-Qadah', 'Dhul-Hijjah',
]

export const RAMADAN = 9

/** "15 Ramadan 1446 AH" — for showing the user which lunar date we mean. */
export function formatHijri(date, { locale = 'en' } = {}) {
  const h = toHijri(date)
  if (locale === 'ar') {
    return new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    }).format(date)
  }
  return `${h.d} ${HIJRI_MONTHS[h.m - 1]} ${h.y} AH`
}

/** Whole days from `from` to `to`, negative when `to` is in the past. */
export function daysBetween(from, to) {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.round((b - a) / DAY_MS)
}
