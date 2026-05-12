import { useState, useEffect, memo } from 'react'
import CoinLogo from './CoinLogo'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const GOPLUS_BASE    = 'https://api.gopluslabs.io/api/v1'
const CACHE_KEY      = 'wl_risk_cache_v1'
const CACHE_TTL      = 6 * 60 * 60 * 1000 // 6 hours

// Coins that are definitively safe — no need to call the API
const SAFE_IDS = new Set([
  'bitcoin','ethereum','binancecoin','solana','ripple','cardano',
  'polkadot','avalanche-2','chainlink','polygon','litecoin','dogecoin',
  'shiba-inu','tron','uniswap','stellar','monero','cosmos','algorand',
  'tezos','filecoin','aave','compound-governance-token','maker',
  'the-graph','decentraland','the-sandbox','axie-infinity',
])

// Stablecoins are low-risk by design — pegged to fiat, not rug-pullable
const STABLECOINS = new Set([
  'tether','usd-coin','dai','binance-usd','true-usd','frax',
  'pax-dollar','gemini-dollar','liquity-usd','usdd','first-digital-usd',
  'paypal-usd','euro-coin','stasis-eurs','usds','usual-usd','curve-dao-token',
  'nusd','fei-protocol','reserve','rai','floating-stablecoin',
])

const CHAIN_MAP = {
  'ethereum': 1, 'binance-smart-chain': 56, 'polygon-pos': 137,
  'avalanche': 43114, 'arbitrum-one': 42161, 'optimistic-ethereum': 10,
  'base': 8453, 'fantom': 250, 'cronos': 25,
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function saveCache(c) { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) }

async function fetchJSON(url) {
  try {
    const r = await fetch(url)
    if (r.ok) return r.json()
  } catch {}
  return null
}

