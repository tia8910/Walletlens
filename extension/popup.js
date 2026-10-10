// WalletLens extension popup: Home, Holdings, Signals, Market and Alerts.
import {
  ext, SITE, STORAGE_KEY, get, set, getSettings, saveSettings, loadPortfolio, fxRates, money, pct, amount,
  CURRENCIES, recordSnapshot, historyFor, ohlc, signalFrom, fearGreed, news, stockQuotes, metalPrice,
} from './lib/core.js'

const STORE_URL = 'https://chromewebstore.google.com/detail/walletlens-portfolio/ajmjdeobjjmabgonhaeaaehoepfafhbn'
const PROXY = u => `https://walletlens-voice.tarek-abdelhameed.workers.dev/proxy?url=${encodeURIComponent(u)}`
const $ = id => document.getElementById(id)
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const CLASS_META = {
  crypto: ['Crypto', '#f7931a'], property: ['Property', '#94a3b8'], stocks: ['Stocks', '#a78bfa'],
  metals: ['Metals', '#e8b825'], cash: ['Cash', '#60a5fa'], other: ['Other', '#22d3ee'],
}

const state = { settings: null, rates: { USD: 1 }, p: null, tab: 'home', range: '1W', wallet: 'all', cls: 'all', sort: 'value', signals: null, marketLoaded: false }
const m = (usd, o) => money(usd, state.settings.currency, state.rates, o)

// ── Icons ─────────────────────────────────────────────────────────────────

const METAL_BADGE = { 'metal:xau': ['Au', '#e8b825'], 'metal:xag': ['Ag', '#94a3b8'], 'metal:xpt': ['Pt', '#cbd5e1'], 'metal:xcu': ['Cu', '#c2410c'] }
function badgeFor(h) {
  const id = h.coin_id
  if (METAL_BADGE[id]) return METAL_BADGE[id]
  if (id.startsWith('stock:')) return [id.slice(6).toUpperCase().slice(0, 4), '#a78bfa']
  if (id.startsWith('fiat:')) return [id.slice(5).toUpperCase().slice(0, 3), '#60a5fa']
  if (id.startsWith('real:')) return ['🏠', '#94a3b8']
  if (id.startsWith('cash:')) return ['$', '#60a5fa']
  if (id.startsWith('bond:') || id.startsWith('other:')) return [(h.coin_symbol || 'OTH').slice(0, 3).toUpperCase(), '#22d3ee']
  return null
}
function letter(h) {
  const [label, color] = badgeFor(h) || [(h.coin_symbol || '?').toUpperCase().slice(0, 4), '#334155']
  const d = el('span', 'ic', esc(label))
  d.style.background = color
  if (color === '#e8b825' || color === '#cbd5e1' || color === '#94a3b8') d.style.color = '#0a0b0d'
  if (label.length > 3) d.style.fontSize = '8px'
  return d
}
function icon(h, image) {
  if (badgeFor(h)) return letter(h)
  const sym = (h.coin_symbol || '').toLowerCase()
  const src = [image, h.coin_image].filter(u => u && /^https?:\/\//.test(u))
  if (sym) src.push(`https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${sym}.svg`, `https://assets.coincap.io/assets/icons/${sym}@2x.png`)
  for (const s of src.slice()) src.push(PROXY(s))
  if (!src.length) return letter(h)
  const img = el('img', 'ic'); img.alt = ''; img.referrerPolicy = 'no-referrer'
  let i = 0; img.src = src[0]
  img.addEventListener('error', () => { i++; if (i < src.length) img.src = src[i]; else img.replaceWith(letter(h)) })
  return img
}

// ── Little charts ───────────────────────────────────────────────────────────

function sparkPath(vals, w, h, pad = 2) {
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1
  return vals.map((v, i) => `${i ? 'L' : 'M'}${(i / (vals.length - 1) * w).toFixed(1)} ${(pad + (1 - (v - lo) / span) * (h - pad * 2)).toFixed(1)}`).join(' ')
}
function spark(vals) {
  if (!vals || vals.length < 2) return el('span', 'spark', '')
  const up = vals[vals.length - 1] >= vals[0]
  const s = el('span', 'spark', `<svg width="52" height="18" viewBox="0 0 52 18"><path d="${sparkPath(vals, 52, 18)}" fill="none" stroke="${up ? '#34d399' : '#f87171'}" stroke-width="1.7" stroke-linejoin="round"/></svg>`)
  return s
}

// ── Sync from the site (unchanged behaviour from 1.x) ───────────────────────

const hasTx = d => !!(d && Array.isArray(d.transactions) && d.transactions.length)
function syncFromOpenTabs() {
  return new Promise(resolve => {
    ext.tabs.query({ url: SITE + '/*' }, tabs => {
      if (!tabs?.length) return resolve(false)
      Promise.all(tabs.map(t => ext.tabs.sendMessage(t.id, { type: 'REQUEST_SYNC' }).catch(() => {}))).then(() => setTimeout(() => resolve(true), 700))
    })
  })
}
// No data on this device yet and no site tab open: open the site in a
// background tab so its content script can sync, then close it.
function fetchViaBackgroundTab(timeoutMs = 9000) {
  return new Promise(resolve => {
    let done = false, tabId = null
    const onChanged = (ch, area) => { if (area === 'local' && ch[STORAGE_KEY] && hasTx(ch[STORAGE_KEY].newValue)) finish(true) }
    const finish = v => { if (done) return; done = true; ext.storage.onChanged.removeListener(onChanged); clearTimeout(timer); if (tabId != null) ext.tabs.remove(tabId).catch(() => {}); resolve(v) }
    ext.storage.onChanged.addListener(onChanged)
    const timer = setTimeout(() => finish(false), timeoutMs)
    try { ext.tabs.create({ url: SITE + '/dashboard', active: false }, t => { tabId = t?.id ?? null; if (tabId == null) finish(false) }) } catch { finish(false) }
  })
}

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  state.settings = await getSettings()
  fillCurrencies()
  applyHide()
  if (state.settings.currency !== 'USD') state.rates = await fxRates()
  await load()
}

