/**
 * Pure notification logic, shared by the push service and its tests.
 *
 * Deliberately free of Deno APIs, npm imports and browser globals: `main.ts`
 * runs this on Deno Deploy, and `client/src/pushLogic.test.js` runs the very
 * same file under vitest in Node. Anything that touches KV, fetch or web-push
 * lives in main.ts — this module only decides *whether* and *what* to send.
 *
 * The reason it exists: the cron that decides a user is idle, or that BTC has
 * moved enough to be worth a lock-screen buzz, runs on a server with no test
 * harness. Those rules are exactly the ones that are embarrassing to get
 * wrong — a bad threshold spams every user at once, and a bad quiet-hours
 * calculation wakes them at 3am. So they live here, in plain JS, tested.
 */

// ── Languages ───────────────────────────────────────────────────────────────
// Must stay in sync with client/src/LanguageContext.jsx. An unknown code falls
// back to English rather than throwing, so a missing language is silent — the
// test suite checks every channel has copy in every language for that reason.
export const LANGS = ['en', 'ar', 'fr', 'es']

export function asLang(raw) {
  return typeof raw === 'string' && LANGS.includes(raw) ? raw : undefined
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** Percentages read better without false precision: 4.2%, but 12% not 12.3%. */
export function fmtPct(n) {
  const a = Math.abs(Number(n) || 0)
  return a >= 10 ? a.toFixed(0) : a.toFixed(1)
}

/** Prices span BTC ($100k) to SHIB ($0.00002); one formatter for both. */
export function fmtPrice(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v >= 1000) return '$' + Math.round(v).toLocaleString('en-US')
  if (v >= 1) return '$' + v.toFixed(2)
  if (v >= 0.01) return '$' + v.toFixed(4)
  return '$' + v.toPrecision(2)
}

