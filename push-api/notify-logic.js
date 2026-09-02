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
export const LANGS = ['en', 'ar', 'fr', 'es', 'de', 'it']

export function asLang(raw) {
  return typeof raw === 'string' && LANGS.includes(raw) ? raw : undefined
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** Percentages read better without false precision: 4.2%, but 12% not 12.3%. */
export function fmtPct(n) {
  const a = Math.abs(Number(n) || 0)
  return a >= 10 ? a.toFixed(0) : a.toFixed(1)
}

/**
 * A percentage that carries its own direction: '+3.2%', '−5%'.
 *
 * fmtPct deliberately drops the sign, because its callers used to put the
 * direction into a translated word ("up", "en hausse"). A price line reads
 * better the way an exchange writes it — sign, number, unit — and it reads the
 * SAME in every language, which is the point: a headline built from a symbol,
 * a signed number and a price has nothing in it that can be mistranslated.
 *
 * U+2212 MINUS, not a hyphen. At notification size a hyphen beside a digit is
 * easy to read as a dash or to miss altogether, and mistaking −5% for +5% is
 * the single worst thing this text can do.
 */
export function signedPct(n) {
  const v = Number(n) || 0
  return `${v < 0 ? '−' : '+'}${fmtPct(v)}%`
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
  // — The one sent the moment notifications are switched on —
  //
  // It is a welcome and a test at once, and the test half is the point: it is
  // the only proof the user ever gets that the whole path works — permission,
  // token, server, FCM, and the channel the app posts on. Without it "enabled"
  // is a toggle position, and the first real notification might be days away.
  welcomeTitle: {
    en: () => 'Notifications are on',
    ar: () => 'تم تفعيل الإشعارات',
    fr: () => 'Notifications activées',
    es: () => 'Notificaciones activadas',
    de: () => 'Benachrichtigungen sind an',
    it: () => 'Notifiche attive',
  },
  welcomeBody: {
    en: () => 'This is what they look like. We’ll tell you when your assets move, and nothing else.',
    ar: () => 'هكذا ستبدو. سنخبرك عند تحرّك أصولك، ولا شيء غير ذلك.',
    fr: () => 'Voilà à quoi elles ressemblent. Nous vous préviendrons quand vos actifs bougent, et rien d’autre.',
    es: () => 'Así se ven. Te avisaremos cuando tus activos se muevan, y nada más.',
    de: () => 'So sehen sie aus. Wir melden uns, wenn sich deine Werte bewegen — sonst nicht.',
    it: () => 'Ecco come appaiono. Ti avviseremo quando i tuoi asset si muovono, e nient’altro.',
  },

  // — Price targets the user set explicitly (pre-existing channel) —
  // The target the user set is the event; the price it reached is the number
  // they want. Both in the title — a target alert that makes you open the app
  // to find out what the price actually is has buried its own headline.
  targetTitle: {
    en: (dir, sym, price) => `${dir} ${sym} hit your target · ${price}`,
    ar: (dir, sym, price) => `${dir} بلغ ${sym} هدفك · ${price}`,
    fr: (dir, sym, price) => `${dir} ${sym} a atteint votre objectif · ${price}`,
    es: (dir, sym, price) => `${dir} ${sym} ha alcanzado tu objetivo · ${price}`,
    de: (dir, sym, price) => `${dir} ${sym} hat Ihr Ziel erreicht · ${price}`,
    it: (dir, sym, price) => `${dir} ${sym} ha raggiunto il tuo obiettivo · ${price}`,
  },
  // The current price moved up into the title, so the body stops repeating it
  // and says the two things left: which target this was, and how the day has
  // gone. `target` arrives pre-formatted by fmtPrice now — it used to be a raw
  // number with a '$' glued on, which wrote "$1e-7" for a sub-cent token and
  // "$103500" without a separator for gold.
  targetBody: {
    en: (sym, cond, target, day) =>
      `Target ${cond === 'above' ? 'above' : 'below'} ${target} · ${sym} over 24h: ${day}`,
    ar: (sym, cond, target, day) =>
      `الهدف ${cond === 'above' ? 'فوق' : 'تحت'} ${target} · ${sym} خلال ٢٤ ساعة: ${day}`,
    fr: (sym, cond, target, day) =>
      `Objectif ${cond === 'above' ? 'au-dessus de' : 'en dessous de'} ${target} · ${sym} sur 24 h : ${day}`,
    es: (sym, cond, target, day) =>
      `Objetivo ${cond === 'above' ? 'por encima de' : 'por debajo de'} ${target} · ${sym} en 24 h: ${day}`,
    de: (sym, cond, target, day) =>
      `Ziel ${cond === 'above' ? 'über' : 'unter'} ${target} · ${sym} in 24 Std.: ${day}`,
    it: (sym, cond, target, day) =>
      `Obiettivo ${cond === 'above' ? 'sopra' : 'sotto'} ${target} · ${sym} nelle 24 h: ${day}`,
  },

  // — Zakat year completing —
  zakatTitle: {
    en: (days) => days === 0 ? 'Your zakat is due today' : 'Your zakat year is nearly complete',
    ar: (days) => days === 0 ? 'زكاتك تحلّ اليوم' : 'اقترب تمام حولك الزكوي',
    fr: (days) => days === 0 ? 'Votre zakat est due aujourd\u2019hui' : 'Votre année zakat touche à sa fin',
    es: (days) => days === 0 ? 'Tu zakat vence hoy' : 'Tu año de zakat está por completarse',
    de: (days) => days === 0 ? 'Ihre Zakat ist heute fällig' : 'Ihr Zakat-Jahr ist bald vollendet',
    it: (days) => days === 0 ? 'La tua zakat scade oggi' : 'Il tuo anno di zakat sta per completarsi',
  },
  zakatBody: {
    en: (days) => days === 0
      ? 'Your zakat year completes today. Open WalletLens to work out what is due.'
      : `Your zakat year completes in ${days} days. Open WalletLens to see what is due.`,
    ar: (days) => days === 0
      ? 'يتمّ حولك الزكوي اليوم. افتح التطبيق لحساب ما يجب عليك.'
      : `يتمّ حولك الزكوي بعد ${days} يوماً. افتح التطبيق لمعرفة ما يجب عليك.`,
    fr: (days) => days === 0
      ? 'Votre année zakat s\u2019achève aujourd\u2019hui. Ouvrez WalletLens pour calculer le montant dû.'
      : `Votre année zakat s\u2019achève dans ${days} jours. Ouvrez WalletLens pour voir le montant dû.`,
    es: (days) => days === 0
      ? 'Tu año de zakat se completa hoy. Abre WalletLens para calcular lo que debes.'
      : `Tu año de zakat se completa en ${days} días. Abre WalletLens para ver lo que debes.`,
    de: (days) => days === 0
      ? 'Ihr Zakat-Jahr ist heute vollendet. Öffnen Sie WalletLens, um den fälligen Betrag zu ermitteln.'
      : `Ihr Zakat-Jahr ist in ${days} Tagen vollendet. Öffnen Sie WalletLens, um den fälligen Betrag zu sehen.`,
    it: (days) => days === 0
      ? 'Il tuo anno di zakat si completa oggi. Apri WalletLens per calcolare quanto è dovuto.'
      : `Il tuo anno di zakat si completa tra ${days} giorni. Apri WalletLens per vedere quanto è dovuto.`,
  },

  // — Test push from Settings —
  testTitle: {
    en: () => '🔔 WalletLens notifications are on',
    ar: () => '🔔 تم تفعيل إشعارات WalletLens',
    fr: () => '🔔 Les notifications WalletLens sont activées',
    es: () => '🔔 Las notificaciones de WalletLens están activadas',
    de: () => '🔔 WalletLens-Benachrichtigungen sind aktiv',
    it: () => '🔔 Le notifiche WalletLens sono attive',
  },
  testBody: {
    en: () => 'Price moves, news on your assets and target alerts will now reach you even when the app is closed.',
    ar: () => 'ستصلك تحركات الأسعار وأخبار أصولك وتنبيهات الأهداف حتى عندما يكون التطبيق مغلقاً.',
    fr: () => 'Les mouvements de prix, l’actualité de vos actifs et vos alertes vous parviendront même application fermée.',
    es: () => 'Los movimientos de precio, las noticias de tus activos y tus alertas te llegarán aunque la app esté cerrada.',
    de: () => 'Kursbewegungen, Nachrichten zu Ihren Anlagen und Zielalarme erreichen Sie ab jetzt auch bei geschlossener App.',
    it: () => 'Movimenti di prezzo, notizie sui tuoi asset e avvisi sugli obiettivi ti raggiungeranno anche ad app chiusa.',
  },

  // — A holding moved sharply —
  // The headline reads like a ticker, and reads the same in every language.
  //
  // It used to be "📈 BTC up 3.2%" — the direction as a translated word, and
  // the PRICE only in the body. On a phone the body is the part that gets
  // collapsed or truncated, so the number a price alert exists to deliver was
  // the one thing that might not be on screen. The title carries it now:
  //
  //     📈 BTC +3.2% · $101,234
  //
  // Symbol, signed percentage, price. Nothing in it to translate, so it cannot
  // be right in one language and wrong in another. The emoji stays: it is the
  // only colour a notification gets, and colour is how an exchange says up or
  // down at a glance — the sign says it again for anyone whose launcher draws
  // emoji flat.
  moveTitle: {
    en: (sym, pct, up, price) => `${up ? '📈' : '📉'} ${sym} ${pct} · ${price}`,
    ar: (sym, pct, up, price) => `${up ? '📈' : '📉'} ${sym} ${pct} · ${price}`,
    fr: (sym, pct, up, price) => `${up ? '📈' : '📉'} ${sym} ${pct} · ${price}`,
    es: (sym, pct, up, price) => `${up ? '📈' : '📉'} ${sym} ${pct} · ${price}`,
    de: (sym, pct, up, price) => `${up ? '📈' : '📉'} ${sym} ${pct} · ${price}`,
    it: (sym, pct, up, price) => `${up ? '📈' : '📉'} ${sym} ${pct} · ${price}`,
  },
  // The body carries the one thing the title cannot: what the move looks like
  // against the whole day. The percentage in the title is measured from a
  // rolling reference — the price when this asset was last flagged — which is
  // the right trigger but a poor sense of scale on its own: 3% since the last
  // alert reads very differently when the day is +12% than when it is flat.
  //
  // The old body repeated the title's own numbers and ended with "Tap to see
  // the impact on your portfolio", which every channel said, which taught the
  // reader to stop reading bodies. Tapping a notification opens something;
  // that does not need saying.
  moveBody: {
    en: (sym, day) => `${sym} over 24h: ${day}`,
    ar: (sym, day) => `${sym} خلال ٢٤ ساعة: ${day}`,
    fr: (sym, day) => `${sym} sur 24 h : ${day}`,
    es: (sym, day) => `${sym} en 24 h: ${day}`,
    de: (sym, day) => `${sym} in 24 Std.: ${day}`,
    it: (sym, day) => `${sym} nelle 24 h: ${day}`,
  },

  // — A round price level crossed —
  // Deliberately plainer than the move copy. The whole point is the number: an
  // exchange sends "BTC drops below $77,000" and it lands because 77,000 is a
  // level people are watching, not because the move was large. Dressing that up
  // buries the one fact worth reading.
  // A level crossing keeps its verb: "broke $100,000" is the event, and no
  // arrangement of bare numbers says it as well. The price it has reached goes
  // beside it, because the level is where it crossed, not where it is now —
  // by the time the phone buzzes those are two different numbers.
  levelTitle: {
    en: (sym, level, up, price) => `${up ? '📈' : '📉'} ${sym} ${up ? 'broke' : 'fell below'} ${level} · ${price}`,
    ar: (sym, level, up, price) => `${up ? '📈' : '📉'} ${sym} ${up ? 'تجاوز' : 'نزل تحت'} ${level} · ${price}`,
    fr: (sym, level, up, price) => `${up ? '📈' : '📉'} ${sym} ${up ? 'franchit' : 'passe sous'} ${level} · ${price}`,
    es: (sym, level, up, price) => `${up ? '📈' : '📉'} ${sym} ${up ? 'supera' : 'baja de'} ${level} · ${price}`,
    de: (sym, level, up, price) => `${up ? '📈' : '📉'} ${sym} ${up ? 'überschreitet' : 'fällt unter'} ${level} · ${price}`,
    it: (sym, level, up, price) => `${up ? '📈' : '📉'} ${sym} ${up ? 'supera' : 'scende sotto'} ${level} · ${price}`,
  },
  levelBody: {
    en: (sym, day) => `${sym} over 24h: ${day}`,
    ar: (sym, day) => `${sym} خلال ٢٤ ساعة: ${day}`,
    fr: (sym, day) => `${sym} sur 24 h : ${day}`,
    es: (sym, day) => `${sym} en 24 h: ${day}`,
    de: (sym, day) => `${sym} in 24 Std.: ${day}`,
    it: (sym, day) => `${sym} nelle 24 h: ${day}`,
  },

  // — Breaking news mentioning an asset the user holds —
  newsTitle: {
    en: (sym) => `📰 ${sym} in the news`,
    ar: (sym) => `📰 ${sym} في الأخبار`,
    fr: (sym) => `📰 ${sym} dans l’actualité`,
    es: (sym) => `📰 ${sym} en las noticias`,
    de: (sym) => `📰 ${sym} in den Nachrichten`,
    it: (sym) => `📰 ${sym} nelle notizie`,
  },
  newsBody: {
    en: (headline) => headline,
    ar: (headline) => headline,
    fr: (headline) => headline,
    es: (headline) => headline,
    de: (headline) => headline,
    it: (headline) => headline,
  },

  // — Market news —
  // The same story, framed for someone who does not hold the asset it names.
  // Without this the news channel is silent for most portfolios: a device
  // watching two coins matches almost nothing a wire actually publishes.
  newsMarketTitle: {
    en: () => '📰 Market news',
    ar: () => '📰 أخبار السوق',
    fr: () => '📰 Actualité des marchés',
    es: () => '📰 Noticias del mercado',
    de: () => '📰 Marktnachrichten',
    it: () => '📰 Notizie di mercato',
  },

  // — Academy daily challenge —
  // The body is the question stem itself, which academyContent.js already
  // carries in all six languages, so only the framing lives here.
  academyTitle: {
    en: () => '🎓 Today’s challenge',
    ar: () => '🎓 تحدي اليوم',
    fr: () => '🎓 Le défi du jour',
    es: () => '🎓 El reto de hoy',
    de: () => '🎓 Die heutige Challenge',
    it: () => '🎓 La sfida di oggi',
  },

  // — Portfolio pulse —
  // Breadth, not value. `up` of `total` holdings green, and the biggest mover
  // either way. There is no amount in this sentence because there is no amount
  // on the server.
  portfolioTitle: {
    en: () => '📊 Your portfolio today',
    ar: () => '📊 محفظتك اليوم',
    fr: () => '📊 Votre portefeuille aujourd’hui',
    es: () => '📊 Tu cartera hoy',
    de: () => '📊 Ihr Portfolio heute',
    it: () => '📊 Il tuo portafoglio oggi',
  },
  portfolioBody: {
    en: (up, total, sym, pct, isUp) =>
      `${up} of your ${total} holdings ${up === 1 ? 'is' : 'are'} up. ${sym} leads at ${isUp ? '+' : '−'}${pct}%.`,
    ar: (up, total, sym, pct, isUp) =>
      `${up} من أصولك الـ${total} في ارتفاع. ${sym} في المقدمة بنسبة ${isUp ? '+' : '−'}${pct}%.`,
    fr: (up, total, sym, pct, isUp) =>
      `${up} de vos ${total} actifs ${up === 1 ? 'est' : 'sont'} en hausse. ${sym} mène avec ${isUp ? '+' : '−'}${pct} %.`,
    es: (up, total, sym, pct, isUp) =>
      `${up} de tus ${total} activos ${up === 1 ? 'está' : 'están'} en verde. ${sym} lidera con ${isUp ? '+' : '−'}${pct} %.`,
    de: (up, total, sym, pct, isUp) =>
      `${up} von ${total} Werten ${up === 1 ? 'liegt' : 'liegen'} im Plus. ${sym} führt mit ${isUp ? '+' : '−'}${pct} %.`,
    it: (up, total, sym, pct, isUp) =>
      `${up} dei tuoi ${total} asset ${up === 1 ? 'è' : 'sono'} in rialzo. ${sym} guida con ${isUp ? '+' : '−'}${pct} %.`,
  },

  // — Investment hacks —
  // Only the framing label. The hack's own title and body come from
  // academyContent.js, already written in all six languages by the same hand
  // that wrote the Academy; re-stating them here would be a second copy to
  // keep in sync and a worse translation.
  hackTitle: {
    en: (title) => `💡 ${title}`,
    ar: (title) => `💡 ${title}`,
    fr: (title) => `💡 ${title}`,
    es: (title) => `💡 ${title}`,
    de: (title) => `💡 ${title}`,
    it: (title) => `💡 ${title}`,
  },

  // — Daily brief, sent once each morning in the user's own timezone —
  digestTitle: {
    en: () => '☀️ Your market brief',
    ar: () => '☀️ موجز السوق الخاص بك',
    fr: () => '☀️ Votre point marché',
    es: () => '☀️ Tu resumen de mercado',
    de: () => '☀️ Ihre Marktübersicht',
    it: () => '☀️ Il tuo riepilogo di mercato',
  },
  digestBody: {
    en: (sym, pct, up, count) => `Biggest mover: ${sym} ${up ? '+' : '−'}${pct}% over 24h, across your ${count} tracked ${count === 1 ? 'asset' : 'assets'}.`,
    ar: (sym, pct, up, count) => `أكبر تحرك: ${sym} ${up ? '+' : '−'}${pct}% خلال ٢٤ ساعة، من بين ${count} من أصولك المتابَعة.`,
    fr: (sym, pct, up, count) => `Plus fort mouvement : ${sym} ${up ? '+' : '−'}${pct} % sur 24 h, parmi vos ${count} actifs suivis.`,
    es: (sym, pct, up, count) => `Mayor movimiento: ${sym} ${up ? '+' : '−'}${pct} % en 24 h, entre tus ${count} activos seguidos.`,
    de: (sym, pct, up, count) => `Größte Bewegung: ${sym} ${up ? '+' : '−'}${pct} % in 24 Std., unter Ihren ${count} verfolgten Anlagen.`,
    it: (sym, pct, up, count) => `Movimento maggiore: ${sym} ${up ? '+' : '−'}${pct}% in 24 h, tra i tuoi ${count} asset seguiti.`,
  },

  // — Feature tips. One-off, each gated on the user's own state (FEATURE_TIPS) —
  featCoinTargetsTitle: {
    en: () => '\u{1F4C8} Decide your exit before you need it',
    ar: () => '\u{1F4C8} قرّر نقطة خروجك قبل أن تحتاجها',
    fr: () => '\u{1F4C8} D\u00e9cidez de votre sortie \u00e0 l\u2019avance',
    es: () => '\u{1F4C8} Decide tu salida antes de necesitarla',
    de: () => '\u{1F4C8} Legen Sie Ihren Ausstieg fest, bevor Sie ihn brauchen',
    it: () => '\u{1F4C8} Decidi la tua uscita prima di averne bisogno',
  },
  featCoinTargetsBody: {
    en: () => 'Set take-profit and stop-loss levels per asset, and WalletLens tracks how close each one is \u2014 so the plan is made calmly, not mid-crash.',
    ar: () => 'حدّد مستويات جني الأرباح ووقف الخسارة لكل أصل، ويتابع WalletLens قرب كل منها — لتضع الخطة بهدوء لا وسط الانهيار.',
    fr: () => 'D\u00e9finissez des niveaux de prise de b\u00e9n\u00e9fice et de stop par actif : WalletLens suit leur proximit\u00e9, pour d\u00e9cider \u00e0 froid.',
    es: () => 'Fija niveles de toma de beneficios y stop por activo; WalletLens sigue lo cerca que est\u00e1 cada uno, para decidir en fr\u00edo.',
    de: () => 'Setzen Sie je Anlage Gewinnziele und Verluststopps; WalletLens verfolgt, wie nah jedes davon ist — so entsteht der Plan in Ruhe, nicht mitten im Absturz.',
    it: () => 'Fissa livelli di presa di profitto e di stop per ogni asset: WalletLens segue quanto è vicino ciascuno, così il piano nasce a mente fredda.',
  },

  featDriveTitle: {
    en: () => '\u{1F510} Your portfolio lives in one browser',
    ar: () => '\u{1F510} محفظتك موجودة في متصفح واحد فقط',
    fr: () => '\u{1F510} Votre portefeuille n\u2019existe que dans un navigateur',
    es: () => '\u{1F510} Tu cartera vive en un solo navegador',
    de: () => '\u{1F510} Ihr Portfolio lebt in einem einzigen Browser',
    it: () => '\u{1F510} Il tuo portafoglio vive in un solo browser',
  },
  featDriveBody: {
    en: () => 'Clear your site data and it\u2019s gone. Turn on encrypted Google Drive backup \u2014 we can\u2019t read it, and it restores in one tap.',
    ar: () => 'امسح بيانات الموقع وستختفي. فعّل النسخ الاحتياطي المشفّر إلى Google Drive — لا يمكننا قراءته، ويُستعاد بضغطة واحدة.',
    fr: () => 'Videz les donn\u00e9es du site et tout dispara\u00eet. Activez la sauvegarde Google Drive chiffr\u00e9e \u2014 illisible pour nous, restaur\u00e9e en un geste.',
    es: () => 'Si borras los datos del sitio, desaparece. Activa la copia cifrada en Google Drive: no podemos leerla y se restaura de un toque.',
    de: () => 'Löschen Sie die Websitedaten und es ist weg. Aktivieren Sie das verschlüsselte Google-Drive-Backup — wir können es nicht lesen, und es lässt sich mit einem Tippen wiederherstellen.',
    it: () => 'Se cancelli i dati del sito, sparisce. Attiva il backup cifrato su Google Drive: noi non possiamo leggerlo e si ripristina con un tocco.',
  },

  featQrtransferTitle: {
    en: () => '\u{1F4F1} Moving to a new phone?',
    ar: () => '\u{1F4F1} هل تنتقل إلى هاتف جديد؟',
    fr: () => '\u{1F4F1} Vous changez de t\u00e9l\u00e9phone ?',
    es: () => '\u{1F4F1} \u00bfCambias de tel\u00e9fono?',
    de: () => '\u{1F4F1} Umzug auf ein neues Handy?',
    it: () => '\u{1F4F1} Stai passando a un telefono nuovo?',
  },
  featQrtransferBody: {
    en: () => 'Scan one QR code and your whole portfolio moves across \u2014 offline, no account, nothing sent anywhere.',
    ar: () => 'امسح رمز QR واحداً لتنتقل محفظتك بالكامل — دون إنترنت ودون حساب ودون إرسال أي شيء.',
    fr: () => 'Scannez un QR code et tout votre portefeuille suit \u2014 hors ligne, sans compte, rien n\u2019est envoy\u00e9.',
    es: () => 'Escanea un c\u00f3digo QR y toda tu cartera se muda: sin conexi\u00f3n, sin cuenta y sin enviar nada.',
    de: () => 'Einen QR-Code scannen und das ganze Portfolio zieht mit — offline, ohne Konto, ohne dass etwas verschickt wird.',
    it: () => 'Scansiona un QR e tutto il portafoglio si sposta — offline, senza account, senza inviare nulla.',
  },

  featSmartimportTitle: {
    en: () => '\u{1F399}\uFE0F Stop typing your trades in',
    ar: () => '\u{1F399}\uFE0F توقّف عن إدخال صفقاتك يدوياً',
    fr: () => '\u{1F399}\uFE0F Arr\u00eatez de saisir vos trades',
    es: () => '\u{1F399}\uFE0F Deja de teclear tus operaciones',
    de: () => '\u{1F399}\uFE0F Schluss mit dem Eintippen Ihrer Trades',
    it: () => '\u{1F399}\uFE0F Smetti di digitare le tue operazioni',
  },
  featSmartimportBody: {
    en: () => 'Say \u201cI bought half a Bitcoin at 65K\u201d, or screenshot any exchange \u2014 WalletLens reads it and fills in the trade.',
    ar: () => 'قل «اشتريت نصف بيتكوين بسعر ٦٥ ألفاً»، أو التقط صورة لأي منصة — يقرأها WalletLens ويملأ الصفقة.',
    fr: () => 'Dites \u00ab j\u2019ai achet\u00e9 un demi-Bitcoin \u00e0 65K \u00bb, ou capturez n\u2019importe quelle plateforme : WalletLens lit et remplit la transaction.',
    es: () => 'Di \u00abcompr\u00e9 medio Bitcoin a 65K\u00bb o haz una captura de cualquier exchange: WalletLens lo lee y rellena la operaci\u00f3n.',
    de: () => 'Sagen Sie „Ich habe einen halben Bitcoin zu 65.000 gekauft“ oder fotografieren Sie eine beliebige Börse — WalletLens liest es und trägt den Trade ein.',
    it: () => 'Di’ «ho comprato mezzo Bitcoin a 65K», oppure fotografa qualsiasi exchange: WalletLens lo legge e compila l’operazione.',
  },

  featApplockTitle: {
    en: () => '\u{1F512} Your portfolio is unlocked right now',
    ar: () => '\u{1F512} محفظتك غير مقفلة الآن',
    fr: () => '\u{1F512} Votre portefeuille est d\u00e9verrouill\u00e9',
    es: () => '\u{1F512} Tu cartera est\u00e1 desbloqueada ahora',
    de: () => '\u{1F512} Ihr Portfolio ist gerade entsperrt',
    it: () => '\u{1F512} Il tuo portafoglio è sbloccato in questo momento',
  },
  featApplockBody: {
    en: () => 'Anyone holding your phone can open WalletLens and read every number. App Lock puts your fingerprint in front of it.',
    ar: () => 'أي شخص يمسك هاتفك يمكنه فتح WalletLens وقراءة كل رقم. قفل التطبيق يضع بصمتك أمامه.',
    fr: () => 'Quiconque tient votre t\u00e9l\u00e9phone peut ouvrir WalletLens et lire chaque chiffre. Le verrou place votre empreinte devant.',
    es: () => 'Cualquiera con tu tel\u00e9fono puede abrir WalletLens y leer cada cifra. El bloqueo pone tu huella delante.',
    de: () => 'Wer Ihr Handy in der Hand hält, kann WalletLens öffnen und jede Zahl lesen. Die App-Sperre stellt Ihren Fingerabdruck davor.',
    it: () => 'Chiunque abbia in mano il tuo telefono può aprire WalletLens e leggere ogni cifra. Il blocco app mette la tua impronta davanti.',
  },
  featTechnicalsTitle: {
    en: () => '\u{1F4C9} RSI, MACD and moving averages on what you hold',
    ar: () => '\u{1F4C9} مؤشرات RSI و MACD والمتوسطات لما تملكه',
    fr: () => '\u{1F4C9} RSI, MACD et moyennes mobiles sur vos actifs',
    es: () => '\u{1F4C9} RSI, MACD y medias m\u00f3viles de lo que tienes',
    de: () => '\u{1F4C9} RSI, MACD und gleitende Durchschnitte für Ihre Bestände',
    it: () => '\u{1F4C9} RSI, MACD e medie mobili su ciò che possiedi',
  },
  featTechnicalsBody: {
    en: () => 'The Technicals page reads your own holdings, so you are not looking up tickers one at a time somewhere else.',
    ar: () => 'صفحة التحليل الفني تقرأ ممتلكاتك، فلا تبحث عن كل رمز على حدة في مكان آخر.',
    fr: () => 'La page Technique lit vos propres avoirs \u2014 plus besoin de chercher chaque ticker ailleurs.',
    es: () => 'La p\u00e1gina T\u00e9cnica lee tus propias posiciones, sin buscar cada ticker por separado.',
    de: () => 'Die Technik-Seite liest Ihre eigenen Positionen, sodass Sie nicht anderswo jedes Kürzel einzeln nachschlagen.',
    it: () => 'La pagina Tecnica legge le tue posizioni, così non devi cercare ogni simbolo altrove.',
  },
  featWhalesTitle: {
    en: () => '\u{1F40B} Someone just moved a very large amount of BTC',
    ar: () => '\u{1F40B} شخص ما حرّك للتو كمية ضخمة من البيتكوين',
    fr: () => '\u{1F40B} Quelqu\u2019un vient de d\u00e9placer une tr\u00e8s grosse somme en BTC',
    es: () => '\u{1F40B} Alguien acaba de mover una cantidad enorme de BTC',
    de: () => '\u{1F40B} Jemand hat gerade sehr viel BTC bewegt',
    it: () => '\u{1F40B} Qualcuno ha appena mosso moltissimi BTC',
  },
  featWhalesBody: {
    en: () => 'WalletLens watches the Bitcoin chain for transactions over $1M. Worth a look when the market moves and nobody says why.',
    ar: () => 'يراقب WalletLens شبكة البيتكوين بحثًا عن تحويلات تتجاوز مليون دولار. يستحق النظر عندما يتحرك السوق دون سبب معلن.',
    fr: () => 'WalletLens surveille la cha\u00eene Bitcoin pour les transactions de plus d\u2019un million. Utile quand le march\u00e9 bouge sans raison annonc\u00e9e.',
    es: () => 'WalletLens vigila la cadena de Bitcoin por transacciones de m\u00e1s de un mill\u00f3n. \u00datil cuando el mercado se mueve sin motivo aparente.',
    de: () => 'WalletLens beobachtet die Bitcoin-Chain auf Transaktionen über 1 Mio. $. Ein Blick lohnt sich, wenn der Markt sich bewegt und niemand sagt warum.',
    it: () => 'WalletLens osserva la catena Bitcoin per transazioni sopra 1 M$. Vale un’occhiata quando il mercato si muove e nessuno spiega perché.',
  },
  featCoachTitle: {
    en: () => '\u{1F9ED} A second opinion on how your portfolio is built',
    ar: () => '\u{1F9ED} رأي ثانٍ في طريقة بناء محفظتك',
    fr: () => '\u{1F9ED} Un second avis sur la construction de votre portefeuille',
    es: () => '\u{1F9ED} Una segunda opini\u00f3n sobre c\u00f3mo est\u00e1 armada tu cartera',
    de: () => '\u{1F9ED} Eine zweite Meinung zum Aufbau Ihres Portfolios',
    it: () => '\u{1F9ED} Un secondo parere su come è costruito il tuo portafoglio',
  },
  featCoachBody: {
    en: () => 'Coach looks at concentration, overlap and what you are actually exposed to \u2014 not at what it thinks you should buy.',
    ar: () => 'يفحص المدرّب التركّز والتداخل وما أنت معرّض له فعليًا \u2014 لا ما يظن أنه عليك شراؤه.',
    fr: () => 'Coach examine la concentration, les doublons et votre exposition r\u00e9elle \u2014 pas ce qu\u2019il pense que vous devriez acheter.',
    es: () => 'Coach mira la concentraci\u00f3n, el solapamiento y tu exposici\u00f3n real \u2014 no lo que cree que deber\u00edas comprar.',
    de: () => 'Der Coach betrachtet Konzentration, Überschneidungen und Ihre tatsächliche Beteiligung — nicht das, was er meint, dass Sie kaufen sollten.',
    it: () => 'Il Coach guarda concentrazione, sovrapposizioni e la tua esposizione reale — non quello che pensa dovresti comprare.',
  },
  featRebalanceTitle: {
    en: () => '\u2696\uFE0F Your mix has drifted from where you set it',
    ar: () => '\u2696\uFE0F توزيع محفظتك انحرف عمّا حددته',
    fr: () => '\u2696\uFE0F Votre r\u00e9partition a d\u00e9riv\u00e9',
    es: () => '\u2696\uFE0F Tu distribuci\u00f3n se ha desviado',
    de: () => '\u2696\uFE0F Ihre Mischung ist von Ihrer Vorgabe abgedriftet',
    it: () => '\u2696\uFE0F Il tuo mix si è allontanato da come lo avevi impostato',
  },
  featRebalanceBody: {
    en: () => 'The rebalancing calculator shows the exact trades to get back to your target weights, using your real holdings.',
    ar: () => 'حاسبة إعادة التوازن تعرض الصفقات الدقيقة للعودة إلى أوزانك المستهدفة، باستخدام ممتلكاتك الحقيقية.',
    fr: () => 'Le calculateur de r\u00e9\u00e9quilibrage montre les op\u00e9rations exactes pour revenir \u00e0 vos pond\u00e9rations cibles.',
    es: () => 'La calculadora de reequilibrio muestra las operaciones exactas para volver a tus pesos objetivo.',
    de: () => 'Der Rebalancing-Rechner zeigt die genauen Trades zurück zu Ihren Zielgewichten, auf Basis Ihrer echten Bestände.',
    it: () => 'Il calcolatore di ribilanciamento mostra le operazioni esatte per tornare ai pesi voluti, sulle tue posizioni reali.',
  },
  featAcademyTitle: {
    en: () => '\u{1F393} The part most trackers leave out',
    ar: () => '\u{1F393} الجزء الذي تتجاهله معظم التطبيقات',
    fr: () => '\u{1F393} Ce que la plupart des trackers omettent',
    es: () => '\u{1F393} La parte que casi ning\u00fan tracker incluye',
    de: () => '\u{1F393} Der Teil, den die meisten Tracker weglassen',
    it: () => '\u{1F393} La parte che quasi tutti i tracker tralasciano',
  },
  featAcademyBody: {
    en: () => 'Short, plain explanations of what you are holding and the mistakes that cost people the most. No jargon, no upsell.',
    ar: () => 'شروح قصيرة وواضحة لما تملكه وللأخطاء الأكثر كلفة. بلا مصطلحات ولا عروض بيع.',
    fr: () => 'Des explications courtes et claires sur ce que vous d\u00e9tenez et les erreurs les plus co\u00fbteuses. Sans jargon ni argumentaire.',
    es: () => 'Explicaciones breves y claras de lo que tienes y de los errores que m\u00e1s cuestan. Sin jerga ni venta.',
    de: () => 'Kurze, klare Erklärungen zu dem, was Sie halten, und zu den Fehlern, die am meisten kosten. Kein Fachjargon, kein Verkaufsdruck.',
    it: () => 'Spiegazioni brevi e chiare su ciò che possiedi e sugli errori che costano di più. Senza gergo e senza spinte commerciali.',
  },
  featGuardianTitle: {
    en: () => '\u{1F6E1}\uFE0F Who reaches your portfolio if you can\u2019t?',
    ar: () => '\u{1F6E1}\uFE0F من يصل إلى محفظتك إن لم تستطع أنت؟',
    fr: () => '\u{1F6E1}\uFE0F Qui acc\u00e8de \u00e0 votre portefeuille si vous ne le pouvez plus ?',
    es: () => '\u{1F6E1}\uFE0F \u00bfQui\u00e9n accede a tu cartera si t\u00fa no puedes?',
    de: () => '\u{1F6E1}\uFE0F Wer erreicht Ihr Portfolio, wenn Sie es nicht können?',
    it: () => '\u{1F6E1}\uFE0F Chi raggiunge il tuo portafoglio se tu non puoi?',
  },
  featGuardianBody: {
    en: () => 'Portfolio Guardian quietly checks you\u2019re still around, and passes your holdings list to someone you trust if you stop answering.',
    ar: () => 'يتحقق حارس المحفظة بهدوء من أنك ما زلت موجوداً، ويمرّر قائمة أصولك إلى شخص تثق به إذا توقفت عن الرد.',
    fr: () => 'Portfolio Guardian v\u00e9rifie discr\u00e8tement que vous \u00eates l\u00e0, et transmet la liste de vos avoirs \u00e0 un proche si vous ne r\u00e9pondez plus.',
    es: () => 'Portfolio Guardian comprueba en silencio que sigues ah\u00ed y entrega tu lista de activos a alguien de confianza si dejas de responder.',
    de: () => 'Der Portfolio-Wächter prüft unauffällig, ob Sie noch da sind, und gibt Ihre Bestandsliste an eine Vertrauensperson weiter, wenn Sie nicht mehr antworten.',
    it: () => 'Il Guardiano del portafoglio verifica con discrezione che tu ci sia, e passa l’elenco delle tue posizioni a una persona di fiducia se smetti di rispondere.',
  },

  featVisionTitle: {
    en: () => '\u{1F3AF} Give your money a destination',
    ar: () => '\u{1F3AF} امنح أموالك وجهة',
    fr: () => '\u{1F3AF} Donnez une destination \u00e0 votre argent',
    es: () => '\u{1F3AF} Dale un destino a tu dinero',
    de: () => '\u{1F3AF} Geben Sie Ihrem Geld ein Ziel',
    it: () => '\u{1F3AF} Dai una destinazione ai tuoi soldi',
  },
  featVisionBody: {
    en: () => 'Vision Goals splits your portfolio into buckets \u2014 emergency fund, house, retirement \u2014 and tracks each one filling up.',
    ar: () => 'تقسّم «أهداف الرؤية» محفظتك إلى سلال — صندوق طوارئ، منزل، تقاعد — وتتابع امتلاء كل واحدة.',
    fr: () => 'Vision Goals r\u00e9partit votre portefeuille en objectifs \u2014 \u00e9pargne de secours, logement, retraite \u2014 et suit leur progression.',
    es: () => 'Vision Goals reparte tu cartera en metas \u2014 fondo de emergencia, casa, jubilaci\u00f3n \u2014 y sigue c\u00f3mo se llenan.',
    de: () => 'Visionsziele teilen Ihr Portfolio in Töpfe — Notgroschen, Haus, Ruhestand — und verfolgen, wie sich jeder füllt.',
    it: () => 'Gli Obiettivi Visione dividono il portafoglio in contenitori — fondo di emergenza, casa, pensione — e seguono il riempimento di ciascuno.',
  },

  featWatchlistTitle: {
    en: () => '\u{1F440} Watch what you don\u2019t own yet',
    ar: () => '\u{1F440} تابع ما لا تملكه بعد',
    fr: () => '\u{1F440} Suivez ce que vous ne d\u00e9tenez pas encore',
    es: () => '\u{1F440} Vigila lo que a\u00fan no tienes',
    de: () => '\u{1F440} Behalten Sie im Blick, was Sie noch nicht besitzen',
    it: () => '\u{1F440} Tieni d’occhio ciò che non possiedi ancora',
  },
  featWatchlistBody: {
    en: () => 'Add coins and stocks you\u2019re considering to your watchlist, and we\u2019ll alert you when one reaches the price you want.',
    ar: () => 'أضف العملات والأسهم التي تفكر بها إلى قائمة متابعتك، وسننبّهك عندما يبلغ أحدها السعر الذي تريده.',
    fr: () => 'Ajoutez \u00e0 votre liste de suivi les actifs qui vous int\u00e9ressent : nous vous alerterons au prix voulu.',
    es: () => 'A\u00f1ade a tu lista de seguimiento lo que est\u00e1s considerando y te avisaremos cuando llegue al precio que quieras.',
    de: () => 'Setzen Sie Coins und Aktien, die Sie erwägen, auf die Watchlist — wir melden uns, sobald einer Ihren Wunschkurs erreicht.',
    it: () => 'Aggiungi alla watchlist monete e titoli che stai valutando: ti avvisiamo appena uno raggiunge il prezzo che vuoi.',
  },

  featWeeklyTitle: {
    en: () => '\u{1F4EC} Your portfolio, summed up every week',
    ar: () => '\u{1F4EC} محفظتك في ملخّص أسبوعي',
    fr: () => '\u{1F4EC} Votre portefeuille r\u00e9sum\u00e9 chaque semaine',
    es: () => '\u{1F4EC} Tu cartera resumida cada semana',
    de: () => '\u{1F4EC} Ihr Portfolio, jede Woche zusammengefasst',
    it: () => '\u{1F4EC} Il tuo portafoglio, riassunto ogni settimana',
  },
  featWeeklyBody: {
    en: () => 'A branded weekly report in your inbox \u2014 performance, allocation and P&L. Your transactions never leave the device.',
    ar: () => 'تقرير أسبوعي في بريدك — الأداء والتوزيع والأرباح والخسائر. ومعاملاتك لا تغادر جهازك أبداً.',
    fr: () => 'Un rapport hebdomadaire dans votre bo\u00eete mail \u2014 performance, r\u00e9partition et P&L. Vos transactions ne quittent jamais l\u2019appareil.',
    es: () => 'Un informe semanal en tu correo \u2014 rendimiento, distribuci\u00f3n y P&L. Tus transacciones nunca salen del dispositivo.',
    de: () => 'Ein gestalteter Wochenbericht in Ihrem Posteingang — Entwicklung, Aufteilung und Gewinn. Ihre Transaktionen verlassen das Gerät nie.',
    it: () => 'Un report settimanale curato nella tua posta — rendimento, allocazione e utili. Le tue transazioni non lasciano mai il dispositivo.',
  },

  featTargetsTitle: {
    en: () => '🎯 Get told the moment your price is hit',
    ar: () => '🎯 اعرف لحظة بلوغ سعرك',
    fr: () => '🎯 Soyez pr\u00e9venu d\u00e8s que votre prix est atteint',
    es: () => '🎯 Ent\u00e9rate en cuanto se alcance tu precio',
    de: () => '🎯 Erfahren Sie es in dem Moment, in dem Ihr Kurs erreicht wird',
    it: () => '🎯 Sappilo nel momento in cui il tuo prezzo viene raggiunto',
  },
  featTargetsBody: {
    en: (sym) => `Set a target on ${sym} and WalletLens will alert you the moment it hits — no need to keep checking.`,
    ar: (sym) => `حدّد هدفاً لـ ${sym} وسينبّهك WalletLens لحظة بلوغه — دون الحاجة إلى المتابعة المستمرة.`,
    fr: (sym) => `D\u00e9finissez un objectif sur ${sym} et WalletLens vous alertera d\u00e8s qu\u2019il est atteint, sans v\u00e9rifier sans cesse.`,
    es: (sym) => `Fija un objetivo en ${sym} y WalletLens te avisar\u00e1 en cuanto se alcance, sin tener que mirar a cada rato.`,
    de: (sym) => `Setzen Sie ein Ziel für ${sym} und WalletLens meldet sich, sobald es erreicht ist — kein ständiges Nachsehen nötig.`,
    it: (sym) => `Imposta un obiettivo su ${sym} e WalletLens ti avviserà appena viene raggiunto — senza controllare di continuo.`,
  },

  featDiversifyTitle: {
    en: () => '📊 See your whole net worth',
    ar: () => '📊 اطّلع على صافي ثروتك كاملاً',
    fr: () => '📊 Voyez tout votre patrimoine',
    es: () => '📊 Mira tu patrimonio completo',
    de: () => '📊 Sehen Sie Ihr ganzes Vermögen',
    it: () => '📊 Guarda tutto il tuo patrimonio',
  },
  featDiversifyBody: {
    en: () => 'Add the rest of what you own — crypto, stocks, gold and cash — for one live view of your net worth.',
    ar: () => 'أضف بقية ما تملك — العملات الرقمية والأسهم والذهب والنقد — للحصول على عرض حيّ واحد لصافي ثروتك.',
    fr: () => 'Ajoutez le reste de ce que vous poss\u00e9dez \u2014 crypto, actions, or et liquidit\u00e9s \u2014 pour une vue unique et en direct.',
    es: () => 'A\u00f1ade el resto de lo que tienes \u2014 cripto, acciones, oro y efectivo \u2014 para una \u00fanica vista en vivo.',
    de: () => 'Ergänzen Sie den Rest Ihres Besitzes — Krypto, Aktien, Gold und Bargeld — für eine einzige Live-Ansicht Ihres Vermögens.',
    it: () => 'Aggiungi il resto di ciò che possiedi — cripto, azioni, oro e liquidità — per un’unica vista dal vivo del tuo patrimonio.',
  },

  featMultiassetTitle: {
    en: () => '🏦 WalletLens tracks more than crypto',
    ar: () => '🏦 WalletLens يتتبّع أكثر من العملات الرقمية',
    fr: () => '🏦 WalletLens ne suit pas que la crypto',
    es: () => '🏦 WalletLens no solo rastrea cripto',
    de: () => '🏦 WalletLens verfolgt mehr als Krypto',
    it: () => '🏦 WalletLens non segue solo le cripto',
  },
  featMultiassetBody: {
    en: () => 'Stocks, gold, silver, cash and real estate sit alongside your coins — one net-worth dashboard, still no account.',
    ar: () => 'الأسهم والذهب والفضة والنقد والعقارات إلى جانب عملاتك — لوحة واحدة لصافي الثروة، وبلا حساب.',
    fr: () => 'Actions, or, argent, liquidit\u00e9s et immobilier c\u00f4toient vos cryptos \u2014 un seul tableau de bord, toujours sans compte.',
    es: () => 'Acciones, oro, plata, efectivo e inmuebles junto a tus monedas: un solo panel, y sin cuenta.',
    de: () => 'Aktien, Gold, Silber, Bargeld und Immobilien stehen neben Ihren Coins — ein Vermögens-Dashboard, weiterhin ohne Konto.',
    it: () => 'Azioni, oro, argento, liquidità e immobili stanno accanto alle tue monete — un’unica dashboard patrimoniale, sempre senza account.',
  },

  featCalendarTitle: {
    en: () => '📅 See what moves the market this week',
    ar: () => '📅 تعرّف على ما يحرّك السوق هذا الأسبوع',
    fr: () => '📅 Voyez ce qui anime les marchés cette semaine',
    es: () => '📅 Mira qué mueve el mercado esta semana',
    de: () => '📅 Sehen Sie, was diese Woche den Markt bewegt',
    it: () => '📅 Scopri cosa muove il mercato questa settimana',
  },
  featCalendarBody: {
    en: () => 'The economic calendar maps every CPI, rate decision and earnings day to your own holdings — so you see what is coming before it moves you.',
    ar: () => 'خريطة التقويم الاقتصادي لكل قرار وأرقام تضخم وأرباح حسب أصولك — لترى ما هو قادم قبل أن يحرّكك.',
    fr: () => 'Le calendrier économique relie chaque CPI, décision de taux et journée de résultats à vos actifs — voyez ce qui arrive avant que cela ne vous touche.',
    es: () => 'El calendario económico vincula cada IPC, decisión de tasas y día de resultados a tus activos: ve lo que viene antes de que te afecte.',
    de: () => 'Der Wirtschaftskalender verknüpft jede Zinsentscheidung und jeden Ergebnistag mit Ihren Werten — sehen Sie, was kommt, bevor es Sie bewegt.',
    it: () => 'Il calendario economico collega ogni dato, decisione sui tassi e trimestrale ai tuoi asset — vedi cosa arriva prima che ti tocchi.',
  },

  featAlphaTitle: {
    en: () => '🧭 Where is each holding heading?',
    ar: () => '🧭 إلى أين يتّجه كل أصل؟',
    fr: () => '🧭 Vers quoi se dirige chaque actif ?',
    es: () => '🧭 ¿Hacia dónde va cada activo?',
    de: () => '🧭 Wohin steuert jede Position?',
    it: () => '🧭 Verso dove va ogni posizione?',
  },
  featAlphaBody: {
    en: () => 'Alpha Score fuses on-chain, technical and market factors into one direction per asset — so you are not choosing on a single signal.',
    ar: () => 'تجمع «نقاط ألفا» عوامل السلسلة والفنية والسوق في اتجاه واحد لكل أصل — فلا تختار على إشارة واحدة.',
    fr: () => 'Le score Alpha combine signaux on-chain, techniques et de marché en une direction par actif — pas de choix sur un seul signal.',
    es: () => 'El Alpha Score fusiona señales on-chain, técnicas y de mercado en una dirección por activo: no elijas con una sola señal.',
    de: () => 'Der Alpha-Score bündelt On-Chain-, technische und Markt-Signale in eine Richtung pro Asset — keine Entscheidung nur auf ein Signal gestützt.',
    it: () => 'L\'Alpha Score fonde segnali on-chain, tecnici e di mercato in una direzione per asset — non scegli su un solo segnale.',
  },

  featMarketindexTitle: {
    en: () => '📈 Your whole market, one number',
    ar: () => '📈 سوقك كاملاً في رقم واحد',
    fr: () => '📈 Tout votre marché en un chiffre',
    es: () => '📈 Todo tu mercado en un solo número',
    de: () => '📈 Ihr ganzer Markt in einer Zahl',
    it: () => '📈 Tutto il tuo mercato in un numero',
  },
  featMarketindexBody: {
    en: () => 'The Market Index blends crypto, stocks and metals into one live breadth read — a faster glance than scrolling every ticker.',
    ar: () => 'يدمج مؤشر السوق العملات الرقمية والأسهم والمعادن في قراءة حيّة واحدة — نظرة أسرع من تصفّح كل شريط.',
    fr: () => 'L’indice de marché rassemble crypto, actions et métaux en une lecture unique — plus rapide que de parcourir chaque ticker.',
    es: () => 'El Índice de Mercado reúne cripto, acciones y metales en una sola lectura en vivo: más rápido que revisar cada ticker.',
    de: () => 'Der Marktindex bündelt Krypto, Aktien und Metalle in einer Live-Übersicht — schneller als jeder Ticker einzeln.',
    it: () => 'L\'indice di mercato unisce cripto, azioni e metalli in un\'unica lettura dal vivo — pi\'u rapido che scorrere ogni ticker.',
  },

  featGrowTitle: {
    en: () => '🌱 Ideas for growing your net worth',
    ar: () => '🌱 أفكار لتنمية صافي ثروتك',
    fr: () => '🌱 Des idées pour faire grandir votre patrimoine',
    es: () => '🌱 Ideas para hacer crecer tu patrimonio',
    de: () => '🌱 Ideen, um Ihr Vermögen zu mehren',
    it: () => '🌱 Idee per far crescere il tuo patrimonio',
  },
  featGrowBody: {
    en: () => 'Grow Net Worth turns your holdings into practical levers — rebalancing, adding, and the moves that actually move the needle.',
    ar: () => 'يحوّل «تنمية صافي الثروة» أصولك إلى أدوات عملية — إعادة التوازن والإضافة والخطوات التي تصنع الفرق فعلاً.',
    fr: () => 'Grow Net Worth transforme vos avoirs en leviers concrets — rééquilibrage, apports et mouvements qui comptent vraiment.',
    es: () => 'Grow Net Worth convierte tus activos en palancas prácticas: reequilibrio, aportes y movimientos que sí importan.',
    de: () => 'Grow Net Worth macht aus Ihren Werten praktische Hebel — Rebalancing, Nachschicht und die Schritte, die wirklich etwas bewegen.',
    it: () => 'Grow Net Worth trasforma i tuoi asset in leve pratiche — ribilanciamento, versamenti e le mosse che contano davvero.',
  },

  featExportTitle: {
    en: () => '📤 Take your data with you',
    ar: () => '📤 خذ بياناتك معك',
    fr: () => '📤 Emportez vos données avec vous',
    es: () => '📤 Lleva tus datos contigo',
    de: () => '📤 Nehmen Sie Ihre Daten mit',
    it: () => '📤 Porta i tuoi dati con te',
  },
  featExportBody: {
    en: () => 'Export your holdings to a local .json or .csv with a QR code — saved to your Downloads, never to the cloud.',
    ar: () => 'صدّر أصولك إلى ملف .json أو .csv مع رمز QR — محفوظ في تنزيلاتك، وليس في السحابة أبداً.',
    fr: () => 'Exportez vos avoirs en .json ou .csv avec un QR code — enregistré dans vos téléchargements, jamais dans le cloud.',
    es: () => 'Exporta tus activos a .json o .csv con un código QR: guardado en tus Descargas, nunca a la nube.',
    de: () => 'Exportieren Sie Ihre Werte als .json oder .csv mit QR-Code — aufs Gerät, nie in die Cloud.',
    it: () => 'Esporta i tuoi asset in .json o .csv con un QR code — salvato nei Download, mai sul cloud.',
  },

  featTransactionsTitle: {
    en: () => '🧾 Your trades, one ledger',
    ar: () => '🧾 صفقاتك في دفتر واحد',
    fr: () => '🧾 Un journal complet de vos transactions',
    es: () => '🧾 Un solo libro de tus operaciones',
    de: () => '🧾 Ihr Handelstagebuch an einem Ort',
    it: () => '🧾 Tutte le tue operazioni in un unico registro',
  },
  featTransactionsBody: {
    en: () => 'Log every buy and sell in Transactions — P&L, totals and per-asset history stay accurate and always at hand.',
    ar: () => 'سجّل كل عملية شراء وبيع في «المعاملات» — أرباحك وخسائرك وإجمالياتك وتاريخ كل أصل دقيقة وفي متناولك.',
    fr: () => 'Enregistrez chaque achat et vente dans Transactions — plus-values, totaux et historique par actif restent exacts et à portée de main.',
    es: () => 'Registra cada compra y venta en Transacciones: ganancias, totales e historial por activo siempre exactos y a mano.',
    de: () => 'Erfassen Sie jeden Kauf und Verkauf in „Transaktionen“ — Gewinne, Summen und Verlauf pro Asset bleiben präzise und griffbereit.',
    it: () => 'Registra ogni acquisto e vendita in Transazioni — profitti, totali e storico per asset restano precisi e sempre a portata di mano.',
  },

  featFeargreedTitle: {
    en: () => '😱 Fear or greed — right now',
    ar: () => '😱 خوف أم طمع — الآن',
    fr: () => '😱 Peur ou euphorie — en ce moment',
    es: () => '😱 ¿Miedo o codicia? Ahora mismo',
    de: () => '😱 Angst oder Gier — jetzt',
    it: () => '😱 Paura o avidità — adesso',
  },
  featFeargreedBody: {
    en: () => 'The Fear & Greed Index reads market mood from real on-chain and price data — see when the crowd is panicking or getting ahead of itself.',
    ar: () => 'يقرأ مؤشر الخوف والطمع مزاج السوق من بيانات السلسلة والأسعار الحقيقية — لترى متى يذعر الجمهور أو يبالغ في التفاؤل.',
    fr: () => 'L\u2019indice de peur et d\u2019avidit\u00e9 lit l\u2019humeur du march\u00e9 \u00e0 partir de donn\u00e9es on-chain et de prix r\u00e9elles — voyez quand la foule panique ou s\u2019emballe.',
    es: () => 'El Índice de Miedo y Codicia lee el ánimo del mercado con datos on-chain y de precio reales: ve cuándo la multitud entra en pánico o se adelanta.',
    de: () => 'Der Angst-und-Gier-Index liest die Marktstimmung aus echten On-Chain- und Kursdaten — sehen Sie, wann die Menge panisch oder zu euphorisch ist.',
    it: () => 'L\u2019indice di paura e avidit\u00e0 legge l\u2019umore del mercato da dati on-chain e prezzi reali — vedi quando la folla \u00e8 nel panico o si sta spingendo troppo.',
  },

  featRiskTitle: {
    en: () => '🛡️ How risky is your portfolio?',
    ar: () => '🛡️ ما مدى خطورة محفظتك؟',
    fr: () => '🛡️ Quel est le risque de votre portefeuille ?',
    es: () => '🛡️ ¿Cuán riesgosa es tu cartera?',
    de: () => '🛡️ Wie riskant ist Ihr Portfolio?',
    it: () => '🛡️ Quanto è rischioso il tuo portafoglio?',
  },
  featRiskBody: {
    en: () => 'The Risk Scanner stress-tests concentration, drawdown and exposure — one look at where your net worth could hurt most.',
    ar: () => 'يختبر «ماسح المخاطر» التركيز والانخفاضات والانكشاف — نظرة واحدة على أكثر ما قد يؤلم صافي ثروتك.',
    fr: () => 'Le scanner de risque met \u00e0 l\u2019\u00e9preuve concentration, baisses et exposition — un coup d\u2019\u0153il aux points de vuln\u00e9rabilit\u00e9 de votre patrimoine.',
    es: () => 'El Escáner de Riesgo pone a prueba concentración, caídas y exposición: un vistazo a lo que más podría afectar tu patrimonio.',
    de: () => 'Der Risiko-Scanner prüft Konzentration, Drawdowns und Exposure — ein Blick auf die Stellen, an denen Ihr Vermögen am meisten wehtut.',
    it: () => 'Lo scanner di rischio verifica concentrazione, drawdown ed esposizione — uno sguardo a dove il tuo patrimonio potrebbe far più male.',
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
    de: (step) => step <= 3 ? 'Die Märkte haben sich bewegt, während Sie weg waren'
      : step <= 7 ? 'Eine Woche Marktbewegungen'
      : step <= 14 ? 'Zwei Wochen — das hat sich geändert'
      : step <= 30 ? 'Ihre Watchlist läuft weiter'
      : 'Wir haben für Sie weiter verfolgt',
    it: (step) => step <= 3 ? 'I mercati si sono mossi mentre eri via'
      : step <= 7 ? 'Una settimana di movimenti di mercato'
      : step <= 14 ? 'Due settimane — ecco che cosa è cambiato'
      : step <= 30 ? 'La tua watchlist è ancora attiva'
      : 'Abbiamo continuato a seguire per te',
  },
  /** Used when we know how one of their assets actually moved — far stronger. */
  retentionMoverBody: {
    en: (sym, pct, up) => `${sym} is ${up ? 'up' : 'down'} ${pct}% since your last visit. See what it did to your portfolio.`,
    ar: (sym, pct, up) => `${sym} ${up ? 'مرتفع' : 'منخفض'} بنسبة ${pct}% منذ آخر زيارة. شاهد أثر ذلك على محفظتك.`,
    fr: (sym, pct, up) => `${sym} est ${up ? 'en hausse' : 'en baisse'} de ${pct} % depuis votre dernière visite. Voyez l’effet sur votre portefeuille.`,
    es: (sym, pct, up) => `${sym} ${up ? 'sube' : 'baja'} un ${pct} % desde tu última visita. Mira el efecto en tu cartera.`,
    de: (sym, pct, up) => `${sym} ist seit Ihrem letzten Besuch ${pct} % ${up ? 'im Plus' : 'im Minus'}. Sehen Sie, was das mit Ihrem Portfolio gemacht hat.`,
    it: (sym, pct, up) => `${sym} è ${up ? 'in rialzo' : 'in calo'} del ${pct}% dalla tua ultima visita. Guarda l’effetto sul tuo portafoglio.`,
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

/**
 * At most one tip every few days, however many preconditions are true at once.
 *
 * Order matters: the list is walked top-down, so the most valuable unused
 * feature goes first.
 *
 * The gap was a week and the cap was eight, against a list that has grown to
 * seventeen. Those two numbers together meant nine features could never be
 * mentioned to anybody, no matter how long they used the app or how much of it
 * they had left switched off — the cap ran out before the list did. A tip for a
 * feature someone is not using is the one notification here that can teach them
 * something, so a ceiling below the length of the list was throwing away the
 * whole point of the channel.
 *
 * Three days and a cap of seventeen: every feature gets its turn. Nobody
 * actually receives all seventeen — several tips are mutually exclusive by
 * construction, `diversify` wanting a single holding where `rebalance` wants
 * four — so the real worst case for somebody who has set up none of it is
 * around fourteen notifications over roughly six weeks, then silence forever.
 *
 * The real brakes are elsewhere and unchanged: each tip fires ONCE EVER, only
 * while its own precondition still holds, and it spends the daily budget like
 * anything else. Somebody who has configured the app well still gets none of
 * this.
 */
export const FEATURE_TIP_GAP_MS = 3 * 24 * 60 * 60 * 1000

/**
 * The most feature tips any one user will ever receive.
 *
 * Keep this at or above FEATURE_TIPS.length, or the tail of the list becomes
 * unreachable — which is exactly what happened when the list outgrew the cap.
 * The guard test asserts the relationship rather than the number.
 */
export const MAX_FEATURE_TIPS = 25

export const FEATURE_TIPS = [
  {
    // The dead man's switch is the feature nobody else has and nobody thinks
    // to look for. Unset is exactly when it is worth one sentence.
    id: 'guardian',
    url: '/guardian',
    when: (st) => st.watchCount > 0 && st.setup.guardian === false,
  },
  {
    // Holdings but no price targets: the highest-value thing they are not
    // using, and the channel most likely to bring them back on its own.
    id: 'targets',
    url: '/dashboard?tab=alerts',
    when: (st) => st.watchCount > 0 && st.alertCount === 0,
  },
  {
    id: 'vision',
    url: '/vision',
    when: (st) => st.watchCount > 0 && st.setup.vision === false,
  },
  {
    id: 'watchlist',
    // ?tab=, not /watchlist — the latter is not a route, and pointing a
    // notification at it lands the user on the 404 page. The dashboard's tabs
    // are addressed the same way the target alerts are.
    url: '/dashboard?tab=watchlist',
    when: (st) => st.watchCount > 0 && st.setup.watchlist === false,
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
  {
    // Per-asset exit ladders — a different feature from the price alerts
    // counted by alertCount, and the one that turns a tracker into a plan.
    id: 'coinTargets',
    url: '/dashboard?tab=targets',
    when: (st) => st.watchCount > 0 && st.setup.coinTargets === false,
  },
  {
    // No Drive file means nothing has ever been backed up there. A portfolio
    // that exists only in one browser's localStorage is one cleared cache away
    // from gone, which makes this the most consequential unset thing here.
    id: 'drive',
    url: '/settings',
    when: (st) => st.watchCount > 0 && st.setup.backup === false,
  },
  {
    // Last, and only for someone who has stayed: a weekly summary is worth
    // offering once the portfolio is clearly real.
    id: 'weekly',
    url: '/settings',
    when: (st) => st.watchCount >= 2 && st.setup.weekly === false,
  },
  {
    // Same signal as `drive` but a different job — moving to a new phone
    // rather than guarding against losing this one. Sits after it, so someone
    // who sets up Drive in the intervening week never sees this at all.
    id: 'qrtransfer',
    url: '/settings',
    when: (st) => st.watchCount > 0 && st.setup.backup === false,
  },
  {
    // The app's own lock, and the only security tip here. A privacy-first
    // tracker whose numbers sit unlocked on a borrowed or stolen phone is the
    // gap most worth one sentence — and it is one tap to close.
    id: 'applock',
    url: '/settings',
    when: (st) => st.watchCount > 0 && st.setup.applock === false,
  },
  {
    // Every tip below here is gated on whether the page has ever been opened,
    // recorded by client/src/featureUse.js. That signal exists precisely so
    // these are not the loose guess the comment on smartimport warns about.
    id: 'technicals',
    url: '/technicals',
    when: (st) => st.watchCount > 0 && st.setup.technicals === false,
  },
  {
    // Only for someone actually holding crypto: whale flow is a BTC-chain
    // feature, and offering it to a stocks-and-metals portfolio is noise.
    id: 'whales',
    url: '/whales',
    when: (st) => st.kinds.includes('crypto') && st.setup.whales === false,
  },
  {
    id: 'coach',
    url: '/coach',
    when: (st) => st.watchCount >= 2 && st.setup.coach === false,
  },
  {
    // Needs a portfolio with something to rebalance BETWEEN — several
    // holdings across more than one asset class. Offered to a two-coin
    // portfolio it is a calculator with nothing to calculate.
    id: 'rebalance',
    url: '/rebalancing-calculator',
    when: (st) => st.watchCount >= 4 && st.kinds.length >= 2 && st.setup.rebalance === false,
  },
  {
    id: 'academy',
    url: '/academy',
    when: (st) => st.watchCount > 0 && st.setup.academy === false,
  },
  {
    // The weakest precondition in the list, and deliberately last.
    //
    // Transactions do not record how they were added, so there is no way to
    // tell someone who has never used voice or screenshot import from someone
    // who uses it weekly. "Has a portfolio, so may want to add to it" is all
    // the hook there is. It survives only because the caps make the worst case
    // one notification, ever.
    //
    // The honest fix is to stamp an import source on new transactions; until
    // that exists, do not add more tips gated this loosely.
    id: 'smartimport',
    url: '/dashboard',
    // The `setup` check is not about smart import — nothing records whether it
    // has been used. It is there so a subscription predating the snapshot
    // stays silent like every other tip, instead of this one alone firing at
    // users the server knows nothing about.
    when: (st) => st.watchCount >= 2 && Object.keys(st.setup).length > 0,
  },
  {
    // The economic calendar is the one scheduled-features reminder that is
    // broadly useful, and it is the newest flagship screen most users have
    // not found. Gated on an actual portfolio like the rest.
    id: 'calendar',
    url: '/calendar',
    when: (st) => st.watchCount > 0 && st.setup.calendar === false,
  },
  {
    // Alpha score projects a direction from on-chain, technicals and market
    // factors per asset. Worth one sentence to anyone holding anything.
    id: 'alpha',
    url: '/alpha',
    when: (st) => st.watchCount > 0 && st.setup.alpha === false,
  },
  {
    // The market index is the quick all-in-one read on crypto, stocks and
    // metals in one number. Two or more holdings make the breadth worth it.
    id: 'marketindex',
    url: '/market-index',
    when: (st) => st.watchCount >= 2 && st.setup.marketindex === false,
  },
  {
    // Grow Net Worth is the actionable counterpart to the passive dashboard:
    // ideas and levers for adding to the portfolio. Offered once someone has
    // something to grow.
    id: 'grow',
    url: '/grow',
    when: (st) => st.watchCount >= 1 && st.setup.grow === false,
  },
  {
    // Export holdings to a local .json/.csv with a QR code. Privacy-first by
    // construction, and the only tip that points at a concrete file the user
    // can hold in their hands.
    id: 'export',
    url: '/dashboard?tab=data',
    when: (st) => st.watchCount >= 1 && st.setup.exportdata === false,
  },
  {
    // The full trade ledger. Anyone who tracks holdings has somewhere to log
    // the history behind them, and the P&L, totals and per-asset breakdowns
    // only exist once the trades do. Gated on the page having never opened,
    // like the other page-based tips below.
    id: 'transactions',
    url: '/transactions',
    when: (st) => st.watchCount > 0 && st.setup.transactions === false,
  },
  {
    // Market mood in one number, drawn from real on-chain and price data.
    // Only for someone actually holding crypto: Fear & Greed is a crypto
    // read, and offering it to a stocks-and-metals-only portfolio is noise.
    id: 'feargreed',
    url: '/fear-and-greed-index',
    when: (st) => st.kinds.includes('crypto') && st.setup.feargreed === false,
  },
  {
    // The Risk Scanner inside the dashboard's tools tab — concentration,
    // drawdown and exposure on the same numbers the user already watches.
    // Deep-links straight to the risk tool rather than the tab's default.
    id: 'risk',
    url: '/dashboard?tab=tools&tool=risk',
    when: (st) => st.watchCount > 0 && st.setup.risk === false,
  },
]

/**
 * The next feature tip worth sending, or null.
 *
 * @param {{watchCount:number, alertCount:number, kinds:string[]}} state
 * @param {string[]} sentIds  tips already sent to this subscription, ever
 */
/**
 * Keep only the four booleans we understand, and only when they are booleans.
 * Anything else stays absent, which pickFeatureTip reads as "already set up"
 * and therefore stays quiet about.
 */
export function sanitizeSetup(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of [
    'guardian', 'vision', 'watchlist', 'weekly', 'coinTargets', 'backup',
    'applock', 'technicals', 'whales', 'academy', 'coach', 'rebalance',
    'calendar', 'alpha', 'marketindex', 'grow', 'exportdata',
    'transactions', 'feargreed', 'risk',
  ]) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k]
  }
  return out
}

export function pickFeatureTip(state, sentIds) {
  const sent = new Set(sentIds || [])
  // A ceiling independent of how long the list gets. Every tip added otherwise
  // raises the worst case for a user who has set nothing up, and the list only
  // ever grows. Eight spread a week apart is two months of occasional
  // nudging; past that they are not going to turn the feature on because we
  // asked a ninth time.
  //
  // Raised from six when the list grew to sixteen. The point of the extra two
  // is reach, not volume: with seventeen tips and a cap of six, most users
  // would never hear about whole features. Anything beyond eight is nagging,
  // and the per-tip gates still mean a well-configured user gets none of it.
  if (sent.size >= MAX_FEATURE_TIPS) return null
  // A subscription from before the setup snapshot existed knows nothing about
  // what is configured. Treating unknown as "already set up" keeps those tips
  // silent until the next sync fills it in — the alternative is telling someone
  // to set up Guardian when they have been using it for months.
  const st = { setup: {}, kinds: [], ...state }
  for (const tip of FEATURE_TIPS) {
    if (sent.has(tip.id)) continue
    try { if (tip.when(st)) return tip } catch { /* a bad predicate sends nothing */ }
  }
  return null
}

// ── Rotating content channels ───────────────────────────────────────────────
//
// The channels above all answer "did something happen?" — and on a two-asset
// portfolio in a calm week the honest answer is no, repeatedly. That is correct
// for a price alert and wrong for the app as a whole: the Academy, the hacks
// and the portfolio read are worth something on exactly the days the market is
// not.
//
// So these three are *scheduled* rather than triggered, and the rule that keeps
// them from becoming noise is different: not "wait for a reason" but "never
// repeat yourself". Each rotates through a finite body of real content, in a
// stable order, and each has its own hour and its own gap.

/** One investment hack every other day. */
export const HACK_GAP_MS = 2 * 24 * 60 * 60 * 1000

/** Local clock slots, spread so two scheduled channels never land together. */
export const HACK_HOUR = 13
export const ACADEMY_HOUR = 18
export const PORTFOLIO_HOUR = 17

/**
 * The next hack to send, as an index into the hack list.
 *
 * Rotation, not a queue with an end. `pickFeatureTip` caps out at eight and
 * then goes silent forever, which is right for setup nudges — a ninth ask to
 * configure Guardian is nagging. A hack is not an ask, it is a thing worth
 * knowing, and "you have read all eighteen, so nothing more, ever" is how a
 * channel quietly dies. When the list is exhausted it starts again: two days
 * apart, eighteen deep, that is a five-week cycle.
 *
 * `sentIds` are indices as strings, so the same bookkeeping survives the list
 * being reordered without silently re-sending everything.
 *
 * @param {{count:number, sentIds:string[]}} args
 * @returns {{index:number, wrapped:boolean}|null}
 */
export function pickHack({ count, sentIds }) {
  const n = Math.floor(Number(count))
  if (!Number.isFinite(n) || n <= 0) return null
  const sent = new Set((sentIds || []).map(String))
  for (let i = 0; i < n; i++) if (!sent.has(String(i))) return { index: i, wrapped: false }
  // Every one has been sent. Start the cycle over rather than going silent.
  return { index: 0, wrapped: true }
}

/**
 * The daily Academy challenge teaser, as an index into the question bank.
 *
 * Deterministic from the local day rather than random, for two reasons: every
 * device on the same day gets the same question, which makes the channel
 * reproducible when someone reports one; and a device that somehow evaluates
 * the same day twice cannot draw two different questions and send both.
 *
 * The index walks by a stride coprime with the bank size, so consecutive days
 * are never adjacent questions from the same category.
 *
 * @param {{dayKey:string, count:number}} args
 * @returns {number|null}
 */
export function pickChallenge({ dayKey, count }) {
  const n = Math.floor(Number(count))
  if (!Number.isFinite(n) || n <= 0) return null
  const day = String(dayKey || '')
  if (!day) return null
  // Days since the epoch, from the YYYY-MM-DD key the rest of the file uses.
  const ms = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  const dayNo = Math.floor(ms / 86_400_000)
  const stride = coprimeStride(n)
  return ((dayNo * stride) % n + n) % n
}

/** The largest stride below n that shares no factor with it (1 when n <= 2). */
function coprimeStride(n) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
  for (let s = Math.floor(n / 2) + 1; s > 1; s--) if (gcd(s, n) === 1) return s
  return 1
}

