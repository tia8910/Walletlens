import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'

/* ── helpers ── */
function fmtUsd(n) {
  if (!n && n !== 0) return '–'
  const abs = Math.abs(n)
  if (abs >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return '$' + (n/1e9).toFixed(2)  + 'B'
  if (abs >= 1e6)  return '$' + (n/1e6).toFixed(2)  + 'M'
  if (abs >= 1e3)  return '$' + (n/1e3).toFixed(2)  + 'K'
  return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '–'
  return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
}
function fmtNum(n, dec = 4) {
  if (n == null || isNaN(n)) return '–'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dec })
}
function timeAgo(d) {
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (sec < 60)   return sec + 's ago'
  if (sec < 3600) return Math.floor(sec/60) + 'm ago'
  if (sec < 86400)return Math.floor(sec/3600) + 'h ago'
  return Math.floor(sec/86400) + 'd ago'
}

/* ══════════════ WALLET READER ══════════════ */
function WalletReader() {
  const [addr, setAddr] = useState('')
  const [chain, setChain] = useState('btc')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function lookup() {
    if (!addr.trim()) return
    setLoading(true); setErr(''); setResult(null)
    track('wallet_lookup', { chain })
    try {
      const data = await api.readWalletAddress(addr.trim(), chain)
      if (!data) { setErr('Could not fetch wallet data. Check the address and try again.'); setLoading(false); return }
      setResult(data)
      track('wallet_lookup_success', { chain, whale_class: data.whaleClass })
    } catch { setErr('Lookup failed. Check the address format.') }
    setLoading(false)
  }

  function whaleLabel(balUsd) {
    if (balUsd >= 10_000_000) return { l: '🐋 Mega Whale', c: 'var(--g)' }
    if (balUsd >= 1_000_000)  return { l: '🐳 Whale',       c: 'var(--g)' }
    if (balUsd >= 100_000)    return { l: '🦈 Shark',        c: '#fbbf24' }
    if (balUsd >= 10_000)     return { l: '🐬 Dolphin',      c: '#60a5fa' }
    return { l: '🐟 Retail',  c: 'rgba(255,255,255,0.5)' }
  }

  return (
    <div className="intel-section">
      <div className="intel-hero">
        <div className="intel-hero-icon">👛</div>
        <h2 className="intel-hero-title">Wallet Reader</h2>
        <p className="intel-hero-sub">Paste any BTC or ETH address to instantly profile it — balance, activity, and whale classification.</p>
      </div>

      <div className="wr-chain-row">
        {['btc','eth'].map(c => (
          <button key={c} className={`wr-chain-btn ${chain === c ? 'active' : ''}`} onClick={() => { setChain(c); setResult(null); setErr('') }}>
            <span className={`wr-chain-dot ${c}`} />{c.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="wr-input-row">
        <input
          className="wr-input"
          placeholder={chain === 'btc' ? 'bc1q… or 1… or 3…' : '0x…'}
          value={addr}
          onChange={e => setAddr(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          spellCheck={false}
        />
        <button className="wr-lookup-btn" onClick={lookup} disabled={loading || !addr.trim()}>
          {loading ? <span className="qs-spinner" /> : '🔍'} Lookup
        </button>
      </div>

      {err && <div className="intel-err">{err}</div>}

      {result && (() => {
        const wl = whaleLabel(result.balanceUsd)
        return (
          <div className="wr-result">
            <div className="wr-profile">
              <div className="wr-whale-badge" style={{ color: wl.c, borderColor: wl.c }}>{wl.l}</div>
              <div className="wr-addr">{result.address.slice(0,8)}…{result.address.slice(-6)}</div>
            </div>
            <div className="wr-stats-grid">
              <div className="wr-stat">
                <div className="wr-stat-lbl">Balance</div>
                <div className="wr-stat-val">{fmtNum(result.balance, 6)} {chain.toUpperCase()}</div>
                <div className="wr-stat-usd">{fmtUsd(result.balanceUsd)}</div>
              </div>
              <div className="wr-stat">
                <div className="wr-stat-lbl">Transactions</div>
                <div className="wr-stat-val">{result.txCount?.toLocaleString() ?? '–'}</div>
              </div>
              {result.lastTx && (
                <div className="wr-stat">
                  <div className="wr-stat-lbl">Last Active</div>
                  <div className="wr-stat-val">{timeAgo(result.lastTx)}</div>
                </div>
              )}
              {result.received != null && (
                <div className="wr-stat">
                  <div className="wr-stat-lbl">Total Received</div>
                  <div className="wr-stat-val">{fmtNum(result.received, 4)} {chain.toUpperCase()}</div>
                </div>
              )}
            </div>
            {result.topTokens?.length > 0 && (
              <div className="wr-tokens">
                <div className="wr-tokens-title">Top Token Holdings</div>
                {result.topTokens.slice(0,5).map((t,i) => (
                  <div key={i} className="wr-token-row">
                    <span className="wr-token-sym">{t.symbol}</span>
                    <span className="wr-token-bal">{fmtNum(t.balance, 2)}</span>
                    {t.usd > 0 && <span className="wr-token-usd">{fmtUsd(t.usd)}</span>}
                  </div>
                ))}
              </div>
            )}
            <a className="wr-explorer-link" href={result.explorerUrl} target="_blank" rel="noreferrer">
              View on {chain === 'btc' ? 'Blockchain.com' : 'Etherscan'} ↗
            </a>
          </div>
        )
      })()}
    </div>
  )
}

/* ══════════════ GEMS TO CATCH ══════════════ */
function GemsTab({ market }) {
  const gems = market
    .filter(c =>
      c.market_cap > 5_000_000 &&
      c.market_cap < 500_000_000 &&
      c.total_volume > 0 &&
      c.price_change_percentage_24h_in_currency != null
    )
    .map(c => {
      const turnover = c.total_volume / c.market_cap
      const absChange = Math.abs(c.price_change_percentage_24h_in_currency || 0)
      const gemScore = Math.round(
        (Math.min(turnover, 1) * 40) +
        (Math.min(absChange / 30, 1) * 30) +
        ((1 - Math.min(c.market_cap / 500_000_000, 1)) * 30)
      )
      return { ...c, turnover, gemScore }
    })
    .sort((a, b) => b.gemScore - a.gemScore)
    .slice(0, 12)

  if (!gems.length) return <p className="muted" style={{padding:'1rem'}}>Loading gem data…</p>

  return (
    <div className="intel-section">
      <div className="intel-hero">
        <div className="intel-hero-icon">💎</div>
        <h2 className="intel-hero-title">Gems to Catch</h2>
        <p className="intel-hero-sub">Low-to-mid cap coins with unusual volume spikes and momentum — early signal radar before the crowd arrives.</p>
      </div>
      <div className="gems-grid">
        {gems.map(c => (
          <Link key={c.id} to={`/asset/${c.id}`} className="gem-card">
            <div className="gem-score-ring" style={{ '--gem-score': c.gemScore }}>
              <svg viewBox="0 0 36 36" width="56" height="56">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={c.gemScore >= 70 ? 'var(--g)' : c.gemScore >= 45 ? '#fbbf24' : '#60a5fa'}
                  strokeWidth="3" strokeDasharray={`${(c.gemScore/100)*94.2} 94.2`}
                  strokeLinecap="round" transform="rotate(-90 18 18)" />
              </svg>
              <img src={c.image} alt="" className="gem-img" />
            </div>
            <div className="gem-info">
              <div className="gem-name">{c.name}</div>
              <div className="gem-sym">{c.symbol?.toUpperCase()}</div>
            </div>
            <div className="gem-stats">
              <div className="gem-stat">
                <span className="gem-stat-lbl">Turnover</span>
                <span className="gem-stat-val">{(c.turnover*100).toFixed(1)}%</span>
              </div>
              <div className="gem-stat">
                <span className="gem-stat-lbl">24h</span>
                <span className={`gem-stat-val ${c.price_change_percentage_24h_in_currency >= 0 ? 'pos' : 'neg'}`}>
                  {fmtPct(c.price_change_percentage_24h_in_currency)}
                </span>
              </div>
              <div className="gem-stat">
                <span className="gem-stat-lbl">MCap</span>
                <span className="gem-stat-val">{fmtUsd(c.market_cap)}</span>
              </div>
            </div>
            <div className="gem-score-badge" style={{ background: c.gemScore >= 70 ? 'rgba(var(--g-rgb),0.15)' : c.gemScore >= 45 ? 'rgba(251,191,36,0.15)' : 'rgba(96,165,250,0.15)', color: c.gemScore >= 70 ? 'var(--g)' : c.gemScore >= 45 ? '#fbbf24' : '#60a5fa' }}>
              {c.gemScore} gem score
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ══════════════ ALPHA FEED ══════════════ */
function AlphaTab({ market, trending }) {
  const signals = []

  // Volume spike: 24h volume > 5× what you'd expect (turnover > 50%)
  market
    .filter(c => c.total_volume / c.market_cap > 0.5 && c.market_cap > 10_000_000)
    .sort((a, b) => (b.total_volume/b.market_cap) - (a.total_volume/a.market_cap))
    .slice(0, 4)
    .forEach(c => signals.push({
      type: 'volume_spike', icon: '⚡', color: '#fbbf24',
      tag: 'Volume Spike',
      coin: c, detail: `${(c.total_volume/c.market_cap*100).toFixed(0)}% turnover in 24h`,
    }))

  // Trending but low cap (retail hasn't found it yet)
  trending
    .filter(t => t.market_cap_rank > 100 || !t.market_cap_rank)
    .slice(0, 3)
    .forEach(t => signals.push({
      type: 'trending_smallcap', icon: '🔥', color: '#f87171',
      tag: 'Trending Low-Cap',
      coin: { ...t, id: t.id, image: t.thumb, name: t.name, symbol: t.symbol, current_price: null },
      detail: `#${t.score ?? '?'} trending · MCap rank #${t.market_cap_rank ?? '?'}`,
    }))

  // Big movers with small cap (high beta = smart-money entry)
  market
    .filter(c => Math.abs(c.price_change_percentage_24h_in_currency||0) > 15 && c.market_cap < 200_000_000 && c.total_volume > 500_000)
    .sort((a, b) => Math.abs(b.price_change_percentage_24h_in_currency||0) - Math.abs(a.price_change_percentage_24h_in_currency||0))
    .slice(0, 4)
    .forEach(c => signals.push({
      type: 'big_mover', icon: c.price_change_percentage_24h_in_currency >= 0 ? '🚀' : '🩸', color: c.price_change_percentage_24h_in_currency >= 0 ? 'var(--g)' : '#f87171',
      tag: c.price_change_percentage_24h_in_currency >= 0 ? 'Breakout' : 'Capitulation',
      coin: c, detail: `${fmtPct(c.price_change_percentage_24h_in_currency)} · MCap ${fmtUsd(c.market_cap)}`,
    }))

  if (!signals.length) return <p className="muted" style={{padding:'1rem'}}>Loading alpha signals…</p>

  return (
    <div className="intel-section">
      <div className="intel-hero">
        <div className="intel-hero-icon">⚡</div>
        <h2 className="intel-hero-title">Alpha Feed</h2>
        <p className="intel-hero-sub">Real-time signals — volume anomalies, trending low-caps, and big movers before the herd catches on.</p>
      </div>
      <div className="alpha-feed">
        {signals.map((s, i) => (
          <Link key={i} to={`/asset/${s.coin.id}`} className="alpha-card">
            <div className="alpha-icon" style={{ background: s.color + '22', color: s.color }}>{s.icon}</div>
            <div className="alpha-content">
              <div className="alpha-tag" style={{ color: s.color }}>{s.tag}</div>
              <div className="alpha-name">
                {s.coin.image && <img src={s.coin.image} alt="" width={18} height={18} style={{borderRadius:'50%',marginRight:6}} />}
                {s.coin.name} <span className="alpha-sym">{s.coin.symbol?.toUpperCase()}</span>
              </div>
              <div className="alpha-detail">{s.detail}</div>
            </div>
            {s.coin.current_price != null && (
              <div className="alpha-price">
                <div>{fmtUsd(s.coin.current_price)}</div>
                <div className={s.coin.price_change_percentage_24h_in_currency >= 0 ? 'pos' : 'neg'}>
                  {fmtPct(s.coin.price_change_percentage_24h_in_currency)}
                </div>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ══════════════ INDICATORS ══════════════ */
function IndicatorsTab({ market, globalData }) {
  const btc = market.find(c => c.id === 'bitcoin')
  const eth = market.find(c => c.id === 'ethereum')

  const btcDom = globalData?.btc_dominance ?? (btc && market.length ? (btc.market_cap / market.reduce((s,c) => s+(c.market_cap||0), 0))*100 : null)
  const totalMcap = market.reduce((s,c) => s+(c.market_cap||0), 0)
  const btcEthRatio = btc && eth ? btc.current_price / eth.current_price : null

  // Altseason index: % of top 50 alts outperforming BTC in 24h
  const top50 = market.slice(0,50).filter(c => c.id !== 'bitcoin')
  const btcChange = btc?.price_change_percentage_24h_in_currency || 0
  const altOutperforming = top50.filter(c => (c.price_change_percentage_24h_in_currency||0) > btcChange).length
  const altseasonScore = Math.round((altOutperforming / top50.length) * 100)
  const altseasonLabel = altseasonScore >= 75 ? 'Alt Season 🔥' : altseasonScore >= 50 ? 'Alts Heating Up' : altseasonScore >= 25 ? 'BTC Season' : 'BTC Dominates ₿'
  const altseasonColor = altseasonScore >= 75 ? '#f59e0b' : altseasonScore >= 50 ? 'var(--g)' : altseasonScore >= 25 ? '#60a5fa' : '#818cf8'

  // Simple RSI-like signal for top 10 (using 24h change as proxy)
  const top10 = market.slice(0,10)

  return (
    <div className="intel-section">
      <div className="intel-hero">
        <div className="intel-hero-icon">📊</div>
        <h2 className="intel-hero-title">Market Indicators</h2>
        <p className="intel-hero-sub">Macro crypto health at a glance — dominance, altseason index, BTC/ETH ratio, and momentum signals.</p>
      </div>

      <div className="ind-grid">
        {/* BTC Dominance */}
        <div className="ind-card">
          <div className="ind-card-title">₿ BTC Dominance</div>
          <div className="ind-gauge-wrap">
            <GaugeSemi value={btcDom ?? 0} max={70} color="#f7931a" />
          </div>
          <div className="ind-value" style={{color:'#f7931a'}}>{btcDom != null ? btcDom.toFixed(1) + '%' : '–'}</div>
          <div className="ind-hint">{btcDom > 55 ? 'BTC leading — risk-off mode' : btcDom > 45 ? 'Balanced market' : 'Alts in control'}</div>
        </div>

        {/* Altseason Index */}
        <div className="ind-card">
          <div className="ind-card-title">🔄 Altseason Index</div>
          <div className="ind-gauge-wrap">
            <GaugeSemi value={altseasonScore} max={100} color={altseasonColor} />
          </div>
          <div className="ind-value" style={{color: altseasonColor}}>{altseasonScore}/100</div>
          <div className="ind-hint">{altseasonLabel}</div>
        </div>

        {/* Total Market Cap */}
        <div className="ind-card">
          <div className="ind-card-title">🌍 Total Market Cap</div>
          <div className="ind-big-stat">{fmtUsd(totalMcap)}</div>
          <div className="ind-hint">Combined top {market.length} assets</div>
          <div className={`ind-badge ${(btc?.price_change_percentage_24h_in_currency||0) >= 0 ? 'pos' : 'neg'}`}>
            BTC 24h {fmtPct(btc?.price_change_percentage_24h_in_currency)}
          </div>
        </div>

        {/* BTC/ETH Ratio */}
        <div className="ind-card">
          <div className="ind-card-title">⚖️ BTC / ETH Ratio</div>
          <div className="ind-big-stat">{btcEthRatio != null ? btcEthRatio.toFixed(1) + 'x' : '–'}</div>
          <div className="ind-hint">{btcEthRatio != null ? (btcEthRatio > 20 ? 'ETH undervalued vs BTC' : btcEthRatio < 12 ? 'ETH strong vs BTC' : 'Neutral ratio') : ''}</div>
        </div>
      </div>

      {/* Momentum table */}
      <div className="ind-momentum">
        <div className="ind-mom-title">Top 10 Momentum</div>
        {top10.map(c => {
          const ch = c.price_change_percentage_24h_in_currency || 0
          const barW = Math.min(Math.abs(ch) / 15 * 100, 100)
          return (
            <Link key={c.id} to={`/asset/${c.id}`} className="ind-mom-row">
              <img src={c.image} alt="" width={20} height={20} style={{borderRadius:'50%'}} />
              <span className="ind-mom-sym">{c.symbol?.toUpperCase()}</span>
              <div className="ind-mom-bar-wrap">
                <div className="ind-mom-bar" style={{
                  width: barW + '%',
                  background: ch >= 0 ? 'rgba(var(--g-rgb),0.5)' : 'rgba(248,113,113,0.5)',
                  marginLeft: ch >= 0 ? '50%' : `calc(50% - ${barW}%)`
                }} />
                <div className="ind-mom-center" />
              </div>
              <span className={`ind-mom-pct ${ch >= 0 ? 'pos' : 'neg'}`}>{fmtPct(ch)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function GaugeSemi({ value, max, color }) {
  const pct = Math.min(value / max, 1)
  const angle = pct * 180
  const r = 40, cx = 50, cy = 50
  const toXY = (deg) => {
    const rad = (deg - 180) * Math.PI / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const [x1, y1] = toXY(0)
  const [x2, y2] = toXY(angle)
  const largeArc = angle > 180 ? 1 : 0
  return (
    <svg viewBox="0 0 100 55" width="100" height="55">
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" strokeLinecap="round" />
      {angle > 0 && (
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
      )}
    </svg>
  )
}

/* ══════════════ MAIN PAGE ══════════════ */
export default function Intel() {
  const [tab, setTab] = useState('gems')
  const [market, setMarket] = useState([])
  const [trending, setTrending] = useState([])
  const [globalData, setGlobalData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [snap, trend, global] = await Promise.all([
        api.getWhaleMarketSnapshot(),
        api.getTrendingCoins(),
        api.getGlobalMarketData(),
      ])
      setMarket(snap || [])
      setTrending(trend || [])
      setGlobalData(global)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const TABS = [
    { k: 'wallets',    l: '👛 Wallet Reader' },
    { k: 'gems',       l: '💎 Gems'          },
    { k: 'alpha',      l: '⚡ Alpha'          },
    { k: 'indicators', l: '📊 Indicators'     },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Intel</h1>
          <p className="page-sub">Wallets · Gems · Alpha · Market Indicators</p>
        </div>
        <button className="refresh-btn" onClick={loadData} disabled={loading}>
          {loading
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 0.8s linear infinite'}}><path d="M21 12a9 9 0 1 1-4.219-7.617"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.86"/></svg>}
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="whale-tabs">
        {TABS.map(t => (
          <button key={t.k} className={`whale-tab ${tab === t.k ? 'active' : ''}`} onClick={() => { setTab(t.k); track('intel_tab_switch', { tab: t.k }) }}>{t.l}</button>
        ))}
      </div>

      {loading && tab !== 'wallets' && <div className="card"><p className="muted">Loading intel…</p></div>}

      {tab === 'wallets' && <WalletReader />}
      {!loading && tab === 'gems' && <GemsTab market={market} />}
      {!loading && tab === 'alpha' && <AlphaTab market={market} trending={trending} />}
      {!loading && tab === 'indicators' && <IndicatorsTab market={market} globalData={globalData} />}
    </div>
  )
}