// ── Notification copy ───────────────────────────────────────────────────────
// The crons run on the server, so the text is built on the server, which means
// the four languages live here as well as in the client's i18n.js. There is no
// way around the duplication without shipping the whole translation table to
// Deno Deploy, and these are short strings.
export const COPY = {
  // — Price targets the user set explicitly (pre-existing channel) —
  targetTitle: {
    en: (dir, sym) => `${dir} ${sym} hit your target`,
    ar: (dir, sym) => `${dir} بلغ ${sym} هدفك`,
    fr: (dir, sym) => `${dir} ${sym} a atteint votre objectif`,
    es: (dir, sym) => `${dir} ${sym} ha alcanzado tu objetivo`,
  },
  targetBody: {
    en: (sym, cond, target, now) =>
      `${sym} is ${cond === 'above' ? 'above' : 'below'} $${target} — now $${now}.`,
    ar: (sym, cond, target, now) =>
      `${sym} ${cond === 'above' ? 'فوق' : 'تحت'} ${target} دولار — والسعر الآن ${now} دولار.`,
    fr: (sym, cond, target, now) =>
      `${sym} est ${cond === 'above' ? 'au-dessus' : 'en dessous'} de ${target} $ — désormais à ${now} $.`,
    es: (sym, cond, target, now) =>
      `${sym} está ${cond === 'above' ? 'por encima' : 'por debajo'} de ${target} $: ahora ${now} $.`,
  },

  // — Test push from Settings —
  testTitle: {
    en: () => '🔔 WalletLens notifications are on',
    ar: () => '🔔 تم تفعيل إشعارات WalletLens',
    fr: () => '🔔 Les notifications WalletLens sont activées',
    es: () => '🔔 Las notificaciones de WalletLens están activadas',
  },
  testBody: {
    en: () => 'Price moves, news on your assets and target alerts will now reach you even when the app is closed.',
    ar: () => 'ستصلك تحركات الأسعار وأخبار أصولك وتنبيهات الأهداف حتى عندما يكون التطبيق مغلقاً.',
    fr: () => 'Les mouvements de prix, l’actualité de vos actifs et vos alertes vous parviendront même application fermée.',
    es: () => 'Los movimientos de precio, las noticias de tus activos y tus alertas te llegarán aunque la app esté cerrada.',
  },

  // — A holding moved sharply —
  moveTitle: {
    en: (sym, pct, up) => `${up ? '📈' : '📉'} ${sym} ${up ? 'up' : 'down'} ${pct}%`,
    ar: (sym, pct, up) => `${up ? '📈' : '📉'} ${sym} ${up ? 'يرتفع' : 'ينخفض'} ${pct}%`,
    fr: (sym, pct, up) => `${up ? '📈' : '📉'} ${sym} ${up ? 'en hausse' : 'en baisse'} de ${pct} %`,
    es: (sym, pct, up) => `${up ? '📈' : '📉'} ${sym} ${up ? 'sube' : 'baja'} un ${pct} %`,
  },
  moveBody: {
    en: (sym, pct, price, up) => `${sym} moved ${up ? '+' : '−'}${pct}% to ${price}. Tap to see the impact on your portfolio.`,
    ar: (sym, pct, price, up) => `تحرك ${sym} بنسبة ${up ? '+' : '−'}${pct}% إلى ${price}. اضغط لرؤية الأثر على محفظتك.`,
    fr: (sym, pct, price, up) => `${sym} a bougé de ${up ? '+' : '−'}${pct} % à ${price}. Touchez pour voir l’effet sur votre portefeuille.`,
    es: (sym, pct, price, up) => `${sym} se movió ${up ? '+' : '−'}${pct} % hasta ${price}. Toca para ver el efecto en tu cartera.`,
  },

  // — Breaking news mentioning an asset the user holds —
  newsTitle: {
    en: (sym) => `📰 ${sym} in the news`,
    ar: (sym) => `📰 ${sym} في الأخبار`,
    fr: (sym) => `📰 ${sym} dans l’actualité`,
    es: (sym) => `📰 ${sym} en las noticias`,
  },
  newsBody: {
    en: (headline) => headline,
    ar: (headline) => headline,
    fr: (headline) => headline,
    es: (headline) => headline,
  },

  // — Daily brief, sent once each morning in the user's own timezone —
  digestTitle: {
    en: () => '☀️ Your market brief',
    ar: () => '☀️ موجز السوق الخاص بك',
    fr: () => '☀️ Votre point marché',
    es: () => '☀️ Tu resumen de mercado',
  },
  digestBody: {
    en: (sym, pct, up, count) => `Biggest mover: ${sym} ${up ? '+' : '−'}${pct}% over 24h, across your ${count} tracked ${count === 1 ? 'asset' : 'assets'}.`,
    ar: (sym, pct, up, count) => `أكبر تحرك: ${sym} ${up ? '+' : '−'}${pct}% خلال ٢٤ ساعة، من بين ${count} من أصولك المتابَعة.`,
    fr: (sym, pct, up, count) => `Plus fort mouvement : ${sym} ${up ? '+' : '−'}${pct} % sur 24 h, parmi vos ${count} actifs suivis.`,
    es: (sym, pct, up, count) => `Mayor movimiento: ${sym} ${up ? '+' : '−'}${pct} % en 24 h, entre tus ${count} activos seguidos.`,
  },


  // — Feature tips. One-off, each gated on the user's own state (FEATURE_TIPS) —
  featTargetsTitle: {
    en: () => '🎯 Get told the moment your price is hit',
    ar: () => '🎯 اعرف لحظة بلوغ سعرك',
    fr: () => '🎯 Soyez pr\u00e9venu d\u00e8s que votre prix est atteint',
    es: () => '🎯 Ent\u00e9rate en cuanto se alcance tu precio',
  },
  featTargetsBody: {
    en: (sym) => `Set a target on ${sym} and WalletLens will alert you the moment it hits — no need to keep checking.`,
    ar: (sym) => `حدّد هدفاً لـ ${sym} وسينبّهك WalletLens لحظة بلوغه — دون الحاجة إلى المتابعة المستمرة.`,
    fr: (sym) => `D\u00e9finissez un objectif sur ${sym} et WalletLens vous alertera d\u00e8s qu\u2019il est atteint, sans v\u00e9rifier sans cesse.`,
    es: (sym) => `Fija un objetivo en ${sym} y WalletLens te avisar\u00e1 en cuanto se alcance, sin tener que mirar a cada rato.`,
  },

  featDiversifyTitle: {
    en: () => '📊 See your whole net worth',
    ar: () => '📊 اطّلع على صافي ثروتك كاملاً',
    fr: () => '📊 Voyez tout votre patrimoine',
    es: () => '📊 Mira tu patrimonio completo',
  },
  featDiversifyBody: {
    en: () => 'Add the rest of what you own — crypto, stocks, gold and cash — for one live view of your net worth.',
    ar: () => 'أضف بقية ما تملك — العملات الرقمية والأسهم والذهب والنقد — للحصول على عرض حيّ واحد لصافي ثروتك.',
    fr: () => 'Ajoutez le reste de ce que vous poss\u00e9dez \u2014 crypto, actions, or et liquidit\u00e9s \u2014 pour une vue unique et en direct.',
    es: () => 'A\u00f1ade el resto de lo que tienes \u2014 cripto, acciones, oro y efectivo \u2014 para una \u00fanica vista en vivo.',
  },

  featMultiassetTitle: {
    en: () => '🏦 WalletLens tracks more than crypto',
    ar: () => '🏦 WalletLens يتتبّع أكثر من العملات الرقمية',
    fr: () => '🏦 WalletLens ne suit pas que la crypto',
    es: () => '🏦 WalletLens no solo rastrea cripto',
  },
  featMultiassetBody: {
    en: () => 'Stocks, gold, silver, cash and real estate sit alongside your coins — one net-worth dashboard, still no account.',
    ar: () => 'الأسهم والذهب والفضة والنقد والعقارات إلى جانب عملاتك — لوحة واحدة لصافي الثروة، وبلا حساب.',
    fr: () => 'Actions, or, argent, liquidit\u00e9s et immobilier c\u00f4toient vos cryptos \u2014 un seul tableau de bord, toujours sans compte.',
    es: () => 'Acciones, oro, plata, efectivo e inmuebles junto a tus monedas: un solo panel, y sin cuenta.',
  },

  // — Win-back for users who stopped opening the app —
  retentionTitle: {
    en: (step) => step <= 3 ? 'Markets moved while you were away'
      : step <= 7 ? 'A week of market moves'
      : step <= 14 ? 'Two weeks — here’s what changed'
      : step <= 30 ? 'Your watchlist is still running'
      : 'We kept tracking for you',
    ar: (step) => step <= 3 ? 'تحركت الأسواق أثناء غيابك'
      : step <= 7 ? 'أسبوع من تحركات السوق'
      : step <= 14 ? 'أسبوعان — إليك ما تغيّر'
      : step <= 30 ? 'قائمة متابعتك ما زالت تعمل'
      : 'واصلنا التتبع نيابةً عنك',
    fr: (step) => step <= 3 ? 'Les marchés ont bougé pendant votre absence'
      : step <= 7 ? 'Une semaine de mouvements'
      : step <= 14 ? 'Deux semaines — voici ce qui a changé'
      : step <= 30 ? 'Votre liste de suivi tourne toujours'
      : 'Nous avons continué à suivre pour vous',
    es: (step) => step <= 3 ? 'Los mercados se movieron mientras no estabas'
      : step <= 7 ? 'Una semana de movimientos'
      : step <= 14 ? 'Dos semanas: esto ha cambiado'
      : step <= 30 ? 'Tu lista de seguimiento sigue activa'
      : 'Seguimos haciendo el seguimiento por ti',
  },
  /** Used when we know how one of their assets actually moved — far stronger. */
  retentionMoverBody: {
    en: (sym, pct, up) => `${sym} is ${up ? 'up' : 'down'} ${pct}% since your last visit. See what it did to your portfolio.`,
    ar: (sym, pct, up) => `${sym} ${up ? 'مرتفع' : 'منخفض'} بنسبة ${pct}% منذ آخر زيارة. شاهد أثر ذلك على محفظتك.`,
    fr: (sym, pct, up) => `${sym} est ${up ? 'en hausse' : 'en baisse'} de ${pct} % depuis votre dernière visite. Voyez l’effet sur votre portefeuille.`,
    es: (sym, pct, up) => `${sym} ${up ? 'sube' : 'baja'} un ${pct} % desde tu última visita. Mira el efecto en tu cartera.`,
  },
}