/** A daily portfolio read needs at least one asset that actually did something. */
export const PULSE_MIN_PCT = 1

/**
 * The breadth read behind the portfolio channel: how many holdings are up,
 * how many down, and which one leads.
 *
 * Deliberately built from percentages alone. The server knows which symbols a
 * device watches — it has to, to price them — and it knows nothing else. No
 * amount, no cost basis, no total. "Four of your six are up, BTC leads at
 * +4.2%" is the most portfolio-shaped sentence that can be written from that,
 * and writing a more useful one would mean asking for data this service has
 * spent its whole design not holding.
 *
 * Returns null when there is nothing worth saying: fewer than two priced
 * holdings, or a day where nothing moved as much as PULSE_MIN_PCT.
 *
 * @param {Array<{symbol:string, pct:number}>} moves
 * @param {number} minPct
 */
export function portfolioPulse(moves, minPct = PULSE_MIN_PCT) {
  const clean = (moves || []).filter(m => Number.isFinite(Number(m?.pct)))
  if (clean.length < 2) return null

  let up = 0, down = 0, leader = null
  for (const m of clean) {
    const pct = Number(m.pct)
    if (pct > 0) up++
    else if (pct < 0) down++
    if (!leader || Math.abs(pct) > Math.abs(leader.pct)) leader = { symbol: m.symbol, pct }
  }
  // A day where every holding drifted a few basis points is a day with no
  // portfolio news, and saying so daily is how a channel gets switched off.
  if (!leader || Math.abs(leader.pct) < minPct) return null

  return { up, down, total: clean.length, leader }
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
// happens", which is what someone with a portfolio wants — and the daily budget
// still bounds it.
//
// There is no quiet-hours preference. It was here, it defaulted off, and then
// it was removed entirely: a window that suppresses alerts is a guess about
// someone's night, wrong for shift workers and for anyone whose timezone we
// inferred badly — and wrong most of all for the person who wants to know at
// 2am precisely because the market does not sleep. The daily budget below is
// the guard that actually protects the notification permission.
export const DEFAULT_PREFS = {
  moves: true,      // a holding swings sharply
  levels: true,     // a holding crosses a round price level
  news: true,       // breaking news naming a holding
  digest: true,     // morning brief — only sends when something actually moved
  retention: true,  // win-back nudges while idle
  features: true,   // one-off tips, each gated on the user's own state
  zakat: true,      // the zakat year completing — a date, never an amount
  // Scheduled content, rather than a reaction to a price. These are what make
  // the app worth a notification on a week when the market does nothing.
  newsMarket: true, // a breaking story that names no holding of yours
  hacks: true,      // one investment hack every other day
  academy: true,    // the daily Academy challenge
  portfolio: true,  // a daily breadth read on the holdings, no amounts
  movePct: 1,       // swing threshold, percent
}

const MIN_MOVE_PCT = 0.5
const MAX_MOVE_PCT = 50

export function sanitizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const bool = (v, d) => (typeof v === 'boolean' ? v : d)
  let pct = Number(p.movePct)
  if (!Number.isFinite(pct)) pct = DEFAULT_PREFS.movePct
  pct = Math.min(MAX_MOVE_PCT, Math.max(MIN_MOVE_PCT, pct))
  return {
    moves: bool(p.moves, DEFAULT_PREFS.moves),
    levels: bool(p.levels, DEFAULT_PREFS.levels),
    news: bool(p.news, DEFAULT_PREFS.news),
    digest: bool(p.digest, DEFAULT_PREFS.digest),
    retention: bool(p.retention, DEFAULT_PREFS.retention),
    features: bool(p.features, DEFAULT_PREFS.features),
    zakat: bool(p.zakat, DEFAULT_PREFS.zakat),
    newsMarket: bool(p.newsMarket, DEFAULT_PREFS.newsMarket),
    hacks: bool(p.hacks, DEFAULT_PREFS.hacks),
    academy: bool(p.academy, DEFAULT_PREFS.academy),
    portfolio: bool(p.portfolio, DEFAULT_PREFS.portfolio),
    movePct: pct,
  }
}

