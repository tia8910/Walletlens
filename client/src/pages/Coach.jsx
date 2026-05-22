import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'

const AIDecisionEngine = lazy(() => import('../components/AIDecisionEngine'))

// ── Wallet Evaluation (mirrored from Dashboard for standalone use) ─────────
const EVAL_CATEGORIES = [
  {
    id: 'btc_anchor', label: 'BTC Anchor', icon: '₿', color: '#f7931a',
    check: (enriched, totalValue) => {
      const btc = enriched.find(h => h.coin_id === 'bitcoin' || h.coin_symbol?.toLowerCase() === 'btc')
      if (!btc) return { pass: false, score: 0, tip: 'Add Bitcoin as a portfolio anchor. BTC historically acts as a safe haven during crypto downturns and gives your portfolio a stability base.' }
      const w = btc.value / totalValue * 100
      if (w < 5) return { pass: false, score: 40, tip: `BTC is only ${w.toFixed(1)}% of your portfolio. Consider increasing to at least 20% — it reduces volatility and acts as a hedge.` }
      if (w > 70) return { pass: true, score: 70, tip: `BTC is ${w.toFixed(1)}% of your portfolio — heavily concentrated. Consider diversifying to other quality assets.` }
      return { pass: true, score: 100, tip: `Solid BTC anchor at ${w.toFixed(1)}% — gives your portfolio a stable foundation.` }
    },
  },
  {
    id: 'eth_exposure', label: 'ETH / Smart Contract', icon: 'Ξ', color: '#627eea',
    check: (enriched, totalValue) => {
      const eth = enriched.find(h => h.coin_id === 'ethereum' || h.coin_symbol?.toLowerCase() === 'eth')
      const hasAlt = enriched.some(h => ['solana','cardano','avalanche-2','polkadot'].includes(h.coin_id))
      if (!eth && !hasAlt) return { pass: false, score: 0, tip: 'No smart-contract layer exposure. ETH (or SOL/ADA/AVAX) drives DeFi, NFTs, and Web3 — missing this entire sector.' }
      const asset = eth || enriched.find(h => ['solana','cardano','avalanche-2','polkadot'].includes(h.coin_id))
      const w = asset.value / totalValue * 100
      return { pass: true, score: 90, tip: `Good — ${asset.coin_symbol?.toUpperCase()} covers your smart-contract exposure at ${w.toFixed(1)}%.` }
    },
  },
  {
    id: 'diversification', label: 'Diversification', icon: '⚖️', color: 'var(--g)',
    check: (enriched, totalValue) => {
      const n = enriched.length
      const weights = enriched.map(h => h.value / totalValue)
      const hhi = weights.reduce((s, w) => s + w * w, 0)
      if (n < 3) return { pass: false, score: 10, tip: `Only ${n} holding${n===1?'':'s'} — extremely concentrated. Spread across 5–10 assets to reduce single-coin risk.` }
      if (hhi > 0.5) return { pass: false, score: 30, tip: `One coin dominates your portfolio (HHI ${hhi.toFixed(2)}). Rebalance so no single asset exceeds 50%.` }
      if (n < 5) return { pass: false, score: 60, tip: `${n} holdings is okay but aim for 5–10. Add 1–2 more quality assets from different sectors.` }
      return { pass: true, score: 95, tip: `Well diversified across ${n} assets with balanced weights.` }
    },
  },
  {
    id: 'stablecoin', label: 'Stablecoin Reserve', icon: '🏦', color: '#60a5fa',
    check: (enriched, totalValue) => {
      const stables = ['tether','usd-coin','dai','binance-usd','true-usd','frax']
      const sv = enriched.filter(h => stables.includes(h.coin_id) || ['usdt','usdc','dai','busd','tusd','frax'].includes(h.coin_symbol?.toLowerCase())).reduce((s,h) => s+h.value, 0)
      const pct = sv / totalValue * 100
      if (pct === 0) return { pass: false, score: 0, tip: 'No stablecoin reserve. Holding 5–15% in USDT/USDC gives you dry powder to buy dips without selling at a loss.' }
      if (pct < 5)  return { pass: false, score: 50, tip: `Only ${pct.toFixed(1)}% in stablecoins. Increase to 5–15% for a proper "buy the dip" reserve.` }
      if (pct > 40) return { pass: true,  score: 65, tip: `${pct.toFixed(1)}% in stablecoins is high — you might be over-hedged and missing upside. Deploy some into quality assets.` }
      return { pass: true, score: 100, tip: `${pct.toFixed(1)}% stablecoin reserve — perfect dry powder for opportunities.` }
    },
  },
  {
    id: 'large_cap', label: 'Large-Cap Weight', icon: '🐋', color: '#3b82f6',
    check: (enriched, totalValue) => {
      const lc = new Set(['bitcoin','ethereum','ripple','binancecoin','solana','cardano','avalanche-2','polkadot','chainlink','litecoin'])
      const lcVal = enriched.filter(h => lc.has(h.coin_id)).reduce((s,h) => s+h.value, 0)
      const pct = lcVal / totalValue * 100
      if (pct < 40) return { pass: false, score: 20, tip: `Only ${pct.toFixed(1)}% in large-cap coins. Heavy small-cap exposure means higher risk of total loss — add more BTC/ETH/SOL.` }
      if (pct < 60) return { pass: false, score: 70, tip: `${pct.toFixed(1)}% large-cap. Aim for at least 60% in proven coins to anchor your portfolio against micro-cap wipeouts.` }
      return { pass: true, score: 95, tip: `${pct.toFixed(1)}% large-cap — solid foundation that absorbs volatility.` }
    },
  },
  {
    id: 'pnl_health', label: 'P&L Health', icon: '💚', color: 'var(--g)',
    check: (enriched, totalValue) => {
      if (!enriched.length) return { pass: false, score: 0, tip: 'No holdings to evaluate.' }
      const avgPnlPct = enriched.reduce((s, h) => s + (h.pnl / Math.max(h.total_invested || h.invested || 1, 1)) * (h.value / totalValue), 0) * 100
      if (avgPnlPct < -30) return { pass: false, score: 10, tip: `Portfolio is down ${Math.abs(avgPnlPct).toFixed(1)}% overall. Consider DCA-ing into your strongest convictions to lower average cost.` }
      if (avgPnlPct < 0) return { pass: false, score: 50, tip: `Portfolio is slightly underwater (${avgPnlPct.toFixed(1)}%). Hold quality assets and average down on dips if you believe in them.` }
      if (avgPnlPct > 100) return { pass: true, score: 100, tip: `Up ${avgPnlPct.toFixed(1)}%! Consider taking some profits into stablecoins to lock in gains.` }
      return { pass: true, score: 90, tip: `Portfolio up ${avgPnlPct.toFixed(1)}% — healthy. Keep managing risk.` }
    },
  },
]

