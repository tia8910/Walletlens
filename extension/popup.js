'use strict';

const ext = typeof browser !== 'undefined' ? browser : chrome;

const STORAGE_KEY     = 'wl_portfolio_cache';
const PRICE_CACHE_KEY = 'wl_price_cache';
const PRICE_TTL       = 2 * 60 * 1000;
const SITE            = 'https://walletlens.live';
const CG_PRICE_URL    = 'https://api.coingecko.com/api/v3/simple/price';
const CG_MARKET_URL   = 'https://api.coingecko.com/api/v3/coins/markets';
const FG_URL          = 'https://api.alternative.me/fng/?limit=1';

const MARKET_COINS = ['bitcoin','ethereum','binancecoin','solana','ripple','cardano'];
const NEWS_URL     = 'https://walletlens.live/news.json';
const CG_OHLC_URL  = 'https://api.coingecko.com/api/v3/coins/{id}/ohlc';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUSD(v, compact = false) {
  if (!isFinite(v)) return '—';
  if (compact && Math.abs(v) >= 1_000_000) return '$' + (v/1_000_000).toFixed(2) + 'M';
  if (compact && Math.abs(v) >= 10_000)    return '$' + (v/1_000).toFixed(1) + 'K';
  return v.toLocaleString('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtPct(pct) {
  if (!isFinite(pct)) return '—';
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

function fmtAmt(n) {
  if (!isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits:2 });
  if (n >= 1)    return n.toLocaleString('en-US', { maximumFractionDigits:4 });
  return n.toPrecision(4).replace(/\.?0+$/, '');
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)    return 'just now';
  if (s < 60)   return s + 's ago';
  if (s < 3600) { const m = Math.floor(s/60); return m + 'm ago'; }
  const h = Math.floor(s/3600); return h + 'h ago';
}

function abbrev(sym) { return (sym||'?').toUpperCase().slice(0,4); }

// ── Portfolio math ────────────────────────────────────────────────────────────

function computeHoldings(transactions) {
  const map = new Map();
  for (const tx of transactions) {
    const id = String(tx.coin_id || '').trim();
    if (!id) continue;
    const qty  = Number(tx.amount ?? tx.quantity ?? 0);
    const cost = Number(tx.total_cost ?? (qty * (tx.price_per_unit ?? 0)));
    if (!isFinite(qty)) continue;
    if (!map.has(id)) {
      map.set(id, { coin_id:id, coin_symbol:tx.coin_symbol||id, coin_name:tx.coin_name||id, amount:0, totalCost:0 });
    }
    const h = map.get(id);
    if (tx.coin_symbol) h.coin_symbol = tx.coin_symbol;
    if (tx.coin_name)   h.coin_name   = tx.coin_name;
    const type = (tx.type||'').toLowerCase();
    if (type === 'buy'  || type === 'deposit')  { h.amount += qty; h.totalCost += cost; }
    if (type === 'sell' || type === 'withdraw') { h.amount -= qty; h.totalCost -= cost; }
  }
  for (const [id,h] of map) { if (h.amount < 1e-9) map.delete(id); }
  return map;
}

// ── Prices ────────────────────────────────────────────────────────────────────

async function fetchPrices(coinIds) {
  if (!coinIds?.length) return {};
  const ids = coinIds.join(',');
  try {
    const sess = ext.storage.session;
    if (sess) {
      const c = await new Promise(r => sess.get(PRICE_CACHE_KEY, x => r(x[PRICE_CACHE_KEY]||null)));
      if (c && c.ids === ids && Date.now()-c.fetchedAt < PRICE_TTL) return c.prices;
    }
  } catch {}
  try {
    const url = new URL(CG_PRICE_URL);
    url.searchParams.set('ids', ids);
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');
    const res = await fetch(url, { signal:AbortSignal.timeout(8000) });
    if (!res.ok) return {};
    const json = await res.json();
    try { const s = ext.storage.session; if (s) s.set({ [PRICE_CACHE_KEY]:{ ids, prices:json, fetchedAt:Date.now() } }); } catch {}
    return json;
  } catch { return {}; }
}