/**
 * Fill in whatever a record predating a field would be missing.
 *
 * Lives here, and is applied by the STORE rather than by each caller, because
 * the alternative has already bitten: a stored row is whatever shape it had
 * when it was last written, and a cron reading it raw sees `undefined` for
 * every field added since. For a preference that reads as "off", so a channel
 * shipped to everyone silently runs for nobody until they happen to reopen the
 * app; for a list it is a TypeError inside the loop, which takes out the run
 * for every other user too. Neither failure announces itself.
 *
 * Normalising at the storage boundary means no consumer has to remember. It is
 * idempotent, so the handlers that already call it explicitly are unaffected.
 */
export function normalizeSub(s = {}) {
  return {
    subscription: s.subscription,
    // Which delivery channel this device wants.
    //
    // 'webpush' for every browser, desktop and iOS home-screen install, which
    // is what every existing row is. 'fcm' for the Android app once it renders
    // itself in a WebView, because a WebView has no service worker and the Web
    // Push subscription does not exist there.
    //
    // Defaulted rather than required, so the thousands of rows written before
    // this field existed keep working untouched — a subscription that does not
    // say is a Web Push one, which is exactly what it is.
    transport: s.transport === 'fcm' ? 'fcm' : 'webpush',
    fcmToken: typeof s.fcmToken === 'string' ? s.fcmToken : '',
    alerts: s.alerts ?? [],
    fired: s.fired ?? {},
    createdAt: s.createdAt ?? Date.now(),
    lang: s.lang,
    watch: s.watch ?? [],
    prefs: { ...DEFAULT_PREFS, ...(s.prefs ?? {}) },
    tz: sanitizeTz(s.tz),
    lastSeen: s.lastSeen ?? s.createdAt ?? Date.now(),
    ref: s.ref ?? {},
    moveFired: s.moveFired ?? {},
    lastPrice: s.lastPrice ?? {},
    lastLevel: s.lastLevel ?? {},
    zakatDue: sanitizeZakatDue(s.zakatDue),
    lastError: sanitizeLastError(s.lastError),
    zakatSent: trimZakatSent(s.zakatSent),
    seenRef: s.seenRef ?? null,
    newsSent: s.newsSent ?? {},
    lastNewsAt: s.lastNewsAt ?? 0,
    digestDay: s.digestDay ?? '',
    retention: Array.isArray(s.retention) ? s.retention : [],
    setup: s.setup ?? {},
    featuresSent: Array.isArray(s.featuresSent) ? s.featuresSent : [],
    lastFeatureAt: s.lastFeatureAt ?? 0,
    // Scheduled-content bookkeeping. All cron-owned, so mergeSubForWrite keeps
    // the cron's copy — see USER_OWNED_FIELDS for the ones that go the other
    // way. A row predating these fields reads as "nothing sent yet", which is
    // the right answer: the rotation starts at the beginning.
    hacksSent: Array.isArray(s.hacksSent) ? s.hacksSent.map(String) : [],
    lastHackAt: s.lastHackAt ?? 0,
    academyDay: s.academyDay ?? '',
    pulseDay: s.pulseDay ?? '',
    sent: s.sent ?? { day: '', n: 0 },
  }
}

