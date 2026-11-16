// The in-app assistant, answered on the device. No server and no AI model:
// it reads the question, then answers from what the app already knows.
//
//   1. Your portfolio  - total value, profit and loss, today's move, biggest
//                         holdings, the mix by class, or one holding by name.
//   2. The app         - which page does what, with a button to open it.
//   3. Words           - a term from the glossary ("what is DCA").
//   4. The FAQ         - the closest question and its answer.
//
// It works offline, costs nothing per question and never fails to reach a
// server. Replies use the same [[nav:/route|Label]] markers as before, so the
// chat renders them as buttons unchanged.

import { FEATURES } from './assistantAi'
import { GLOSSARY } from './data/glossary'
import { faqSections } from './data/faqContent'
import { categorizeAsset } from './data/assets'

const STOP = new Set(('a an the is are am was were be been i me my mine we our you your it its this that these those to of in on at for with by from ' +
  'and or but if then so do does did can could should would will how what which who whom why where when there here ' +
  'please pls help want need like get show tell give know about any some more most also just me? walletlens app ' +
  'هل ما ماذا كيف لماذا اين أين متى من في على الى إلى عن مع هذا هذه ذلك التي الذي انا أنا لي عندي او أو و').split(/\s+/))

/** Words of a question, lower case, without punctuation or filler. Pure. */
export function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&/-]+/gu, ' ')
    .split(/[\s/-]+/)
    .filter(w => w && !STOP.has(w))
    .map(stem)
}
// Plurals and endings, so "alerts" finds "alert" and "rebalancing" finds "rebalance".
function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  return w
}
const has = (ws, list) => list.some(k => ws.includes(k) || ws.some(w => w.startsWith(k)))

// Words people use for each page, beyond its own label and description.
const FEATURE_WORDS = {
  'Price Alerts': ['alert', 'notify', 'notification', 'remind', 'ping', 'تنبيه', 'اشعار'],
  'Sell Targets': ['target', 'take', 'profit', 'exit', 'tp', 'هدف'],
  'Rebalancing Tool': ['rebalance', 'rebalanc', 'target mix', 'weight', 'توازن', 'موازنة'],
  'Import from Excel': ['excel', 'csv', 'spreadsheet', 'sheet', 'xlsx', 'اكسل'],
  'Import by Voice': ['voice', 'speak', 'say', 'mic', 'صوت'],
  'Import Screenshot': ['screenshot', 'photo', 'picture', 'image', 'scan', 'لقطة', 'صورة'],
  'Import Backup': ['restore', 'backup', 'file', 'استعادة'],
  'Wallets & Backup': ['wallet', 'backup', 'export', 'drive', 'google', 'محفظة', 'نسخ'],
  'Academy': ['learn', 'course', 'lesson', 'video', 'academy', 'teach', 'تعلم', 'درس', 'دروس'],
  'Risk Scanner': ['risk', 'rug', 'scam', 'contract', 'مخاطر', 'احتيال'],
  'Technical Analysis': ['rsi', 'macd', 'indicator', 'chart', 'technical', 'momentum', 'فني'],
  'Fear & Greed Index': ['fear', 'greed', 'sentiment', 'mood', 'خوف', 'طمع'],
  'Settings': ['setting', 'theme', 'dark', 'light', 'language', 'font', 'currency', 'اعدادات', 'لغة'],
  'Privacy Policy': ['privacy', 'private', 'data', 'خصوصية'],
  'Transactions': ['transaction', 'history', 'trade', 'edit', 'delete', 'undo', 'معاملات', 'سجل'],
  'Watchlist': ['watch', 'watchlist', 'follow', 'track', 'متابعة'],
  'Alpha Signals': ['signal', 'alpha', 'onchain', 'whale', 'اشارة'],
  'Coach': ['coach', 'habit', 'advice', 'mentor', 'مدرب', 'نصيحة'],
  'Market Index': ['market', 'index', 'top', 'ranking', 'سوق'],
  'Portfolio Analysis': ['analyze', 'analysis', 'insight', 'health', 'score', 'review', 'تحليل'],
  'Dashboard': ['home', 'dashboard', 'الرئيسية'],
}