// Score a token. Returns { score 0-100, grade, color, signals[] }
async function scoreToken(coinId) {
  // Stablecoins always safe — check before cache to override any stale cached score
  if (STABLECOINS.has(coinId)) {
    return { score: 90, grade: 'SAFE', color: '#34d399', signals: [
      { label: 'Fiat-pegged stablecoin — no rug risk', status: 'good' },
      { label: 'High liquidity by design', status: 'good' },
      { label: 'No smart contract price dependency', status: 'good' },
    ]}
  }

  // Major coins always safe — check before cache too
  if (SAFE_IDS.has(coinId)) {
    return { score: 95, grade: 'SAFE', color: '#34d399', signals: [
      { label: 'Established blue-chip', status: 'good' },
      { label: 'High liquidity', status: 'good' },
      { label: 'Multi-year track record', status: 'good' },
    ]}
  }

  const cache = loadCache()
  const cached = cache[coinId]
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result

  // Non-crypto IDs (metals, stocks, fiat)
  if (coinId.startsWith('metal:') || coinId.startsWith('stock:') || coinId.startsWith('fiat:')) {
    const result = { score: 90, grade: 'SAFE', color: '#34d399', signals: [
      { label: 'Regulated asset class', status: 'good' },
      { label: 'No smart contract risk', status: 'good' },
    ]}
    cache[coinId] = { result, ts: Date.now() }
    saveCache(cache)
    return result
  }

  const signals = []
  let totalPoints = 0
  let maxPoints   = 0

  // ── 1. CoinGecko metadata ──────────────────────────────────────────────
  const cgData = await fetchJSON(
    `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=true&developer_data=true`
  )

  // Age score (20 pts)
  maxPoints += 20
  if (cgData?.genesis_date) {
    const ageMonths = (Date.now() - new Date(cgData.genesis_date)) / (1000 * 60 * 60 * 24 * 30)
    const agePts = Math.min(20, Math.round(ageMonths / 3))
    totalPoints += agePts
    signals.push({
      label: `Token age: ${Math.round(ageMonths)} months`,
      status: ageMonths >= 24 ? 'good' : ageMonths >= 6 ? 'warn' : 'bad',
    })
  } else {
    signals.push({ label: 'Launch date unknown', status: 'warn' })
    totalPoints += 8
  }

  // Market cap score (20 pts)
  maxPoints += 20
  const mcap = cgData?.market_data?.market_cap?.usd ?? 0
  if (mcap > 1e9) { totalPoints += 20; signals.push({ label: `Market cap $${(mcap/1e9).toFixed(1)}B`, status: 'good' }) }
  else if (mcap > 100e6) { totalPoints += 14; signals.push({ label: `Market cap $${(mcap/1e6).toFixed(0)}M`, status: 'warn' }) }
  else if (mcap > 10e6) { totalPoints += 7;  signals.push({ label: `Market cap $${(mcap/1e6).toFixed(0)}M — low`, status: 'warn' }) }
  else { totalPoints += 2;  signals.push({ label: `Market cap < $10M — very low`, status: 'bad' }) }

  // Liquidity (volume/mcap ratio) (15 pts)
  maxPoints += 15
  const vol24 = cgData?.market_data?.total_volume?.usd ?? 0
  const liqRatio = mcap > 0 ? vol24 / mcap : 0
  if (liqRatio > 0.1) { totalPoints += 15; signals.push({ label: `High liquidity (${(liqRatio*100).toFixed(1)}% daily vol/mcap)`, status: 'good' }) }
  else if (liqRatio > 0.02) { totalPoints += 9; signals.push({ label: `Moderate liquidity (${(liqRatio*100).toFixed(1)}% daily vol/mcap)`, status: 'warn' }) }
  else { totalPoints += 2; signals.push({ label: `Low liquidity — exit risk`, status: 'bad' }) }

  // Community score (10 pts)
  maxPoints += 10
  const commScore = cgData?.community_score ?? 0
  const commPts = Math.round((commScore / 100) * 10)
  totalPoints += commPts
  signals.push({
    label: `Community score: ${commScore.toFixed(0)}/100`,
    status: commScore > 50 ? 'good' : commScore > 20 ? 'warn' : 'bad',
  })

  // Developer activity (10 pts)
  maxPoints += 10
  const devScore = cgData?.developer_score ?? 0
  const devPts = Math.round((devScore / 100) * 10)
  totalPoints += devPts
  signals.push({
    label: `Developer activity: ${devScore.toFixed(0)}/100`,
    status: devScore > 50 ? 'good' : devScore > 20 ? 'warn' : 'bad',
  })

  // ── 2. GoPlus Security API (contract-level checks) ─────────────────────
  const platforms = cgData?.platforms || {}
  const chainEntry = Object.entries(platforms).find(([chain]) => CHAIN_MAP[chain])
  if (chainEntry) {
    const [chainName, contractAddr] = chainEntry
    const chainId = CHAIN_MAP[chainName]
    if (contractAddr) {
      const gpData = await fetchJSON(`${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${contractAddr}`)
      const info = gpData?.result?.[contractAddr.toLowerCase()]

      if (info) {
        // Honeypot (25 pts)
        maxPoints += 25
        if (info.is_honeypot === '0') { totalPoints += 25; signals.push({ label: 'Not a honeypot ✓', status: 'good' }) }
        else if (info.is_honeypot === '1') { signals.push({ label: '⚠️ HONEYPOT DETECTED', status: 'bad' }) }
        else { totalPoints += 10; signals.push({ label: 'Honeypot status unknown', status: 'warn' }) }

        // Contract verified
        if (info.is_open_source === '1') { totalPoints += 5; signals.push({ label: 'Contract verified & open source', status: 'good' }); maxPoints += 5 }
        else if (info.is_open_source === '0') { signals.push({ label: 'Contract NOT verified', status: 'bad' }); maxPoints += 5 }

        // Owner renounced
        if (info.owner_address === '' || info.can_take_back_ownership === '0') {
          totalPoints += 5; signals.push({ label: 'Ownership renounced ✓', status: 'good' }); maxPoints += 5
        } else if (info.owner_address) {
          signals.push({ label: 'Owner can modify contract', status: 'warn' }); maxPoints += 5; totalPoints += 2
        }

        // Buy/sell tax
        const buyTax  = parseFloat(info.buy_tax  || '0') * 100
        const sellTax = parseFloat(info.sell_tax || '0') * 100
        if (buyTax > 0 || sellTax > 0) {
          maxPoints += 10
          if (buyTax > 10 || sellTax > 10) { signals.push({ label: `High tax: buy ${buyTax.toFixed(1)}% / sell ${sellTax.toFixed(1)}%`, status: 'bad' }) }
          else { totalPoints += 8; signals.push({ label: `Tax: buy ${buyTax.toFixed(1)}% / sell ${sellTax.toFixed(1)}%`, status: 'warn' }) }
        }

        // Holder concentration (top holders)
        const holders = info.holders || []
        if (holders.length > 0) {
          maxPoints += 10
          const top10Pct = holders.slice(0, 10).reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100
          if (top10Pct < 30) { totalPoints += 10; signals.push({ label: `Top 10 hold ${top10Pct.toFixed(1)}% — good distribution`, status: 'good' }) }
          else if (top10Pct < 60) { totalPoints += 5; signals.push({ label: `Top 10 hold ${top10Pct.toFixed(1)}% — concentrated`, status: 'warn' }) }
          else { signals.push({ label: `Top 10 hold ${top10Pct.toFixed(1)}% — very concentrated`, status: 'bad' }) }
        }
      }
    }
  }

  const rawScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 50
  const score = Math.max(5, Math.min(100, rawScore))
  const grade = score >= 80 ? 'SAFE' : score >= 60 ? 'MODERATE' : score >= 35 ? 'HIGH RISK' : 'DANGER'
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#f59e0b' : score >= 35 ? '#f87171' : '#ef4444'

  const result = { score, grade, color, signals }
  cache[coinId] = { result, ts: Date.now() }
  saveCache(cache)
  return result
}