// ── Merging a cron's copy back over the stored row ──────────────────────────
//
// allSubs() caches its full-table scan for minutes (see main.ts), so the row a
// cron mutated can be well out of date by the time it is written. Writing it
// wholesale would undo whatever the user did meanwhile — a preference change,
// a new alert, the /seen heartbeat that says they came back.
//
// So the write is a merge, and the rule is ownership. Every field below is
// written ONLY by the HTTP handlers; the cron never touches them, so the
// stored value always wins.
export const USER_OWNED_FIELDS = [
  // The device's ADDRESS, in both its forms. `subscription` was here from the
  // start for an obvious reason — a device that re-subscribed while a cron
  // held the row must not have its new endpoint overwritten by the old one —
  // and the FCM pair belongs here by exactly that argument. FCM tokens rotate:
  // on a restore to a new device, an app-data clear, or at Firebase's own
  // discretion. Left out, a cron write would put the dead token back and the
  // device would go silent again with nothing to see.
  'subscription', 'transport', 'fcmToken',
  'alerts', 'watch', 'setup', 'prefs',
  'lang', 'tz', 'lastSeen', 'zakatDue',
]

/**
 * Combine the row a cron mutated with the row currently in storage.
 *
 * @param mutated the cron's copy, carrying whatever it just recorded
 * @param fresh   the row as stored right now, or null if it has been deleted
 * @returns the row to write, or null when there is nothing to write to
 */
