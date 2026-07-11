import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { assetClass, getStockSector } from '../data/assets'
import { track } from '../analytics'
import Icon from '../components/Icon'
import Alpha from './Alpha'

const AIDecisionEngine = lazy(() => import('../components/AIDecisionEngine'))

// ── Asset-mix helpers ──────────────────────────────────────────────────────
// The wallet evaluation adapts to what's actually in the portfolio: a stock
// investor should never be told to "buy Bitcoin", and a crypto investor
// shouldn't be graded on equity sectors. We compute the value share of each
// asset class first, then only run the checks that are relevant.
const STABLE_IDS = ['tether','usd-coin','dai','binance-usd','true-usd','frax','usdd','gemini-dollar','paxos-standard']
const STABLE_SYMS = ['usdt','usdc','dai','busd','tusd','frax','usdd','gusd','usdp','pyusd','fdusd']
const isStable = (h) => STABLE_IDS.includes(h.coin_id) || STABLE_SYMS.includes(h.coin_symbol?.toLowerCase())
const isMetalClass = (k) => k === 'gold' || k === 'silver' || k === 'copper' || k === 'platinum'

function assetMix(enriched, totalValue) {
  const mix = { crypto: 0, stock: 0, metal: 0, cash: 0, bond: 0, other: 0 }
  if (!totalValue) return mix
  for (const h of enriched) {
    const k = assetClass(h.coin_id)
    const share = h.value / totalValue
    if (isStable(h) || k === 'fiat') mix.cash += share
    else if (k === 'crypto') mix.crypto += share
    else if (k === 'stock') mix.stock += share
    else if (isMetalClass(k)) mix.metal += share
    else if (k === 'bond') mix.bond += share
    else mix.other += share
  }
  return mix
}