// ── Significance: what earns an interruption ────────────────────────────────
// Every notification has to be able to answer "why now?" with something that
// happened, not with a timer having elapsed. A scheduled slot is permission to
// *look* for a reason — never a reason in itself. If nothing cleared these
// bars, the right output is silence.
//
// This is why there is no "markets are calm" digest and no "your assets have
// new prices" nudge: both are notifications whose entire content is that
// nothing happened, and they train people to swipe without reading — which
// costs us the alerts that do matter.

// ── Feature tips ────────────────────────────────────────────────────────────
// Telling someone about a feature is only worth an interruption when their own
// state says they would benefit and are not already using it. That is the same
// "reason" test the other channels apply — the trigger is a fact about this
// user, never a slot in a rotation.
//
// This is deliberately NOT the old Android worker reborn. That cycled canned
// tips on a 30-minute timer regardless of who was reading. Here each tip fires
// at most ONCE EVER, at most one per week, only while its precondition holds,
// and only from the narrow state the server legitimately knows: how many assets
// are tracked, of what kind, and how many price targets are set. There is no
// usage tracking behind these, and there must not be.
//
// If you want to add a tip and cannot express its trigger as a fact about the
// user, it does not belong here.

/** At most one tip a week, however many preconditions are true at once. */
export const FEATURE_TIP_GAP_MS = 7 * 24 * 60 * 60 * 1000

