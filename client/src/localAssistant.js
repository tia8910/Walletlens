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
  'Risk Scanner': ['risk', 'rug', 'scam', 'safe', 'contract', 'مخاطر', 'احتيال'],
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

function faqMatch(ws, lang) {
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
  return best && best.score >= 1 ? best : null
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
  const one = hs.find(h => [h.sym, h.name].some(n => n && n.length >= 2 && t.includes(` ${n.toLowerCase()} `)) || t.includes(` ${h.sym.toLowerCase()}?`))
  if (one) {
    const share = total > 0 ? (one.value / total) * 100 : 0
    return `${one.name} (${one.sym}): ${Number(one.amount).toLocaleString('en-US', { maximumFractionDigits: 8 })} ${L('worth', 'بقيمة')} ${usd(one.value)}, ${share.toFixed(1)}% ${L('of your portfolio', 'من محفظتك')}.`
      + (one.price > 0 ? `\n${L('Price', 'السعر')} ${usd(one.price)} (${pct(one.day)} ${L('today', 'اليوم')}). ${L('Profit/loss', 'الربح/الخسارة')} ${usd(one.pnl)} (${pct(one.pnlPct)}).` : '')
      + `\n\n[[nav:/asset/${encodeURIComponent(one.coin_id)}|${L('Open', 'فتح')} ${one.sym}]]`
  }

  const wantsWorth = has(ws, ['worth', 'value', 'total', 'balance', 'net', 'قيمة', 'رصيد', 'اجمالي'])
  const wantsToday = has(ws, ['today', 'day', '24h', 'daily', 'mover', 'اليوم'])
  const wantsBig = has(ws, ['biggest', 'largest', 'top', 'main', 'اكبر', 'أكبر'])
  const wantsMix = has(ws, ['allocation', 'mix', 'split', 'diversif', 'breakdown', 'categor', 'توزيع', 'تنويع'])
  const wantsPnl = has(ws, ['profit', 'loss', 'pnl', 'p&l', 'gain', 'losing', 'winning', 'return', 'perform', 'ربح', 'خسارة', 'اداء', 'أداء'])
  const wantsCount = has(ws, ['many', 'count', 'number', 'عدد'])
  const about = has(ws, ['portfolio', 'holding', 'asset', 'coin', 'stock', 'own', 'invest', 'محفظ', 'اصول', 'أصول']) || wantsWorth || wantsToday || wantsMix || wantsPnl
  if (!(about && (wantsWorth || wantsToday || wantsBig || wantsMix || wantsPnl || wantsCount))) return null
  if (!hs.length) return empty

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

  if (!ws.length || /^(hi|hello|hey|salam|مرحبا|اهلا|السلام)\b/i.test(text) && ws.length <= 2) {
    return L("Hi! I can tell you about your portfolio (value, today's move, biggest holdings, your mix), find any feature in the app, and explain investing terms. What would you like to know?",
      'مرحباً! يمكنني إخبارك عن محفظتك (القيمة، حركة اليوم، أكبر الأصول، التوزيع)، وإيجاد أي ميزة في التطبيق، وشرح مصطلحات الاستثمار. بماذا أساعدك؟')
  }
  if (/^(thanks|thank you|thx|شكرا|شكراً)/i.test(text)) return L("You're welcome! Ask me anything else.", 'على الرحب والسعة! اسألني أي شيء آخر.')

  // Adding a holding is the most common question, and it is a button, not a page.
  if (has(ws, ['add', 'buy', 'record', 'enter', 'اضف', 'أضف', 'اضافة', 'شراء']) && has(ws, ['coin', 'asset', 'holding', 'stock', 'crypto', 'gold', 'bond', 'position', 'purchase', 'trade', 'اصل', 'سهم', 'عملة', 'ذهب'])) {
    return L('Tap the + button in the middle of the bottom bar, or Buy on your balance card. Pick the asset, type how much you bought and the price, then confirm. You can also import many at once from a screenshot, your voice or an Excel file.',
      'اضغط زر + في منتصف الشريط السفلي، أو شراء في بطاقة الرصيد. اختر الأصل واكتب الكمية والسعر ثم أكّد. يمكنك أيضاً استيراد عدة أصول دفعة واحدة من لقطة شاشة أو بالصوت أو من ملف إكسل.')
      + `\n\n[[nav:/dashboard?tab=manage|${L('Import holdings', 'استيراد الأصول')}]]`
  }

  const valued = valueHoldings(holdings, prices)

  // "Should I sell X?", "Is X a good investment?": no advice, but the tools
  // that help decide, and the person's own position when they hold it.
  if (/\b(should i|good investment|worth buying|buy or sell|sell or hold|time to (buy|sell)|will .* (go up|go down|rise|fall|crash))\b|هل اشتري|هل أشتري|هل ابيع|هل أبيع|استثمار جيد/i.test(text)) {
    const t = ` ${text.toLowerCase()} `
    const held = valued.find(h => [h.sym, h.name].some(n => n && n.length >= 2 && t.includes(` ${n.toLowerCase()}`)))
    return L("I can't tell you what to buy or sell, and nobody can promise where a price goes. These help you decide for yourself:", 'لا أستطيع أن أنصحك بالشراء أو البيع، ولا أحد يضمن اتجاه السعر. هذه الأدوات تساعدك على القرار بنفسك:')
      + (held ? `
${L('You hold', 'لديك')} ${held.sym} ${L('worth', 'بقيمة')} ${usd(held.value)} (${pct(held.pnlPct)}).` : '')
      + `

${held ? `[[nav:/asset/${encodeURIComponent(held.coin_id)}|${held.sym}]] ` : ''}[[nav:/dashboard?tab=tools&tool=ai|${L('Portfolio Analysis', 'تحليل المحفظة')}]] [[nav:/alpha|${L('Signals', 'الإشارات')}]] [[nav:/coach|${L('Coach', 'المدرب')}]]`
  }

  const mine = portfolioAnswer(ws, text, valued, ar)
  if (mine) return mine

  const term = /\b(what|define|meaning|mean|explain)\b|ما هو|ما هي|معنى|اشرح/i.test(text) || ws.length <= 3 ? glossaryMatch(text) : null
  if (term) return `${term.term}: ${term.short}\n\n[[nav:/learn/${term.slug}|${L('Read more', 'اقرأ المزيد')}]]`

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