export function mergeSubForWrite(mutated, fresh) {
  // Deleted mid-run. An unsubscribe must not be undone by a cron that was
  // already holding the row.
  if (!fresh) return null
  if (!mutated) return fresh

  const merged = { ...mutated }
  for (const f of USER_OWNED_FIELDS) merged[f] = fresh[f]

  // zakatSent is bookkeeping FOR a specific zakatDue. If the user moved the
  // date while this run was in flight, the reminders already sent belong to
  // the old date, and the reset that came with the new one is what counts.
  if (fresh.zakatDue !== mutated.zakatDue) {
    merged.zakatSent = Array.isArray(fresh.zakatSent) ? fresh.zakatSent : []
  }

  // retention is the one field both sides write: the win-back ladder APPENDS
  // the step it just sent, and /seen CLEARS the list because the user came
  // back. Taking it fresh unconditionally would drop the append and re-send
  // the same nudge every run; keeping ours would ignore the return visit. An
  // empty stored list means /seen ran, and that wins; otherwise our copy
  // carries the append.
  const freshRetention = Array.isArray(fresh.retention) ? fresh.retention : []
  merged.retention = freshRetention.length === 0
    ? []
    : (Array.isArray(mutated.retention) ? mutated.retention : freshRetention)

  return merged
}