async function load({ quiet = false } = {}) {
  if (!quiet) { show('loading'); hide('no-data'); document.querySelectorAll('.tab').forEach(t => t.hidden = true); hide('nav') }
  let data = await get(STORAGE_KEY)
  if (await syncFromOpenTabs()) data = await get(STORAGE_KEY)
  if (!hasTx(data)) { $('loading-caption').hidden = false; if (await fetchViaBackgroundTab()) data = await get(STORAGE_KEY); $('loading-caption').hidden = true }
  if (!hasTx(data)) { hide('loading'); show('no-data'); return }
  state.p = await loadPortfolio(state.wallet)
  if (!state.p || !state.p.rows.length) { hide('loading'); show('no-data'); return }
  if (state.wallet === 'all') await recordSnapshot(state.p.total)
  hide('loading'); show('nav')
  fillWallets(data.wallets)
  go(state.tab)
}

function show(id) { $(id).hidden = false }
function hide(id) { $(id).hidden = true }

function go(tab) {
  state.tab = tab
  document.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== 'tab-' + tab)
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab))
  ;({ home: renderHome, holdings: renderHoldings, signals: renderSignals, market: renderMarket, alerts: renderAlerts })[tab]()
  $('main').scrollTop = 0
}
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)))
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => go(b.dataset.goto)))

// ── Header ─────────────────────────────────────────────────────────────────

