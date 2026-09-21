import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { track } from '../analytics'
import {
  GRAMS_PER_TROY_OZ, NISAB_GOLD_GRAMS, NISAB_SILVER_GRAMS,
  RATE_LUNAR, RATE_SOLAR, nisabValue, nextRamadan,
} from '../zakat'

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
)

// Spot prices, from the same feed the app uses (allowed by the site CSP).
// A failure is not fatal: both fields stay editable and the page keeps working
// with whatever the visitor types, because a calculator that refuses to compute
// when one upstream is down is worse than one working from a typed-in price.
const GOLD_URL = 'https://api.gold-api.com/price/XAU'
const SILVER_URL = 'https://api.gold-api.com/price/XAG'
// Without a timeout the page hangs rather than degrades. A blocked or stalled
// feed leaves the promise unsettled forever, so the "could not reach the feed"
// message never appears and the visitor sits in front of empty price fields
// with no idea they are meant to type into them. Six seconds, then fall back
// to manual entry — which the calculator supports fully.
const SPOT_TIMEOUT_MS = 6000

/**
 * Long-term shares are zakatable on the company's underlying zakatable assets,
 * which no price feed can know. 30% is the widely published approximation and
 * is labelled as one wherever it is shown. Shares bought to trade are stock in
 * trade and zakatable in full.
 */
const LONG_TERM_PORTION = 0.30

