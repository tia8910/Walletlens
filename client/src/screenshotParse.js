// Turns the words read off a portfolio screenshot into holdings.
//
// No model and no service: screenshotOcr.js reads the words and their boxes on
// the device, and this file works out the rows from the layout. Every app
// draws a holding the same way at heart — an asset's name or ticker, its
// amount, and money figures beside it (the value, often the price, maybe a
// percent change) — so:
//
//   1. ANCHORS. A word, or two or three, that is a known ticker (uppercase:
//      BTC, AAPL) or a known name (Bitcoin, USD Coin, Gold) marks an asset.
//      The name and the ticker of one holding sit a line apart and are one
//      anchor ("Bitcoin" over "BTC").
//   2. ROWS. Each anchor owns the band of the screen around it, halfway to
//      its neighbours and no more than a couple of lines away.
//   3. NUMBERS. In that band, a number followed by the ticker or a unit
//      ("0.1 BTC", "10 Shares") is the amount; "$", "€", "≈" or "USD" make it
//      money; "%" is a change and is skipped.
//   4. PRICE OR VALUE. When amount × one figure = another, those are price
//      and value. Otherwise the live market price says which figure is which,
//      and failing that the figure is taken as the value.
//
// Anything it cannot place is left out rather than guessed; the user reviews
// every row before it is saved, and tidyImportRows (SmartImport.jsx) still
// checks each price against the market afterwards.

// Words that are tickers of some coin and also everyday screen chrome.
const NOT_ANCHORS = new Set([
  'ALL', 'BUY', 'SELL', 'MAX', 'MIN', 'TOP', 'HOT', 'NEW', 'MORE', 'HOME', 'SEND', 'SWAP', 'EARN', 'SPOT', 'LIVE',
  'OK', 'ON', 'OFF', 'AM', 'PM', 'UTC', 'ID', 'TV', 'AI', 'APP', 'GO', 'BACK', 'NEXT', 'DONE', 'VIEW', 'HIDE', 'SHOW',
  'OPEN', 'CLOSE', 'HOLD', 'LONG', 'SHORT', 'CASH', 'FEE', 'FEES', 'ROI', 'APY', 'APR', 'NFT', 'NFTS', 'PNL', 'DAY',
  'WEEK', 'YEAR', 'TODAY', 'TOTAL', 'VALUE', 'PRICE', 'ASSET', 'ASSETS', 'COIN', 'COINS', 'TOKEN', 'TOKENS', 'WALLET',
  'MARKET', 'MARKETS', 'TRADE', 'TRADES', 'ORDER', 'ORDERS', 'LIMIT', 'STOP', 'PAY', 'CARD', 'GAS', 'ONE', 'ME', 'MY',
  'A', 'I', 'S', 'X', 'T', 'P', 'B', 'K', 'M', 'IN', 'OUT', 'UP', 'DOWN', 'TO', 'OF', 'OR', 'AND', 'THE', 'FOR', 'NOW', 'NOT',
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'INR', 'AED', 'EGP', 'SAR', 'TRY', 'BRL', 'RUB', 'KRW',
])
const NOT_NAMES = new Set(['total', 'value', 'balance', 'balances', 'price', 'home', 'more', 'spot', 'earn', 'funding',
  'overview', 'assets', 'tokens', 'activity', 'stocks', 'crypto', 'market', 'markets', 'wallet', 'trade', 'signals',
  'analyze', 'track', 'grow', 'today', 'portfolio', 'holdings', 'send', 'receive', 'swap', 'buy', 'sell', 'gas', 'flow',
  'stacks', 'core', 'origin', 'story', 'sonic', 'render', 'graph', 'status', 'just', 'ever', 'safe', 'echo', 'frax'])
const TOTAL_WORDS = /^(total|estimated|est\.?|net|balance|portfolio|equity|worth)$/i
const UNIT_WORDS = /^(shares?|sh|oz|ounces?|units?|coins?|tokens?|grams?|g|lb)$/i
const PRICE_LABEL = /^(price|last|mark|avg|average|cost|entry)$/i
const VALUE_LABEL = /^(value|balance|worth|equity|total)$/i
const AMOUNT_LABEL = /^(amount|qty|quantity|holdings?|available|units|size)$/i
const MONEY = /^(?:US\$|A\$|C\$|HK\$|S\$|\$|€|£|¥|₹|≈|~|=)+/
const FIAT_CODE = /^(USD|USDT|EUR|GBP)$/i

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Index the assets the reader can recognise.
 * entries: [{ symbol, name, rank?, price? }] — coins, stocks, metals, holdings.
 */