function fillCurrencies() {
  $('currency').innerHTML = CURRENCIES.map(([c, f]) => `<option value="${c}">${f} ${c}</option>`).join('')
  $('currency').value = state.settings.currency
}
$('currency').addEventListener('change', async e => {
  state.settings = await saveSettings({ currency: e.target.value })
  state.rates = e.target.value === 'USD' ? { USD: 1 } : await fxRates()
  go(state.tab)
})
function applyHide() {
  document.body.classList.toggle('hide-values', !!state.settings.hideBalances)
  $('btn-hide').querySelector('use').setAttribute('href', state.settings.hideBalances ? '#i-eyeoff' : '#i-eye')
}
async function setHide(v) {
  state.settings = await saveSettings({ hideBalances: v })
  applyHide()
  if ($('hide-on')) $('hide-on').checked = v
}
$('btn-hide').addEventListener('click', () => setHide(!state.settings.hideBalances))
$('btn-refresh').addEventListener('click', async () => {
  const b = $('btn-refresh'); b.classList.add('spin'); b.disabled = true
  state.signals = null; state.marketLoaded = false
  await set('wl_price_cache_v2', null)
  await load({ quiet: true })
  b.classList.remove('spin'); b.disabled = false
})
$('btn-menu').addEventListener('click', e => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden })
document.addEventListener('click', () => { $('menu').hidden = true })
$('menu').addEventListener('click', e => {
  const act = e.target.dataset.act
  if (act === 'open') open(SITE + '/dashboard')
  if (act === 'import') openImport()
  if (act === 'share') share('copy')
  if (act === 'friend') tellFriend()
  if (act === 'rate') open(STORE_URL + '/reviews')
})
function open(url) { ext.tabs.create({ url }); window.close() }
function toast(t) { const x = $('toast'); x.textContent = t; x.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { x.hidden = true }, 2200) }

// ── Home ───────────────────────────────────────────────────────────────────

async function renderHome() {
  const p = state.p
  $('total').textContent = m(p.total); $('total').classList.add('money')
  const day = $('day-chip')
  day.className = 'chip' + (p.dayChange < 0 ? ' r' : '')
  day.innerHTML = `${p.dayChange < 0 ? '▼' : '▲'} <span class="money">${m(Math.abs(p.dayChange))}</span> · ${pct(p.dayPct)} today`
  const pc = $('pnl-chip')
  if (p.pnl != null) { pc.hidden = false; pc.innerHTML = `P&amp;L <span class="money">${m(p.pnl, { sign: true })}</span> · ${pct(p.pnlPct, 1)}` } else pc.hidden = true
  await drawHistory()

  // Allocation by class
  const byCls = {}
  for (const r of p.rows) if (r.value > 0) byCls[r.cls] = (byCls[r.cls] || 0) + r.value
  const parts = Object.entries(byCls).sort((a, b) => b[1] - a[1])
  let off = 0
  $('donut').innerHTML = parts.map(([c, v]) => { const share = v / p.total * 100; const s = `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${CLASS_META[c][1]}" stroke-width="6" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${-off}" transform="rotate(-90 21 21)"/>`; off += share; return s }).join('')
    + `<text x="21" y="23.6" text-anchor="middle" font-family="Sora" font-weight="800" font-size="7.5" fill="#fff">${p.rows.length}</text>`
  $('legend').innerHTML = parts.map(([c, v]) => `<div><i style="background:${CLASS_META[c][1]}"></i>${CLASS_META[c][0]}<b>${(v / p.total * 100).toFixed(0)}%</b></div>`).join('')

  // Top movers: biggest moves today among what has a live price
  const movers = p.rows.filter(r => r.value > 0 && isFinite(r.chg) && r.chg !== null).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 3)
  const box = $('movers'); box.innerHTML = ''
  ;(movers.length ? movers : p.rows.slice(0, 3)).forEach(r => box.appendChild(row(r)))
  $('synced-home').textContent = 'Synced ' + ago(p.data.syncedAt)
}

