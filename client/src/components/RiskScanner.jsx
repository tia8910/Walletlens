import { useState, useEffect, useCallback } from 'react'
import { track } from '../analytics'
import CoinLogo from './CoinLogo'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const GOPLUS_BASE    = 'https://api.gopluslabs.io/api/v1'
const CACHE_KEY      = 'wl_risk_cache_v2'
const CACHE_TTL      = 6 * 60 * 60 * 1000 // 6 hours

// Established blue-chips — skip API scoring
const SAFE_IDS = new Set([
  'bitcoin','ethereum','binancecoin','solana','ripple','cardano',
  'polkadot','avalanche-2','chainlink','polygon','litecoin','dogecoin',
  'shiba-inu','tron','uniswap','stellar','monero','cosmos','algorand',
  'tezos','filecoin','aave','compound-governance-token','maker',
  'the-graph','decentraland','the-sandbox','axie-infinity',
  'bitcoin-cash','ethereum-classic','near','aptos','sui','arbitrum',
  'optimism','immutable-x','injective-protocol','sei-network',
  'internet-computer','hedera-hashgraph','vechain','theta-token',
  'render-token','fetch-ai','worldcoin-wld','ondo-finance',
  'mantle','cronos','flow','gala','sandbox',
])

// Stablecoins — low risk by design
const STABLECOINS = new Set([
  'tether','usd-coin','dai','binance-usd','true-usd','frax',
  'pax-dollar','gemini-dollar','liquity-usd','usdd','first-digital-usd',
  'paypal-usd','euro-coin','stasis-eurs','usds','usual-usd',
  'nusd','fei-protocol','reserve','rai','curve-dao-token',
  'usde','ethena-usde','mountain-protocol-usdm',
])

const CHAIN_MAP = {
  'ethereum': 1, 'binance-smart-chain': 56, 'polygon-pos': 137,
  'avalanche': 43114, 'arbitrum-one': 42161, 'optimistic-ethereum': 10,
  'base': 8453, 'fantom': 250, 'cronos': 25, 'solana': 'solana',
  'tron': 'tron', 'klay-token': 8217, 'linea': 59144,
  'zksync': 324, 'scroll': 534352,
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function saveCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
}

async function fetchJSON(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (r.ok) return r.json()
  } catch {}
  return null
}