// ── Zakat reminders ─────────────────────────────────────────────────────────
// The one thing the server is told is a DATE. Not the amount, not the
// portfolio value, not whether the user is above nisab — all of that is worked
// out on the device and stays there. A reminder that says "your zakat year
// completes today" needs nothing else, and asking for more would break the
// promise the rest of this file keeps.
//
// Three reminders: a month out (time to arrange the money), a week out, and on
// the day. Each fires once per due date, tracked by key.

export const ZAKAT_MILESTONES = [30, 7, 0]

const DAY_MS = 86400000

/** 'YYYY-MM-DD' → epoch ms at UTC midnight, or NaN if malformed. */
export function parseDayKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return NaN
  const t = Date.UTC(y, m - 1, d)
  // Round-trip guard: Date.UTC happily accepts 2025-02-31.
  const back = new Date(t)
  if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return NaN
  return t
}

/**
 * The last time a send to this device was REFUSED, and what it said.
 *
 * Cron-owned, so it is deliberately absent from USER_OWNED_FIELDS: the
 * senders write it and nothing on the request path does.
 *
 * It exists because `sent` answers only half the question. A zero count means
 * "nothing was delivered", which is the same reading whether nothing was due
 * or every attempt was rejected — and those two want opposite fixes. The
 * rejection text is the only thing that separates them, and until now it went
 * to a console.warn inside a Worker, where the one person who needs it cannot
 * see it without attaching a live tail at the moment it happens.
 *
 * The code is truncated hard. It is a diagnostic shown in Settings, not a log,
 * and an FCM error body can run to kilobytes of JSON.
 */