const COPY = {
  en: {
    dir: 'ltr',
    title: 'Zakat Calculator for Crypto, Gold & Stocks',
    sub: <>Work out what you owe on a modern portfolio — <strong>cash, gold, silver, crypto and shares</strong> — against a live nisab. Nothing you type is sent anywhere.</>,
    yourWealth: 'Your wealth',
    cash: 'Cash & bank',
    gold: 'Gold',
    silver: 'Silver',
    grams: 'grams',
    crypto: 'Crypto',
    stocks: 'Shares & ETFs',
    held: 'Held',
    longTerm: 'Long term',
    trading: 'To trade',
    liabilities: 'Debts due now',
    basis: 'Zakat year',
    lunar: 'Lunar (2.5%)',
    solar: 'Solar (2.577%)',
    standard: 'Nisab standard',
    silverStd: 'Silver (595g)',
    goldStd: 'Gold (85g)',
    spot: 'Spot price, per troy ounce',
    nisabIs: 'Nisab today',
    zakatable: 'Zakatable wealth',
    owed: 'Zakat due',
    below: 'Below nisab — no zakat is due on this amount.',
    aboveNote: 'Due once this wealth has been held for a full year (hawl).',
    ramadan: 'Next Ramadan begins about',
    ctaLive: 'Calculate on my live portfolio',
    ctaNote: 'The app values your holdings at live prices, tracks the hawl year for you, and can remind you a month, a week and a day before it completes. The reminder carries a date only, never an amount.',
    h2how: 'How zakat on a portfolio is calculated',
    steps: [
      <>Add up everything <strong>zakatable</strong>: cash, gold, silver, crypto, shares, money owed to you.</>,
      <>Subtract <strong>debts that are due now</strong>. Not a whole 25-year mortgage — the instalments you owe.</>,
      <>Compare the total to <strong>nisab</strong>, the minimum threshold, set by the price of 595g of silver or 85g of gold.</>,
      <>If you are at or above nisab and have been for a <strong>full year</strong>, pay <strong>2.5%</strong> of the total.</>,
    ],
    h2what: 'What counts in a modern portfolio',
    rows: [
      ['Cash, bank balances, savings', 'Zakatable in full.'],
      ['Gold and silver', 'Zakatable in full, by weight, whether bullion, coins or jewellery held as wealth.'],
      ['Crypto', 'Treated as a tradeable asset by most contemporary scholars and zakatable at market value on your due date.'],
      ['Shares held to trade', 'Stock in trade — zakatable in full at market value.'],
      ['Shares held long term', 'Zakatable on the company’s underlying zakatable assets. About 30% of market value is the common approximation.'],
      ['Pensions you cannot access', 'Generally excluded until accessible. Scholars differ; ask yours.'],
      ['Your home, car, tools of work', 'Not zakatable. Personal use, not wealth held.'],
    ],
    h2nisab: 'Gold nisab or silver nisab?',
    nisabBody: <>The two thresholds come from the Prophet ﷺ setting them in metal, and metal prices have drifted far apart since. <strong>595g of silver</strong> is worth far less than <strong>85g of gold</strong>, so the silver standard puts more people above the threshold and more wealth into circulation to those entitled to it. Most contemporary zakat bodies use silver for cash and mixed wealth, which is why it is the default here. The gold standard is the stricter one on the payer’s side and is also held. Both are offered above; neither is hidden in a settings screen.</>,
    h2year: 'The lunar year, and why the rate changes',
    yearBody: <>Zakat is due after one <strong>lunar</strong> year — about 354 days — at 2.5%. If you would rather pay on a fixed solar date, the rate is scaled to <strong>2.577%</strong> to cover the extra eleven days. Paying 2.5% on a solar year quietly underpays a little, every year, forever.</>,
    h2faq: 'Common questions',
    faq: [
      ['Do I pay zakat on crypto?', 'Most contemporary scholars treat crypto as a tradeable asset, zakatable at 2.5% of its market value on your due date, provided your total wealth is at or above nisab. A minority hold that it is not wealth at all. This calculator includes it and lets you set it to zero if you follow that view.'],
      ['Do I pay zakat on shares I hold long term?', 'You pay on the company’s underlying zakatable assets rather than the whole share price. Since no price feed can see a balance sheet, about 30% of market value is the commonly used approximation. Shares bought to trade are zakatable in full.'],
      ['What is nisab right now?', 'Nisab is the value of 85 grams of gold or 595 grams of silver, so it moves with the metal price. This page prices it live and shows the figure it used.'],
      ['What if my wealth dipped below nisab during the year?', 'The Hanafi position is that only the start and end of the year matter, so a dip in between is ignored. The other three schools hold that wealth must stay at or above nisab throughout, or the year restarts. The app lets you choose which rule to track.'],
      ['Is my data sent anywhere?', 'No. This page computes in your browser and stores nothing. In the app your holdings stay on your device, and the zakat reminder sends a date only — never an amount.'],
    ],
    disclaimer: 'This is a calculation tool, not a fatwa. Rulings differ between schools and scholars, particularly on crypto and on shares. Take the number to someone qualified before you act on it.',
    home: 'WalletLens home',
  },
  ar: {
    dir: 'rtl',
    title: 'حاسبة الزكاة للعملات الرقمية والذهب والأسهم',
    sub: <>احسب زكاتك على محفظة حديثة — <strong>نقد وذهب وفضة وعملات رقمية وأسهم</strong> — مقابل نصاب محدَّث بالسعر الحالي. لا يُرسل ما تكتبه إلى أي جهة.</>,
    yourWealth: 'أموالك',
    cash: 'النقد والبنك',
    gold: 'ذهب',
    silver: 'فضة',
    grams: 'جرام',
    crypto: 'عملات رقمية',
    stocks: 'أسهم وصناديق',
    held: 'القيمة',
    longTerm: 'استثمار طويل',
    trading: 'للمتاجرة',
    liabilities: 'ديون حالّة',
    basis: 'الحول',
    lunar: 'قمري (٢٫٥٪)',
    solar: 'شمسي (٢٫٥٧٧٪)',
    standard: 'معيار النصاب',
    silverStd: 'الفضة (٥٩٥ جم)',
    goldStd: 'الذهب (٨٥ جم)',
    spot: 'السعر الفوري للأونصة',
    nisabIs: 'النصاب اليوم',
    zakatable: 'المال الزكوي',
    owed: 'الزكاة المستحقة',
    below: 'أقل من النصاب — لا زكاة على هذا المبلغ.',
    aboveNote: 'تجب بعد حَوَلان الحول على هذا المال.',
    ramadan: 'رمضان القادم يبدأ تقريبًا في',
    ctaLive: 'احسبها على محفظتي الحيّة',
    ctaNote: 'يقوّم التطبيق ممتلكاتك بالأسعار الحيّة، ويتتبع الحول عنك، ويذكّرك قبل تمامه بشهر وبأسبوع وفي يومه. التذكير يحمل تاريخًا فقط، ولا يحمل مبلغًا أبدًا.',
    h2how: 'كيف تُحسب زكاة المحفظة',
    steps: [
      <>اجمع كل ما هو <strong>زكوي</strong>: النقد والذهب والفضة والعملات الرقمية والأسهم والديون لك.</>,
      <>اطرح <strong>الديون الحالّة</strong> عليك، لا كامل قرض ممتد لسنوات، بل ما استحق منه.</>,
      <>قارن المجموع بـ<strong>النصاب</strong>، وهو قيمة ٥٩٥ جرامًا من الفضة أو ٨٥ جرامًا من الذهب.</>,
      <>إن بلغت النصاب ومضى عليه <strong>حول كامل</strong>، فأخرج <strong>٢٫٥٪</strong> من المجموع.</>,
    ],
    h2what: 'ماذا يدخل في المحفظة الحديثة',
    rows: [
      ['النقد وأرصدة البنوك والمدخرات', 'زكوي بالكامل.'],
      ['الذهب والفضة', 'زكوي بالكامل بالوزن، سبائك كان أو عملات أو حليًا مُتّخذًا للادّخار.'],
      ['العملات الرقمية', 'يعدّها أكثر المعاصرين مالًا متقوَّمًا، وتزكَّى بقيمتها السوقية يوم الوجوب.'],
      ['أسهم المتاجرة', 'عروض تجارة، تزكَّى بقيمتها السوقية كاملة.'],
      ['أسهم الاستثمار الطويل', 'تزكَّى على الموجودات الزكوية للشركة، والتقدير الشائع نحو ٣٠٪ من القيمة السوقية.'],
      ['المعاشات غير المتاحة', 'تُستثنى غالبًا حتى تصير متاحة، وللعلماء فيها خلاف.'],
      ['بيتك وسيارتك وأدوات عملك', 'ليست زكوية، فهي للاستعمال لا للنماء.'],
    ],
    h2nisab: 'نصاب الذهب أم نصاب الفضة؟',
    nisabBody: <>النصابان ثابتان بالمعدن، وقد تباعد سعرا المعدنين كثيرًا منذ ذلك الحين. <strong>٥٩٥ جرامًا من الفضة</strong> أقل قيمة بكثير من <strong>٨٥ جرامًا من الذهب</strong>، فمعيار الفضة يُدخل عددًا أكبر في حدّ الوجوب ويوصل مالًا أكثر إلى مستحقيه. ولهذا تأخذ به أكثر هيئات الزكاة المعاصرة في النقود والأموال المختلطة، وهو الافتراضي هنا. ومعيار الذهب أيسر على المزكّي وبه قائلون. والخياران معروضان أعلاه، ولم يُخبَّأ أحدهما في شاشة إعدادات.</>,
    h2year: 'الحول القمري، ولماذا تتغير النسبة',
    yearBody: <>تجب الزكاة بعد <strong>حول قمري</strong> نحو ٣٥٤ يومًا بنسبة ٢٫٥٪. فإن أحببت الإخراج في تاريخ شمسي ثابت، رُفعت النسبة إلى <strong>٢٫٥٧٧٪</strong> لتغطية الأحد عشر يومًا الزائدة. وإخراج ٢٫٥٪ على حول شمسي ينقص شيئًا يسيرًا كل عام.</>,
    h2faq: 'أسئلة شائعة',
    faq: [
      ['هل في العملات الرقمية زكاة؟', 'يعدّها أكثر المعاصرين مالًا متقوَّمًا تجب فيه الزكاة بنسبة ٢٫٥٪ من قيمتها السوقية يوم الوجوب إذا بلغ مجموع مالك النصاب. وذهب قليل إلى أنها ليست مالًا. وهذه الحاسبة تُدخلها، ويمكنك تصفيرها إن أخذت بالقول الآخر.'],
      ['وأسهم الاستثمار الطويل؟', 'تزكَّى على الموجودات الزكوية للشركة لا على كامل سعر السهم. ولمّا كانت أسعار السوق لا تكشف الميزانية، شاع تقدير نحو ٣٠٪ من القيمة السوقية. أما أسهم المتاجرة فتزكَّى كاملة.'],
      ['كم النصاب الآن؟', 'النصاب قيمة ٨٥ جرامًا من الذهب أو ٥٩٥ جرامًا من الفضة، فهو يتغير بتغير سعر المعدن. وهذه الصفحة تحسبه بالسعر الحالي وتعرض الرقم الذي استعملته.'],
      ['وإن نقص مالي عن النصاب أثناء الحول؟', 'عند الحنفية يُعتبر طرفا الحول فقط ويُغتفر النقص بينهما. وعند الجمهور لا بد من بقاء المال نصابًا طوال الحول وإلا استُؤنف. والتطبيق يتيح لك اختيار ما تتبعه.'],
      ['هل تُرسل بياناتي؟', 'لا. تُحسب هذه الصفحة في متصفحك ولا تحفظ شيئًا. وفي التطبيق تبقى ممتلكاتك على جهازك، ويحمل تذكير الزكاة تاريخًا فقط لا مبلغًا.'],
    ],
    disclaimer: 'هذه أداة حساب لا فتوى. تختلف الأقوال بين المذاهب والعلماء، خصوصًا في العملات الرقمية والأسهم. اعرض النتيجة على أهل العلم قبل العمل بها.',
    home: 'الصفحة الرئيسية',
  },
}