// Returns { score 0-100, grade, color, signals[], breakdown{} }
async function scoreToken(coinId, forceRefresh = false) {
  if (STABLECOINS.has(coinId)) {
    return { score: 90, grade: 'SAFE', color: '#34d399', signals: [
      { label: 'Fiat-pegged stablecoin — no rug risk', status: 'good' },
      { label: 'High liquidity by design', status: 'good' },
      { label: 'No smart contract price dependency', status: 'good' },
    ], breakdown: { cg: 90, gp: null }}
  }

  if (SAFE_IDS.has(coinId)) {
    return { score: 95, grade: 'SAFE', color: '#34d399', signals: [
      { label: 'Established blue-chip asset', status: 'good' },
      { label: 'High liquidity across major exchanges', status: 'good' },
      { label: 'Multi-year on-chain track record', status: 'good' },
    ], breakdown: { cg: 95, gp: null }}
  }

  // Non-crypto asset classes — use asset-appropriate risk profiles
  const idL = coinId.toLowerCase()
  const NON_CRYPTO_PREFIXES = ['metal:', 'stock:', 'fiat:', 'cash:', 'bond:', 'real:', 'other:']
  const NON_CRYPTO_SUBSTRINGS = ['appartment', 'apartment', 'property', 'realestate']
  const isRealEstate = idL.startsWith('real:') || idL.startsWith('other:') || NON_CRYPTO_SUBSTRINGS.some(s => idL.includes(s))
  const isBond = idL.startsWith('bond:')
  const isStock = idL.startsWith('stock:')
  const isMetal = idL.startsWith('metal:')
  const isFiat = idL.startsWith('fiat:') || idL.startsWith('cash:')

  if (NON_CRYPTO_PREFIXES.some(p => idL.startsWith(p)) || NON_CRYPTO_SUBSTRINGS.some(s => idL.includes(s))) {
    let score, signals
    if (isRealEstate) {
      score = 72
      signals = [
        { label: 'Physical asset — no smart contract risk', status: 'good' },
        { label: 'Illiquid — cannot sell quickly', status: 'warn' },
        { label: 'Subject to local market & legal risk', status: 'warn' },
        { label: 'No live price feed — manually tracked', status: 'info' },
      ]
    } else if (isBond) {
      score = 85
      signals = [
        { label: 'Fixed-income instrument — lower volatility', status: 'good' },
        { label: 'Regulated debt security', status: 'good' },
        { label: 'Subject to interest rate risk', status: 'warn' },
        { label: 'Credit risk depends on issuer', status: 'info' },
      ]
    } else if (isStock) {
      score = 80
      signals = [
        { label: 'Exchange-listed equity — regulated', status: 'good' },
        { label: 'No smart contract or rug risk', status: 'good' },
        { label: 'Subject to company & market risk', status: 'warn' },
        { label: 'Liquid — tradable on stock exchanges', status: 'good' },
      ]
    } else if (isMetal) {
      score = 88
      signals = [
        { label: 'Store of value — thousands of years track record', status: 'good' },
        { label: 'No counterparty or smart contract risk', status: 'good' },
        { label: 'Regulated commodity markets', status: 'good' },
        { label: 'Lower volatility than crypto', status: 'good' },
      ]
    } else if (isFiat) {
      score = 90
      signals = [
        { label: 'Government-backed currency', status: 'good' },
        { label: 'No smart contract risk', status: 'good' },
        { label: 'Subject to inflation risk over time', status: 'info' },
      ]
    } else {
      score = 78
      signals = [
        { label: 'Non-crypto asset — no token/rug risk', status: 'good' },
        { label: 'Manually tracked asset', status: 'info' },
      ]
    }
    const grade = score >= 80 ? 'SAFE' : score >= 60 ? 'MODERATE' : 'HIGH RISK'
    const color = score >= 80 ? '#34d399' : score >= 60 ? '#f59e0b' : '#f87171'
    const result = { score, grade, color, signals, breakdown: { cg: score, gp: null } }
    const cache = loadCache()
    cache[coinId] = { result, ts: Date.now() }
    saveCache(cache)
    return result
  }

  const cache = loadCache()
  if (!forceRefresh && cache[coinId] && Date.now() - cache[coinId].ts < CACHE_TTL) {
    return cache[coinId].result
  }

  const signals = []
  let totalPoints = 0
  let maxPoints   = 0

  // ── 1. CoinGecko metadata ──────────────────────────────────────────────
  const cgData = await fetchJSON(
    `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=true&developer_data=true`
  )

  // Age (20 pts)
  maxPoints += 20
  if (cgData?.genesis_date) {
    const ageMonths = (Date.now() - new Date(cgData.genesis_date)) / (1000 * 60 * 60 * 24 * 30)
    const agePts = Math.min(20, Math.round(ageMonths / 2.5))
    totalPoints += agePts
    const ageYears = (ageMonths / 12).toFixed(1)
    signals.push({
      label: `Token age: ${ageMonths >= 12 ? ageYears + ' years' : Math.round(ageMonths) + ' months'}`,
      status: ageMonths >= 24 ? 'good' : ageMonths >= 6 ? 'warn' : 'bad',
    })
  } else {
    signals.push({ label: 'Launch date unknown', status: 'warn' })
    totalPoints += 8
  }

  // Market cap rank (15 pts) — new signal
  maxPoints += 15
  const mcapRank = cgData?.market_cap_rank ?? null
  if (mcapRank !== null) {
    if (mcapRank <= 50)  { totalPoints += 15; signals.push({ label: `Top ${mcapRank} by market cap`, status: 'good' }) }
    else if (mcapRank <= 200) { totalPoints += 10; signals.push({ label: `Ranked #${mcapRank} by market cap`, status: 'warn' }) }
    else if (mcapRank <= 500) { totalPoints += 5;  signals.push({ label: `Ranked #${mcapRank} — small cap`, status: 'warn' }) }
    else { totalPoints += 1; signals.push({ label: `Ranked #${mcapRank} — micro cap`, status: 'bad' }) }
  } else {
    signals.push({ label: 'No market cap rank — untracked', status: 'bad' })
    totalPoints += 1
  }

  // Market cap absolute (15 pts)
  maxPoints += 15
  const mcap = cgData?.market_data?.market_cap?.usd ?? 0
  if (mcap > 1e9)      { totalPoints += 15; signals.push({ label: `Market cap $${(mcap/1e9).toFixed(1)}B`, status: 'good' }) }
  else if (mcap > 100e6) { totalPoints += 10; signals.push({ label: `Market cap $${(mcap/1e6).toFixed(0)}M`, status: 'warn' }) }
  else if (mcap > 10e6)  { totalPoints += 5;  signals.push({ label: `Market cap $${(mcap/1e6).toFixed(0)}M — low`, status: 'warn' }) }
  else { totalPoints += 1; signals.push({ label: 'Market cap < $10M — very low', status: 'bad' }) }

  // Liquidity / volume ratio (15 pts)
  maxPoints += 15
  const vol24 = cgData?.market_data?.total_volume?.usd ?? 0
  const liqRatio = mcap > 0 ? vol24 / mcap : 0
  if (liqRatio > 0.1)  { totalPoints += 15; signals.push({ label: `High liquidity (${(liqRatio*100).toFixed(1)}% daily vol/mcap)`, status: 'good' }) }
  else if (liqRatio > 0.02) { totalPoints += 9; signals.push({ label: `Moderate liquidity (${(liqRatio*100).toFixed(1)}% vol/mcap)`, status: 'warn' }) }
  else { totalPoints += 1; signals.push({ label: 'Low liquidity — exit risk', status: 'bad' }) }

  // Volatility risk — 24h price change (10 pts) — new signal
  maxPoints += 10
  const chg24h = cgData?.market_data?.price_change_percentage_24h ?? null
  if (chg24h !== null) {
    const absChg = Math.abs(chg24h)
    if (absChg < 5)       { totalPoints += 10; signals.push({ label: `Low volatility: ${chg24h.toFixed(1)}% (24h)`, status: 'good' }) }
    else if (absChg < 15) { totalPoints += 6;  signals.push({ label: `Moderate volatility: ${chg24h.toFixed(1)}% (24h)`, status: 'warn' }) }
    else { totalPoints += 2;  signals.push({ label: `High volatility: ${chg24h.toFixed(1)}% (24h)`, status: 'bad' }) }
  }

  // ATH drawdown — how far from all-time high (10 pts) — new signal
  maxPoints += 10
  const athChg = cgData?.market_data?.ath_change_percentage?.usd ?? null
  if (athChg !== null) {
    const dropPct = Math.abs(athChg)
    if (dropPct < 30)      { totalPoints += 10; signals.push({ label: `Near ATH — only ${dropPct.toFixed(0)}% below peak`, status: 'good' }) }
    else if (dropPct < 70) { totalPoints += 6;  signals.push({ label: `${dropPct.toFixed(0)}% below ATH`, status: 'warn' }) }
    else if (dropPct < 90) { totalPoints += 3;  signals.push({ label: `${dropPct.toFixed(0)}% below ATH — significant decline`, status: 'warn' }) }
    else { totalPoints += 0; signals.push({ label: `${dropPct.toFixed(0)}% below ATH — token has collapsed`, status: 'bad' }) }
  }

  // Multi-chain presence (5 pts) — new signal
  maxPoints += 5
  const platformCount = Object.keys(cgData?.platforms || {}).length
  if (platformCount >= 5)      { totalPoints += 5; signals.push({ label: `On ${platformCount} blockchains — broad adoption`, status: 'good' }) }
  else if (platformCount >= 2) { totalPoints += 3; signals.push({ label: `On ${platformCount} blockchains`, status: 'warn' }) }
  else if (platformCount === 1){ totalPoints += 1; signals.push({ label: 'Single-chain only', status: 'warn' }) }
  else { signals.push({ label: 'No on-chain contract found', status: 'bad' }) }

  // Developer activity (10 pts)
  maxPoints += 10
  const devScore = cgData?.developer_score ?? 0
  const devPts = Math.round((devScore / 100) * 10)
  totalPoints += devPts
  signals.push({
    label: `Developer activity: ${devScore.toFixed(0)}/100`,
    status: devScore > 50 ? 'good' : devScore > 20 ? 'warn' : 'bad',
  })

  // ── 2. GoPlus Security API ────────────────────────────────────────────
  const platforms = cgData?.platforms || {}
  const chainEntry = Object.entries(platforms).find(([chain]) => CHAIN_MAP[chain])
  if (chainEntry) {
    const [chainName, contractAddr] = chainEntry
    const chainId = CHAIN_MAP[chainName]
    if (contractAddr && typeof chainId === 'number') {
      const gpData = await fetchJSON(`${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${contractAddr}`)
      const info = gpData?.result?.[contractAddr.toLowerCase()]

      if (info) {
        // Honeypot (30 pts)
        maxPoints += 30
        if (info.is_honeypot === '0') { totalPoints += 30; signals.push({ label: 'Not a honeypot ✓', status: 'good' }) }
        else if (info.is_honeypot === '1') { signals.push({ label: '⚠️ HONEYPOT DETECTED — cannot sell', status: 'bad' }) }
        else { totalPoints += 12; signals.push({ label: 'Honeypot status unverified', status: 'warn' }) }

        // Contract verified / open source (8 pts)
        maxPoints += 8
        if (info.is_open_source === '1') { totalPoints += 8; signals.push({ label: 'Contract verified & open source ✓', status: 'good' }) }
        else if (info.is_open_source === '0') { signals.push({ label: 'Contract NOT verified — unaudited code', status: 'bad' }) }
        else { totalPoints += 4; signals.push({ label: 'Contract verification unknown', status: 'warn' }) }

        // Mint authority (8 pts) — new check
        maxPoints += 8
        if (info.can_mint === '0' || info.can_mint === undefined) {
          totalPoints += 8; signals.push({ label: 'No mint authority — supply is fixed ✓', status: 'good' })
        } else if (info.can_mint === '1') {
          signals.push({ label: 'Owner can mint new tokens — inflation risk', status: 'bad' })
        }

        // Owner renounced (8 pts)
        maxPoints += 8
        if (info.owner_address === '' || info.can_take_back_ownership === '0') {
          totalPoints += 8; signals.push({ label: 'Ownership renounced ✓', status: 'good' })
        } else if (info.owner_address) {
          totalPoints += 3; signals.push({ label: 'Owner can modify contract', status: 'warn' })
        }

        // Trading cooldown / transfer restrictions (6 pts) — new
        maxPoints += 6
        if (info.trading_cooldown === '0' && info.transfer_pausable === '0') {
          totalPoints += 6; signals.push({ label: 'No transfer restrictions ✓', status: 'good' })
        } else if (info.transfer_pausable === '1') {
          signals.push({ label: 'Owner can pause all transfers', status: 'bad' })
        } else {
          totalPoints += 3; signals.push({ label: 'Some transfer restrictions present', status: 'warn' })
        }

        // Buy/sell tax (12 pts)
        const buyTax  = parseFloat(info.buy_tax  || '0') * 100
        const sellTax = parseFloat(info.sell_tax || '0') * 100
        maxPoints += 12
        if (buyTax === 0 && sellTax === 0) {
          totalPoints += 12; signals.push({ label: 'Zero buy/sell tax ✓', status: 'good' })
        } else if (buyTax > 10 || sellTax > 10) {
          signals.push({ label: `High tax: buy ${buyTax.toFixed(1)}% / sell ${sellTax.toFixed(1)}%`, status: 'bad' })
        } else {
          totalPoints += 7; signals.push({ label: `Tax: buy ${buyTax.toFixed(1)}% / sell ${sellTax.toFixed(1)}%`, status: 'warn' })
        }

        // Holder concentration (12 pts)
        const holders = info.holders || []
        if (holders.length > 0) {
          maxPoints += 12
          const top10Pct = holders.slice(0, 10).reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100
          if (top10Pct < 20)      { totalPoints += 12; signals.push({ label: `Top 10 wallets: ${top10Pct.toFixed(1)}% — well distributed`, status: 'good' }) }
          else if (top10Pct < 40) { totalPoints += 8;  signals.push({ label: `Top 10 wallets: ${top10Pct.toFixed(1)}% — somewhat concentrated`, status: 'warn' }) }
          else if (top10Pct < 60) { totalPoints += 4;  signals.push({ label: `Top 10 wallets: ${top10Pct.toFixed(1)}% — concentrated`, status: 'warn' }) }
          else { signals.push({ label: `Top 10 wallets: ${top10Pct.toFixed(1)}% — whale dominated`, status: 'bad' }) }
        }
      }
    }
  }

  const rawScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 50
  const score = Math.max(5, Math.min(100, rawScore))
  const grade = score >= 80 ? 'SAFE' : score >= 60 ? 'MODERATE' : score >= 35 ? 'HIGH RISK' : 'DANGER'
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#f59e0b' : score >= 35 ? '#f87171' : '#ef4444'

  const result = { score, grade, color, signals }
  const newCache = loadCache()
  newCache[coinId] = { result, ts: Date.now() }
  saveCache(newCache)
  return result
}