export function sanitizeLastError(raw) {
  if (!raw || typeof raw !== 'object') return null
  const at = Number(raw.at)
  const code = String(raw.code ?? '').slice(0, 160)
  if (!Number.isFinite(at) || !code) return null
  return { at, code }
}

export function sanitizeZakatDue(raw) {
  if (raw == null) return null
  const t = parseDayKey(raw)
  if (!Number.isFinite(t)) return null
  // A zakat year is one lunar year, so a due date more than ~14 months out or
  // more than a year past is not a date this app produced.
  const now = Date.now()
  if (t > now + 430 * DAY_MS || t < now - 400 * DAY_MS) return null
  return raw
}

/**
 * Which zakat reminder, if any, is due today.
 *
 * @param dueDate 'YYYY-MM-DD' — the user's own zakat anniversary
 * @param today   'YYYY-MM-DD' in the user's local timezone
 * @param sent    keys already delivered
 * @returns { days, key } or null
 */
export function dueZakatReminder({ dueDate, today, sent = [] }) {
  const due = parseDayKey(dueDate)
  const now = parseDayKey(today)
  if (!Number.isFinite(due) || !Number.isFinite(now)) return null

  const daysOut = Math.round((due - now) / DAY_MS)
  // Past the date: the app rolls the year forward once it is paid, so a due
  // date in the past means it has not been. Keep saying so on the day itself
  // only — a daily nag about an obligation is not this app's place.
  if (daysOut < 0) return null

  // The largest milestone at or above today's distance, so a phone that was
  // off for the 30-day mark still gets the 7-day one rather than nothing.
  const hit = ZAKAT_MILESTONES.find(m => daysOut === m)
  if (hit === undefined) return null

  const key = `${dueDate}:${hit}`
  if (sent.includes(key)) return null
  return { days: hit, key }
}