async function drawHistory() {
  const vals = await historyFor(state.range)
  const svg = $('hist')
  const note = $('hist-note')
  if (vals.length < 2) {
    svg.innerHTML = `<path d="M0 50 L320 50" stroke="rgba(255,255,255,.18)" stroke-dasharray="4 5" fill="none"/>`
    note.hidden = false
    return
  }
  note.hidden = true
  const up = vals[vals.length - 1] >= vals[0]
  const d = sparkPath(vals, 320, 70, 6)
  svg.innerHTML = `<path d="${d} L320 70 L0 70Z" fill="url(#${up ? 'sg' : 'sgr'})"/><path d="${d}" fill="none" stroke="${up ? '#34d399' : '#f87171'}" stroke-width="2.2" stroke-linejoin="round"/>`
}
document.querySelectorAll('#range button').forEach(b => b.addEventListener('click', () => {
  state.range = b.dataset.r
  document.querySelectorAll('#range button').forEach(x => x.classList.toggle('on', x === b))
  drawHistory()
}))

function ago(ts) {
  if (!ts) return 'never'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  return Math.floor(s / 86400) + ' d ago'
}

// ── Holdings ───────────────────────────────────────────────────────────────

function row(r, { withSpark = false } = {}) {
  const h = r.h
  const x = el('div', 'r click')
  x.appendChild(icon(h, r.image))
  const sub = r.cls === 'property' || r.cls === 'other' ? (r.cls === 'property' ? 'Property' : 'Other asset') : `${amount(h.amount)} ${esc((h.coin_symbol || '').toUpperCase())}`
  x.appendChild(el('span', 'nm', `${esc(h.coin_name || h.coin_symbol)}<small class="money">${sub}</small>`))
  if (withSpark) x.appendChild(spark(r.spark))
  // Assets without a market (property, bonds, other) are valued at cost, and
  // cash does not move: neither gets a P&L or a day change.
  const atCost = state.p.prices[h.coin_id]?.estimated
  let small
  if (atCost) small = '<span class="mu">Valued at cost</span>'
  else if (r.cls === 'cash') small = '<span class="mu">Cash</span>'
  else {
    const chg = r.chg == null || !isFinite(r.chg) ? '' : `<span class="${r.chg < 0 ? 'dn' : 'up'}">${pct(r.chg)}</span>`
    const pnl = withSpark && r.pnl != null && Math.abs(r.pnl) >= 0.01 ? `<span class="${r.pnl < 0 ? 'dn' : 'up'} money">${m(r.pnl, { compact: true, sign: true })}</span>` : ''
    small = [pnl, chg].filter(Boolean).join(' · ') || '<span class="mu">·</span>'
  }
  x.appendChild(el('span', 'v', `<span class="money">${m(r.value, { compact: r.value >= 1e5 })}</span><small>${small}</small>`))
  x.addEventListener('click', () => open(`${SITE}/asset/${encodeURIComponent(h.coin_id)}`))
  return x
}

function fillWallets(wallets) {
  const w = $('wallet')
  const list = Array.isArray(wallets) ? wallets : []
  w.innerHTML = '<option value="all">All wallets</option>' + list.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')
  w.value = state.wallet
  w.hidden = list.length < 2
}
$('wallet').addEventListener('change', async e => { state.wallet = e.target.value; state.p = await loadPortfolio(state.wallet); renderHoldings() })
document.querySelectorAll('#cls button').forEach(b => b.addEventListener('click', () => {
  state.cls = b.dataset.c
  document.querySelectorAll('#cls button').forEach(x => x.classList.toggle('on', x === b))
  renderHoldings()
}))
const SORTS = { value: 'Sorted by value', change: 'Sorted by today’s move', pnl: 'Sorted by P&L' }
$('sort').addEventListener('click', () => {
  const keys = Object.keys(SORTS); state.sort = keys[(keys.indexOf(state.sort) + 1) % keys.length]
  renderHoldings()
})