// ── Portfolio summary ─────────────────────────────────────────────────────
function PortfolioRiskSummary({ results, holdings }) {
  if (!results || Object.keys(results).length === 0) return null

  const scanned = holdings.filter(h => results[h.coin_id])
  if (scanned.length === 0) return null

  const totalValue = scanned.reduce((s, h) => s + (h.value || 0), 0)

  // Weighted average score by portfolio value
  let weightedScore = 0
  scanned.forEach(h => {
    const r = results[h.coin_id]
    const weight = totalValue > 0 ? (h.value || 0) / totalValue : 1 / scanned.length
    weightedScore += r.score * weight
  })
  weightedScore = Math.round(weightedScore)

  const gradeCounts = { SAFE: 0, MODERATE: 0, 'HIGH RISK': 0, DANGER: 0 }
  scanned.forEach(h => { gradeCounts[results[h.coin_id].grade]++ })

  const gradeColor = weightedScore >= 80 ? '#34d399' : weightedScore >= 60 ? '#f59e0b' : weightedScore >= 35 ? '#f87171' : '#ef4444'
  const gradeLabel = weightedScore >= 80 ? 'SAFE' : weightedScore >= 60 ? 'MODERATE' : weightedScore >= 35 ? 'HIGH RISK' : 'DANGER'

  // Most dangerous holding
  const worst = scanned.reduce((a, h) => results[h.coin_id].score < results[a.coin_id].score ? h : a, scanned[0])
  const worstResult = results[worst.coin_id]

  return (
    <div className="glass-card risk-portfolio-summary">
      <div className="risk-summary-header">Portfolio Risk Overview</div>
      <div className="risk-summary-body">
        <div className="risk-summary-score-wrap">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
            <circle cx="40" cy="40" r="30" fill="none" stroke={gradeColor} strokeWidth="6"
              strokeDasharray={`${(weightedScore/100)*(2*Math.PI*30)} ${2*Math.PI*30}`}
              strokeDashoffset={2*Math.PI*30*0.25} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            <text x="40" y="40" textAnchor="middle" dominantBaseline="central"
              fontSize="16" fontWeight="800" fill={gradeColor} fontFamily="Inter,sans-serif">
              {weightedScore}
            </text>
          </svg>
          <div className="risk-summary-grade" style={{ color: gradeColor }}>{gradeLabel}</div>
          <div className="risk-summary-label muted">Portfolio Score</div>
        </div>
        <div className="risk-summary-breakdown">
          {Object.entries(gradeCounts).filter(([, v]) => v > 0).map(([grade, count]) => {
            const c = grade === 'SAFE' ? '#34d399' : grade === 'MODERATE' ? '#f59e0b' : grade === 'HIGH RISK' ? '#f87171' : '#ef4444'
            return (
              <div key={grade} className="risk-summary-grade-row">
                <span className="risk-summary-dot" style={{ background: c }} />
                <span style={{ color: c, fontWeight: 700 }}>{count}×</span>
                <span className="muted">{grade}</span>
              </div>
            )
          })}
          {worstResult.score < 80 && (
            <div className="risk-summary-worst">
              <span className="muted">Most risky:</span>
              <span style={{ color: worstResult.color, fontWeight: 700 }}>
                {worst.coin_symbol?.toUpperCase()} ({worstResult.score})
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
function RiskCard({ holding, onResult, forceRefresh }) {
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState(false)

  const runScan = useCallback((refresh = false) => {
    setLoading(true)
    setResult(null)
    scoreToken(holding.coin_id, refresh).then(r => {
      setResult(r)
      setLoading(false)
      if (r) {
        track('risk_scan_result', { symbol: holding.coin_symbol, grade: r.grade, score: r.score })
        onResult?.(holding.coin_id, r)
      }
    }).catch(() => setLoading(false))
  }, [holding.coin_id, holding.coin_symbol, onResult])

  useEffect(() => { runScan(forceRefresh) }, [holding.coin_id, forceRefresh])

  function handleRescan(e) {
    e.stopPropagation()
    track('risk_rescan', { symbol: holding.coin_symbol })
    runScan(true)
  }

  return (
    <div className="glass-card risk-card" onClick={() => {
      if (result) {
        setExpanded(v => !v)
        if (!expanded) track('risk_card_expand', { symbol: holding.coin_symbol, grade: result.grade })
      }
    }}>
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
              <button className="risk-rescan-btn" onClick={handleRescan} title="Re-scan">↻</button>
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

// ── Scam Catcher — check any contract address ──────────────────────────────
async function checkScamAddress(input) {
  input = input.trim()
  const flags = []
  let verdict = 'UNKNOWN'
  let verdictColor = '#f59e0b'

  // Check if it looks like a contract address
  const isEthAddr = /^0x[0-9a-fA-F]{40}$/.test(input)
  const isSolAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input)

  if (!isEthAddr && !isSolAddr) {
    // Try as CoinGecko ID or symbol search
    const search = await fetchJSON(`${COINGECKO_BASE}/search?query=${encodeURIComponent(input)}`)
    const coin = search?.coins?.[0]
    if (!coin) return { verdict: 'NOT FOUND', verdictColor: '#6b7280', flags: [{ icon: '?', text: 'Token not found on CoinGecko — may be very new or unlisted', color: '#f59e0b' }], score: null }
    // recurse with the coin id
    return checkScamAddress(coin.id)
  }

  // EVM contract check via GoPlus
  if (isEthAddr) {
    // Try major chains
    const chains = [1, 56, 137, 43114, 42161, 10, 8453]
    let info = null
    for (const chainId of chains) {
      const gp = await fetchJSON(`${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${input}`)
      const res = gp?.result?.[input.toLowerCase()]
      if (res && (res.is_honeypot !== undefined || res.token_name)) { info = res; break }
    }

    if (!info) {
      flags.push({ icon: '?', text: 'Contract not found on any major EVM chain — may be on a smaller chain or not a token', color: '#f59e0b' })
      return { verdict: 'UNVERIFIED', verdictColor: '#f59e0b', flags, score: null }
    }

    let danger = 0

    if (info.is_honeypot === '1') {
      danger += 40; flags.push({ icon: '🚨', text: 'HONEYPOT — you cannot sell this token', color: '#ef4444' })
    } else if (info.is_honeypot === '0') {
      flags.push({ icon: '✓', text: 'Not a honeypot — selling is possible', color: '#34d399' })
    }

    if (info.is_open_source === '0') {
      danger += 15; flags.push({ icon: '✕', text: 'Contract is NOT verified — hidden code', color: '#f87171' })
    } else if (info.is_open_source === '1') {
      flags.push({ icon: '✓', text: 'Contract is open source and verified', color: '#34d399' })
    }

    if (info.can_mint === '1') {
      danger += 15; flags.push({ icon: '⚠', text: 'Owner can mint unlimited new tokens', color: '#f87171' })
    }

    if (info.transfer_pausable === '1') {
      danger += 10; flags.push({ icon: '⚠', text: 'Owner can pause/freeze all transfers', color: '#f87171' })
    }

    const buyTax  = parseFloat(info.buy_tax  || '0') * 100
    const sellTax = parseFloat(info.sell_tax || '0') * 100
    if (sellTax > 30) {
      danger += 20; flags.push({ icon: '🚨', text: `Sell tax is ${sellTax.toFixed(0)}% — effectively a trap`, color: '#ef4444' })
    } else if (sellTax > 10) {
      danger += 10; flags.push({ icon: '⚠', text: `High sell tax: ${sellTax.toFixed(1)}%`, color: '#f87171' })
    } else if (buyTax > 0 || sellTax > 0) {
      flags.push({ icon: '⚠', text: `Tax: buy ${buyTax.toFixed(1)}% / sell ${sellTax.toFixed(1)}%`, color: '#f59e0b' })
    } else {
      flags.push({ icon: '✓', text: 'Zero buy/sell tax', color: '#34d399' })
    }

    const holders = info.holders || []
    if (holders.length > 0) {
      const top3Pct = holders.slice(0, 3).reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100
      if (top3Pct > 50) {
        danger += 15; flags.push({ icon: '⚠', text: `Top 3 wallets hold ${top3Pct.toFixed(0)}% — extreme whale concentration`, color: '#f87171' })
      } else if (top3Pct > 20) {
        flags.push({ icon: '⚠', text: `Top 3 wallets hold ${top3Pct.toFixed(0)}%`, color: '#f59e0b' })
      } else {
        flags.push({ icon: '✓', text: `Good distribution — top 3 hold ${top3Pct.toFixed(0)}%`, color: '#34d399' })
      }
    }

    if (info.token_name) flags.unshift({ icon: 'ℹ', text: `Token: ${info.token_name} (${info.token_symbol})`, color: 'rgba(255,255,255,0.5)' })

    const score = Math.max(0, 100 - danger)
    if (danger >= 40) { verdict = 'LIKELY SCAM';    verdictColor = '#ef4444' }
    else if (danger >= 20) { verdict = 'HIGH RISK'; verdictColor = '#f87171' }
    else if (danger >= 5)  { verdict = 'CAUTION';   verdictColor = '#f59e0b' }
    else { verdict = 'LOOKS CLEAN'; verdictColor = '#34d399' }

    return { verdict, verdictColor, flags, score, name: info.token_name }
  }

  // Solana — basic CoinGecko lookup
  const search = await fetchJSON(`${COINGECKO_BASE}/coins/solana/contract/${input}`)
  if (!search?.id) {
    flags.push({ icon: '?', text: 'Not found on CoinGecko — unverified Solana token', color: '#f59e0b' })
    flags.push({ icon: '⚠', text: 'No market data available — exercise extreme caution', color: '#f87171' })
    return { verdict: 'UNVERIFIED', verdictColor: '#f87171', flags, score: null }
  }

  return checkScamAddress(search.id)
}

function ScamCatcher() {
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)

  async function handleCheck() {
    if (!input.trim()) return
    setLoading(true)
    setResult(null)
    track('scam_check', { input_type: input.startsWith('0x') ? 'evm_address' : input.length > 30 ? 'sol_address' : 'name' })
    try {
      const r = await checkScamAddress(input)
      setResult(r)
      track('scam_check_result', { verdict: r.verdict })
    } catch {
      setResult({ verdict: 'ERROR', verdictColor: '#6b7280', flags: [{ icon: '!', text: 'Could not fetch data — check your connection', color: '#f59e0b' }], score: null })
    }
    setLoading(false)
  }

  return (
    <div className="glass-card risk-scam-card">
      <div className="risk-scam-header">
        <span style={{ fontSize: '1.2rem' }}>🔍</span>
        <span className="risk-scam-title">Scam Catcher</span>
      </div>
      <p className="risk-scam-desc">
        Enter a token name, CoinGecko ID, or contract address (EVM / Solana) to check for honeypots, hidden taxes, mint traps, and whale concentration.
      </p>
      <div className="risk-scam-input-row">
        <input
          className="risk-scam-input"
          placeholder="e.g. 0x1f9840... or pepe or solana-token-id"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCheck()}
        />
        <button className="risk-scam-btn" onClick={handleCheck} disabled={loading || !input.trim()}>
          {loading ? '…' : 'Check'}
        </button>
      </div>

      {result && (
        <div className="risk-scam-result">
          <div className="risk-scam-verdict">
            <span className="risk-scam-verdict-icon">
              {result.verdict === 'LOOKS CLEAN' ? '✅' : result.verdict === 'LIKELY SCAM' ? '🚨' : result.verdict === 'HIGH RISK' ? '🔴' : '⚠️'}
            </span>
            <span className="risk-scam-verdict-text" style={{ color: result.verdictColor }}>
              {result.verdict}
              {result.name ? ` — ${result.name}` : ''}
              {result.score !== null ? ` (${result.score}/100)` : ''}
            </span>
          </div>
          <div className="risk-scam-flags">
            {result.flags.map((f, i) => (
              <div key={i} className="risk-scam-flag">
                <span style={{ color: f.color, fontWeight: 700, flexShrink: 0 }}>{f.icon}</span>
                <span style={{ color: f.color === 'rgba(255,255,255,0.5)' ? f.color : undefined }}>{f.text}</span>
              </div>
            ))}
          </div>
          <p className="risk-scam-note">Data from GoPlus Security Labs. Always DYOR before investing.</p>
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

export default function RiskScanner({ enriched }) {
  const [results, setResults]   = useState({})
  const [scanGen, setScanGen]   = useState(0) // bump to force re-scan all

  const cryptoHoldings = enriched.filter(h =>
    !h.coin_id.startsWith('metal:') && !h.coin_id.startsWith('stock:') && !h.coin_id.startsWith('fiat:')
  )

  // Sort by score ascending (most risky first) once results come in
  const sorted = [...cryptoHoldings].sort((a, b) => {
    const sa = results[a.coin_id]?.score ?? 999
    const sb = results[b.coin_id]?.score ?? 999
    return sa - sb
  })

  function handleResult(coinId, r) {
    setResults(prev => ({ ...prev, [coinId]: r }))
  }

  function rescanAll() {
    setResults({})
    setScanGen(g => g + 1)
    track('risk_rescan_all', { holdings_count: cryptoHoldings.length })
  }

  return (
    <div className="risk-root">
      {/* Portfolio summary */}
      <PortfolioRiskSummary results={results} holdings={cryptoHoldings} />

      {/* Legend + rescan */}
      <div className="glass-card risk-legend">
        <div className="risk-legend-header">
          <p className="risk-legend-title">Risk Score Guide</p>
          {cryptoHoldings.length > 0 && (
            <button className="risk-rescan-all-btn" onClick={rescanAll}>↻ Re-scan All</button>
          )}
        </div>
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
          Scores combine CoinGecko market data (age, cap rank, liquidity, volatility, ATH, dev activity)
          + GoPlus on-chain security (honeypot, tax, mint authority, holder concentration).
          Sorted by risk — highest risk first.
        </p>
      </div>

      {/* Scam Catcher — always visible */}
      <ScamCatcher />

      {cryptoHoldings.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <p className="muted">Add crypto holdings to see risk scores.</p>
        </div>
      ) : (
        sorted.map(h => (
          <RiskCard
            key={h.coin_id + '-' + scanGen}
            holding={h}
            onResult={handleResult}
            forceRefresh={scanGen > 0}
          />
        ))
      )}
    </div>
  )
}
