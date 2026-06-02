/**
 * WalletLens Portfolio Extension — Popup Script
 *
 * 1. Reads cached portfolio data from chrome.storage.local (written by background.js).
 * 2. Computes net holdings from transactions using the same fold logic as the app.
 * 3. Fetches live prices from CoinGecko (with a 2-minute session cache).
 * 4. Renders the popup UI without using innerHTML or external CDN dependencies.
 */

'use strict';

const ext = typeof browser !== 'undefined' ? browser : chrome;

const STORAGE_KEY        = 'wl_portfolio_cache';
const PRICE_CACHE_KEY    = 'wl_price_cache';
const PRICE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const TOP_HOLDINGS_COUNT = 3;
const SITE_URL           = 'https://walletlens.live';
const COINGECKO_URL      = 'https://api.coingecko.com/api/v3/simple/price';

// ── Utility helpers ───────────────────────────────────────────────────────────

/**
 * Format a USD dollar amount.
 * @param {number} value
 * @param {boolean} compact  Use K/M abbreviation for large values
 */
function formatUSD(value, compact = false) {
  if (!isFinite(value)) return '—';
  if (compact && Math.abs(value) >= 1_000_000) {
    return '$' + (value / 1_000_000).toFixed(2) + 'M';
  }
  if (compact && Math.abs(value) >= 10_000) {
    return '$' + (value / 1_000).toFixed(1) + 'K';
  }
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a 24h change percentage.
 * @param {number} pct
 */
function formatPct(pct) {
  if (!isFinite(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(2) + '%';
}

/**
 * Relative time string, e.g. "2 minutes ago".
 * @param {number} ts  Unix ms timestamp
 */
function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)   return 'just now';
  if (diff < 60)  return diff + 's ago';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return m + ' minute' + (m === 1 ? '' : 's') + ' ago';
  }
  const h = Math.floor(diff / 3600);
  return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
}

/**
 * Abbreviate a coin symbol for the holding icon (max 4 chars).
 * @param {string} symbol
 */
function abbrev(symbol) {
  return (symbol || '?').toUpperCase().slice(0, 4);
}

// ── Portfolio math ────────────────────────────────────────────────────────────

/**
 * Fold a transactions array into a map of
 *   { [coin_id]: { coin_id, coin_symbol, coin_name, amount } }
 * Mirrors the logic in client/src/data/portfolio.js → foldBalances / aggregatePortfolio.
 *
 * @param {Array} transactions
 * @returns {Map<string, {coin_id:string, coin_symbol:string, coin_name:string, amount:number}>}
 */
function computeHoldings(transactions) {
  const holdings = new Map();

  for (const tx of transactions) {
    const id = String(tx.coin_id || '').trim();
    if (!id) continue;

    const qty = Number(tx.amount ?? tx.quantity ?? 0);
    if (!isFinite(qty)) continue;

    if (!holdings.has(id)) {
      holdings.set(id, {
        coin_id:     id,
        coin_symbol: tx.coin_symbol || id,
        coin_name:   tx.coin_name   || tx.coin_symbol || id,
        amount:      0,
      });
    }

    const h = holdings.get(id);
    // Keep the most recent symbol/name in case later txs have it
    if (tx.coin_symbol) h.coin_symbol = tx.coin_symbol;
    if (tx.coin_name)   h.coin_name   = tx.coin_name;

    const type = (tx.type || '').toLowerCase();
    if (type === 'buy' || type === 'deposit') {
      h.amount += qty;
    } else if (type === 'sell' || type === 'withdraw') {
      h.amount -= qty;
    }
  }

  // Filter out dust / zero balances
  for (const [id, h] of holdings) {
    if (h.amount < 1e-9) holdings.delete(id);
  }

  return holdings;
}

// ── Price fetching ────────────────────────────────────────────────────────────

/**
 * Fetch prices for all coin IDs from CoinGecko.
 * Results are cached in chrome.storage.session with a 2-minute TTL.
 * Returns a map: { [coin_id]: { usd: number, usd_24h_change: number } }
 * On any error returns an empty object (UI shows "—").
 *
 * @param {string[]} coinIds
 * @returns {Promise<Object>}
 */