// ── Wallet Evaluation — adaptive checks ────────────────────────────────────
// Each check declares `applies(mix)`: only relevant checks are scored, so the
// overall grade reflects the right rubric for crypto-heavy, stock-heavy, or
// genuinely mixed portfolios. Universal checks always apply.
const EVAL_CATEGORIES = [
  // ── Universal ──
  {
    id: 'asset_mix', label: 'Asset-Class Balance', icon: 'grid', color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue, mix) => {
      const classes = Object.entries(mix).filter(([, v]) => v >= 0.03)
      const n = classes.length
      const top = Math.max(...Object.values(mix))
      if (n <= 1) {
        const only = (classes[0]?.[0] || 'one asset class')
        return { pass: false, score: 25, tip: `Everything is in ${only}. Spreading across uncorrelated classes (e.g. crypto + stocks + gold + cash) is the single biggest way to cut portfolio risk.` }
      }
      if (top > 0.85) return { pass: false, score: 55, tip: `${(top*100).toFixed(0)}% sits in one asset class. Adding a second or third class (stocks, gold, or cash) would hedge a downturn in your dominant one.` }
      if (n >= 3) return { pass: true, score: 100, tip: `Balanced across ${n} asset classes — crypto, equities, metals and cash hedge each other well.` }
      return { pass: true, score: 85, tip: `Spread across ${n} asset classes. A third (e.g. gold or cash) would add another hedge.` }
    },
  },
  {
    id: 'diversification', label: 'Diversification', icon: 'scale', color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue) => {
      const n = enriched.length
      const weights = enriched.map(h => h.value / totalValue)
      const hhi = weights.reduce((s, w) => s + w * w, 0)
      if (n < 3) return { pass: false, score: 10, tip: `Only ${n} holding${n===1?'':'s'} — extremely concentrated. Spread across 5–10 positions to reduce single-name risk.` }
      if (hhi > 0.5) return { pass: false, score: 30, tip: `One position dominates your portfolio (HHI ${hhi.toFixed(2)}). Rebalance so no single holding exceeds 50%.` }
      if (n < 5) return { pass: false, score: 60, tip: `${n} holdings is okay but aim for 5–10. Add 1–2 more quality positions from different sectors or classes.` }
      return { pass: true, score: 95, tip: `Well diversified across ${n} positions with balanced weights.` }
    },
  },
  {
    id: 'cash_reserve', label: 'Cash & Dry Powder', icon: 'bank', color: '#60a5fa',
    check: (enriched, totalValue, mix) => {
      const pct = mix.cash * 100
      if (pct === 0) return { pass: false, score: 30, tip: 'No cash or stablecoin reserve. Holding 5–15% in cash/stablecoins gives you dry powder to buy dips without selling at a loss.' }
      if (pct < 5)  return { pass: false, score: 60, tip: `Only ${pct.toFixed(1)}% in cash/stablecoins. Increasing to 5–15% gives you a proper "buy the dip" reserve.` }
      if (pct > 50) return { pass: true,  score: 65, tip: `${pct.toFixed(1)}% in cash is high — you may be missing market upside. Consider deploying some into quality assets.` }
      return { pass: true, score: 100, tip: `${pct.toFixed(1)}% cash reserve — healthy dry powder for opportunities.` }
    },
  },
  {
    id: 'pnl_health', label: 'P&L Health', icon: 'pulse', color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue) => {
      if (!enriched.length) return { pass: false, score: 0, tip: 'No holdings to evaluate.' }
      const avgPnlPct = enriched.reduce((s, h) => s + (h.pnl / Math.max(h.total_invested || h.invested || 1, 1)) * (h.value / totalValue), 0) * 100
      if (avgPnlPct < -30) return { pass: false, score: 10, tip: `Portfolio is down ${Math.abs(avgPnlPct).toFixed(1)}% overall. Consider DCA-ing into your strongest convictions to lower average cost.` }
      if (avgPnlPct < 0) return { pass: false, score: 50, tip: `Portfolio is slightly underwater (${avgPnlPct.toFixed(1)}%). Hold quality assets and average down on dips if you believe in them.` }
      if (avgPnlPct > 100) return { pass: true, score: 100, tip: `Up ${avgPnlPct.toFixed(1)}%! Consider taking some profits to lock in gains.` }
      return { pass: true, score: 90, tip: `Portfolio up ${avgPnlPct.toFixed(1)}% — healthy. Keep managing risk.` }
    },
  },

  // ── Crypto sleeve (only when crypto is a meaningful part) ──
  {
    id: 'btc_anchor', label: 'BTC Anchor', icon: '₿', color: '#f7931a',
    applies: (mix) => mix.crypto >= 0.1,
    check: (enriched, totalValue, mix) => {
      const cryptoVal = mix.crypto * totalValue
      const btc = enriched.find(h => h.coin_id === 'bitcoin' || h.coin_symbol?.toLowerCase() === 'btc')
      if (!btc) return { pass: false, score: 20, tip: 'No Bitcoin in your crypto sleeve. BTC acts as a safe haven during crypto downturns — consider it as a stability anchor.' }
      const w = btc.value / cryptoVal * 100  // share of the crypto sleeve
      if (w < 20) return { pass: false, score: 50, tip: `BTC is only ${w.toFixed(1)}% of your crypto. Increasing toward 30–40% of the crypto sleeve reduces altcoin volatility.` }
      if (w > 80) return { pass: true, score: 75, tip: `BTC is ${w.toFixed(1)}% of your crypto — a strong anchor, though adding ETH/SOL would broaden crypto exposure.` }
      return { pass: true, score: 100, tip: `Solid BTC anchor at ${w.toFixed(1)}% of your crypto sleeve.` }
    },
  },
  {
    id: 'large_cap', label: 'Large-Cap Crypto', icon: 'whale', color: '#3b82f6',
    applies: (mix) => mix.crypto >= 0.1,
    check: (enriched, totalValue, mix) => {
      const cryptoVal = mix.crypto * totalValue
      const lc = new Set(['bitcoin','ethereum','ripple','binancecoin','solana','cardano','avalanche-2','polkadot','chainlink','litecoin'])
      const lcVal = enriched.filter(h => lc.has(h.coin_id)).reduce((s,h) => s+h.value, 0)
      const pct = lcVal / cryptoVal * 100
      if (pct < 40) return { pass: false, score: 30, tip: `Only ${pct.toFixed(1)}% of your crypto is large-cap. Heavy small-cap exposure raises wipeout risk — anchor with more BTC/ETH/SOL.` }
      if (pct < 60) return { pass: false, score: 70, tip: `${pct.toFixed(1)}% large-cap crypto. Aim for 60%+ in proven coins to absorb micro-cap volatility.` }
      return { pass: true, score: 95, tip: `${pct.toFixed(1)}% of your crypto is large-cap — a solid, volatility-absorbing base.` }
    },
  },

  // ── Stock sleeve (only when stocks are a meaningful part) ──
  {
    id: 'stock_sectors', label: 'Stock Sector Spread', icon: 'bar-chart', color: '#818cf8',
    applies: (mix) => mix.stock >= 0.1,
    check: (enriched) => {
      const stocks = enriched.filter(h => assetClass(h.coin_id) === 'stock')
      const sectors = new Set(stocks.map(h => getStockSector(h.coin_id)).filter(Boolean))
      const n = sectors.size
      if (stocks.length < 2) return { pass: false, score: 40, tip: 'Only one stock position. Single-name risk is high — add 2–3 stocks from different sectors (e.g. Tech, Healthcare, Finance).' }
      if (n === 1) return { pass: false, score: 35, tip: `All your stocks are in ${[...sectors][0]}. Sector concentration is risky — diversify into Healthcare, Finance, Energy, or Consumer.` }
      if (n === 2) return { pass: false, score: 70, tip: `Stocks span 2 sectors (${[...sectors].join(', ')}). Adding a third sector would smooth out sector-specific drawdowns.` }
      return { pass: true, score: 100, tip: `Stocks span ${n} sectors (${[...sectors].join(', ')}) — well diversified across the equity market.` }
    },
  },
  {
    id: 'equity_quality', label: 'Equity vs Crypto Balance', icon: 'building', color: '#38bdf8',
    applies: (mix) => mix.stock >= 0.1 && mix.crypto >= 0.1,
    check: (enriched, totalValue, mix) => {
      const ratio = mix.stock / (mix.stock + mix.crypto)
      const pct = ratio * 100
      if (pct < 15) return { pass: false, score: 60, tip: `Equities are just ${pct.toFixed(0)}% of your risk assets — the rest is crypto. More stocks would dampen crypto's swings.` }
      if (pct > 85) return { pass: true, score: 80, tip: `Equities are ${pct.toFixed(0)}% of your risk assets — a small crypto allocation can add asymmetric upside.` }
      return { pass: true, score: 100, tip: `Healthy ${pct.toFixed(0)}/${(100-pct).toFixed(0)} split between stocks and crypto — they hedge each other's cycles.` }
    },
  },
]