export function buildCatalogue(entries = []) {
  const bySymbol = new Map(), byName = new Map()
  let maxWords = 1
  for (const e of entries) {
    const sym = String(e?.symbol || '').toUpperCase().trim()
    if (!sym) continue
    const rank = Number(e.rank) || 1e6
    const entry = { symbol: sym, name: e.name || sym, rank, price: Number(e.price) || 0 }
    const prev = bySymbol.get(sym)
    if (!prev || rank < prev.rank) bySymbol.set(sym, { ...entry, price: entry.price || prev?.price || 0 })
    else if (!prev.price && entry.price) prev.price = entry.price
    for (const nm of [e.name, ...(e.aliases || [])]) {
      const key = norm(nm)
      if (!key || key.length < 3 || NOT_NAMES.has(key)) continue
      const p = byName.get(key)
      if (!p || rank < p.rank) byName.set(key, entry)
      maxWords = Math.max(maxWords, String(nm).trim().split(/\s+/).length)
    }
  }
  return { bySymbol, byName, maxWords: Math.min(maxWords, 3) }
}

/** A number as written on a screen: "1,234.56", "1.234,56", "0,5", "$1.2K". */
export function parseNumber(raw) {
  let s = String(raw || '').trim()
  let mult = 1
  const suf = s.match(/([kmb])$/i)
  if (suf && /\d/.test(s.slice(0, -1))) { mult = { k: 1e3, m: 1e6, b: 1e9 }[suf[1].toLowerCase()]; s = s.slice(0, -1) }
  // OCR reads an O for a zero inside figures.
  s = s.replace(/(?<=\d)[Oo](?=[\d.,]|$)/g, '0')
  if (!/^\d[\d.,]*$/.test(s)) return NaN
  const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length
  if (dots && commas) {
    // The later separator is the decimal one.
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  } else if (commas) {
    s = commas === 1 && !/^\d{1,3},\d{3}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (dots > 1) {
    // "1.174.31" (a misread comma) or "1.234.567": the last group decides.
    const parts = s.split('.')
    const last = parts.pop()
    s = last.length === 3 ? parts.join('') + last : parts.join('') + '.' + last
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n * mult : NaN
}

function median(xs) {
  if (!xs.length) return 0
  const a = [...xs].sort((x, y) => x - y)
  return a[Math.floor(a.length / 2)]
}

// Split glued readings ("2ETH", "$5,219.25") into the parts a row is made of.
function tokenize(words) {
  const out = []
  for (const w of words) {
    const text = String(w.text || '').trim().replace(/^[([{]+|[)\]},;:]+$/g, '')
    if (!text) continue
    const base = { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, h: Math.max(1, w.y1 - w.y0) }
    const glued = text.match(/^([+-]?[\d.,]+)([A-Za-z]{2,10})$/)
    if (glued && !/^[kmb]$/i.test(glued[2])) {
      const cut = w.x0 + (w.x1 - w.x0) * glued[1].length / text.length
      out.push({ ...base, text: glued[1], x1: cut })
      out.push({ ...base, text: glued[2], x0: cut })
    } else out.push({ ...base, text })
  }
  // Reading order: by line, then left to right.
  const h = median(out.map(t => t.h)) || 10
  return out.sort((a, b) => (Math.abs(a.y0 - b.y0) < h * 0.5 ? a.x0 - b.x0 : a.y0 - b.y0))
}

function sameLine(a, b) {
  const h = Math.min(a.h, b.h)
  return Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) < h * 0.6
}

// The words that name an asset: tickers, then names of up to three words.
function findAnchors(tokens, cat) {
  const anchors = []
  const used = new Set()
  // Names first, longest first, so "USD Coin" is one anchor and "Bitcoin Cash" is not Bitcoin.
  for (let n = cat.maxWords; n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const run = tokens.slice(i, i + n)
      if (run.some((t, k) => used.has(i + k))) continue
      if (n > 1 && run.some((t, k) => k && !sameLine(run[k - 1], t))) continue
      if (!/^[A-Z]/.test(run[0].text)) continue
      const key = norm(run.map(t => t.text).join(' '))
      const entry = cat.byName.get(key)
      if (!entry) continue
      // A name the same as its ticker ("BNB") is matched below, as a ticker.
      if (n === 1 && run[0].text === run[0].text.toUpperCase() && cat.bySymbol.has(run[0].text.toUpperCase())) continue
      for (let k = 0; k < n; k++) used.add(i + k)
      anchors.push({ entry, kind: 'name', idx: Array.from({ length: n }, (_, k) => i + k), ...box(run) })
    }
  }
  tokens.forEach((t, i) => {
    if (used.has(i)) return
    const pair = t.text.match(/^([A-Z0-9]{2,10})[/-](USDT|USDC|USD|BUSD|EUR|BTC|ETH)$/)
    const sym = (pair ? pair[1] : t.text).replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(t.text.replace(/[/-].*$/, '')) || NOT_ANCHORS.has(sym)) return
    const entry = cat.bySymbol.get(sym)
    if (!entry) return
    used.add(i)
    anchors.push({ entry, kind: 'ticker', idx: [i], ...box([t]) })
  })
  return anchors
}

