import { useEffect, useState, useMemo, lazy, Suspense } from 'react'
import { noteFeatureUse } from '../featureUse'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import Icon from '../components/Icon'
import { useLanguage } from '../LanguageContext'

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

function timeAgo(d, t) {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return t('wtSecAgo')(sec)
  if (sec < 3600) return t('wtMinAgo')(Math.floor(sec / 60))
  if (sec < 86400) return t('wtHourAgo')(Math.floor(sec / 3600))
  return t('wtDayAgo')(Math.floor(sec / 86400))
}

export default function Whales() {
  // Records the discovery, so the feature tip for this page stops being
  // offered to someone who has already found it.
  useEffect(() => { noteFeatureUse('whales') }, [])

  const { t } = useLanguage()
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

  // Derived mover lists — memoized so unrelated re-renders (tab switches, etc.)
  // don't re-filter/sort the full ~250-row snapshot every time.
  const gainers = useMemo(() => [...snapshot]
    .filter(c => c[pctKey] != null)
    .sort((a, b) => b[pctKey] - a[pctKey])
    .slice(0, 8), [snapshot, pctKey])

  const losers = useMemo(() => [...snapshot]
    .filter(c => c[pctKey] != null)
    .sort((a, b) => a[pctKey] - b[pctKey])
    .slice(0, 8), [snapshot, pctKey])

  // Volume anomalies: highest volume / market cap ratio (turnover)
  const volumeAnomalies = useMemo(() => [...snapshot]
    .filter(c => c.market_cap > 100_000_000 && c.total_volume > 0)
    .map(c => ({ ...c, _turnover: c.total_volume / c.market_cap }))
    .sort((a, b) => b._turnover - a._turnover)
    .slice(0, 8), [snapshot])

  // Whale magnets: highest absolute 24h dollar volume
  const volumeLeaders = useMemo(() => [...snapshot]
    .sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
    .slice(0, 8), [snapshot])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('wtTitle')}</h1>
          <p className="page-sub">{t('wtSub')}</p>
        </div>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          {loading
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 0.8s linear infinite'}}><path d="M21 12a9 9 0 1 1-4.219-7.617"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.86"/></svg>}
          {loading ? t('loading') : t('refresh')}
        </button>
      </div>

      <div className="whale-tabs">
        {[
          { k: 'smart', l: t('wtTabSmart') },
          { k: 'movers', l: t('wtTabMovers') },
          { k: 'volume', l: t('wtTabVolume') },
          { k: 'trending', l: t('wtTabTrending') },
          { k: 'btc', l: t('wtTabBtc') },
          { k: 'feed', l: t('wtTabFeed') },
          { k: 'flows', l: t('wtTabFlows') },
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
        <Suspense fallback={<div className="card"><p className="muted">{t('loading')}</p></div>}>
          <SmartAlerts enriched={[]} prices={{}} />
        </Suspense>
      )}

      {loading && tab !== 'smart' && <div className="card"><p className="muted">{t('wtLoadingSignals')}</p></div>}

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
              <h3 className="whale-card-h positive">▲ {t('wtWindowed')(t('wtTopGainers'), moverWindow)}</h3>
              {gainers.map(c => <MoverRow key={c.id} c={c} pctKey={pctKey} />)}
            </div>
            <div className="whale-card">
              <h3 className="whale-card-h negative">▼ {t('wtWindowed')(t('wtTopLosers'), moverWindow)}</h3>
              {losers.map(c => <MoverRow key={c.id} c={c} pctKey={pctKey} />)}
            </div>
          </div>
        </>
      )}

      {!loading && tab === 'volume' && (
        <div className="whale-split">
          <div className="whale-card">
            <h3 className="whale-card-h" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="volume-chart" size={16} style={{ color:'#fb923c' }} />{t('wtVolumeAnomalies')}</h3>
            <p className="whale-help">{t('wtVolumeAnomaliesHelp')}</p>
            {volumeAnomalies.map(c => (
              <div key={c.id} className="whale-row">
                <Link to={`/asset/${c.id}`} className="whale-coin">
                  <img src={c.image} alt="coin logo" width={26} height={26}  onError={e => { e.currentTarget.style.display = 'none' }} />
                  <div>
                    <div className="whale-name">{c.name}</div>
                    <div className="whale-sym">{c.symbol?.toUpperCase()}</div>
                  </div>
                </Link>
                <div className="whale-stat">
                  <div className="whale-stat-val">{(c._turnover * 100).toFixed(1)}%</div>
                  <div className="whale-stat-lbl">{t('wtTurnover')}</div>
                </div>
                <div className="whale-stat">
                  <div className="whale-stat-val">{fmtUsd(c.total_volume)}</div>
                  <div className="whale-stat-lbl">{t('wt24hVol')}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="whale-card">
            <h3 className="whale-card-h" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="bar-chart" size={16} style={{ color: 'var(--g-ink)', fontWeight: 700 }} />{t('wtVolumeLeaders')}</h3>
            <p className="whale-help">{t('wtVolumeLeadersHelp')}</p>
            {volumeLeaders.map(c => (
              <div key={c.id} className="whale-row">
                <Link to={`/asset/${c.id}`} className="whale-coin">
                  <img src={c.image} alt="coin logo" width={26} height={26}  onError={e => { e.currentTarget.style.display = 'none' }} />
                  <div>
                    <div className="whale-name">{c.name}</div>
                    <div className="whale-sym">{c.symbol?.toUpperCase()}</div>
                  </div>
                </Link>
                <div className="whale-stat">
                  <div className="whale-stat-val">{fmtUsd(c.total_volume)}</div>
                  <div className="whale-stat-lbl">{t('wt24hVol')}</div>
                </div>
                <div className={`whale-stat ${c.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}`}>
                  <div className="whale-stat-val">{fmtPct(c.price_change_percentage_24h)}</div>
                  <div className="whale-stat-lbl">{t('wt24h')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === 'trending' && (
        <div className="whale-card">
          <h3 className="whale-card-h" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="search" size={16} style={{ color:'var(--text-muted)' }} />{t('wtTrendingSearches')}</h3>
          <p className="whale-help">{t('wtTrendingHelp')}</p>
          <div className="trending-grid">
            {/* `coin`, not `t` — this map used to bind the translator's name,
                which is fine until the body needs to translate something. */}
            {trending.map((coin, i) => (
              <Link key={coin.id || i} to={`/asset/${coin.id}`} className="trending-card">
                <div className="trending-rank">#{i + 1}</div>
                <img src={coin.thumb} alt="coin logo" width={32} height={32}  onError={e => { e.currentTarget.style.display = 'none' }} />
                <div className="trending-info">
                  <div className="whale-name">{coin.name}</div>
                  <div className="whale-sym">{coin.symbol}</div>
                </div>
                {coin.market_cap_rank && (
                  <div className="trending-mcap">{t('wtMcapRank')(coin.market_cap_rank)}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === 'btc' && (
        <div className="whale-card">
          <h3 className="whale-card-h" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="flow" size={16} style={{ color:'#38bdf8' }} />{t('wtBtcTitle')}</h3>
          <p className="whale-help">{t('wtBtcHelp')}</p>
          {largeTx.length === 0 && (
            <p className="muted">{t('wtBtcEmpty')}</p>
          )}
          {largeTx.map(tx => (
            <a
              key={tx.hash}
              className="btc-tx-row"
              href={`https://www.blockchain.com/btc/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              <div className="btc-tx-icon"><Icon name="flow" size={18} style={{ color:'#38bdf8' }} /></div>
              <div className="btc-tx-main">
                <div className="btc-tx-amt">{tx.btc.toFixed(2)} BTC</div>
                <div className="btc-tx-hash">{tx.hash.slice(0, 14)}…{tx.hash.slice(-6)}</div>
              </div>
              <div className="btc-tx-side">
                <div className="btc-tx-usd">{fmtUsd(tx.usd)}</div>
                <div className="btc-tx-time">{timeAgo(tx.time, t)}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {!loading && tab === 'feed' && (
        <div className="whale-card">
          <h3 className="whale-card-h" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="flow" size={16} style={{ color:'#38bdf8' }} />{t('wtFeedTitle')}</h3>
          <p className="whale-help">{t('wtFeedHelp')}</p>
          {whaleFeed.length === 0 && (
            <p className="muted">{t('wtFeedEmpty')}</p>
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
                <div className="btc-tx-time">{timeAgo(tx.time, t)}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {!loading && tab === 'flows' && (
        <div className="whale-card">
          <h3 className="whale-card-h" style={{ display:'inline-flex', alignItems:'center', gap:'0.4em' }}><Icon name="bank" size={16} style={{ color:'var(--text-muted)' }} />{t('wtFlowsTitle')}</h3>
          <p className="whale-help">{t('wtFlowsHelp')}</p>
          {exchangeFlows.length === 0 && <p className="muted">{t('wtFlowsEmpty')}</p>}
          {exchangeFlows.map((ex, i) => (
            <div key={ex.id} className="exchange-row">
              <div className="exchange-rank">#{i + 1}</div>
              <div className="exchange-logo">
                {ex.image ? <img src={ex.image} alt="coin logo" width={28} height={28}  onError={e => { e.currentTarget.style.display = 'none' }} /> : <span className="exchange-logo-placeholder"><Icon name="bank" size={18} /></span>}
              </div>
              <div className="exchange-info">
                <div className="whale-name">{ex.name}</div>
                {ex.country && <div className="whale-sym">{ex.country}</div>}
              </div>
              <div className="whale-stat">
                <div className="whale-stat-val">{ex.volume24h >= 1000 ? (ex.volume24h / 1000).toFixed(1) + 'K' : ex.volume24h.toFixed(0)} BTC</div>
                <div className="whale-stat-lbl">{t('wt24hVol')}</div>
              </div>
              <div className="whale-stat">
                <TrustBar score={ex.trustScore} />
                <div className="whale-stat-lbl">{t('wtTrust')(ex.trustScore)}</div>
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
    <div style={{ width: 60, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

function MoverRow({ c, pctKey }) {
  const { t } = useLanguage()
  const pct = c[pctKey]
  return (
    <div className="whale-row">
      <Link to={`/asset/${c.id}`} className="whale-coin">
        <img src={c.image} alt="coin logo" width={26} height={26}  onError={e => { e.currentTarget.style.display = 'none' }} />
        <div>
          <div className="whale-name">{c.name}</div>
          <div className="whale-sym">{c.symbol?.toUpperCase()}</div>
        </div>
      </Link>
      <div className="whale-stat">
        <div className="whale-stat-val">{fmtUsd(c.current_price)}</div>
        <div className="whale-stat-lbl">{t('wtPrice')}</div>
      </div>
      <div className={`whale-stat ${pct >= 0 ? 'positive' : 'negative'}`}>
        <div className="whale-stat-val">{fmtPct(pct)}</div>
        <div className="whale-stat-lbl">{t('wtChange')}</div>
      </div>
    </div>
  )
}