function featureMatches(ws) {
  return FEATURES.map(f => {
    const own = words(`${f.label} ${f.desc}`)
    const extra = (FEATURE_WORDS[f.label] || []).flatMap(words)
    let score = 0
    for (const w of ws) {
      if (extra.some(e => e === w || (w.length > 3 && e.startsWith(w)) || (e.length > 3 && w.startsWith(e)))) score += 3
      else if (own.includes(w)) score += 1
    }
    return { f, score }
  }).filter(x => x.score >= 3).sort((a, b) => b.score - a.score)
}

// Asset classes the app tracks that the glossary has no page for.
const CLASS_TERMS = [
  { term: 'Bond', keys: ['bond', 'bonds', 'treasury', 'treasuries', 'سند', 'سندات'], en: 'A bond is a loan you make to a government or company. It pays you interest on a schedule and returns your money at the end of its term. Bonds usually move far less than stocks or crypto.', ar: 'السند قرض تقدّمه لحكومة أو شركة، يدفع لك فائدة دورية ويعيد مالك في نهاية مدته. عادةً يتحرك أقل بكثير من الأسهم أو العملات الرقمية.' },
  { term: 'Stock', keys: ['stock', 'stocks', 'share', 'shares', 'equity', 'سهم', 'أسهم', 'اسهم'], en: 'A stock is a share of ownership in a company. Its price moves with how the company is expected to do, and some stocks pay dividends.', ar: 'السهم حصة ملكية في شركة. يتحرك سعره مع توقعات أداء الشركة، وبعض الأسهم توزع أرباحاً.' },
  { term: 'Gold', keys: ['gold', 'xau', 'ذهب'], en: 'Gold is a precious metal held as a store of value. It is priced per troy ounce (XAU) and often holds up when other markets fall.', ar: 'الذهب معدن ثمين يُحتفظ به كمخزن للقيمة، يُسعَّر بالأونصة (XAU) وغالباً يصمد عند هبوط الأسواق الأخرى.' },
]
function classTerm(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[?.!,]/g, ' ')} `
  return CLASS_TERMS.find(c => c.keys.some(k => t.includes(` ${k} `))) || null
}

function glossaryMatch(text) {
  const t = ` ${String(text || '').toLowerCase()} `
  let best = null
  for (const g of GLOSSARY) {
    const names = [g.term, g.term.replace(/\s*\(.*\)\s*/, ''), ...(g.term.match(/\(([^)]+)\)/)?.[1] ? [g.term.match(/\(([^)]+)\)/)[1]] : []), g.slug.replace(/-/g, ' ')]
    for (const n of names) {
      const k = n.toLowerCase().trim()
      if (k.length >= 2 && new RegExp(`[^\\p{L}\\p{N}]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\p{L}\\p{N}]`, 'u').test(t)) {
        if (!best || k.length > best.len) best = { g, len: k.length }
      }
    }
  }
  return best?.g || null
}

// Everyday words for what the FAQ calls something else.
const FAQ_SYNONYMS = { money: 'free', pay: 'free', paid: 'free', cost: 'free', price: 'free', subscription: 'free', earn: 'free', revenue: 'free',
  login: 'account', sign: 'account', register: 'account', email: 'account', mobile: 'phone', android: 'phone', iphone: 'phone',
  safe: 'see', secure: 'see', private: 'see', transfer: 'move', device: 'move', erase: 'delete', wipe: 'delete', bug: 'report', feedback: 'report' }

function faqMatch(ws, lang) {
  ws = [...new Set(ws.flatMap(w => (FAQ_SYNONYMS[w] ? [w, FAQ_SYNONYMS[w]] : [w])))]
  if (!ws.length) return null
  let best = null
  for (const sec of faqSections(lang)) {
    for (const { q, a } of sec.faqs) {
      const qw = words(q), aw = words(a)
      let s = 0
      for (const w of ws) { if (qw.includes(w)) s += 2; else if (aw.includes(w)) s += 0.5 }
      const score = s / Math.max(3, ws.length)
      if (!best || score > best.score) best = { q, a, score }
    }
  }
  return best && best.score >= 0.6 ? best : null
}

// ── Portfolio ────────────────────────────────────────────────────────────
const usd = (n) => {
  const v = Number(n) || 0
  const d = Math.abs(v) >= 1000 ? 0 : 2
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
}
const pct = (n) => `${n >= 0 ? '+' : ''}${(Number(n) || 0).toFixed(2)}%`

/** Holdings with value, profit and the day's move, from amounts and cached prices. Pure. */
export function valueHoldings(holdings, prices = {}) {
  return (holdings || []).filter(h => Number(h?.amount) > 0).map(h => {
    const p = prices[h.coin_id] || {}
    const price = Number(p.usd) || 0
    const value = price > 0 ? price * h.amount : Number(h.total_invested) || 0
    const invested = Number(h.total_invested) || 0
    const pnl = price > 0 ? value - invested : 0
    return {
      ...h, price, value, invested, pnl,
      pnlPct: invested > 0 && price > 0 ? (pnl / invested) * 100 : 0,
      day: Number(p.usd_24h_change) || 0,
      sym: String(h.coin_symbol || h.coin_id || '').toUpperCase(),
      name: h.coin_name || String(h.coin_symbol || '').toUpperCase(),
    }
  }).sort((a, b) => b.value - a.value)
}

const CLASS = { crypto: ['Crypto', 'كريبتو'], metals: ['Precious metals', 'معادن ثمينة'], stocks: ['Stocks & ETFs', 'أسهم'], bonds: ['Bonds', 'سندات'], realestate: ['Real estate', 'عقارات'], cash: ['Cash', 'نقد'] }

function portfolioAnswer(ws, text, hs, ar) {
  const L = (en, a) => (ar ? a : en)
  const empty = L("You don't have any holdings yet. Add your first one and I can tell you about your portfolio.", 'لا توجد أصول بعد. أضف أول أصل لأخبرك عن محفظتك.')
    + `\n\n[[nav:/dashboard?tab=manage|${L('Add holdings', 'إضافة أصول')}]]`
  const total = hs.reduce((s, h) => s + h.value, 0)
  const invested = hs.reduce((s, h) => s + h.invested, 0)
  const pnl = hs.reduce((s, h) => s + h.pnl, 0)

  // One holding by name or ticker.
  const t = ` ${String(text || '').toLowerCase()} `
  const ALIAS = { 'metal:xau': ['gold', 'ذهب'], 'metal:xag': ['silver', 'فضة'], 'metal:xpt': ['platinum'], 'metal:xcu': ['copper'], bitcoin: ['btc', 'bitcoin'], ethereum: ['eth', 'ether', 'ethereum'] }
  const namesOf = (h) => [h.sym, h.name, String(h.name || '').split(/[\s(]/)[0], String(h.coin_id || '').replace(/^[a-z]+:/, ''), ...(ALIAS[h.coin_id] || [])]
  const clean = t.replace(/[?.!,]/g, ' ')
  const one = hs.find(h => namesOf(h).some(n => n && n.length >= 2 && clean.includes(` ${String(n).toLowerCase()} `)))
  if (one) {
    const share = total > 0 ? (one.value / total) * 100 : 0
    return `${one.name} (${one.sym}): ${Number(one.amount).toLocaleString('en-US', { maximumFractionDigits: 8 })} ${L('worth', 'بقيمة')} ${usd(one.value)}, ${share.toFixed(1)}% ${L('of your portfolio', 'من محفظتك')}.`
      + (one.price > 0 ? `\n${L('Price', 'السعر')} ${usd(one.price)} (${pct(one.day)} ${L('today', 'اليوم')}). ${L('Profit/loss', 'الربح/الخسارة')} ${usd(one.pnl)} (${pct(one.pnlPct)}).` : '')
      + `\n\n[[nav:/asset/${encodeURIComponent(one.coin_id)}|${L('Open', 'فتح')} ${one.sym}]]`
  }

  const q = String(text || '').toLowerCase()
  const wantsWorth = has(ws, ['worth', 'value', 'total', 'balance', 'net', 'قيمة', 'رصيد', 'اجمالي'])
  const wantsInvested = /how much (did|have) i (invest|put|spen|pay)|\b(total )?invested\b|money (i )?put in|كم استثمرت/.test(q)
  const wantsBest = /\b(best|worst|winner|loser|top performer|performing|up the most|down the most|biggest (gain|loss|winner|loser|mover))\b|الأفضل|الأسوأ/.test(q)
  const bestToday = wantsBest && /today|24 ?h|now|the most|moving|اليوم/.test(q)
  const classAsk = /\b(percent|percentage|%|share|portion|how much)\b.*\b(crypto|stocks?|gold|metals?|bonds?|cash)\b|\b(crypto|stocks?|gold|metals?|bonds?|cash)\b.*\b(percent|percentage|%|share|portion)\b/.test(q)
  const wantsToday = has(ws, ['today', 'day', '24h', 'daily', 'mover', 'اليوم'])
  const wantsBig = has(ws, ['biggest', 'largest', 'top', 'main', 'اكبر', 'أكبر'])
  const wantsMix = has(ws, ['allocation', 'mix', 'split', 'diversif', 'breakdown', 'categor', 'توزيع', 'تنويع']) || classAsk
  const wantsPnl = has(ws, ['profit', 'loss', 'pnl', 'p&l', 'gain', 'losing', 'winning', 'return', 'perform', 'ربح', 'خسارة', 'اداء', 'أداء']) || /making money|losing money|in the (green|red)|up or down|هل أربح|هل اربح/.test(q)
  const wantsCount = has(ws, ['many', 'count', 'number', 'عدد'])
  // "How is my portfolio doing?", "how am I doing", "portfolio summary":
  // the overview, value, today and the best and worst holding together.
  const wantsOverview = /\bhow('?s| is| are| am)?\b.*\b(portfolio|holdings?|investments?|assets?|i)\b.*\b(doing|going|looking|performing|faring)\b|\b(portfolio|holdings?|investments?)\b.*\b(status|summary|overview|update|report|health|doing|performance)\b|\b(summary|overview|update)\b.*\b(portfolio|holdings?|investments?)\b|\bhow am i doing\b|^\W*(give me |show me )?(an? )?(overview|summary|recap|status)\W*$|كيف (حال|اداء|أداء)? ?محفظتي|ملخص المحفظة/i.test(String(text || ''))
  const about = has(ws, ['portfolio', 'holding', 'asset', 'coin', 'stock', 'own', 'invest', 'محفظ', 'اصول', 'أصول']) || wantsWorth || wantsToday || wantsMix || wantsPnl
  if (!wantsOverview && !wantsInvested && !wantsBest && !classAsk && !(about && (wantsWorth || wantsToday || wantsBig || wantsMix || wantsPnl || wantsCount))) return null
  if (!hs.length) return empty
  if (wantsInvested && !wantsWorth) {
    const inv = hs.reduce((s, h) => s + h.invested, 0)
    return `${L('You have put in', 'إجمالي ما استثمرته')} ${usd(inv)} ${L('across', 'في')} ${hs.length} ${L(hs.length === 1 ? 'holding' : 'holdings', 'أصول')}.`
      + `\n${L('Largest', 'الأكبر')}: ${[...hs].sort((a, b) => b.invested - a.invested).slice(0, 3).map(h => `${h.sym} ${usd(h.invested)}`).join(', ')}.\n\n[[nav:/transactions|${L('Transactions', 'المعاملات')}]]`
  }
  if (wantsBest) {
    const priced = hs.filter(h => h.price > 0)
    if (!priced.length) return L('Live prices have not loaded yet. Ask again in a moment.', 'لم يتم تحميل الأسعار بعد. اسأل بعد لحظات.')
    const key = bestToday ? 'day' : 'pnlPct'
    const sorted = [...priced].filter(h => bestToday || h.invested > 0).sort((a, b) => b[key] - a[key])
    const b = sorted[0], w = sorted[sorted.length - 1]
    const lbl = bestToday ? L('today', 'اليوم') : L('since you bought', 'منذ الشراء')
    return `${L('Best', 'الأفضل')} ${lbl}: ${b.sym} ${pct(b[key])}.` + (w && w !== b ? `\n${L('Worst', 'الأسوأ')} ${lbl}: ${w.sym} ${pct(w[key])}.` : '')
      + `\n\n[[nav:/asset/${encodeURIComponent(b.coin_id)}|${b.sym}]]` + (w && w !== b ? ` [[nav:/asset/${encodeURIComponent(w.coin_id)}|${w.sym}]]` : '')
  }
  if (wantsOverview && !wantsWorth && !wantsToday && !wantsBig && !wantsMix && !wantsPnl && !wantsCount) {
    return portfolioAnswer(['worth', 'today', 'profit', 'portfolio'], '', hs, ar)
  }

  const out = []
  const unpriced = !hs.some(h => h.price > 0)
  if (unpriced && (wantsWorth || wantsPnl || wantsToday)) {
    out.push(`${L('Live prices have not loaded yet, so I can only count what you paid', 'لم يتم تحميل الأسعار بعد، لذا أحسب ما دفعته فقط')}: ${usd(invested)} ${L('across', 'في')} ${hs.length} ${L(hs.length === 1 ? 'holding' : 'holdings', 'أصول')}. ${L('Ask again in a moment.', 'اسأل مرة أخرى بعد لحظات.')}`)
    return `${out.join('\n\n')}\n\n[[nav:/dashboard|${L('Open Home', 'فتح الرئيسية')}]]`
  }
  if (wantsWorth || (!wantsToday && !wantsBig && !wantsMix && !wantsPnl && !wantsCount)) {
    out.push(`${L('Your portfolio is worth', 'قيمة محفظتك')} ${usd(total)} ${L('across', 'في')} ${hs.length} ${L(hs.length === 1 ? 'holding' : 'holdings', 'أصول')}. ${L('You put in', 'استثمرت')} ${usd(invested)}, ${L('so you are', 'أي أنك')} ${pnl >= 0 ? L('up', 'رابح') : L('down', 'خاسر')} ${usd(Math.abs(pnl))}${invested > 0 ? ` (${pct((pnl / invested) * 100)})` : ''}.`)
  }
  if (wantsCount && !wantsWorth) out.push(`${L('You hold', 'لديك')} ${hs.length} ${L(hs.length === 1 ? 'asset' : 'assets', 'أصول')}.`)
  if (wantsToday) {
    const dayUsd = hs.reduce((s, h) => s + (h.price > 0 ? h.value - h.value / (1 + h.day / 100) : 0), 0)
    const moving = hs.filter(h => h.price > 0 && h.day !== 0)
    const up = [...moving].sort((a, b) => b.day - a.day)[0]
    const down = [...moving].sort((a, b) => a.day - b.day)[0]
    out.push(`${L('Today you are', 'اليوم أنت')} ${dayUsd >= 0 ? L('up', 'رابح') : L('down', 'خاسر')} ${usd(Math.abs(dayUsd))}.`
      + (up && up.day > 0 ? ` ${L('Leading', 'الأفضل')}: ${up.sym} ${pct(up.day)}.` : '')
      + (down && down.day < 0 ? ` ${L('Trailing', 'الأضعف')}: ${down.sym} ${pct(down.day)}.` : ''))
  }
  if (wantsBig) {
    out.push(`${L('Your biggest holdings', 'أكبر أصولك')}:\n` + hs.slice(0, 3).map(h => `- ${h.sym}: ${usd(h.value)} (${total > 0 ? ((h.value / total) * 100).toFixed(1) : '0'}%)`).join('\n'))
  }
  if (wantsMix) {
    const by = {}
    for (const h of hs) { const c = categorizeAsset(h); by[c] = (by[c] || 0) + h.value }
    out.push(`${L('Your mix', 'توزيع محفظتك')}:\n` + Object.entries(by).sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `- ${(CLASS[c] || [c, c])[ar ? 1 : 0]}: ${total > 0 ? ((v / total) * 100).toFixed(1) : '0'}% (${usd(v)})`).join('\n'))
  }
  if (wantsPnl && !wantsWorth) {
    const priced = hs.filter(h => h.price > 0 && h.invested > 0)
    const best = [...priced].sort((a, b) => b.pnlPct - a.pnlPct)[0]
    const worst = [...priced].sort((a, b) => a.pnlPct - b.pnlPct)[0]
    out.push(`${L('Overall you are', 'إجمالاً أنت')} ${pnl >= 0 ? L('up', 'رابح') : L('down', 'خاسر')} ${usd(Math.abs(pnl))}${invested > 0 ? ` (${pct((pnl / invested) * 100)})` : ''}.`
      + (best ? ` ${L('Best', 'الأفضل')}: ${best.sym} ${pct(best.pnlPct)}.` : '')
      + (worst && worst !== best ? ` ${L('Worst', 'الأسوأ')}: ${worst.sym} ${pct(worst.pnlPct)}.` : ''))
  }
  const navs = [`[[nav:/dashboard|${L('Open Home', 'فتح الرئيسية')}]]`]
  if (wantsMix || wantsBig) navs.push(`[[nav:/dashboard?tab=tools&tool=ai|${L('Portfolio Analysis', 'تحليل المحفظة')}]]`)
  return `${out.join('\n\n')}\n\n${navs.join(' ')}`
}

// ── How-tos: buttons and gestures, not pages ────────────────────────────
const HOWTOS = [
  { re: /\b(how (do|can|to)|where).*\b(add|buy|record|enter)\b|^\W*(add|buy) (a |an |some |my |new )?\w+|اضيف|أضيف|إضافة|اضافة|كيف اشتري|كيف أشتري/i,
    en: 'Tap the + button in the middle of the bottom bar, or Buy on your balance card. Pick the asset, type how much you bought and the price, then confirm. You can also import many at once from a screenshot, your voice or an Excel file.',
    ar: 'اضغط زر + في منتصف الشريط السفلي، أو شراء في بطاقة الرصيد. اختر الأصل واكتب الكمية والسعر ثم أكّد. يمكنك أيضاً استيراد عدة أصول دفعة واحدة من لقطة شاشة أو بالصوت أو من ملف إكسل.',
    not: /\b(alert|wallet|widget|watchlist|extension|target|note)\b/i,
    nav: ['/dashboard?tab=manage', 'Import holdings', 'استيراد الأصول'] },
  { re: /\b(how (do|can|to)).*\b(sell|remove|delete|close)\b|^\W*(sell|remove|delete) (a |an |my )?\w+|كيف (ابيع|أبيع|احذف|أحذف)/i,
    en: 'To sell, tap Sell on your balance card, or the ⋮ next to a holding and then Sell, and enter how much you sold. To remove an entry made by mistake, delete it in Transactions.',
    ar: 'للبيع اضغط بيع في بطاقة الرصيد، أو ⋮ بجانب الأصل ثم بيع، وأدخل الكمية المباعة. لحذف إدخال خاطئ احذفه من المعاملات.',
    not: /\b(data|everything|account|history|chat|alert|wallet)\b/i,
    nav: ['/transactions', 'Transactions', 'المعاملات'] },
  { re: /\b(export|download|print)\b|\b(pdf|excel|csv)\b.*\b(report|file|export)\b|تصدير/i,
    en: 'On Home, in your holdings list, tap the Excel or PDF button at the top of the list to export your holdings. A full backup of everything is in Wallets & Backup.',
    ar: 'في الرئيسية، اضغط زر إكسل أو PDF أعلى قائمة الأصول لتصديرها. النسخة الاحتياطية الكاملة في المحافظ والنسخ الاحتياطي.',
    nav: ['/dashboard', 'Open Home', 'فتح الرئيسية'] },
  { re: /\b(change|switch|set)\b.*\b(currency|eur|euro|gbp|egp|sar|aed|usd|dollar|pound)\b|العملة/i,
    en: 'Tap the currency button (USD) at the top of your balance card and pick any currency, or Bitcoin. Every amount on Home follows it.',
    ar: 'اضغط زر العملة (USD) أعلى بطاقة الرصيد واختر أي عملة أو بيتكوين، وتتبعها كل المبالغ في الرئيسية.',
    nav: ['/dashboard', 'Open Home', 'فتح الرئيسية'] },
]

// ── The answer ───────────────────────────────────────────────────────────

/**
 * An answer to one question, from the device alone. Pure, for the test.
 * @param {string} question
 * @param {{ lang?: string, holdings?: object[], prices?: object }} ctx
 */
export function answerLocally(question, { lang = 'en', holdings = [], prices = {} } = {}) {
  const ar = lang === 'ar'
  const L = (en, a) => (ar ? a : en)
  const text = String(question || '').trim()
  const ws = words(text)

  const valued = valueHoldings(holdings, prices)

  // "Should I sell X?", "Is X a good investment?", "what should I do": no
  // advice, but the tools that help decide, and the person's own position.
  if (/\b(should i|good investment|worth buying|buy or sell|sell or hold|time to (buy|sell)|will .* (go up|go down|rise|fall|crash))\b|هل اشتري|هل أشتري|هل ابيع|هل أبيع|ماذا أفعل|ماذا افعل|استثمار جيد/i.test(text)) {
    const t = ` ${text.toLowerCase().replace(/[?.!,]/g, ' ')} `
    const held = valued.find(h => [h.sym, h.name, String(h.name || '').split(/[\s(]/)[0]].some(n => n && n.length >= 2 && t.includes(` ${n.toLowerCase()} `)))
    return L("I can't tell you what to buy or sell, and nobody can promise where a price goes. These help you decide for yourself:", 'لا أستطيع أن أنصحك بالشراء أو البيع، ولا أحد يضمن اتجاه السعر. هذه الأدوات تساعدك على القرار بنفسك:')
      + (held ? `\n${L('You hold', 'لديك')} ${held.sym} ${L('worth', 'بقيمة')} ${usd(held.value)} (${pct(held.pnlPct)}).` : '')
      + `\n\n${held ? `[[nav:/asset/${encodeURIComponent(held.coin_id)}|${held.sym}]] ` : ''}[[nav:/dashboard?tab=tools&tool=ai|${L('Portfolio Analysis', 'تحليل المحفظة')}]] [[nav:/alpha|${L('Signals', 'الإشارات')}]] [[nav:/coach|${L('Coach', 'المدرب')}]]`
  }

  for (const h of HOWTOS) if (h.re.test(text) && !h.not?.test(text)) return (ar ? h.ar : h.en) + (h.nav ? `\n\n[[nav:${h.nav[0]}|${ar ? h.nav[2] : h.nav[1]}]]` : '')

  if (!ws.length || /^(hi|hello|hey|salam|مرحبا|اهلا|السلام)\b/i.test(text) && ws.length <= 2) {
    return L("Hi! I can tell you about your portfolio (value, today's move, biggest holdings, your mix), find any feature in the app, and explain investing terms. What would you like to know?",
      'مرحباً! يمكنني إخبارك عن محفظتك (القيمة، حركة اليوم، أكبر الأصول، التوزيع)، وإيجاد أي ميزة في التطبيق، وشرح مصطلحات الاستثمار. بماذا أساعدك؟')
  }
  if (/^(thanks|thank you|thx|شكرا|شكراً)/i.test(text)) return L("You're welcome! Ask me anything else.", 'على الرحب والسعة! اسألني أي شيء آخر.')

  const mine = portfolioAnswer(ws, text, valued, ar)
  if (mine) return mine

  const asksWhat = /\b(what|define|meaning|mean|explain)\b|ما هو|ما هي|معنى|اشرح/i.test(text)
  const term = asksWhat || ws.length <= 3 ? glossaryMatch(text) : null
  if (term) return `${term.term}: ${term.short}\n\n[[nav:/learn/${term.slug}|${L('Read more', 'اقرأ المزيد')}]]`
  const cls = asksWhat ? classTerm(text) : null
  if (cls) return `${cls.term}: ${ar ? cls.ar : cls.en}\n\n[[nav:/academy|${L('Learn more in the Academy', 'تعلم المزيد في الأكاديمية')}]]`

  // A question the FAQ asks almost word for word wins over a page.
  const faqFirst = faqMatch(ws, ar ? 'ar' : 'en')
  if (faqFirst && faqFirst.score >= 1.3) {
    const a = faqFirst.a.length > 650 ? `${faqFirst.a.slice(0, faqFirst.a.lastIndexOf(' ', 640))}…` : faqFirst.a
    const page = featureMatches(ws)[0]?.f
    return `${a}\n\n${page ? `[[nav:${page.route}|${page.label}]] ` : ''}[[nav:/faq|${L('More in the FAQ', 'المزيد في الأسئلة الشائعة')}]]`
  }

  const feats = featureMatches(ws)
  if (feats.length) {
    const near = feats.filter(x => x.score >= feats[0].score - 1)
    const top = near.filter((x, i) => near.findIndex(y => y.f.route === x.f.route) === i).slice(0, 3)
    const lead = top[0].f
    return `${L('This is in', 'تجد ذلك في')} ${lead.label}: ${lead.desc}.`
      + (top.length > 1 ? `\n${L('These may help too', 'وقد تفيدك أيضاً')}: ${top.slice(1).map(x => x.f.label).join(', ')}.` : '')
      + `\n\n${top.map(x => `[[nav:${x.f.route}|${x.f.label}]]`).join(' ')}`
  }

  const faq = faqMatch(ws, ar ? 'ar' : 'en')
  if (faq) {
    const a = faq.a.length > 650 ? `${faq.a.slice(0, faq.a.lastIndexOf(' ', 640))}…` : faq.a
    return `${a}\n\n[[nav:/faq|${L('More in the FAQ', 'المزيد في الأسئلة الشائعة')}]]`
  }

  const loose = glossaryMatch(text)
  if (loose) return `${loose.term}: ${loose.short}\n\n[[nav:/learn/${loose.slug}|${L('Read more', 'اقرأ المزيد')}]]`

  return L("I'm not sure about that one. I can answer questions about your portfolio, find features in the app, and explain investing terms. Try \"What is my portfolio worth?\", \"How do I set a price alert?\" or \"What is DCA?\"",
    'لست متأكداً من ذلك. يمكنني الإجابة عن محفظتك، وإيجاد ميزات التطبيق، وشرح مصطلحات الاستثمار. جرّب: "كم قيمة محفظتي؟" أو "كيف أضبط تنبيه سعر؟" أو "ما هو DCA؟"')
    + `\n\n[[nav:/faq|FAQ]] [[nav:/academy|${L('Academy', 'الأكاديمية')}]]`
}