function renderHoldings() {
  const p = state.p
  $('sort').textContent = SORTS[state.sort] + ' ▾'
  let rows = p.rows.slice()
  if (state.cls !== 'all') rows = rows.filter(r => state.cls === 'other' ? ['cash', 'property', 'other'].includes(r.cls) : r.cls === state.cls)
  if (state.sort === 'change') rows.sort((a, b) => (b.chg ?? -1e9) - (a.chg ?? -1e9))
  if (state.sort === 'pnl') rows.sort((a, b) => (b.pnl ?? -1e18) - (a.pnl ?? -1e18))
  $('h-count').textContent = rows.length
  const box = $('holdings'); box.innerHTML = ''
  if (!rows.length) box.appendChild(el('p', 'empty', 'Nothing in this group yet.'))
  rows.forEach(r => box.appendChild(row(r, { withSpark: true })))
  $('synced-h').textContent = 'Synced ' + ago(p.data.syncedAt)
}

// ── Signals ────────────────────────────────────────────────────────────────

async function renderSignals() {
  const crypto = state.p.rows.filter(r => r.cls === 'crypto' && r.value > 0).slice(0, 10)
  const box = $('signals')
  if (!crypto.length) { box.innerHTML = '<p class="empty">Signals cover crypto holdings. Add a coin in WalletLens to see one here.</p>'; $('levels').innerHTML = ''; $('n-buy').textContent = $('n-sell').textContent = '0'; return }
  if (!state.signals) {
    box.innerHTML = '<div class="state" style="height:120px"><div class="spinner"></div></div>'
    const out = []
    // A few at a time, so a long list does not trip the free price API's limit.
    for (let i = 0; i < crypto.length; i += 3) {
      const batch = await Promise.all(crypto.slice(i, i + 3).map(async r => ({ r, s: signalFrom(await ohlc(r.h.coin_id, 30)) })))
      out.push(...batch)
    }
    state.signals = out
  }
  const list = state.signals.filter(x => x.s)
  $('n-buy').textContent = list.filter(x => x.s.action === 'buy').length
  $('n-sell').textContent = list.filter(x => x.s.action === 'sell').length
  box.innerHTML = ''
  if (!list.length) { box.innerHTML = '<p class="empty">Price history is not available right now. Try refresh in a minute.</p>'; return }
  list.forEach(({ r, s }, i) => {
    const x = el('div', 'r click')
    x.appendChild(icon(r.h, r.image))
    x.appendChild(el('span', 'nm', `${esc(r.h.coin_name)}<small>${esc(s.why)}</small>`))
    x.appendChild(el('span', 'sig ' + s.action, s.action.toUpperCase()))
    x.addEventListener('click', () => levels(r, s))
    box.appendChild(x)
    if (i === 0) levels(r, s)
  })
}
function levels(r, s) {
  const k = v => m(v, { compact: v >= 1e4 })
  $('levels').innerHTML = `<div class="levels ${s.action === 'sell' ? 'sell' : ''}"><div class="levels-h"><span>${esc(r.h.coin_name)} · levels</span><span class="${s.action === 'sell' ? 'dn' : s.action === 'buy' ? 'up' : ''}">${s.action[0].toUpperCase() + s.action.slice(1)}</span></div>
    <div class="levels-g"><div><span class="k">STOP</span><span class="dn">${k(s.stop)}</span></div>${s.tp.map((v, i) => `<div><span class="k">TP${i + 1}</span><span class="up">${k(v)}</span></div>`).join('')}</div></div>`
}

// ── Market ─────────────────────────────────────────────────────────────────