// ── Signal badge ──────────────────────────────────────────────────────────
function SignalBadge({ status, label }) {
  const colors = { good: '#34d399', warn: '#f59e0b', bad: '#f87171' }
  const icons  = { good: '✓', warn: '⚠', bad: '✕' }
  return (
    <div className="risk-signal">
      <span className="risk-signal-icon" style={{ color: colors[status] }}>{icons[status]}</span>
      <span className="risk-signal-label">{label}</span>
    </div>
  )
}

// ── Score ring ─────────────────────────────────────────────────────────────
function ScoreRing({ score, color }) {
  const r = 24, circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="risk-ring-svg">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x="32" y="32" textAnchor="middle" dominantBaseline="central"
        fontSize="13" fontWeight="800" fill={color} fontFamily="Inter,sans-serif">
        {score}
      </text>
    </svg>
  )
}

// ── Per-coin card ─────────────────────────────────────────────────────────
function RiskCard({ holding }) {
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    scoreToken(holding.coin_id).then(r => {
      if (!cancelled) { setResult(r); setLoading(false) }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [holding.coin_id])

  return (
    <div className="glass-card risk-card" onClick={() => result && setExpanded(v => !v)}>
      <div className="risk-card-top">
        <div className="risk-card-left">
          <CoinLogo image={holding.coin_image} symbol={holding.coin_symbol} size={38} className="dvx-holding-icon" />
          <div>
            <div className="risk-sym">{holding.coin_symbol?.toUpperCase()}</div>
            <div className="muted risk-name">{holding.coin_id}</div>
          </div>
        </div>
        <div className="risk-card-right">
          {loading && <div className="risk-spinner" />}
          {result && (
            <>
              <ScoreRing score={result.score} color={result.color} />
              <div className="risk-grade" style={{ color: result.color }}>{result.grade}</div>
              <span className="risk-chevron" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </>
          )}
        </div>
      </div>

      {expanded && result && (
        <div className="risk-signals" onClick={e => e.stopPropagation()}>
          {result.signals.map((s, i) => <SignalBadge key={i} status={s.status} label={s.label} />)}
        </div>
      )}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────
const LEGEND = [
  { grade: 'SAFE',      color: '#34d399', range: '80–100', desc: 'Established, liquid, low contract risk' },
  { grade: 'MODERATE',  color: '#f59e0b', range: '60–79',  desc: 'Some risk factors — monitor closely' },
  { grade: 'HIGH RISK', color: '#f87171', range: '35–59',  desc: 'Multiple red flags — be cautious' },
  { grade: 'DANGER',    color: '#ef4444', range: '0–34',   desc: 'Likely scam or extreme risk' },
]

function RiskScanner({ enriched }) {
  const cryptoHoldings = enriched.filter(h =>
    !h.coin_id.startsWith('metal:') && !h.coin_id.startsWith('stock:') && !h.coin_id.startsWith('fiat:')
  )

  return (
    <div className="risk-root">
      <div className="glass-card risk-legend">
        <p className="risk-legend-title">Risk Score Guide</p>
        <div className="risk-legend-grid">
          {LEGEND.map(l => (
            <div key={l.grade} className="risk-legend-item">
              <span className="risk-legend-grade" style={{ color: l.color }}>{l.grade}</span>
              <span className="risk-legend-range muted">{l.range}</span>
              <span className="risk-legend-desc muted">{l.desc}</span>
            </div>
          ))}
        </div>
        <p className="muted risk-legend-note">
          Scores use CoinGecko market data + GoPlus on-chain security analysis. Click any card to see signal breakdown.
        </p>
      </div>

      {cryptoHoldings.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <p className="muted">Add crypto holdings to see risk scores.</p>
        </div>
      ) : (
        cryptoHoldings.map(h => <RiskCard key={h.coin_id} holding={h} />)
      )}
    </div>
  )
}

export default memo(RiskScanner)