function box(ts) {
  const x0 = Math.min(...ts.map(t => t.x0)), x1 = Math.max(...ts.map(t => t.x1))
  const y0 = Math.min(...ts.map(t => t.y0)), y1 = Math.max(...ts.map(t => t.y1))
  return { x0, x1, y0, y1, h: median(ts.map(t => t.h)), cy: (y0 + y1) / 2 }
}

// One holding, many words: its name and ticker a line apart are one group.
function groupAnchors(anchors) {
  const sorted = [...anchors].sort((a, b) => a.cy - b.cy)
  const groups = []
  for (const a of sorted) {
    const g = groups.find(g => g.symbol === a.entry.symbol && Math.abs(g.cy - a.cy) < 2.4 * Math.max(g.h, a.h))
    if (g) {
      g.members.push(a)
      Object.assign(g, box([g, a]), { cy: (Math.min(g.y0, a.y0) + Math.max(g.y1, a.y1)) / 2 })
    } else groups.push({ symbol: a.entry.symbol, entry: a.entry, members: [a], ...box([a]) })
  }
  // "Wrapped Bitcoin" over "WBTC": a ticker beats a lone name right next to it.
  const out = groups.filter(g => !(g.members.every(m => m.kind === 'name') &&
    groups.some(o => o !== g && o.members.some(m => m.kind === 'ticker') && Math.abs(o.cy - g.cy) < 1.8 * g.h)))
  return out.sort((a, b) => a.cy - b.cy)
}

function classify(tok, prev, next, symbol) {
  let text = tok.text
  const money = MONEY.test(text) || (prev && /^(US\$|\$|€|£|≈|~|=)$/.test(prev.text) && sameLine(prev, tok))
  text = text.replace(MONEY, '').replace(/^[+-]/, '')
  if (/%$/.test(text) || (next && next.text === '%' && sameLine(tok, next))) return null
  if (/[:/]/.test(text)) return null
  const value = parseNumber(text)
  if (!Number.isFinite(value) || value <= 0) return null
  const nextSame = next && sameLine(tok, next) && next.x0 - tok.x1 < tok.h * 3 ? next : null
  const prevSame = prev && sameLine(prev, tok) ? prev : null
  const after = nextSame ? nextSame.text.replace(/[^A-Za-z]/g, '') : ''
  const fiatAfter = FIAT_CODE.test(after) && after.toUpperCase() !== symbol
  const strong = !!nextSame && (after.toUpperCase() === symbol || UNIT_WORDS.test(after))
  const label = prevSame ? (PRICE_LABEL.test(prevSame.text) ? 'price' : VALUE_LABEL.test(prevSame.text) ? 'value' : AMOUNT_LABEL.test(prevSame.text) ? 'amount' : null) : null
  return { value, money: money || fiatAfter, strong: strong || label === 'amount', label: label === 'amount' ? null : label, h: tok.h, tok }
}

const off = (a, b) => (a > 0 && b > 0 ? Math.max(a / b, b / a) : Infinity)

function solveRow(nums, symbol, market) {
  const strong = nums.find(n => n.strong)
  const nearMarket = (n) => market > 0 && off(n.value, market) < 1.25
  let amount = strong ? strong.value : 0
  if (!amount) {
    const plain = nums.find(n => !n.money && !n.label && !nearMarket(n))
    if (plain) amount = plain.value
  }
  const amountTok = strong || nums.find(n => n.value === amount && !n.money)
  // Every other figure is a price or a value; a table may print them bare.
  const money = nums.filter(n => n !== amountTok)

  if (!amount) {
    // Only a money figure: a value, if the market price makes it one.
    const v = money.find(n => market > 0 && !nearMarket(n) && n.label !== 'price')
    return v ? { amount: v.value / market, price: market } : null
  }
  for (const p of money) for (const v of money) {
    if (p !== v && Math.abs(amount * p.value - v.value) <= v.value * 0.015 + 0.01) return { amount, price: p.value }
  }
  const lp = money.find(n => n.label === 'price')
  if (lp) return { amount, price: lp.value }
  const lv = money.find(n => n.label === 'value')
  if (lv) return { amount, price: lv.value / amount }
  if (!money.length) return { amount, price: 0 }
  if (market > 0) {
    // Whichever reading lands nearer the market: the figure, or the figure ÷ amount.
    let best = null
    for (const n of money) for (const px of [n.value, n.value / amount]) if (!best || off(px, market) < off(best, market)) best = px
    return { amount, price: off(best, market) < 3 ? best : 0 }
  }
  // No market to ask: a holdings list shows the value. Of two figures the
  // value is the bigger when there is more than one unit, else the smaller.
  const vals = money.map(n => n.value)
  const value = amount >= 1 ? Math.max(...vals) : Math.min(...vals)
  return { amount, price: value / amount }
}