export const FEATURE_TIPS = [
  {
    // Holdings but no price targets: the single highest-value thing they are
    // not using, and the channel most likely to bring them back on its own.
    id: 'targets',
    url: '/dashboard?tab=alerts',
    when: (st) => st.watchCount > 0 && st.alertCount === 0,
  },
  {
    // One asset is a tracker they have not finished setting up.
    id: 'diversify',
    url: '/dashboard',
    when: (st) => st.watchCount === 1,
  },
  {
    // Several assets, all crypto — most people in that position do not know
    // this tracks stocks, metals and cash in the same net-worth view.
    id: 'multiasset',
    url: '/dashboard',
    when: (st) => st.watchCount >= 3 && st.kinds.length === 1 && st.kinds[0] === 'crypto',
  },
]

/**
 * The next feature tip worth sending, or null.
 *
 * @param {{watchCount:number, alertCount:number, kinds:string[]}} state
 * @param {string[]} sentIds  tips already sent to this subscription, ever
 */
export function pickFeatureTip(state, sentIds) {
  const sent = new Set(sentIds || [])
  for (const tip of FEATURE_TIPS) {
    if (sent.has(tip.id)) continue
    try { if (tip.when(state)) return tip } catch { /* a bad predicate sends nothing */ }
  }
  return null
}

/** A holding that moved this much in 24h is worth a line in the brief. */
export const DIGEST_MIN_PCT = 3

/** A win-back has to lead with something worth coming back for. */
export const RETENTION_MIN_PCT = 5

/**
 * The single most notable mover in a set, or null when nothing clears the bar.
 * Null means: say nothing at all.
 *
 * @param {Array<{symbol:string, pct:number}>} moves
 * @param {number} minPct
 */