/**
 * The whole calculation, as a pure function of what the visitor typed.
 *
 * Exported and tested rather than left inline: the arithmetic IS the product
 * here. A mis-converted gram or the wrong rate on a solar year is a religious
 * obligation calculated wrongly, and that is not something a rendered screen
 * would reveal.
 */
export function computeZakatFromInputs({
  cash = 0, goldGrams = 0, silverGrams = 0, crypto = 0, shares = 0,
  sharesLongTerm = true, debts = 0,
  goldPerOz = 0, silverPerOz = 0,
  standard = 'silver', basis = 'lunar',
} = {}) {
  const nisab = nisabValue({ standard, goldPerOz, silverPerOz })
  const goldValue = (num(goldGrams) / GRAMS_PER_TROY_OZ) * num(goldPerOz)
  const silverValue = (num(silverGrams) / GRAMS_PER_TROY_OZ) * num(silverPerOz)
  const shareValue = num(shares) * (sharesLongTerm ? LONG_TERM_PORTION : 1)
  const gross = num(cash) + goldValue + silverValue + num(crypto) + shareValue
  // Never negative: debts larger than assets mean nothing is owed, not that
  // zakat runs backwards into a refund.
  const net = Math.max(0, gross - num(debts))
  const rate = basis === 'solar' ? RATE_SOLAR : RATE_LUNAR
  // Below nisab there is no obligation, so the amount is 0 rather than a small
  // number the page would otherwise invite someone to pay.
  const due = nisab != null && net >= nisab
  return { nisab, goldValue, silverValue, shareValue, net, rate, due, amount: due ? net * rate : 0 }
}