async function renderMarket() {
  if (state.marketLoaded) return
  state.marketLoaded = true
  const [fg, spx, gold, articles] = await Promise.all([fearGreed(), stockQuotes(['^spx']), metalPrice('XAU'), news()])
  if (fg) {
    $('fg-arc').setAttribute('stroke-dashoffset', String(132 - fg.now / 100 * 132))
    $('fg-now').innerHTML = `<span class="${fg.now < 45 ? 'dn' : fg.now > 55 ? 'up' : ''}">${fg.now}</span> <span style="font-size:13px">${esc(fg.label)}</span>`
    $('fg-past').textContent = [fg.yesterday != null && `Yesterday ${fg.yesterday}`, fg.week != null && `Last week ${fg.week}`].filter(Boolean).join(' · ')
  } else $('fg-now').textContent = 'Unavailable'
  const pr = state.p.prices
  const tiles = [
    ['BITCOIN', pr.bitcoin?.usd, pr.bitcoin?.chg],
    ['ETHEREUM', pr.ethereum?.usd, pr.ethereum?.chg],
    ['GOLD / OZ', gold, null],
    ['S&P 500', spx['^spx']?.usd, spx['^spx']?.chg, true],
  ]
  $('majors').innerHTML = tiles.map(([n, v, c, pts]) => `<div class="tile"><span class="k">${n}</span><b>${v ? (pts ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : m(v)) : '—'}</b><small class="${c < 0 ? 'dn' : 'up'}">${c == null ? '&nbsp;' : pct(c)}</small></div>`).join('')

  // Headlines that mention something you hold come first.
  const names = state.p.rows.flatMap(r => [r.h.coin_name, (r.h.coin_symbol || '').toUpperCase()]).filter(s => s && s.length > 2)
  const mine = a => names.find(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(a.title || ''))
  const ranked = articles.map(a => ({ a, hit: mine(a) })).sort((x, y) => (y.hit ? 1 : 0) - (x.hit ? 1 : 0)).slice(0, 8)
  const box = $('news'); box.innerHTML = ''
  if (!ranked.length) box.innerHTML = '<p class="empty">No headlines right now.</p>'
  for (const { a, hit } of ranked) {
    const link = el('a', '', `${esc(a.title)}<small>${hit ? `<span class="tag">${esc(hit)}</span> · ` : ''}${esc(a.source || a.publisher || '')}${a.publishedAt || a.date ? ' · ' + ago(new Date(a.publishedAt || a.date).getTime()) : ''}</small>`)
    link.addEventListener('click', () => { const u = a.url || a.link; if (typeof u === 'string' && /^https?:\/\//i.test(u)) open(u) })
    box.appendChild(link)
  }
}

// ── Alerts ─────────────────────────────────────────────────────────────────

function renderAlerts() {
  const s = state.settings
  const list = $('alert-list'); list.innerHTML = ''
  for (const a of s.alerts) {
    const x = el('div', 'r')
    x.appendChild(letter({ coin_id: a.coinId.includes(':') ? a.coinId : 'x', coin_symbol: a.symbol }))
    x.appendChild(el('span', 'nm', `${esc(a.name)} ${a.kind === 'above' ? 'above' : 'below'} ${m(a.usd)}<small>${a.on ? 'Price alert' : a.firedAt ? 'Fired ' + ago(a.firedAt) : 'Off'}</small>`))
    const tog = el('label', 'tog', `<input type="checkbox" ${a.on ? 'checked' : ''}><i></i>`)
    tog.querySelector('input').addEventListener('change', async e => { a.on = e.target.checked; state.settings = await saveSettings({ alerts: s.alerts }); ping() })
    const del = el('button', 'del', '<svg><use href="#i-trash"/></svg>'); del.title = 'Delete alert'
    del.addEventListener('click', async () => { state.settings = await saveSettings({ alerts: s.alerts.filter(y => y.id !== a.id) }); renderAlerts() })
    x.append(tog, del)
    list.appendChild(x)
  }
  $('move-pct').value = String(s.moveAlert.pct)
  $('move-on').checked = s.moveAlert.on
  $('digest-hour').innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`).join('')
  $('digest-hour').value = String(s.digest.hour)
  $('digest-on').checked = s.digest.on
  $('badge-on').checked = s.badge
  $('hide-on').checked = s.hideBalances
}
const ping = () => ext.runtime.sendMessage({ type: 'CHECK_NOW' }).catch?.(() => {})
$('move-on').addEventListener('change', async e => { state.settings = await saveSettings({ moveAlert: { ...state.settings.moveAlert, on: e.target.checked } }) })
$('move-pct').addEventListener('change', async e => { state.settings = await saveSettings({ moveAlert: { ...state.settings.moveAlert, pct: +e.target.value } }) })
$('digest-on').addEventListener('change', async e => { state.settings = await saveSettings({ digest: { ...state.settings.digest, on: e.target.checked } }) })
$('digest-hour').addEventListener('change', async e => { state.settings = await saveSettings({ digest: { ...state.settings.digest, hour: +e.target.value, lastDay: '' } }) })
$('badge-on').addEventListener('change', async e => {
  state.settings = await saveSettings({ badge: e.target.checked })
  if (!e.target.checked) ext.action.setBadgeText({ text: '' }); else ping()
})
$('hide-on').addEventListener('change', e => setHide(e.target.checked))

// New price alert
$('btn-new-alert').addEventListener('click', () => {
  const opts = state.p.rows.filter(r => state.p.prices[r.h.coin_id]?.usd > 0 && !state.p.prices[r.h.coin_id]?.estimated)
  const extra = ['bitcoin', 'ethereum'].filter(id => !opts.find(r => r.h.coin_id === id) && state.p.prices[id])
  $('af-asset').innerHTML = opts.map(r => `<option value="${esc(r.h.coin_id)}">${esc(r.h.coin_name)} (${esc((r.h.coin_symbol || '').toUpperCase())})</option>`).join('')
    + extra.map(id => `<option value="${id}">${id === 'bitcoin' ? 'Bitcoin (BTC)' : 'Ethereum (ETH)'}</option>`).join('')
  $('af-cur').textContent = state.settings.currency
  $('alert-form').hidden = false; $('btn-new-alert').hidden = true
  showNow()
})
const rate = () => state.settings.currency === 'USD' ? 1 : (state.rates[state.settings.currency] || 1)
function showNow() {
  const id = $('af-asset').value, p = state.p.prices[id]?.usd
  $('af-now').textContent = p ? `Now ${m(p)}` : ''
  if (p && !$('af-price').value) $('af-price').placeholder = (p * rate()).toFixed(p * rate() >= 100 ? 0 : 4)
}
$('af-asset').addEventListener('change', () => { $('af-price').value = ''; showNow() })
$('af-cancel').addEventListener('click', () => { $('alert-form').hidden = true; $('btn-new-alert').hidden = false })
$('alert-form').addEventListener('submit', async e => {
  e.preventDefault()
  const id = $('af-asset').value, v = parseFloat($('af-price').value)
  if (!id || !(v > 0)) return
  const r = state.p.rows.find(x => x.h.coin_id === id)
  const name = r ? r.h.coin_name : id === 'bitcoin' ? 'Bitcoin' : 'Ethereum'
  const symbol = r ? (r.h.coin_symbol || '').toUpperCase() : id === 'bitcoin' ? 'BTC' : 'ETH'
  const alert = { id: Date.now().toString(36), kind: $('af-kind').value, coinId: id, symbol, name, usd: v / rate(), on: true, firedAt: 0 }
  state.settings = await saveSettings({ alerts: [...state.settings.alerts, alert] })
  $('alert-form').reset(); $('alert-form').hidden = true; $('btn-new-alert').hidden = false
  renderAlerts(); toast('Alert saved'); ping()
})

// ── Import ─────────────────────────────────────────────────────────────────

function openImport() { $('import-code').value = ''; hide('import-error'); hide('import-ok'); show('import') }
$('btn-import-nodata').addEventListener('click', openImport)
$('import-close').addEventListener('click', () => hide('import'))
$('btn-open-site').addEventListener('click', () => open(SITE + '/dashboard'))

async function gunzipB64(b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ds = new DecompressionStream('gzip'), w = ds.writable.getWriter()
  w.write(bytes); w.close()
  const reader = ds.readable.getReader(), chunks = []; let total = 0
  for (;;) {
    const { done, value } = await reader.read(); if (done) break
    total += value.length
    if (total > 10 * 1024 * 1024) { reader.cancel(); throw new Error('Backup too large to decompress.') }
    chunks.push(value)
  }
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length }
  return new TextDecoder().decode(out)
}
async function importCode(raw) {
  const code = (raw || '').trim().replace(/\s+/g, '')
  if (!code) throw new Error('Paste a backup code first.')
  let json
  if (code.startsWith('WL3-') || code.startsWith('WL2-')) {
    try { json = await gunzipB64(code.slice(4)) } catch { throw new Error('Could not read the code. Make sure you copied all of it.') }
  } else {
    try { json = decodeURIComponent(escape(atob(code.startsWith('WL1-') ? code.slice(4) : code))) } catch { throw new Error('Could not read the code. Make sure you copied all of it.') }
  }
  let parsed; try { parsed = JSON.parse(json) } catch { throw new Error('The backup data is incomplete.') }
  let transactions, wallets = [], settings = {}
  if (parsed?.v === 3) {
    if (!Array.isArray(parsed.txs)) throw new Error('No transactions found in this code.')
    transactions = parsed.txs.map(tx => ({ coin_image: '', category: 'crypto', ...tx }))
    wallets = Array.isArray(parsed.ws) ? parsed.ws : []
    if (parsed.st && typeof parsed.st === 'object') settings = parsed.st
  } else {
    if (!parsed?.data || typeof parsed.data !== 'object') throw new Error('The backup data is incomplete.')
    try {
      transactions = JSON.parse(parsed.data.crypto_tracker_transactions || '[]')
      if (parsed.data.crypto_tracker_wallets) wallets = JSON.parse(parsed.data.crypto_tracker_wallets)
      if (parsed.data.wl_settings) settings = JSON.parse(parsed.data.wl_settings)
    } catch { throw new Error('The transactions in this code are malformed.') }
  }
  if (!Array.isArray(transactions)) throw new Error('No transactions found in this code.')
  await set(STORAGE_KEY, { transactions, wallets, settings, syncedAt: Date.now() })
  return { txCount: transactions.length, walletCount: wallets.length }
}
$('import-apply').addEventListener('click', async () => {
  const b = $('import-apply'); hide('import-error'); hide('import-ok'); b.textContent = 'Importing…'; b.disabled = true
  try {
    const { txCount, walletCount } = await importCode($('import-code').value)
    $('import-ok').textContent = `Imported ${txCount} transactions and ${walletCount} wallets.`; show('import-ok')
    setTimeout(async () => { hide('import'); state.signals = null; state.marketLoaded = false; await load(); ping() }, 1000)
  } catch (err) {
    $('import-error').textContent = err.message; show('import-error')
  }
  b.textContent = 'Import portfolio'; b.disabled = false
})

// ── Share (percentages only, never a balance) ───────────────────────────────

const shareLink = c => `${SITE}/?ref=ext&utm_source=extension&utm_medium=share&utm_campaign=${c}`
function shareText() {
  const p = state.p
  const line = p?.pnlPct != null ? `My portfolio is ${p.pnlPct >= 0 ? 'up' : 'down'} ${Math.abs(p.pnlPct).toFixed(1)}% all time 📊`
    : p ? `My portfolio moved ${pct(p.dayPct, 1)} today 📊` : 'I track my whole net worth in one place 📊'
  return `${line}\nFree, private, no account. Tracked with WalletLens 👇`
}
async function share(ch) {
  const text = shareText(), url = shareLink('portfolio_share')
  if (ch === 'copy') { try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard') } catch {} return }
  const t = { x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, whatsapp: `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` }[ch]
  if (t) open(t)
}
document.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => share(b.dataset.share)))
async function tellFriend() {
  const url = shareLink('tell_friend')
  const text = 'A free, private net worth tracker: crypto, stocks, gold and cash in one place, no account. It lives in your browser toolbar too 👇'
  try { await navigator.clipboard.writeText(`${text}\n${url}`) } catch {}
  open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)
}

boot().catch(err => { console.error('[WalletLens]', err); hide('loading'); show('no-data') })