export function pickHeadline(moves, minPct) {
  let best = null
  for (const m of moves || []) {
    const pct = Number(m?.pct)
    if (!Number.isFinite(pct) || Math.abs(pct) < minPct) continue
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { symbol: m.symbol, pct }
  }
  return best
}

/** Pick a copy function for a language, falling back to English. */
export function copy(key, lang) {
  const table = COPY[key]
  if (!table) throw new Error(`unknown copy key: ${key}`)
  const chosen = lang && lang !== 'en' ? table[lang] : table.en
  return chosen ?? table.en
}

// ── Preferences ─────────────────────────────────────────────────────────────
// Every channel is individually switchable, and all of them start on.
//
// `digest` used to default off, on the reasoning that a daily scheduled buzz is
// the one people resent most. That reasoning no longer applies to this channel:
// the brief only sends when a holding has actually moved (DIGEST_MIN_PCT), so a
// quiet week is a silent week. What it defaults to is "tell me when something
// happens", which is what someone with a portfolio wants — and quiet hours and
// the daily budget still bound it.
export const DEFAULT_PREFS = {
  moves: true,      // a holding swings sharply
  news: true,       // breaking news naming a holding
  digest: true,     // morning brief — only sends when something actually moved
  retention: true,  // win-back nudges while idle
  features: true,   // one-off tips, each gated on the user's own state
  movePct: 5,       // swing threshold, percent
  quiet: true,      // hold non-urgent pushes overnight
}

const MIN_MOVE_PCT = 1
const MAX_MOVE_PCT = 50

export function sanitizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const bool = (v, d) => (typeof v === 'boolean' ? v : d)
  let pct = Number(p.movePct)
  if (!Number.isFinite(pct)) pct = DEFAULT_PREFS.movePct
  pct = Math.min(MAX_MOVE_PCT, Math.max(MIN_MOVE_PCT, pct))
  return {
    moves: bool(p.moves, DEFAULT_PREFS.moves),
    news: bool(p.news, DEFAULT_PREFS.news),
    digest: bool(p.digest, DEFAULT_PREFS.digest),
    retention: bool(p.retention, DEFAULT_PREFS.retention),
    features: bool(p.features, DEFAULT_PREFS.features),
    movePct: pct,
    quiet: bool(p.quiet, DEFAULT_PREFS.quiet),
  }
}

// ── Watch list ──────────────────────────────────────────────────────────────
// What the server is told about a portfolio: which assets, and nothing else.
// No amounts, no cost basis, no total value — the notification copy never
// needs them, so they never leave the device.
export const MAX_WATCH = 40
const KINDS = ['crypto', 'stock', 'metal']

export function sanitizeWatch(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const w of raw) {
    if (out.length >= MAX_WATCH) break
    const id = String(w?.id ?? '').trim().slice(0, 80).toLowerCase()
    const symbol = String(w?.symbol ?? '').trim().slice(0, 20).toUpperCase()
    const kind = KINDS.includes(w?.kind) ? w.kind : 'crypto'
    if (!id || !symbol) continue
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id, symbol, kind })
  }
  return out
}

// ── Price-target alerts (pre-existing shape) ────────────────────────────────
export const MAX_ALERTS = 50

export function sanitizeAlerts(raw) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_ALERTS).flatMap(a => {
    const id = String(a?.id ?? '').slice(0, 40)
    const coin_id = String(a?.coin_id ?? '').slice(0, 80)
    const coin_symbol = String(a?.coin_symbol ?? '').slice(0, 20)
    const condition = a?.condition === 'below' ? 'below' : 'above'
    const targetPrice = Number(a?.targetPrice)
    if (!id || !coin_id || !Number.isFinite(targetPrice) || targetPrice <= 0) return []
    return [{ id, coin_id, coin_symbol, condition, targetPrice }]
  })
}

// ── Timezone, quiet hours, daily budget ─────────────────────────────────────
// The device reports its UTC offset in minutes so the server can reason about
// the user's clock. Anything outside a real-world offset range is a bug or an
// attack, and defaulting such a device to UTC is better than pushing at 4am.
const MIN_TZ = -12 * 60
const MAX_TZ = 14 * 60