const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const money = (n, lang) =>
  n.toLocaleString(lang === 'ar' ? 'en-US' : 'en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

export default function ZakatCalculatorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // Read from the PATH, not from the language context. Context is seeded from
  // localStorage and the browser, so /ar/zakat-calculator would render English
  // for an English-configured browser — contradicting both its own prerendered
  // HTML and the hreflang pointing at it. The URL is the promise; keep it.
  const isAr = location.pathname.startsWith('/ar/')
  const c = isAr ? COPY.ar : COPY.en
  const lang = isAr ? 'ar' : 'en'

  const [goldOz, setGoldOz] = useState('')
  const [silverOz, setSilverOz] = useState('')
  const [spotFailed, setSpotFailed] = useState(false)

  const [cash, setCash] = useState('')
  const [goldG, setGoldG] = useState('')
  const [silverG, setSilverG] = useState('')
  const [crypto, setCrypto] = useState('')
  const [stocks, setStocks] = useState('')
  const [stocksLongTerm, setStocksLongTerm] = useState(true)
  const [debts, setDebts] = useState('')
  const [standard, setStandard] = useState('silver')
  const [basis, setBasis] = useState('lunar')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(GOLD_URL, { signal: AbortSignal.timeout(SPOT_TIMEOUT_MS) }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(SILVER_URL, { signal: AbortSignal.timeout(SPOT_TIMEOUT_MS) }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([g, s]) => {
      if (cancelled) return
      const gp = Number(g?.price), sp = Number(s?.price)
      if (Number.isFinite(gp) && gp > 0) setGoldOz(String(Math.round(gp * 100) / 100))
      if (Number.isFinite(sp) && sp > 0) setSilverOz(String(Math.round(sp * 100) / 100))
      if (!(gp > 0) || !(sp > 0)) setSpotFailed(true)
    })
    return () => { cancelled = true }
  }, [])

  const calc = useMemo(() => computeZakatFromInputs({
    cash, goldGrams: goldG, silverGrams: silverG, crypto, shares: stocks,
    sharesLongTerm: stocksLongTerm, debts,
    goldPerOz: goldOz, silverPerOz: silverOz, standard, basis,
  }), [goldOz, silverOz, cash, goldG, silverG, crypto, stocks, stocksLongTerm, debts, standard, basis])

  const ramadan = useMemo(() => {
    const d = nextRamadan(new Date())
    if (!d) return null
    return d.toLocaleDateString(isAr ? 'ar' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }, [isAr])

  const field = (label, value, onChange, suffix) => (
    <label className="zk-lp-field">
      <span className="zk-lp-label">{label}</span>
      <span className="zk-lp-input">
        <input inputMode="decimal" value={value} placeholder="0"
          onChange={e => onChange(e.target.value)} />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  )

  return (
    <div className="wl-app wl-app-landing" dir={c.dir}>
      <main className="tc-page">
        <header className="tc-head">
          <Link to={isAr ? '/ar/free-net-worth-tracker' : '/'} className="tc-brand" aria-label={c.home}>
            <Logo size={34} /> <span>WalletLens</span>
          </Link>
        </header>

        <section className="tc-hero">
          <h1 className="tc-h1">{c.title}</h1>
          <p className="tc-sub">{c.sub}</p>

          <div className="zk-lp-card">
            <div className="zk-lp-grid">
              {field(c.cash, cash, setCash, '$')}
              {field(`${c.gold} — ${c.grams}`, goldG, setGoldG, 'g')}
              {field(`${c.silver} — ${c.grams}`, silverG, setSilverG, 'g')}
              {field(c.crypto, crypto, setCrypto, '$')}
              {field(c.stocks, stocks, setStocks, '$')}
              {field(c.liabilities, debts, setDebts, '$')}
            </div>

            <div className="zk-lp-opts">
              <div className="zk-lp-seg" role="group" aria-label={c.stocks}>
                <button type="button" className={stocksLongTerm ? 'on' : ''} onClick={() => setStocksLongTerm(true)}>{c.longTerm}</button>
                <button type="button" className={!stocksLongTerm ? 'on' : ''} onClick={() => setStocksLongTerm(false)}>{c.trading}</button>
              </div>
              <div className="zk-lp-seg" role="group" aria-label={c.standard}>
                <button type="button" className={standard === 'silver' ? 'on' : ''} onClick={() => setStandard('silver')}>{c.silverStd}</button>
                <button type="button" className={standard === 'gold' ? 'on' : ''} onClick={() => setStandard('gold')}>{c.goldStd}</button>
              </div>
              <div className="zk-lp-seg" role="group" aria-label={c.basis}>
                <button type="button" className={basis === 'lunar' ? 'on' : ''} onClick={() => setBasis('lunar')}>{c.lunar}</button>
                <button type="button" className={basis === 'solar' ? 'on' : ''} onClick={() => setBasis('solar')}>{c.solar}</button>
              </div>
            </div>

            <div className="zk-lp-spot">
              <span>{c.spot}</span>
              {field(c.gold, goldOz, setGoldOz, '$')}
              {field(c.silver, silverOz, setSilverOz, '$')}
            </div>

            <div className="zk-lp-out">
              <div className="zk-lp-out-row">
                <span>{c.nisabIs}</span>
                <b>{calc.nisab == null ? '—' : `$${money(calc.nisab, lang)}`}</b>
              </div>
              <div className="zk-lp-out-row">
                <span>{c.zakatable}</span>
                <b>${money(calc.net, lang)}</b>
              </div>
              <div className={`zk-lp-out-row zk-lp-out-total${calc.due ? ' due' : ''}`}>
                <span>{c.owed}</span>
                <b>{calc.due ? `$${money(calc.amount, lang)}` : '—'}</b>
              </div>
              <p className="zk-lp-note">{calc.due ? c.aboveNote : c.below}</p>
            </div>
          </div>

          {ramadan && <p className="zk-lp-ramadan">{c.ramadan} <strong>{ramadan}</strong></p>}

          <div className="tc-cta-row" style={{ marginTop: '1.4rem' }}>
            <button className="lp-cta-primary"
              onClick={() => { track('zakat_lp_cta', { lang }); navigate('/dashboard') }}>
              {c.ctaLive}{ARROW}
            </button>
          </div>
          <p className="tc-sub" style={{ fontSize: '0.92rem', marginTop: '0.8rem' }}>{c.ctaNote}</p>
        </section>

        <section className="tc-section">
          <h2>{c.h2how}</h2>
          <ol className="tc-steps">{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>

        <section className="tc-section">
          <h2>{c.h2what}</h2>
          <dl className="zk-lp-defs">
            {c.rows.map(([term, def]) => (
              <div key={term}><dt>{term}</dt><dd>{def}</dd></div>
            ))}
          </dl>
        </section>

        <section className="tc-section">
          <h2>{c.h2nisab}</h2>
          <p>{c.nisabBody}</p>
          <p style={{ opacity: 0.75, fontSize: '0.92rem' }}>
            {NISAB_GOLD_GRAMS}g / {NISAB_SILVER_GRAMS}g · {GRAMS_PER_TROY_OZ.toFixed(4)} g per troy ounce
          </p>
        </section>

        <section className="tc-section">
          <h2>{c.h2year}</h2>
          <p>{c.yearBody}</p>
        </section>

        <section className="tc-section">
          <h2>{c.h2faq}</h2>
          <dl className="zk-lp-defs">
            {c.faq.map(([q, a]) => (
              <div key={q}><dt>{q}</dt><dd>{a}</dd></div>
            ))}
          </dl>
        </section>

        <section className="tc-section">
          <p className="zk-lp-disclaimer">{c.disclaimer}</p>
          {spotFailed && (
            <p className="zk-lp-disclaimer" style={{ opacity: 0.7 }}>
              {isAr
                ? 'تعذّر جلب سعر المعدن الآن — أدخله يدويًا أعلاه وستعمل الحاسبة كالمعتاد.'
                : 'Could not reach the metal price feed just now — type a price above and the calculator works as normal.'}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