// A table's header row: two or more column labels on one line. The nearest
// header above a figure names it, so the last such row wins (sorted below).
function columnHeaders(tokens) {
  const kindOf = (t) => (PRICE_LABEL.test(t.text) ? 'price' : VALUE_LABEL.test(t.text) ? 'value' : AMOUNT_LABEL.test(t.text) ? 'amount' : null)
  const labelled = tokens.filter(kindOf)
  return labelled
    .filter(t => labelled.filter(o => o !== t && sameLine(o, t)).length >= 1)
    .map(t => ({ kind: kindOf(t), x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1 }))
    .sort((a, b) => b.y1 - a.y1)
}

/**
 * words: [{ text, x0, y0, x1, y1 }] from readScreenshotWords.
 * catalogue: buildCatalogue(...).
 * Returns [{ symbol, name, amount, price, type }] — price 0 when not shown.
 */
export function parseHoldingsFromWords(words, catalogue) {
  const tokens = tokenize(words || [])
  if (!tokens.length) return []
  const anchors = findAnchors(tokens, catalogue)
  const groups = groupAnchors(anchors)
  if (!groups.length) return []
  const width = Math.max(...tokens.map(t => t.x1))
  const rowH = median(groups.map(g => g.h)) || 10
  const anchorIdx = new Set(anchors.flatMap(a => a.idx))
  const headers = columnHeaders(tokens)
  const rows = []

  groups.forEach((g, gi) => {
    // A headline total ("0.218 BTC" in big type under "Estimated Balance") is not a holding.
    if (g.h > rowH * 1.7) return
    if (g.x0 > width * 0.6) return
    const above = tokens.filter(t => t.y1 <= g.y0 + 2 && g.y0 - t.y1 < g.h * 1.6)
    const lineOf = tokens.filter(t => sameLine(t, g))
    if ([...above, ...lineOf].some(t => TOTAL_WORDS.test(t.text))) return

    const prevG = groups[gi - 1], nextG = groups[gi + 1]
    const top = Math.max(prevG ? (prevG.cy + g.cy) / 2 : -Infinity, g.y0 - g.h * 2.2)
    const bottom = Math.min(nextG ? (nextG.cy + g.cy) / 2 : Infinity, g.y1 + g.h * 2.6)
    const band = []
    tokens.forEach((t, i) => { if (!anchorIdx.has(i) && (t.y0 + t.y1) / 2 >= top && (t.y0 + t.y1) / 2 < bottom) band.push(i) })

    const nums = []
    for (const i of band) {
      const n = classify(tokens[i], tokens[i - 1], tokens[i + 1], g.symbol)
      if (!n) continue
      // In a table the label is the column's header, somewhere above.
      const head = n.label || n.strong ? null : headers.find(hd => hd.y1 <= n.tok.y0 && hd.x0 - n.tok.h <= n.tok.x1 && n.tok.x0 <= hd.x1 + n.tok.h)
      if (head) { if (head.kind === 'amount') n.strong = true; else n.label = head.kind }
      nums.push(n)
    }
    const solved = solveRow(nums, g.symbol, g.entry.price)
    if (!solved || !(solved.amount > 0) || !Number.isFinite(solved.amount)) return
    const words = band.map(i => tokens[i].text.toLowerCase())
    const type = words.some(w => /^(sell|sold)$/.test(w)) && !words.some(w => /^(buy|bought)$/.test(w)) ? 'sell' : 'buy'
    rows.push({
      symbol: g.symbol,
      name: g.entry.name,
      amount: +solved.amount.toPrecision(10),
      price: solved.price > 0 ? +solved.price.toPrecision(10) : 0,
      type,
    })
  })
  return rows
}