export function sanitizeTz(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  const r = Math.round(n)
  return r >= MIN_TZ && r <= MAX_TZ ? r : 0
}

/** Hour 0–23 on the user's own clock. */
export function localHour(nowMs, tzOffsetMin) {
  const shifted = nowMs + sanitizeTz(tzOffsetMin) * 60_000
  return Math.floor(shifted / 3_600_000) % 24
}

/** Calendar day on the user's own clock, for once-a-day gates. */
export function localDayKey(nowMs, tzOffsetMin) {
  const shifted = nowMs + sanitizeTz(tzOffsetMin) * 60_000
  return new Date(shifted).toISOString().slice(0, 10)
}

export const QUIET_START_HOUR = 22  // 22:00 local — stop
export const QUIET_END_HOUR = 8     // 08:00 local — resume

/** True while the user is probably asleep. Never applied to their own targets. */
export function inQuietHours(nowMs, tzOffsetMin) {
  const h = localHour(nowMs, tzOffsetMin)
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR
}

/**
 * The single most important guard in this file. Automated channels share one
 * daily budget so that a volatile day can't turn into forty buzzes — the
 * fastest way to lose the notification permission for good.
 */
export const DAILY_PUSH_BUDGET = 6

export function withinDailyBudget(quota, nowMs, tzOffsetMin, budget = DAILY_PUSH_BUDGET) {
  const day = localDayKey(nowMs, tzOffsetMin)
  if (!quota || quota.day !== day) return true
  return (quota.n || 0) < budget
}

export function bumpQuota(quota, nowMs, tzOffsetMin) {
  const day = localDayKey(nowMs, tzOffsetMin)
  if (!quota || quota.day !== day) return { day, n: 1 }
  return { day, n: (quota.n || 0) + 1 }
}

// ── Movement detection ──────────────────────────────────────────────────────
// A rolling reference price per asset, rebased whenever it fires or ages out.
// Rebasing on fire is what stops a steady climb from re-firing every cycle;
// rebasing after a day is what stops a week-old reference from making a normal
// market look like a crash.
export const MOVE_REF_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const MOVE_COOLDOWN_MS = 3 * 60 * 60 * 1000

export function evaluateMove({ price, ref, thresholdPct, now, lastFired = 0, cooldownMs = MOVE_COOLDOWN_MS }) {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return { fire: false, changePct: 0, nextRef: ref ?? null }

  // First sighting of this asset — start the window, say nothing.
  if (!ref || !Number.isFinite(ref.price) || ref.price <= 0) {
    return { fire: false, changePct: 0, nextRef: { price: p, ts: now } }
  }

  const changePct = ((p - ref.price) / ref.price) * 100

  if (Math.abs(changePct) >= thresholdPct) {
    // Threshold crossed, but a recent buzz about this same asset outranks it.
    if (now - lastFired < cooldownMs) return { fire: false, changePct, nextRef: ref }
    return { fire: true, changePct, nextRef: { price: p, ts: now } }
  }

  if (now - (ref.ts || 0) > MOVE_REF_MAX_AGE_MS) {
    return { fire: false, changePct, nextRef: { price: p, ts: now } }
  }
  return { fire: false, changePct, nextRef: ref }
}

// ── News matching ───────────────────────────────────────────────────────────
// Symbols that are also ordinary English words, or news-page furniture. Left
// unfiltered, "GAS prices" and "ONE more thing" push a crypto alert to anyone
// holding those tickers, and the channel loses all credibility.
const AMBIGUOUS_SYMBOLS = new Set([
  'all', 'any', 'one', 'two', 'for', 'not', 'can', 'the', 'and', 'you', 'new',
  'now', 'top', 'buy', 'win', 'get', 'use', 'max', 'big', 'hot', 'key', 'pay',
  'own', 'run', 'gas', 'ai', 'id', 'it', 'is', 'on', 'up', 'go', 'are', 'ceo',
  'usa', 'fed', 'etf', 'nft', 'ath', 'api', 'app', 'job', 'war', 'oil', 'gdp',
  'cpi', 'ipo', 'sec', 'irs', 'eur', 'usd', 'gbp', 'day', 'year', 'time',
])

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Search terms for one watched asset. The symbol is used only when it is
 * unambiguous; the CoinGecko id ("avalanche-2" → "avalanche") is the safer
 * signal and is always included when it is a real word.
 */