function computeEval(enriched, totalValue) {
  if (!enriched.length) return null
  const results = EVAL_CATEGORIES.map(cat => ({ ...cat, ...cat.check(enriched, totalValue) }))
  const overall = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
  return { results, overall, missing: results.filter(r => !r.pass), strong: results.filter(r => r.pass) }
}

function ScoreRing({ score }) {
  const r = 52, circ = 2 * Math.PI * r
  const color = score >= 80 ? 'var(--g)' : score >= 55 ? '#fbbf24' : '#f87171'
  const label = score >= 80 ? 'Strong' : score >= 55 ? 'Needs Work' : 'At Risk'
  return (
    <div className="coach-ring-wrap">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10"/>
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${circ * score / 100} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 65 65)" style={{ transition: 'stroke-dasharray 1.2s ease' }}/>
      </svg>
      <div className="coach-ring-inner">
        <div className="coach-ring-score" style={{ color }}>{score}</div>
        <div className="coach-ring-label" style={{ color }}>{label}</div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function Coach() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio]     = useState([])
  const [prices, setPrices]           = useState({})
  const [transactions, setTransactions] = useState([])
  const [targets, setTargets]         = useState([])
  const [loaded, setLoaded]           = useState(false)
  const [evalExpanded, setEvalExpanded] = useState(null)
  const [activeSection, setActiveSection] = useState('engine')

  useEffect(() => {
    track('coach_page_view')
    async function load() {
      const [p, txs, ct] = await Promise.all([
        api.getPortfolio(), api.getTransactions(), api.getCoinTargets(),
      ])
      setPortfolio(p || [])
      setTransactions(txs || [])
      setTargets(Object.entries(ct || {}).map(([coin_id, v]) => ({ coin_id, ...v })))
      if (p?.length) {
        const ids = p.map(h => h.coin_id).join(',')
        api.getPrices(ids).then(px => setPrices(px || {})).catch(() => {})
      }
      setLoaded(true)
    }
    load()
  }, [])

  const { enriched, totalValue, totalInvested } = useMemo(() => {
    const raw = portfolio.map(h => {
      const price = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value = h.amount * price
      const invested = h.total_invested || 0
      const pnl = value - invested
      return { ...h, price, value, invested, pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : 0 }
    }).sort((a, b) => b.value - a.value)
    const totalValue = raw.reduce((s, h) => s + h.value, 0)
    const totalInvested = raw.reduce((s, h) => s + h.invested, 0)
    return { enriched: raw, totalValue, totalInvested }
  }, [portfolio, prices])

  const eval_ = useMemo(() => computeEval(enriched, totalValue), [enriched, totalValue])
  const hasPrices = enriched.some(h => h.value > 0)

  const SECTIONS = [
    { id: 'engine',  label: 'Decision Engine', icon: '⚡' },
    { id: 'eval',    label: 'Wallet Score',    icon: '🔍' },
    { id: 'actions', label: 'AI Analysis',     icon: '🤖' },
  ]

  return (
    <div className="dvx-page">

      {/* ── Hero header ── */}
      <div className="coach-hero">
        <div className="coach-hero-glow" />
        <div className="coach-hero-inner">
          <div className="coach-hero-icon">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
              <line x1="9" y1="21" x2="15" y2="21"/>
              <line x1="10" y1="17" x2="10" y2="21"/>
              <line x1="14" y1="17" x2="14" y2="21"/>
            </svg>
          </div>
          <div>
            <h1 className="coach-hero-title">AI Coach</h1>
            <p className="coach-hero-sub">Decision engine · wallet health · portfolio advice</p>
          </div>
        </div>
        {hasPrices && eval_ && (
          <div className="coach-hero-score">
            <div className="coach-score-pill" style={{
              color: eval_.overall >= 80 ? 'var(--g)' : eval_.overall >= 55 ? '#fbbf24' : '#f87171',
              borderColor: eval_.overall >= 80 ? 'rgba(0,200,83,0.3)' : eval_.overall >= 55 ? 'rgba(251,191,36,0.3)' : 'rgba(248,113,113,0.3)',
            }}>
              <span className="coach-score-num">{eval_.overall}</span>
              <span className="coach-score-lbl">/ 100</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Section tabs ── */}
      <div className="coach-tabs">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`coach-tab${activeSection === s.id ? ' coach-tab-active' : ''}`}
            onClick={() => { setActiveSection(s.id); track('coach_section', { section: s.id }) }}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {loaded && enriched.length === 0 && (
        <div className="glass-card" style={{ textAlign:'center', padding:'3rem 1.5rem', margin:'1rem 1rem' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>🧠</div>
          <h3 style={{ marginBottom:'0.5rem' }}>Nothing to Coach Yet</h3>
          <p className="muted" style={{ marginBottom:'1.25rem' }}>Add your first trade so the AI can analyse your portfolio and give personalised advice.</p>
          <button className="coach-cta-btn" onClick={() => navigate('/transactions')}>
            + Add First Trade
          </button>
        </div>
      )}

      {/* ── Decision Engine ── */}
      {activeSection === 'engine' && enriched.length > 0 && (
        <div style={{ padding: '0 0 1.5rem' }}>
          {!hasPrices && (
            <div className="coach-loading-bar">
              <span className="coach-loading-dot" />
              Fetching live prices to generate signals…
            </div>
          )}
          <Suspense fallback={<div style={{ padding:'2rem', textAlign:'center', color:'var(--text-sub)' }}>Loading engine…</div>}>
            <AIDecisionEngine
              enriched={enriched}
              prices={prices}
              transactions={transactions}
              totalValue={totalValue}
              totalInvested={totalInvested}
            />
          </Suspense>
        </div>
      )}

      {/* ── Wallet Evaluation ── */}
      {activeSection === 'eval' && enriched.length > 0 && (
        <div style={{ padding: '0 0 1.5rem' }}>
          {!eval_ ? (
            <div style={{ padding:'2rem', textAlign:'center', color:'var(--text-sub)' }}>Calculating…</div>
          ) : (
            <>
              {/* Score header */}
              <div className="glass-card coach-eval-header">
                <div className="coach-eval-header-left">
                  <h2 className="coach-eval-title">Wallet Evaluation</h2>
                  <p className="muted" style={{ margin:'0.25rem 0 0', fontSize:'0.82rem' }}>Portfolio health vs best practices</p>
                  {eval_.missing.length > 0 ? (
                    <div className="eval-missing-count">⚠️ {eval_.missing.length} gap{eval_.missing.length > 1 ? 's' : ''} found — tap each to fix</div>
                  ) : (
                    <div className="eval-missing-count" style={{ color:'var(--g)' }}>✅ All checks passed — excellent wallet health!</div>
                  )}
                </div>
                <ScoreRing score={eval_.overall} />
              </div>

              {/* Category cards */}
              <div className="eval-grid" style={{ padding: '0 1rem' }}>
                {eval_.results.map(cat => (
                  <div key={cat.id}
                    className={`eval-cat-card ${cat.pass ? 'eval-cat-pass' : 'eval-cat-fail'} ${evalExpanded === cat.id ? 'eval-cat-open' : ''}`}
                    onClick={() => { const o = evalExpanded !== cat.id; setEvalExpanded(o ? cat.id : null); if (o) track('coach_eval_expand', { cat: cat.id }) }}
                    style={{ '--eval-color': cat.color }}
                  >
                    <div className="eval-cat-header">
                      <span className="eval-cat-icon" style={{ background: cat.color + '22', color: cat.color }}>{cat.icon}</span>
                      <div className="eval-cat-info">
                        <div className="eval-cat-label">{cat.label}</div>
                        <div className="eval-cat-bar-wrap">
                          <div className="eval-cat-bar" style={{ width: `${cat.score}%`, background: cat.color }} />
                        </div>
                      </div>
                      <div className="eval-cat-right">
                        <span className="eval-cat-score" style={{ color: cat.color }}>{cat.score}</span>
                        <span className={`eval-cat-badge ${cat.pass ? 'eval-badge-pass' : 'eval-badge-fail'}`}>{cat.pass ? '✓' : '✗'}</span>
                      </div>
                    </div>
                    {evalExpanded === cat.id && (
                      <div className="eval-cat-tip"><span style={{ marginRight:'0.5rem' }}>{cat.pass ? '💡' : '🔧'}</span>{cat.tip}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── AI Analysis ── */}
      {activeSection === 'actions' && (
        <div style={{ padding: '1rem' }}>
          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'tools', tool: 'ai' } }); track('coach_action', { action: 'ai_analysis' }) }}>
            <div className="coach-action-icon" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Full AI Portfolio Analysis</div>
              <div className="coach-action-sub">Deep-dive analysis of your holdings, risk profile, and personalized recommendations powered by Claude AI</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'targets' } }); track('coach_action', { action: 'targets' }) }}>
            <div className="coach-action-icon" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Set Profit Targets</div>
              <div className="coach-action-sub">Plan your exits before emotions take over — set multi-level sell targets for each holding</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'alerts' } }); track('coach_action', { action: 'alerts' }) }}>
            <div className="coach-action-icon" style={{ background: 'rgba(0,200,83,0.13)', color: 'var(--g)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Smart Price Alerts</div>
              <div className="coach-action-sub">Get notified when your coins hit key levels — never miss a breakout or a crash warning</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'tools', tool: 'risk' } }); track('coach_action', { action: 'risk' }) }}>
            <div className="coach-action-icon" style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Risk Scanner</div>
              <div className="coach-action-sub">Scan your portfolio for concentration risk, liquidity risk, and volatility exposure</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/alpha'); track('coach_action', { action: 'alpha' }) }}>
            <div className="coach-action-icon" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20L12 4l6 16"/><path d="M8.5 14h7"/><circle cx="12" cy="4" r="1" fill="currentColor" stroke="none"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Alpha Signals</div>
              <div className="coach-action-sub">Price signals, buy/sell indicators, and on-chain metrics for your holdings</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>
        </div>
      )}

    </div>
  )
}