async function fetchPrices(coinIds) {
  if (!coinIds || coinIds.length === 0) return {};

  const ids = coinIds.join(',');

  // Try session cache first (chrome.storage.session is ephemeral per browser session)
  try {
    const sessionStorage = ext.storage.session;
    if (sessionStorage) {
      const cached = await new Promise((resolve) => {
        sessionStorage.get(PRICE_CACHE_KEY, (r) => resolve(r[PRICE_CACHE_KEY] || null));
      });
      if (
        cached &&
        cached.ids === ids &&
        cached.fetchedAt &&
        Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS
      ) {
        return cached.prices;
      }
    }
  } catch {
    // chrome.storage.session not available (e.g. Firefox MV2 fallback) — proceed
  }

  // Live fetch
  try {
    const url = new URL(COINGECKO_URL);
    url.searchParams.set('ids', ids);
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');

    const res = await fetch(url.toString(), {
      method:  'GET',
      headers: { 'Accept': 'application/json' },
      // 8-second timeout
      signal:  AbortSignal.timeout(8000),
    });

    if (!res.ok) return {};

    const json = await res.json();

    // Persist to session cache
    try {
      const sessionStorage = ext.storage.session;
      if (sessionStorage) {
        sessionStorage.set({
          [PRICE_CACHE_KEY]: { ids, prices: json, fetchedAt: Date.now() },
        });
      }
    } catch {}

    return json;
  } catch {
    return {};
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function show(id)    { document.getElementById(id).hidden = false; }
function hide(id)    { document.getElementById(id).hidden = true;  }
function setText(id, text) { document.getElementById(id).textContent = text; }

/**
 * Build a single holding row DOM node without innerHTML.
 * @param {{coin_id, coin_symbol, coin_name, amount}} holding
 * @param {number} value   USD value
 * @param {number|null} change24h  Percentage
 * @param {boolean} hideValues
 */
function buildHoldingRow(holding, value, change24h, hideValues) {
  const row = document.createElement('div');
  row.className = 'holding-row';

  // Left side
  const left = document.createElement('div');
  left.className = 'holding-left';

  const icon = document.createElement('div');
  icon.className = 'holding-icon';
  icon.textContent = abbrev(holding.coin_symbol);

  const info = document.createElement('div');
  info.className = 'holding-info';

  const sym = document.createElement('span');
  sym.className = 'holding-symbol';
  sym.textContent = (holding.coin_symbol || '').toUpperCase();

  const amt = document.createElement('span');
  amt.className = 'holding-amount';
  amt.textContent = hideValues
    ? '••••'
    : formatAmount(holding.amount);

  info.appendChild(sym);
  info.appendChild(amt);
  left.appendChild(icon);
  left.appendChild(info);

  // Right side
  const right = document.createElement('div');
  right.className = 'holding-right';

  const val = document.createElement('span');
  val.className = 'holding-value';
  val.textContent = hideValues ? '••••' : formatUSD(value, true);

  const chg = document.createElement('span');
  if (change24h === null || change24h === undefined || !isFinite(change24h)) {
    chg.className = 'holding-change neutral';
    chg.textContent = '—';
  } else {
    chg.className = 'holding-change' + (change24h < 0 ? ' negative' : '');
    chg.textContent = formatPct(change24h);
  }

  right.appendChild(val);
  right.appendChild(chg);

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

/**
 * Format a coin amount — trim trailing zeros.
 * @param {number} amount
 */
function formatAmount(amount) {
  if (!isFinite(amount)) return '—';
  if (amount >= 1000) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (amount >= 1) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }
  // Small amounts — show up to 8 sig figs
  return amount.toPrecision(4).replace(/\.?0+$/, '');
}

// ── Main render ───────────────────────────────────────────────────────────────

async function render() {
  // Show loading spinner initially
  show('loading');
  hide('no-data');
  hide('portfolio');

  // 1. Load cached portfolio from storage
  const cached = await new Promise((resolve) => {
    ext.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result[STORAGE_KEY] || null);
    });
  });

  if (!cached || !Array.isArray(cached.transactions) || cached.transactions.length === 0) {
    hide('loading');
    show('no-data');
    return;
  }

  const { transactions, settings, syncedAt } = cached;
  const hideValues = !!(settings && settings.hideValues);

  // 2. Compute holdings from transactions
  const holdingsMap = computeHoldings(transactions);

  if (holdingsMap.size === 0) {
    hide('loading');
    show('no-data');
    return;
  }

  // 3. Show portfolio skeleton while prices load
  hide('loading');
  show('portfolio');

  // Set synced timestamp
  setText('last-synced', 'Synced ' + timeAgo(syncedAt));

  // Mark change badge as loading
  const changeBadge = document.getElementById('change-badge');
  changeBadge.className = 'change-badge loading';
  changeBadge.textContent = 'loading…';

  // Set total value as loading indicator
  const totalValueEl = document.getElementById('total-value');
  totalValueEl.textContent = '…';

  // 4. Fetch live prices
  const coinIds = Array.from(holdingsMap.keys());
  const prices  = await fetchPrices(coinIds);
  const pricesFailed = Object.keys(prices).length === 0;

  // 5. Compute values per holding
  const holdingsWithValue = [];
  let totalValue = 0;
  let totalValuePrev = 0;   // 24h-ago estimated value (for portfolio-level % change)

  for (const [id, holding] of holdingsMap) {
    const priceData = prices[id];
    const price     = priceData?.usd       ?? null;
    const change24h = priceData?.usd_24h_change ?? null;

    const value = price !== null ? holding.amount * price : null;

    if (value !== null) {
      totalValue += value;
      // Estimate previous value: v_prev = v / (1 + pct/100)
      if (change24h !== null && isFinite(change24h)) {
        totalValuePrev += value / (1 + change24h / 100);
      } else {
        totalValuePrev += value; // no change data → assume flat
      }
    }

    holdingsWithValue.push({ holding, value, change24h });
  }

  // 6. Render total value
  if (hideValues) {
    totalValueEl.textContent = '••••••';
    totalValueEl.classList.add('hidden-values');
  } else if (pricesFailed || totalValue === 0) {
    totalValueEl.textContent = pricesFailed ? '—' : formatUSD(0);
  } else {
    totalValueEl.textContent = formatUSD(totalValue);
  }

  // 7. Render 24h change
  if (pricesFailed) {
    changeBadge.className = 'change-badge loading';
    changeBadge.textContent = '—';

    // Show error notice only if it doesn't already exist
    if (!document.querySelector('.price-error')) {
      const notice = document.createElement('p');
      notice.className = 'price-error';
      notice.textContent = 'Live prices unavailable';
      document.getElementById('change-row').appendChild(notice);
    }
  } else if (totalValuePrev > 0) {
    const portfolioChange = ((totalValue - totalValuePrev) / totalValuePrev) * 100;
    changeBadge.className = 'change-badge' + (portfolioChange < 0 ? ' negative' : '');
    changeBadge.textContent = hideValues ? '—' : formatPct(portfolioChange);
  } else {
    changeBadge.className = 'change-badge loading';
    changeBadge.textContent = '—';
  }

  // 8. Sort by value descending and render top holdings
  holdingsWithValue.sort((a, b) => {
    const va = a.value ?? -Infinity;
    const vb = b.value ?? -Infinity;
    return vb - va;
  });

  const listEl = document.getElementById('holdings-list');
  // Clear any previous content using DOM (not innerHTML)
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

  const top = holdingsWithValue.slice(0, TOP_HOLDINGS_COUNT);

  if (top.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'holdings-empty';
    empty.textContent = 'No holdings to display';
    listEl.appendChild(empty);
  } else {
    for (const { holding, value, change24h } of top) {
      const row = buildHoldingRow(holding, value ?? 0, change24h, hideValues);
      listEl.appendChild(row);
    }
  }
}

// ── Button handlers ───────────────────────────────────────────────────────────

function openSite() {
  ext.tabs.create({ url: SITE_URL });
  window.close();
}

document.getElementById('btn-open-site').addEventListener('click', openSite);
document.getElementById('btn-open-app').addEventListener('click', openSite);

// ── Boot ──────────────────────────────────────────────────────────────────────

render().catch((err) => {
  // Fallback: show no-data state on unhandled errors
  console.error('[WalletLens ext] popup render error:', err);
  hide('loading');
  show('no-data');
});