export function termsFor(asset) {
  const terms = []
  const sym = String(asset?.symbol || '').toLowerCase()
  if (sym.length >= 3 && !AMBIGUOUS_SYMBOLS.has(sym)) terms.push(sym)

  const name = String(asset?.id || '').replace(/-\d+$/, '').replace(/-/g, ' ').toLowerCase()
  if (name.length >= 4 && !AMBIGUOUS_SYMBOLS.has(name) && name !== sym) terms.push(name)

  return terms
}

/**
 * The first watched asset an article is about, or null.
 * Word-boundary matching on purpose: `\bsol\b` must not fire on "solar".
 */
export function matchArticle(article, watch) {
  const hay = `${article?.title || ''} ${article?.description || ''}`.toLowerCase()
  if (!hay.trim()) return null
  for (const asset of watch || []) {
    for (const term of termsFor(asset)) {
      if (new RegExp(`\\b${escapeRe(term)}\\b`).test(hay)) return asset
    }
  }
  return null
}

/** Only genuinely fresh stories are worth a lock-screen interrupt. */
export const NEWS_MAX_AGE_MS = 2 * 60 * 60 * 1000

export function isBreaking(article, now, maxAgeMs = NEWS_MAX_AGE_MS) {
  const ts = Date.parse(article?.pubDate || '')
  if (!Number.isFinite(ts)) return false
  const age = now - ts
  // Feeds occasionally carry clock-skewed future dates; treat a small lead as
  // "just published" and anything wilder as untrustworthy.
  if (age < -10 * 60 * 1000) return false
  return age <= maxAgeMs
}

/** One news push per user per this window, however many stories match. */
export const NEWS_COOLDOWN_MS = 4 * 60 * 60 * 1000

/**
 * Compact, stable key for a story URL. Only used to remember what has already
 * been sent, so a fast non-cryptographic hash is the right tool — collisions
 * cost one skipped notification, not a security property.
 */