async function fetchMarketCoins() {
  try {
    const url = new URL(CG_MARKET_URL);
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('ids', MARKET_COINS.join(','));
    url.searchParams.set('order', 'market_cap_desc');
    url.searchParams.set('per_page', '6');
    url.searchParams.set('page', '1');
    url.searchParams.set('sparkline', 'false');
    url.searchParams.set('price_change_percentage', '24h');
    const res = await fetch(url, { signal:AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function fetchNews() {
  try {
    const res = await fetch(NEWS_URL, { signal:AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const json = await res.json();
    // news.json is { updated, count, articles: [...] }; older builds returned a bare array.
    const list = Array.isArray(json) ? json : (Array.isArray(json?.articles) ? json.articles : []);
    return list.slice(0, 12);
  } catch { return []; }
}

async function fetchOHLC(coinId) {
  try {
    const url = CG_OHLC_URL.replace('{id}', coinId);
    const full = url + '?vs_currency=usd&days=14';
    const res = await fetch(full, { signal:AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json(); // [[ts, open, high, low, close], ...]
  } catch { return null; }
}

async function fetchFearGreed() {
  try {
    const res = await fetch(FG_URL, { signal:AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.[0] || null;
  } catch { return null; }
}

// ── Backup-code import ────────────────────────────────────────────────────────

async function gunzipB64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes); writer.close();
  const chunks = []; const reader = ds.readable.getReader();
  while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
  return new TextDecoder().decode(out);
}

function b64decode(str) { return decodeURIComponent(escape(atob(str))); }

async function importFromBackupCode(raw) {
  const code = (raw || '').trim().replace(/\s+/g, '');
  if (!code) throw new Error('Paste a backup code first.');
  let json;
  if (code.startsWith('WL2-')) {
    try { json = await gunzipB64(code.slice(4)); }
    catch { throw new Error('Could not decompress — make sure you copied the full code.'); }
  } else {
    const b64 = code.startsWith('WL1-') ? code.slice(4) : code;
    try { json = b64decode(b64); }
    catch { throw new Error('Could not decode — make sure you copied the full code.'); }
  }
  let parsed;
  try { parsed = JSON.parse(json); }
  catch { throw new Error('Backup data is corrupted or incomplete.'); }
  if (!parsed?.data || typeof parsed.data !== 'object') throw new Error('Backup data is missing or corrupted.');
  let transactions, wallets = [], settings = {};
  try {
    const txRaw = parsed.data['crypto_tracker_transactions'];
    const wRaw  = parsed.data['crypto_tracker_wallets'];
    const sRaw  = parsed.data['wl_settings'];
    transactions = txRaw ? JSON.parse(txRaw) : [];
    if (wRaw) wallets  = JSON.parse(wRaw);
    if (sRaw) settings = JSON.parse(sRaw);
  } catch { throw new Error('Transaction data is malformed.'); }
  if (!Array.isArray(transactions)) throw new Error('No valid transaction data found.');
  const payload = { transactions, wallets, settings, syncedAt: Date.now() };
  await new Promise(r => ext.storage.local.set({ [STORAGE_KEY]: payload }, r));
  return { txCount: transactions.length, walletCount: wallets.length };
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }
function setText(id, t) { $(id).textContent = t; }

function buildHoldingRow(holding, value, change24h, pnlGain, hideValues, showPnl = false, signalInfo = null) {
  const row = document.createElement('div');
  row.className = 'holding-row';

  const left = document.createElement('div');
  left.className = 'holding-left';
  const icon = document.createElement('div');
  icon.className = 'holding-icon';
  icon.textContent = abbrev(holding.coin_symbol);
  const info = document.createElement('div');
  info.className = 'holding-info';
  const sym = document.createElement('span');
  sym.className = 'holding-symbol';
  sym.textContent = (holding.coin_symbol||'').toUpperCase();
  const amt = document.createElement('span');
  amt.className = 'holding-amount';
  amt.textContent = hideValues ? '••••' : fmtAmt(holding.amount) + ' ' + (holding.coin_symbol||'').toUpperCase();
  info.append(sym, amt);
  left.append(icon, info);

  const right = document.createElement('div');
  right.className = 'holding-right';
  const val = document.createElement('span');
  val.className = 'holding-value';
  val.textContent = hideValues ? '••••' : fmtUSD(value??0, true);
  const chg = document.createElement('span');
  if (!isFinite(change24h)) { chg.className = 'holding-change neutral'; chg.textContent = '—'; }
  else { chg.className = 'holding-change' + (change24h < 0 ? ' negative' : ''); chg.textContent = fmtPct(change24h); }
  right.append(val, chg);

  if (showPnl && isFinite(pnlGain) && pnlGain !== null) {
    const pnl = document.createElement('span');
    pnl.className = 'holding-pnl' + (pnlGain >= 0 ? ' pos' : ' neg');
    pnl.textContent = hideValues ? '••' : (pnlGain >= 0 ? '+' : '') + fmtUSD(pnlGain, true);
    right.appendChild(pnl);
  }

  if (signalInfo) {
    const sig = document.createElement('span');
    sig.className = 'holding-signal ' + signalInfo.sigClass;
    sig.textContent = signalInfo.signal;
    right.appendChild(sig);
  }

  row.append(left, right);
  return row;
}

function buildMarketRow(coin) {
  const chg = coin.price_change_percentage_24h ?? 0;
  const row = document.createElement('div');
  row.className = 'market-row';

  const left = document.createElement('div');
  left.className = 'market-left';
  const icon = document.createElement('div');
  icon.className = 'market-icon';
  icon.textContent = abbrev(coin.symbol);
  const info = document.createElement('div');
  const sym = document.createElement('div');
  sym.className = 'market-sym';
  sym.textContent = (coin.symbol||'').toUpperCase();
  const name = document.createElement('div');
  name.className = 'market-name';
  name.textContent = coin.name;
  info.append(sym, name);
  left.append(icon, info);

  const right = document.createElement('div');
  right.className = 'market-right';
  const price = document.createElement('div');
  price.className = 'market-price';
  price.textContent = fmtUSD(coin.current_price);
  const chgEl = document.createElement('div');
  chgEl.className = 'market-chg' + (chg < 0 ? ' neg' : '');
  chgEl.textContent = fmtPct(chg);
  right.append(price, chgEl);

  row.append(left, right);
  return row;
}

// ── TA math ───────────────────────────────────────────────────────────────────

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    avgGain = (avgGain * (period-1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period-1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a,b) => a+b, 0) / period;
}

function calcMACD(closes) {
  // EMA helper
  function ema(arr, n) {
    const k = 2/(n+1); let e = arr[0];
    for (let i = 1; i < arr.length; i++) e = arr[i]*k + e*(1-k);
    return e;
  }
  if (closes.length < 26) return null;
  const ema12 = ema(closes.slice(-26), 12);
  const ema26 = ema(closes.slice(-26), 26);
  return { macd: ema12 - ema26, signal: ema12 - ema26 }; // simplified
}

// ── News render ───────────────────────────────────────────────────────────────

async function loadNewsTab() {
  const listEl = $('news-list');
  listEl.innerHTML = '<div class="market-loading"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div></div>';
  const articles = await fetchNews();
  listEl.innerHTML = '';
  if (!articles.length) {
    listEl.innerHTML = '<p class="news-empty">No news available</p>'; return;
  }
  for (const a of articles) {
    const item = document.createElement('div');
    item.className = 'news-item';
    item.addEventListener('click', () => { ext.tabs.create({ url: a.url || a.link }); window.close(); });

    const title = document.createElement('div');
    title.className = 'news-title';
    title.textContent = a.title;

    const meta = document.createElement('div');
    meta.className = 'news-meta';
    const src = document.createElement('span');
    src.className = 'news-source';
    src.textContent = a.source || a.publisher || '';
    const time = document.createElement('span');
    time.className = 'news-time';
    const ts = a.publishedAt || a.date || a.published_at || a.pubDate;
    time.textContent = ts ? timeAgo(new Date(ts).getTime()) : '';
    meta.append(src, time);
    item.append(title, meta);
    listEl.appendChild(item);
  }
}

// ── TA render ─────────────────────────────────────────────────────────────────

async function loadTAForCoin(coinId) {
  const content = $('ta-content');
  content.innerHTML = '<div class="market-loading"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div></div>';

  const ohlc = await fetchOHLC(coinId);
  if (!ohlc || ohlc.length < 15) {
    content.innerHTML = '<p class="holdings-empty">Not enough price data</p>'; return;
  }

  const closes = ohlc.map(c => c[4]);
  const lastPrice = closes[closes.length - 1];
  const rsi = calcRSI(closes, 14);
  const sma20 = calcSMA(closes, Math.min(20, closes.length));
  const sma50 = calcSMA(closes, Math.min(50, closes.length));
  const change7d = closes.length >= 7 ? ((lastPrice - closes[closes.length-7]) / closes[closes.length-7]) * 100 : null;

  // Trend
  const trend = sma20 ? (lastPrice > sma20 ? 'Bullish' : 'Bearish') : '—';
  const trendClass = trend === 'Bullish' ? 'bullish' : trend === 'Bearish' ? 'bearish' : 'neutral';

  // RSI signal
  let rsiSignal = 'Neutral', rsiClass = 'neutral';
  if (rsi !== null) {
    if (rsi < 30) { rsiSignal = 'Oversold'; rsiClass = 'bullish'; }
    else if (rsi > 70) { rsiSignal = 'Overbought'; rsiClass = 'bearish'; }
  }

  // Overall signal
  let signal = 'Neutral', sigClass = 'neutral';
  if (rsi !== null && sma20) {
    const bullPoints = (rsi < 50 ? 1 : 0) + (lastPrice > sma20 ? 1 : 0) + (isFinite(change7d) && change7d > 0 ? 1 : 0);
    if (bullPoints >= 2) { signal = '🟢 Bullish'; sigClass = 'buy'; }
    else if (bullPoints === 0) { signal = '🔴 Bearish'; sigClass = 'sell'; }
    else { signal = '🟡 Neutral'; sigClass = 'neutral'; }
  }

  content.innerHTML = '';

  // Price card
  const priceCard = document.createElement('div');
  priceCard.className = 'ta-card';
  priceCard.innerHTML = `<div class="ta-card-title">Price</div>`;
  const rows = [
    ['Current',  fmtUSD(lastPrice), ''],
    ['7d Change', isFinite(change7d) ? fmtPct(change7d) : '—', change7d >= 0 ? 'bullish' : 'bearish'],
    ['SMA 20',   sma20 ? fmtUSD(sma20) : '—', ''],
    ['Trend',    trend, trendClass],
  ];
  for (const [label, val, cls] of rows) {
    const row = document.createElement('div');
    row.className = 'ta-row';
    row.innerHTML = `<span class="ta-row-label">${label}</span><span class="ta-row-val ${cls}">${val}</span>`;
    priceCard.appendChild(row);
  }
  content.appendChild(priceCard);

  // RSI card
  const rsiCard = document.createElement('div');
  rsiCard.className = 'ta-card';
  rsiCard.innerHTML = `
    <div class="ta-card-title">RSI (14)</div>
    <div class="ta-row">
      <span class="ta-row-label">Value</span>
      <span class="ta-row-val ${rsiClass}">${rsi !== null ? rsi.toFixed(1) : '—'}</span>
    </div>
    <div class="ta-row">
      <span class="ta-row-label">Signal</span>
      <span class="ta-row-val ${rsiClass}">${rsiSignal}</span>
    </div>
    <div class="ta-rsi-bar-wrap">
      <div class="ta-rsi-zones"><div class="ta-rsi-zone-os"></div><div class="ta-rsi-zone-ob"></div></div>
      <div class="ta-rsi-bar" style="width:${rsi ?? 50}%;background:${rsiClass==='bullish'?'#4ade80':rsiClass==='bearish'?'#f87171':'#fbbf24'}"></div>
    </div>
  `;
  content.appendChild(rsiCard);

  // Signal
  const sigEl = document.createElement('div');
  sigEl.className = `ta-signal ${sigClass}`;
  sigEl.textContent = signal;
  content.appendChild(sigEl);
}

// ── Per-holding signal badge ──────────────────────────────────────────────────

const signalCache = new Map(); // coinId → { signal, sigClass }

async function fetchSignalForCoin(coinId) {
  if (signalCache.has(coinId)) return signalCache.get(coinId);
  const ohlc = await fetchOHLC(coinId);
  if (!ohlc || ohlc.length < 15) { const r = { signal:'—', sigClass:'neutral' }; signalCache.set(coinId, r); return r; }
  const closes = ohlc.map(c => c[4]);
  const last = closes[closes.length - 1];
  const rsi  = calcRSI(closes, 14);
  const sma  = calcSMA(closes, Math.min(20, closes.length));
  const chg7 = closes.length >= 7 ? (last - closes[closes.length - 7]) / closes[closes.length - 7] * 100 : null;
  let signal = '—', sigClass = 'neutral';
  if (rsi !== null && sma) {
    const bull = (rsi < 50 ? 1 : 0) + (last > sma ? 1 : 0) + (isFinite(chg7) && chg7 > 0 ? 1 : 0);
    if (bull >= 2)   { signal = 'Buy';  sigClass = 'buy'; }
    else if (bull === 0) { signal = 'Sell'; sigClass = 'sell'; }
    else                 { signal = 'Hold'; sigClass = 'neutral'; }
  }
  const result = { signal, sigClass };
  signalCache.set(coinId, result);
  return result;
}

// ── Tab state ─────────────────────────────────────────────────────────────────

let currentTab = 'overview';
let cachedData = null;
let cachedPrices = {};
let marketLoaded = false;
let newsLoaded   = false;

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    btn.classList.add('tab-active');
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
    show('tab-' + currentTab);
    if (currentTab === 'market'   && !marketLoaded) loadMarketTab();
    if (currentTab === 'holdings') renderHoldingsTab();
    if (currentTab === 'news'     && !newsLoaded) { newsLoaded = true; loadNewsTab(); }
  });
});

// ── Overview tab ──────────────────────────────────────────────────────────────

function renderOverviewTab(holdingsArr, hideValues, syncedAt) {
  // Ticker
  const btcData = cachedPrices['bitcoin'];
  const ethData = cachedPrices['ethereum'];
  if (btcData) {
    setText('btc-price', fmtUSD(btcData.usd, true));
    const chgEl = $('btc-chg');
    chgEl.textContent = fmtPct(btcData.usd_24h_change);
    chgEl.className = 'ticker-chg' + (btcData.usd_24h_change < 0 ? ' neg' : '');
  }
  if (ethData) {
    setText('eth-price', fmtUSD(ethData.usd, true));
    const chgEl = $('eth-chg');
    chgEl.textContent = fmtPct(ethData.usd_24h_change);
    chgEl.className = 'ticker-chg' + (ethData.usd_24h_change < 0 ? ' neg' : '');
  }

  // Total value + 24h change
  let totalValue = 0, totalValuePrev = 0, totalInvested = 0;
  for (const { holding, value, change24h } of holdingsArr) {
    if (value !== null) {
      totalValue += value;
      totalInvested += holding.totalCost || 0;
      if (isFinite(change24h)) totalValuePrev += value / (1 + change24h / 100);
      else totalValuePrev += value;
    }
  }

  const tvEl = $('total-value');
  if (hideValues) { tvEl.textContent = '••••••'; tvEl.classList.add('hidden-values'); }
  else { tvEl.textContent = fmtUSD(totalValue); tvEl.classList.remove('hidden-values'); }

  const badge = $('change-badge');
  if (totalValuePrev > 0) {
    const pctChg = ((totalValue - totalValuePrev) / totalValuePrev) * 100;
    badge.className = 'change-badge' + (pctChg < 0 ? ' negative' : '');
    badge.textContent = hideValues ? '—' : fmtPct(pctChg);
  } else {
    badge.className = 'change-badge loading'; badge.textContent = '—';
  }

  // P&L
  if (totalInvested > 0) {
    const gain = totalValue - totalInvested;
    const gainPct = (gain / totalInvested) * 100;
    $('pnl-invested').textContent = hideValues ? '••••' : fmtUSD(totalInvested);
    const gainEl = $('pnl-gain');
    gainEl.textContent = hideValues ? '••••' : `${gain >= 0 ? '+' : ''}${fmtUSD(gain)} (${fmtPct(gainPct)})`;
    gainEl.className = 'pnl-val' + (gain >= 0 ? ' pos' : ' neg');
    $('pnl-card').hidden = false;
  }

  // Top 5 holdings
  const listEl = $('overview-holdings-list');
  listEl.innerHTML = '';
  const top5 = holdingsArr.slice(0, 5);
  if (!top5.length) {
    const e = document.createElement('p'); e.className = 'holdings-empty';
    e.textContent = 'No holdings'; listEl.appendChild(e);
  } else {
    for (const { holding, value, change24h } of top5) {
      listEl.appendChild(buildHoldingRow(holding, value, change24h, null, hideValues));
    }
  }

  setText('last-synced-ov', syncedAt ? 'Synced ' + timeAgo(syncedAt) : '—');
}

// ── Holdings tab ──────────────────────────────────────────────────────────────

function renderHoldingsTab() {
  if (!cachedData) return;
  const { transactions, wallets, settings, syncedAt } = cachedData;
  const hideValues = !!(settings?.hideValues);
  const walletId = $('wallet-filter').value;

  let txs = transactions;
  if (walletId !== 'all') txs = transactions.filter(t => String(t.wallet_id) === walletId);

  const map = computeHoldings(txs);
  const holdingsArr = buildHoldingsArr(map);

  const listEl = $('all-holdings-list');
  listEl.innerHTML = '';
  setText('holdings-count', holdingsArr.length + ' asset' + (holdingsArr.length !== 1 ? 's' : ''));

  if (!holdingsArr.length) {
    const e = document.createElement('p'); e.className = 'holdings-empty';
    e.textContent = 'No holdings'; listEl.appendChild(e);
  } else {
    for (const { holding, value, change24h } of holdingsArr) {
      const pnlGain = isFinite(value) && holding.totalCost > 0 ? value - holding.totalCost : null;
      const row = buildHoldingRow(holding, value, change24h, pnlGain, hideValues, true);
      row.dataset.coinId = holding.coin_id;
      listEl.appendChild(row);
    }
    // Fetch signals lazily and inject badges without blocking render
    const isCrypto = id => !id.startsWith('stock:') && !id.startsWith('metal:');
    for (const { holding } of holdingsArr) {
      if (!isCrypto(holding.coin_id)) continue;
      fetchSignalForCoin(holding.coin_id).then(sig => {
        const row = listEl.querySelector(`[data-coin-id="${holding.coin_id}"]`);
        if (!row) return;
        let badge = row.querySelector('.holding-signal');
        if (!badge) { badge = document.createElement('span'); row.querySelector('.holding-right').appendChild(badge); }
        badge.className = 'holding-signal ' + sig.sigClass;
        badge.textContent = sig.signal;
      }).catch(() => {});
    }
  }
  setText('last-synced-h', syncedAt ? 'Synced ' + timeAgo(syncedAt) : '—');
}

function buildHoldingsArr(map) {
  return Array.from(map.values()).map(holding => {
    const p = cachedPrices[holding.coin_id];
    const value = p?.usd != null ? holding.amount * p.usd : null;
    return { holding, value, change24h: p?.usd_24h_change ?? null };
  }).sort((a, b) => (b.value??-Infinity) - (a.value??-Infinity));
}

// ── Market tab ────────────────────────────────────────────────────────────────

async function loadMarketTab() {
  marketLoaded = true;
  const [coins, fg] = await Promise.all([fetchMarketCoins(), fetchFearGreed()]);

  // Fear & Greed
  if (fg) {
    const val = parseInt(fg.value, 10);
    setText('fg-value', val);
    setText('fg-label-text', fg.value_classification || '—');
    $('fg-bar').style.width = val + '%';
    $('fg-value').style.color = val < 30 ? '#f87171' : val < 50 ? '#fbbf24' : val < 75 ? '#4ade80' : '#00e676';
  } else {
    setText('fg-value', '—'); setText('fg-label-text', 'Unavailable');
  }

  // Coin list
  const listEl = $('market-list');
  listEl.innerHTML = '';
  if (!coins.length) {
    listEl.innerHTML = '<p class="holdings-empty">Unable to load market data</p>';
    return;
  }
  for (const coin of coins) listEl.appendChild(buildMarketRow(coin));
}

// ── Main render ───────────────────────────────────────────────────────────────

async function render() {
  show('loading');
  hide('no-data');
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);

  const stored = await new Promise(r => ext.storage.local.get(STORAGE_KEY, x => r(x[STORAGE_KEY]||null)));

  if (!stored || !Array.isArray(stored.transactions) || !stored.transactions.length) {
    hide('loading'); show('no-data'); return;
  }

  cachedData = stored;
  const { transactions, wallets, settings, syncedAt } = stored;
  const hideValues = !!(settings?.hideValues);

  const map = computeHoldings(transactions);
  if (!map.size) { hide('loading'); show('no-data'); return; }

  // Populate wallet filter
  const wf = $('wallet-filter');
  wf.innerHTML = '<option value="all">All Wallets</option>';
  if (Array.isArray(wallets) && wallets.length > 1) {
    for (const w of wallets) {
      const opt = document.createElement('option');
      opt.value = String(w.id); opt.textContent = w.name;
      wf.appendChild(opt);
    }
  }

  // Populate TA coin selector from holdings
  const taSelect = $('ta-coin-select');
  taSelect.innerHTML = '<option value="">Select a coin…</option>';
  for (const [id, h] of map) {
    // Only crypto coins (skip stocks/metals which have no CoinGecko OHLC)
    if (id.startsWith('stock:') || id.startsWith('metal:')) continue;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = (h.coin_symbol||'').toUpperCase() + ' — ' + (h.coin_name||id);
    taSelect.appendChild(opt);
  }
  taSelect.addEventListener('change', () => {
    if (taSelect.value) loadTAForCoin(taSelect.value);
  });

  // Show overview tab
  hide('loading');
  show('tab-' + currentTab);

  // Fetch prices
  const allCoinIds = [...Array.from(map.keys()), 'bitcoin', 'ethereum'].filter((v,i,a)=>a.indexOf(v)===i);
  cachedPrices = await fetchPrices(allCoinIds);

  const holdingsArr = buildHoldingsArr(map);
  renderOverviewTab(holdingsArr, hideValues, syncedAt);
  if (currentTab === 'holdings') renderHoldingsTab();
}

// ── Refresh button ────────────────────────────────────────────────────────────

const refreshBtn = $('btn-refresh');
refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spinning'); refreshBtn.disabled = true;
  marketLoaded = false; newsLoaded = false; signalCache.clear();
  try {
    await new Promise(r => {
      ext.tabs.query({ url:'https://walletlens.live/*' }, tabs => {
        if (!tabs?.length) return r();
        Promise.all(tabs.map(t => ext.tabs.sendMessage(t.id, { type:'REQUEST_SYNC' }).catch(()=>{}))).then(() => setTimeout(r, 600));
      });
    });
  } catch {}
  await render();
  if (currentTab === 'market') loadMarketTab();
  refreshBtn.classList.remove('spinning'); refreshBtn.disabled = false;
});