/** Keep the sent-key list from growing without bound. */
export function trimZakatSent(sent, max = 12) {
  const list = Array.isArray(sent) ? sent.filter(x => typeof x === 'string') : []
  return list.length > max ? list.slice(list.length - max) : list
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

// ── Timezone and the daily budget ───────────────────────────────────────────
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

/**
 * How many notifications this device has had today, on its own clock.
 *
 * This used to be a budget: six a day across every automated channel, and the
 * seventh was dropped. It is a counter now, by product decision — nothing is
 * ever withheld for being the seventh. A price that moved is worth saying so
 * whether or not five other things happened first, and a tracker that goes
 * quiet for the rest of the day the moment the market gets interesting is
 * quiet exactly when it is most needed.
 *
 * The per-channel gates are what keep the volume sane, and they are untouched:
 * MOVE_COOLDOWN_MS holds each asset for three hours after it fires (levels
 * share that same timer), NEWS_COOLDOWN_MS four, the brief is once a day and
 * only when something actually moved, retention steps are days apart and
 * FEATURE_TIP_GAP_MS is three days. Those are per-reason and cannot stack into
 * a stream from one event; a global cap could only ever silence a *different*
 * reason, which is the one thing it should not do.
 *
 * The count is kept because /status reports it. "Notifications are on and
 * nothing arrives" is indistinguishable from "nothing happened worth sending"
 * without a number, and that ambiguity has already cost this service one
 * multi-day debugging session.
 */
export function bumpSent(sent, nowMs, tzOffsetMin) {
  const day = localDayKey(nowMs, tzOffsetMin)
  if (!sent || sent.day !== day) return { day, n: 1 }
  return { day, n: (sent.n || 0) + 1 }
}

// ── Movement detection ──────────────────────────────────────────────────────
// A rolling reference price per asset, rebased whenever it fires or ages out.
// Rebasing on fire is what stops a steady climb from re-firing every cycle;
// rebasing after a day is what stops a week-old reference from making a normal
// market look like a crash.
export const MOVE_REF_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const MOVE_COOLDOWN_MS = 1 * 60 * 60 * 1000

/**
 * Where an asset was 24h ago, for the first reference point of a new watcher.
 *
 * evaluateMove says nothing on first sighting and starts the window from the
 * CURRENT price — correct for an asset that has just been added to a portfolio
 * someone has been watching all along, and wrong for the case that actually
 * happens: a device that registers while a move is already underway. A coin up
 * 20% on the day reads as 0% from that moment and stays silent until it moves
 * another whole threshold on top of the 20% the user never heard about.
 *
 * Seeding from the 24h-ago price instead makes the very first evaluation
 * reflect the day that actually happened. Returns null when the change is
 * unusable, and the caller falls back to the old behaviour.
 *
 * @param {{price:number, change24h:number, now:number}} q
 * @returns {{price:number, ts:number}|null}
 */
/**
 * The round-number spacing that matters at a given price.
 *
 * A fixed step cannot work across four orders of magnitude — $1,000 steps
 * would be silent forever on a token under a dollar, and one-cent steps on
 * bitcoin would fire hundreds of times an hour. So the step scales with the
 * price. What it must ALSO do is scale smoothly, and a plain tenth-of-the-
 * magnitude (10 ** (floor(log10 p) - 1)) does not: the step is constant across
 * a whole decade while the price inside that decade grows tenfold, so the gap
 * a price must travel to reach a level slides from 1% at the top of the decade
 * to 10% at the bottom of the next one, in one jump.
 *
 * That jump is not theoretical. At $99,000 bitcoin was 1.0% from a level; the
 * day it crossed $100,000 the step went from $1,000 to $10,000 and it needed
 * 9.9%. The channel switched itself off at exactly the price everyone was
 * watching, and worse than silently: a 9.9% move is one the movement channel
 * has long since reported, so the level alert had nothing left to add.
 *
 * The leading digit therefore picks a 1-2-5 sub-step, which is the ladder
 * chart axes and exchange price grids already use. The gap stays between 1%
 * and 2.5% of the price everywhere, with no cliff at any power of ten, and the
 * levels stay round: $77,000 on bitcoin at $77k, $112,000 at $110k, $2,500 on
 * a $2.5k ether, 66 cents on a 66-cent token.
 *
 * @param {number} price
 * @returns {number} step, or 0 when the price is unusable
 */
export function roundLevelStep(price) {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return 0
  const base = Math.pow(10, Math.floor(Math.log10(p)))
  const lead = p / base            // leading digit, 1 <= lead < 10
  // gap = sub / lead percent, so each band lands inside 1%-2.5%.
  const sub = lead < 2 ? 2 : lead < 5 ? 5 : 10
  return (base * sub) / 100
}

/**
 * The round level a price has just crossed, if any.
 *
 * This is the alert an exchange sends and a percentage cannot express: "BTC
 * drops below $77,000" lands because the number is round, not because the move
 * was large. A 0.4% slip past a level people are watching is worth more than a
 * 3% drift in the middle of a range.
 *
 * Crossing is judged between the previous observed price and the current one,
 * so a level is reported once, on the pass that crosses it, in whichever
 * direction. `lastLevel` suppresses the re-alert when a price oscillates
 * around a level it has already announced.
 *
 * @param {{price:number, prev:number, lastLevel?:number|null}} args
 * @returns {{level:number, up:boolean}|null}
 */
export function crossedLevel({ price, prev, lastLevel = null }) {
  const p = Number(price)
  const q = Number(prev)
  if (!Number.isFinite(p) || !Number.isFinite(q) || p <= 0 || q <= 0) return null

  // Step from the lower of the two, so a move spanning a magnitude boundary
  // (999 -> 1001) is measured at the finer spacing rather than skipping levels.
  const step = roundLevelStep(Math.min(p, q))
  if (!step) return null

  const up = p > q
  // The level crossed nearest to where the price ended up. A pass that jumps
  // several levels reports the furthest one reached, which is the one worth
  // saying out loud.
  const level = up ? Math.floor(p / step) * step : Math.ceil(p / step) * step
  if (level <= 0) return null

  // Did the price actually pass it, rather than merely sit on that side?
  const crossed = up ? (q < level && p >= level) : (q > level && p <= level)
  if (!crossed) return null

  // Already announced, and the price has not moved on to a further level.
  if (lastLevel !== null && Math.abs(level - lastLevel) < step / 2) return null

  return { level, up }
}

export function seedRefFromChange({ price, change24h, now }) {
  const p = Number(price)
  const pct = Number(change24h)
  if (!Number.isFinite(p) || p <= 0) return null
  // A -100% change implies a price of zero 24h ago; anything at or past that
  // is bad data, not a move.
  if (!Number.isFinite(pct) || pct <= -100) return null
  const dayAgo = p / (1 + pct / 100)
  if (!Number.isFinite(dayAgo) || dayAgo <= 0) return null
  return { price: dayAgo, ts: now - MOVE_REF_MAX_AGE_MS }
}

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

/**
 * Terms that make a story market-wide rather than about one coin.
 *
 * The news channel matches articles against the user's own watch list, which
 * is correct and also why it almost never fires: a device watching two assets
 * matches a handful of the stories a wire publishes in a day. The fix is not
 * to loosen the per-asset match — "GAS prices" pushing an alert to a GAS
 * holder is exactly the failure AMBIGUOUS_SYMBOLS exists to prevent — but to
 * admit a second, clearly-labelled kind of story: the ones that move every
 * portfolio regardless of what is in it.
 *
 * Curated rather than inferred. A frequency heuristic would drift with
 * whatever the feed happens to be publishing; this list says, in one place,
 * what counts as market-wide, and a story that matches none of it stays out.
 */
const MARKET_TERMS = [
  'bitcoin', 'ethereum',
  // Central banks. "fed" alone is not here on purpose — \bfed\b matches "fed
  // up" and "fed the dog", and a channel that fires on those is finished. The
  // phrasings a wire actually uses are listed instead.
  'federal reserve', 'the fed', 'fed cuts', 'fed raises', 'fed hikes',
  'fed holds', 'fed chair', 'fomc', 'powell', 'rate decision',
  'cuts rates', 'raises rates', 'hikes rates', 'basis points',
  'interest rate', 'interest rates', 'rate cut', 'rate hike',
  // Macro prints that move everything on the day they land.
  'inflation', 'cpi', 'jobs report', 'unemployment', 'gdp', 'recession',
  'tariff', 'treasury yield', 'bond yields',
  // Whole-market conditions and the events that reprice a sector at once.
  'stock market', 's&p 500', 'nasdaq', 'dow jones',
  'bear market', 'bull market', 'market crash', 'all-time high',
  'sec approves', 'spot etf', 'etf approval', 'halving',
]

/**
 * Whether a story is about the market as a whole.
 *
 * Phrase matching, not word matching: "the fed" and "rate cut" are two-word
 * signals whose individual halves are worthless, and `\bgdp\b` on a title
 * containing "GDPR" is the sort of thing that makes a channel untrustworthy.
 *
 * @param {{title?:string, description?:string}} article
 */
export function isMarketStory(article) {
  const hay = `${article?.title || ''} ${article?.description || ''}`.toLowerCase()
  if (!hay.trim()) return false
  return MARKET_TERMS.some(term => new RegExp(`\\b${escapeRe(term)}\\b`).test(hay))
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
  // The zakat tab, not the tools tab it used to point at. Zakat has a tab of
  // its own — a reminder that lands one tab away from the calculator it is
  // about makes the user go looking for what they were just told.
  zakat: '/dashboard?tab=zakat',
  // The three scheduled channels each land on the page they are about, not on
  // the dashboard. A hack that opens a portfolio screen has thrown away the
  // one thing the tap was for.
  hack: '/academy?tab=hacks',
  academy: '/academy?tab=challenge',
  portfolio: '/dashboard',
  test: '/settings',
}

/**
 * Where a notification about ONE asset should land: that asset's own page.
 *
 * CHANNEL_URL can only answer "what kind of notification is this", and for the
 * price channels that is not the interesting question. Being told BTC crossed
 * a target and then being shown the dashboard makes the reader do the work the
 * notification was supposed to have done — find the asset, open it, see the
 * chart. The payload already knows which asset it is about.
 *
 * The id, not the symbol: /asset/:coinId is keyed by the id the app stores
 * ('bitcoin'), and two listings can share a symbol. Encoded because an id
 * arrives from a watch list the user's own device sent.
 *
 * Returns null when there is no id to use — a market-wide story, or a
 * subscription written before watch entries carried one — and the caller then
 * falls back to the channel's own page rather than linking to /asset/undefined.
 */
export function assetUrl(asset) {
  const id = appAssetId(asset)
  return id ? `/asset/${encodeURIComponent(id)}` : null
}

/**
 * The id the APP files this asset under, which is not always the one the
 * subscription stores.
 *
 * This is the whole reason assetUrl is not one line. A subscription carries
 * assets in two shapes and only one of them is already the app's id:
 *
 *   alerts      keep `coin_id` exactly as the app wrote it — 'metal:xau'
 *   watch       are built by toWatchAssets(), which SPLITS the id into a
 *               `kind` and an id with the prefix REMOVED — 'metal' + 'xau'
 *
 * That split is right for the server, which groups quote lookups by kind. It
 * is wrong for a link: /asset/:coinId is keyed by the prefixed id, and
 * assetClass() reads the prefix to decide what an asset even is. So '/asset/xau'
 * is not a shorter way of saying gold — it is a request for a CRYPTO COIN
 * called "xau", which does not exist, and the page comes up empty.
 *
 * Gold is the single largest holding in more than a few portfolios, so the
 * flagship case of this whole feature — "the price alert opens the asset" —
 * would have been broken for exactly the people most likely to tap it.
 *
 * The prefix is put back from `kind`. Tokenized stocks are the one lossy case:
 * toWatchAssets strips 'stock:' and 'xstock:' to the same thing, so a holder
 * of xstock:aapl lands on stock:aapl. That is the right ASSET on the wrong
 * listing, which is still incomparably better than the dashboard.
 */
const KIND_PREFIX = { metal: 'metal:', stock: 'stock:', crypto: '' }

function appAssetId(asset) {
  // An alert's own id, already in the app's form. Checked first: it is the
  // authoritative one wherever it exists.
  const stored = asset?.coin_id
  if (stored !== undefined && stored !== null && String(stored).trim()) {
    return String(stored).trim()
  }

  const bare = asset?.id
  if (bare === undefined || bare === null || !String(bare).trim()) return null
  const s = String(bare).trim()

  // An unknown kind is left alone rather than guessed at: a wrong prefix is a
  // link to nothing, while a bare id at least still works for crypto, which is
  // what an unrecognised kind most likely is.
  const prefix = KIND_PREFIX[asset?.kind] ?? ''
  // Already prefixed — a caller that passed the app's id under `id`.
  if (prefix && s.startsWith(prefix)) return s
  return prefix + s
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
  level:     { urgency: 'high',   ttl: 60 * 60 },       // 1h — about a price
  news:      { urgency: 'normal', ttl: 2 * 60 * 60 },   // 2h — story goes stale
  digest:    { urgency: 'low',    ttl: 4 * 60 * 60 },   // stale after the morning
  retention: { urgency: 'low',    ttl: 12 * 60 * 60 },  // no hurry by definition
  feature:   { urgency: 'low',    ttl: 24 * 60 * 60 },  // useful whenever it lands
  // Scheduled content is never urgent — none of it is about a number that is
  // about to change. Low urgency lets the phone batch them with whatever else
  // is pending, which is also why they can share a day with a price alert
  // without feeling like two interruptions.
  hack:      { urgency: 'low',    ttl: 24 * 60 * 60 },  // true tomorrow too
  portfolio: { urgency: 'low',    ttl: 6 * 60 * 60 },   // a read on today
  // The challenge is the one that expires: it IS today's, and arriving after
  // midnight would point at a question that is no longer the one on screen.
  academy:   { urgency: 'low',    ttl: 5 * 60 * 60 },
  // High urgency for three notifications a year. The reminder is worth waking
  // a dozing phone for — it is a religious obligation falling due on a date the
  // user chose, not a price that will still be there later — and the loudness
  // invariant is that a channel which buzzes is one that wakes the device.
  // The long TTL is the other half: unlike a price, this stays true all day.
  zakat:     { urgency: 'high',   ttl: 24 * 60 * 60 },
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