export function shortHash(s) {
  let h = 5381
  const str = String(s)
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/**
 * Drop expired entries from a `key → timestamp` record. Without this, the
 * seen-story map on a long-lived subscription grows until the KV value stops
 * fitting, which fails the write and silently freezes that user's alerts.
 */
export function pruneSent(map, now, maxAgeMs) {
  const out = {}
  for (const [k, ts] of Object.entries(map || {})) {
    if (Number.isFinite(ts) && now - ts < maxAgeMs) out[k] = ts
  }
  return out
}

// ── Retention ladder ────────────────────────────────────────────────────────
// Escalating, then stopping. Someone who has ignored five nudges over two
// months is not going to be won back by a sixth, and continuing to buzz them
// is how an app gets its notifications switched off system-wide.
export const RETENTION_STEPS = [3, 7, 14, 30, 60]
export const RETENTION_HOUR = 10  // 10:00 on the user's own clock

/**
 * Which win-back step is due, or null. Steps fire at most once each; coming
 * back to the app clears the record, so the ladder restarts on the next lapse.
 */
export function dueRetentionStep({ lastSeen, now, sentSteps = [] }) {
  if (!Number.isFinite(lastSeen) || lastSeen <= 0) return null
  const idleDays = (now - lastSeen) / 86_400_000
  if (idleDays < RETENTION_STEPS[0]) return null

  const done = new Set(sentSteps.map(Number))
  // Highest step they have earned but not yet been sent — so a user who
  // installs, vanishes for 40 days and gets one push, not four in a row.
  let due = null
  for (const step of RETENTION_STEPS) {
    if (idleDays >= step && !done.has(step)) due = step
  }
  return due
}

// ── Deep links ──────────────────────────────────────────────────────────────
// Where each channel drops the user. Every one of these must be a real route:
// the previous version pointed price targets at "/watchlist", which the app has
// never had, so every target alert landed on the 404 page.
//
// The dashboard's tabs are addressed with ?tab= rather than router state,
// because a notification opened from the lock screen is a cold navigation and
// carries nothing but a URL.
export const CHANNEL_URL = {
  target: '/dashboard?tab=alerts',
  move: '/dashboard',
  news: '/dashboard',
  digest: '/dashboard',
  retention: '/dashboard',
  feature: '/dashboard',
  test: '/settings',
}

// ── Delivery semantics ──────────────────────────────────────────────────────
// How the push *service* is told to treat each message, which is a different
// question from whether we decided to send it. This matters precisely because
// the app is closed: on a locked, dozing Android phone, Chrome's FCM channel
// holds normal-urgency messages until the next maintenance window, which can be
// hours. A price alert that arrives late is worse than useless — the price has
// moved on and the user acts on a number that no longer exists.
//
// TTL is the other half. web-push defaults to FOUR WEEKS, so a phone that is
// off for a few days would come back and be told about a target crossed last
// Tuesday. Time-sensitive channels expire fast; a win-back nudge can wait,
// because it is not about a number.
//
//   urgency  high      wakes the device out of Doze
//            normal    delivered on the next radio activity
//            low       batched with whatever else is pending
export const CHANNEL_DELIVERY = {
  target:    { urgency: 'high',   ttl: 60 * 60 },       // 1h — about a price
  move:      { urgency: 'high',   ttl: 60 * 60 },       // 1h — about a price
  news:      { urgency: 'normal', ttl: 2 * 60 * 60 },   // 2h — story goes stale
  digest:    { urgency: 'low',    ttl: 4 * 60 * 60 },   // stale after the morning
  retention: { urgency: 'low',    ttl: 12 * 60 * 60 },  // no hurry by definition
  feature:   { urgency: 'low',    ttl: 24 * 60 * 60 },  // useful whenever it lands
  test:      { urgency: 'high',   ttl: 60 },            // immediate or not at all
}

const DEFAULT_DELIVERY = { urgency: 'normal', ttl: 60 * 60 }

export function deliveryFor(channel) {
  return CHANNEL_DELIVERY[channel] ?? DEFAULT_DELIVERY
}

/**
 * A push-service Topic for a notification tag.
 *
 * Topic makes the push service keep only the newest undelivered message per
 * topic per subscription. For a phone that has been offline, that is the
 * difference between unlocking to one current "BTC -7%" and unlocking to five
 * stale ones from the same afternoon.
 *
 * RFC 8030 restricts it to the URL-safe base64 alphabet, max 32 chars, and
 * web-push *throws* on anything else — so tags like "move-crypto:bitcoin" have
 * to be scrubbed before they go anywhere near a header.
 */
export function pushTopic(tag) {
  const clean = String(tag ?? '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32)
  // A tag of nothing but separators ("🚀" scrubs to "--") is legal for the
  // header but carries no identity, and two unrelated notifications sharing it
  // would silently replace each other in an offline device's queue. No topic
  // is better than a wrong one: without it, both are simply delivered.
  return /[A-Za-z0-9]/.test(clean) ? clean : undefined
}

/**
 * Build the payload the service worker renders. `channel` travels with it so
 * the client can attribute opens, and `url` is resolved from the channel
 * unless the caller overrides it.
 */
export function buildPayload({ channel, title, body, tag, url, sym }) {
  return {
    title,
    body,
    tag: tag || channel,
    url: url || CHANNEL_URL[channel] || '/',
    channel,
    ...(sym ? { sym } : {}),
  }
}