// ── Import panel ─────────────────────────────────────────────────────────────

function showImportPanel() {
  $('import-code-input').value = '';
  $('import-error').hidden   = true;
  $('import-success').hidden = true;
  $('btn-import-apply').textContent = 'Import portfolio';
  $('btn-import-apply').disabled = false;
  $('import-panel').hidden = false;
}

function hideImportPanel() { $('import-panel').hidden = true; }

$('btn-import').addEventListener('click', showImportPanel);
$('btn-import-from-nodata').addEventListener('click', showImportPanel);
$('btn-import-back').addEventListener('click', hideImportPanel);

$('btn-import-apply').addEventListener('click', async () => {
  const btn = $('btn-import-apply');
  $('import-error').hidden   = true;
  $('import-success').hidden = true;
  btn.textContent = 'Importing…';
  btn.disabled = true;
  try {
    const { txCount, walletCount } = await importFromBackupCode($('import-code-input').value);
    $('import-success').textContent = `✅ Imported ${txCount} transactions · ${walletCount} wallets`;
    $('import-success').hidden = false;
    setTimeout(async () => {
      hideImportPanel();
      cachedData = null; cachedPrices = {}; marketLoaded = false; newsLoaded = false; signalCache.clear();
      await render();
    }, 1200);
  } catch (err) {
    $('import-error').textContent = '⚠️ ' + err.message;
    $('import-error').hidden = false;
    btn.textContent = 'Import portfolio';
    btn.disabled = false;
  }
});

// ── Open site buttons ─────────────────────────────────────────────────────────

function openURL(url) { ext.tabs.create({ url }); window.close(); }

$('btn-open-site').addEventListener('click', () => openURL(SITE));

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => openURL(SITE + btn.dataset.path));
});

// Wallet filter change
$('wallet-filter').addEventListener('change', renderHoldingsTab);

// ── Boot ──────────────────────────────────────────────────────────────────────

render().catch(err => {
  console.error('[WalletLens ext]', err);
  hide('loading'); show('no-data');
});