function computeEval(enriched, totalValue) {
  if (!enriched.length) return null
  const mix = assetMix(enriched, totalValue)
  const results = EVAL_CATEGORIES
    .filter(cat => !cat.applies || cat.applies(mix))
    .map(cat => ({ ...cat, ...cat.check(enriched, totalValue, mix) }))
  const overall = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
  return { results, overall, missing: results.filter(r => !r.pass), strong: results.filter(r => r.pass), mix }
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
    { id: 'engine',  label: 'Decision Engine', icon: 'zap' },
    { id: 'eval',    label: 'Wallet Score',    icon: 'search' },
    { id: 'actions', label: 'AI Analysis',     icon: 'cpu' },
    { id: 'alpha',   label: 'Alpha',           icon: 'α' },
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
              color: eval_.overall >= 80 ? 'var(--g-ink)' : eval_.overall >= 55 ? '#fbbf24' : '#f87171',
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
            <span style={{ display:'inline-flex', alignItems:'center' }}><Icon name={s.icon} size={14} /></span> {s.label}
          </button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {loaded && enriched.length === 0 && (
        <div className="glass-card" style={{ textAlign:'center', padding:'3rem 1.5rem', margin:'1rem 1rem' }}>
          <div style={{ marginBottom:'0.75rem', display:'flex', justifyContent:'center' }}><Icon name="brain" size={40} /></div>
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
                    <div className="eval-missing-count"><Icon name="warning" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{eval_.missing.length} gap{eval_.missing.length > 1 ? 's' : ''} found — tap each to fix</div>
                  ) : (
                    <div className="eval-missing-count" style={{ color: 'var(--g-ink)', fontWeight: 700 }}><Icon name="shield-check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />All checks passed — excellent wallet health!</div>
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
                      <span className="eval-cat-icon" style={{ background: cat.color + '22', color: cat.color }}><Icon name={cat.icon} size={16} /></span>
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
                      <div className="eval-cat-tip"><Icon name={cat.pass ? 'lightbulb' : 'sliders'} size={14} style={{ marginRight:'0.4rem', verticalAlign:'-2px' }} />{cat.tip}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Alpha Signals ── */}
      {activeSection === 'alpha' && (
        <div style={{ padding: '0 0 1.5rem' }}>
          <Alpha />
        </div>
      )}

      {/* ── AI Analysis ── */}
      {activeSection === 'actions' && (
        <div style={{ padding: '1rem' }}>
          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'tools', tool: 'ai' } }); track('coach_action', { action: 'ai_analysis' }) }}>
            <div className="coach-action-icon" data-action="ai">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Full AI Portfolio Analysis</div>
              <div className="coach-action-sub">Deep-dive analysis of your holdings, risk profile, and personalized recommendations powered by Claude AI</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'targets' } }); track('coach_action', { action: 'targets' }) }}>
            <div className="coach-action-icon" data-action="targets">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Set Profit Targets</div>
              <div className="coach-action-sub">Plan your exits before emotions take over — set multi-level sell targets for each holding</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'alerts' } }); track('coach_action', { action: 'alerts' }) }}>
            <div className="coach-action-icon" data-action="alerts">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Smart Price Alerts</div>
              <div className="coach-action-sub">Get notified when your coins hit key levels — never miss a breakout or a crash warning</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'tools', tool: 'risk' } }); track('coach_action', { action: 'risk' }) }}>
            <div className="coach-action-icon" data-action="risk">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">Risk Scanner</div>
              <div className="coach-action-sub">Scan your portfolio for concentration risk, liquidity risk, and volatility exposure</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { setActiveSection('alpha'); track('coach_action', { action: 'alpha' }) }}>
            <div className="coach-action-icon" data-action="alpha">
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
