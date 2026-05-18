import { useEffect, useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'

const SmartAlerts = lazy(() => import('../components/SmartAlerts'))

function fmtUsd(n) {
  if (!n && n !== 0) return '–'
  const abs = Math.abs(n)
  if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K'
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '–'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function timeAgo(d) {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return sec + 's ago'
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago'
  return Math.floor(sec / 86400) + 'd ago'
}

export default function Whales() {
  const [snapshot, setSnapshot] = useState([])
  const [trending, setTrending] = useState([])
  const [largeTx, setLargeTx] = useState([])
  const [whaleFeed, setWhaleFeed] = useState([])
  const [exchangeFlows, setExchangeFlows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('movers')
  const [moverWindow, setMoverWindow] = useState('24h')

  useEffect(() => { track('whales_view'); load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [snap, trend, btc, feed, flows] = await Promise.all([
        api.getWhaleMarketSnapshot(),
        api.getTrendingCoins(),
        api.getLargeBtcTransactions(500_000),
        api.getWhaleAlertFeed(500_000),
        api.getExchangeFlows(),
      ])
      setSnapshot(snap)
      setTrending(trend)
      setLargeTx(btc)
      setWhaleFeed(feed)
      setExchangeFlows(flows)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const pctKey = {
    '1h': 'price_change_percentage_1h_in_currency',
    '24h': 'price_change_percentage_24h_in_currency',
    '7d': 'price_change_percentage_7d_in_currency',
  }[moverWindow]

  const gainers = [...snapshot]
    .filter(c => c[pctKey] != null)
    .sort((a, b) => b[pctKey] - a[pctKey])
    .slice(0, 8)

  const losers = [...snapshot]
    .filter(c => c[pctKey] != null)
    .sort((a, b) => a[pctKey] - b[pctKey])
    .slice(0, 8)

  // Volume anomalies: highest volume / market cap ratio (turnover)
  const volumeAnomalies = [...snapshot]
    .filter(c => c.market_cap > 100_000_000 && c.total_volume > 0)
    .map(c => ({ ...c, _turnover: c.total_volume / c.market_cap }))
    .sort((a, b) => b._turnover - a._turnover)
    .slice(0, 8)

  // Whale magnets: highest absolute 24h dollar volume
  const volumeLeaders = [...snapshot]
    .sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
    .slice(0, 8)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Whale Tracker</h1>
          <p className="page-sub">Live large-money flows, market anomalies, and smart-money signals.</p>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          {loading
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 0.8s linear infinite'}}><path d="M21 12a9 9 0 1 1-4.219-7.617"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.86"/></svg>}
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="whale-tabs">
        {[
          { k: 'smart', l: '⚡ Smart Alerts' },
          { k: 'movers', l: 'Top Movers' },
          { k: 'volume', l: 'Volume Anomalies' },
          { k: 'trending', l: 'Trending' },
          { k: 'btc', l: 'BTC Whale Txs' },
          { k: 'feed', l: '🐋 Whale Feed' },
          { k: 'flows', l: '🏦 Exchange Flows' },
        ].map(t => (
          <button
            key={t.k}
            className={`whale-tab ${tab === t.k ? 'active' : ''}`}
            onClick={() => { setTab(t.k); track('whales_tab_switch', { tab: t.k }) }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'smart' && (
        <Suspense fallback={<div className="card"><p className="muted">Loading…</p></div>}>
          <SmartAlerts enriched={[]} prices={{}} />
        </Suspense>
      )}

      {loading && tab !== 'smart' && <div className="card"><p className="muted">Loading whale signals…</p></div>}

      {!loading && tab === 'movers' && (
        <>
          <div className="whale-window-tabs">
            {['1h', '24h', '7d'].map(w => (
              <button
                key={w}
                className={`chart-tab ${moverWindow === w ? 'active' : ''}`}
                onClick={() => setMoverWindow(w)}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="whale-split">
            <div className="whale-card">
              <h3 className="whale-card-h positive">▲ Top Gainers ({moverWindow})</h3>
              {gainers.map(c => <MoverRow key={c.id} c={c} pctKey={pctKey} />)}
            </div>
            <div className="whale-card">
              <h3 className="whale-card-h negative">▼ Top Losers ({moverWindow})</h3>
              {losers.map(c => <MoverRow key={c.id} c={c} pctKey={pctKey} />)}
            </div>
          </div>
        </>
      )}

      {!loading && tab === 'volume' && (
        <div className="whale-split">
          <div className="whale-card">
            <h3 className="whale-card-h">🔥 Volume Anomalies</h3>
            <p className="whale-help">Highest 24h-volume / market-cap ratio — unusual turnover, often whale entry.</p>
            {volumeAnomalies.map(c => (
              <div key={c.id} className="whale-row">
                <Link to={`/asset/${c.id}`} className="whale-coin">
                  <img src={c.image} alt="" width={26} height={26} />
                  <div>
                    <div className="whale-name">{c.name}</div>
                    <div className="whale-sym">{c.symbol?.toUpperCase()}</div>
                  </div>
                </Link>
                <div className="whale-stat">
                  <div className="whale-stat-val">{(c._turnover * 100).toFixed(1)}%</div>
                  <div className="whale-stat-lbl">turnover</div>
                </div>
                <div className="whale-stat">
                  <div className="whale-stat-val">{fmtUsd(c.total_volume)}</div>
                  <div className="whale-stat-lbl">24h vol</div>
                </div>
              </div>
            ))}
          </div>
          <div className="whale-card">
            <h3 className="whale-card-h">💰 Volume Leaders</h3>
            <p className="whale-help">Where the most dollars are flowing right now.</p>
            {volumeLeaders.map(c => (
              <div key={c.id} className="whale-row">
                <Link to={`/asset/${c.id}`} className="whale-coin">
                  <img src={c.image} alt="" width={26} height={26} />
                  <div>
                    <div className="whale-name">{c.name}</div>
                    <div className="whale-sym">{c.symbol?.toUpperCase()}</div>
                  </div>
                </Link>
                <div className="whale-stat">
                  <div className="whale-stat-val">{fmtUsd(c.total_volume)}</div>
                  <div className="whale-stat-lbl">24h vol</div>
                </div>
                <div className={`whale-stat ${c.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}`}>
                  <div className="whale-stat-val">{fmtPct(c.price_change_percentage_24h)}</div>
                  <div className="whale-stat-lbl">24h</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === 'trending' && (
        <div className="whale-card">
          <h3 className="whale-card-h">🔍 Trending Searches (CoinGecko)</h3>
          <p className="whale-help">Most-searched coins on CoinGecko in the last 24h. A leading indicator of retail attention.</p>
          <div className="trending-grid">
            {trending.map((t, i) => (
              <Link key={t.id || i} to={`/asset/${t.id}`} className="trending-card">
                <div className="trending-rank">#{i + 1}</div>
                <img src={t.thumb} alt="" width={32} height={32} />
                <div className="trending-info">
                  <div className="whale-name">{t.name}</div>
                  <div className="whale-sym">{t.symbol}</div>
                </div>
                {t.market_cap_rank && (
                  <div className="trending-mcap">MCap #{t.market_cap_rank}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === 'btc' && (
        <div className="whale-card">
          <h3 className="whale-card-h">🐋 Live Bitcoin Whale Transactions</h3>
          <p className="whale-help">Unconfirmed BTC txs over $500K from blockchain.info — refresh to see new ones.</p>
          {largeTx.length === 0 && (
            <p className="muted">No whale txs in current mempool snapshot. Try refresh.</p>
          )}
          {largeTx.map(tx => (
            <a
              key={tx.hash}
              className="btc-tx-row"
              href={`https://www.blockchain.com/btc/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              <div className="btc-tx-icon">🐋</div>
              <div className="btc-tx-main">
                <div className="btc-tx-amt">{tx.btc.toFixed(2)} BTC</div>
                <div className="btc-tx-hash">{tx.hash.slice(0, 14)}…{tx.hash.slice(-6)}</div>
              </div>
              <div className="btc-tx-side">
                <div className="btc-tx-usd">{fmtUsd(tx.usd)}</div>
                <div className="btc-tx-time">{timeAgo(tx.time)}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {!loading && tab === 'feed' && (
        <div className="whale-card">
          <h3 className="whale-card-h">🐋 Multi-Chain Whale Alert Feed</h3>
          <p className="whale-help">Large transfers (&gt;$500K) across BTC and ETH mempools — live, no API key required.</p>
          {whaleFeed.length === 0 && (
            <p className="muted">No whale transfers detected right now. Try refresh.</p>
          )}
          {whaleFeed.map((tx, i) => (
            <a
              key={tx.hash + i}
              className="btc-tx-row"
              href={tx.chain === 'BTC'
                ? `https://www.blockchain.com/btc/tx/${tx.hash}`
                : `https://etherscan.io/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              <div className={`whale-feed-chain ${tx.chain.toLowerCase()}`}>{tx.chain}</div>
              <div className="btc-tx-main">
                <div className="btc-tx-amt">{tx.amount.toFixed(2)} {tx.symbol}</div>
                <div className="btc-tx-hash">{tx.hash.slice(0, 14)}…{tx.hash.slice(-6)}</div>
              </div>
              <div className="btc-tx-side">
                <div className="btc-tx-usd">{fmtUsd(tx.usd)}</div>
                <div className="btc-tx-time">{timeAgo(tx.time)}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {!loading && tab === 'flows' && (
        <div className="whale-card">
          <h3 className="whale-card-h">🏦 Exchange Flow Rankings</h3>
          <p className="whale-help">Top exchanges by 24h BTC-equivalent volume. High trust score + high volume = healthy liquidity.</p>
          {exchangeFlows.length === 0 && <p className="muted">Could not load exchange data.</p>}
          {exchangeFlows.map((ex, i) => (
            <div key={ex.id} className="exchange-row">
              <div className="exchange-rank">#{i + 1}</div>
              <div className="exchange-logo">
                {ex.image ? <img src={ex.image} alt="" width={28} height={28} /> : <span className="exchange-logo-placeholder">🏦</span>}
              </div>
              <div className="exchange-info">
                <div className="whale-name">{ex.name}</div>
                {ex.country && <div className="whale-sym">{ex.country}</div>}
              </div>
              <div className="whale-stat">
                <div className="whale-stat-val">{ex.volume24h >= 1000 ? (ex.volume24h / 1000).toFixed(1) + 'K' : ex.volume24h.toFixed(0)} BTC</div>
                <div className="whale-stat-lbl">24h vol</div>
              </div>
              <div className="whale-stat">
                <TrustBar score={ex.trustScore} />
                <div className="whale-stat-lbl">trust {ex.trustScore}/10</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrustBar({ score }) {
  const pct = (score / 10) * 100
  const color = score >= 8 ? 'var(--g)' : score >= 5 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

function MoverRow({ c, pctKey }) {
  const pct = c[pctKey]
  return (
    <div className="whale-row">
      <Link to={`/asset/${c.id}`} className="whale-coin">
        <img src={c.image} alt="" width={26} height={26} />
        <div>
          <div className="whale-name">{c.name}</div>
          <div className="whale-sym">{c.symbol?.toUpperCase()}</div>
        </div>
      </Link>
      <div className="whale-stat">
        <div className="whale-stat-val">{fmtUsd(c.current_price)}</div>
        <div className="whale-stat-lbl">price</div>
      </div>
      <div className={`whale-stat ${pct >= 0 ? 'positive' : 'negative'}`}>
        <div className="whale-stat-val">{fmtPct(pct)}</div>
        <div className="whale-stat-lbl">change</div>
      </div>
    </div>
  )
}
