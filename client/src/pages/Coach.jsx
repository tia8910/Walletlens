import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { assetClass, getStockSector } from '../data/assets'
import { track } from '../analytics'
import Icon from '../components/Icon'
import { useLanguage } from '../LanguageContext'
import { CLASS_LABEL_KEYS, renderTip } from '../data/walletEvalTips'
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
//
// `label` and `tip` are translation keys rather than English. These run at
// module scope, where there is no hook to call useLanguage() from, and they
// are also used for scoring — so a tip is returned as [key, ...args] and the
// row renders it with t(key)(...args).
const EVAL_CATEGORIES = [
  // ── Universal ──
  {
    id: 'asset_mix', labelKey: 'cchCatAssetMix', icon: 'grid', color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue, mix) => {
      const classes = Object.entries(mix).filter(([, v]) => v >= 0.03)
      const n = classes.length
      const top = Math.max(...Object.values(mix))
      if (n <= 1) {
        // The mix key ('crypto', 'stock', …) is an internal identifier, not a
        // word to show anyone. It gets resolved to a translated noun so the
        // sentence reads naturally in every language.
        const only = classes[0]?.[0]
        return { pass: false, score: 25, tip: ['cchTipMixSingle', { k: CLASS_LABEL_KEYS[only] || 'clsOther' }] }
      }
      if (top > 0.85) return { pass: false, score: 55, tip: ['cchTipMixTop', (top * 100).toFixed(0)] }
      if (n >= 3) return { pass: true, score: 100, tip: ['cchTipMixThree', n] }
      return { pass: true, score: 85, tip: ['cchTipMixTwo', n] }
    },
  },
  {
    id: 'diversification', labelKey: 'cchCatDiversification', icon: 'scale', color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue) => {
      const n = enriched.length
      const weights = enriched.map(h => h.value / totalValue)
      const hhi = weights.reduce((s, w) => s + w * w, 0)
      if (n < 3) return { pass: false, score: 10, tip: ['cchTipDivFew', n] }
      if (hhi > 0.5) return { pass: false, score: 30, tip: ['cchTipDivHhi', hhi.toFixed(2)] }
      if (n < 5) return { pass: false, score: 60, tip: ['cchTipDivOkay', n] }
      return { pass: true, score: 95, tip: ['cchTipDivGood', n] }
    },
  },
  {
    id: 'cash_reserve', labelKey: 'cchCatCash', icon: 'bank', color: '#60a5fa',
    check: (enriched, totalValue, mix) => {
      const pct = mix.cash * 100
      if (pct === 0) return { pass: false, score: 30, tip: ['cchTipCashNone'] }
      if (pct < 5)  return { pass: false, score: 60, tip: ['cchTipCashLow', pct.toFixed(1)] }
      if (pct > 50) return { pass: true,  score: 65, tip: ['cchTipCashHigh', pct.toFixed(1)] }
      return { pass: true, score: 100, tip: ['cchTipCashGood', pct.toFixed(1)] }
    },
  },
  {
    id: 'pnl_health', labelKey: 'cchCatPnl', icon: 'pulse', color: 'var(--g-ink)', fontWeight: 700,
    check: (enriched, totalValue) => {
      if (!enriched.length) return { pass: false, score: 0, tip: ['cchTipPnlNone'] }
      const avgPnlPct = enriched.reduce((s, h) => s + (h.pnl / Math.max(h.total_invested || h.invested || 1, 1)) * (h.value / totalValue), 0) * 100
      if (avgPnlPct < -30) return { pass: false, score: 10, tip: ['cchTipPnlDeep', Math.abs(avgPnlPct).toFixed(1)] }
      if (avgPnlPct < 0) return { pass: false, score: 50, tip: ['cchTipPnlUnder', avgPnlPct.toFixed(1)] }
      if (avgPnlPct > 100) return { pass: true, score: 100, tip: ['cchTipPnlStrong', avgPnlPct.toFixed(1)] }
      return { pass: true, score: 90, tip: ['cchTipPnlHealthy', avgPnlPct.toFixed(1)] }
    },
  },

  // ── Crypto sleeve (only when crypto is a meaningful part) ──
  {
    id: 'btc_anchor', labelKey: 'cchCatBtcAnchor', icon: '₿', color: '#f7931a',
    applies: (mix) => mix.crypto >= 0.1,
    check: (enriched, totalValue, mix) => {
      const cryptoVal = mix.crypto * totalValue
      const btc = enriched.find(h => h.coin_id === 'bitcoin' || h.coin_symbol?.toLowerCase() === 'btc')
      if (!btc) return { pass: false, score: 20, tip: ['cchTipBtcNone'] }
      const w = btc.value / cryptoVal * 100  // share of the crypto sleeve
      if (w < 20) return { pass: false, score: 50, tip: ['cchTipBtcLow', w.toFixed(1)] }
      if (w > 80) return { pass: true, score: 75, tip: ['cchTipBtcHigh', w.toFixed(1)] }
      return { pass: true, score: 100, tip: ['cchTipBtcGood', w.toFixed(1)] }
    },
  },
  {
    id: 'large_cap', labelKey: 'cchCatLargeCap', icon: 'whale', color: '#3b82f6',
    applies: (mix) => mix.crypto >= 0.1,
    check: (enriched, totalValue, mix) => {
      const cryptoVal = mix.crypto * totalValue
      const lc = new Set(['bitcoin','ethereum','ripple','binancecoin','solana','cardano','avalanche-2','polkadot','chainlink','litecoin'])
      const lcVal = enriched.filter(h => lc.has(h.coin_id)).reduce((s,h) => s+h.value, 0)
      const pct = lcVal / cryptoVal * 100
      if (pct < 40) return { pass: false, score: 30, tip: ['cchTipLcLow', pct.toFixed(1)] }
      if (pct < 60) return { pass: false, score: 70, tip: ['cchTipLcMid', pct.toFixed(1)] }
      return { pass: true, score: 95, tip: ['cchTipLcGood', pct.toFixed(1)] }
    },
  },

  // ── Stock sleeve (only when stocks are a meaningful part) ──
  {
    id: 'stock_sectors', labelKey: 'cchCatStockSectors', icon: 'bar-chart', color: '#818cf8',
    applies: (mix) => mix.stock >= 0.1,
    check: (enriched) => {
      const stocks = enriched.filter(h => assetClass(h.coin_id) === 'stock')
      const sectors = new Set(stocks.map(h => getStockSector(h.coin_id)).filter(Boolean))
      const n = sectors.size
      if (stocks.length < 2) return { pass: false, score: 40, tip: ['cchTipSecOne'] }
      if (n === 1) return { pass: false, score: 35, tip: ['cchTipSecSingle', [...sectors][0]] }
      if (n === 2) return { pass: false, score: 70, tip: ['cchTipSecTwo', [...sectors].join(', ')] }
      return { pass: true, score: 100, tip: ['cchTipSecGood', n, [...sectors].join(', ')] }
    },
  },
  {
    id: 'equity_quality', labelKey: 'cchCatEquityQuality', icon: 'building', color: '#38bdf8',
    applies: (mix) => mix.stock >= 0.1 && mix.crypto >= 0.1,
    check: (enriched, totalValue, mix) => {
      const ratio = mix.stock / (mix.stock + mix.crypto)
      const pct = ratio * 100
      if (pct < 15) return { pass: false, score: 60, tip: ['cchTipEqLow', pct.toFixed(0)] }
      if (pct > 85) return { pass: true, score: 80, tip: ['cchTipEqHigh', pct.toFixed(0)] }
      return { pass: true, score: 100, tip: ['cchTipEqGood', pct.toFixed(0), (100 - pct).toFixed(0)] }
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
  const { t } = useLanguage()
  const r = 52, circ = 2 * Math.PI * r
  const color = score >= 80 ? 'var(--g)' : score >= 55 ? '#fbbf24' : '#f87171'
  const label = score >= 80 ? t('cchRingStrong') : score >= 55 ? t('cchRingNeedsWork') : t('cchRingAtRisk')
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
  const { t } = useLanguage()
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
    { id: 'engine',  label: t('cchSecEngine'),  icon: 'zap' },
    { id: 'eval',    label: t('cchSecEval'),    icon: 'search' },
    { id: 'actions', label: t('cchSecActions'), icon: 'cpu' },
    { id: 'alpha',   label: t('cchSecAlpha'),   icon: 'α' },
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
            <h1 className="coach-hero-title">{t('cchTitle')}</h1>
            <p className="coach-hero-sub">{t('cchSub')}</p>
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
          <h3 style={{ marginBottom:'0.5rem' }}>{t('cchEmptyTitle')}</h3>
          <p className="muted" style={{ marginBottom:'1.25rem' }}>{t('cchEmptyBody')}</p>
          <button className="coach-cta-btn" onClick={() => navigate('/transactions')}>
            + {t('cchAddFirst')}
          </button>
        </div>
      )}

      {/* ── Decision Engine ── */}
      {activeSection === 'engine' && enriched.length > 0 && (
        <div style={{ padding: '0 0 1.5rem' }}>
          {!hasPrices && (
            <div className="coach-loading-bar">
              <span className="coach-loading-dot" />
              {t('cchFetchingPrices')}
            </div>
          )}
          <Suspense fallback={<div style={{ padding:'2rem', textAlign:'center', color:'var(--text-sub)' }}>{t('cchLoadingEngine')}</div>}>
            <AIDecisionEngine
              enriched={enriched}
              prices={prices}
              transactions={transactions}
              totalValue={totalValue}
              totalInvested={totalInvested}
            />
            {/* Grow My Net Worth lives on its own page (/grow) */}
            {enriched.length > 0 && (
              <button
                className="ade-trigger gp-trigger"
                onClick={() => { track('growth_plan_open', { nw: Math.round(totalValue) }); navigate('/grow') }}
              >
                <span className="ade-trigger-brain"><Icon name="trend-up" size={20} /></span>
                <span className="ade-trigger-text">
                  {t('cchGrowTitle')}
                  <span className="ade-trigger-sub">{t('cchGrowSub')}</span>
                </span>
                <span className="ade-trigger-arrow">→</span>
              </button>
            )}
          </Suspense>
        </div>
      )}

      {/* ── Wallet Evaluation ── */}
      {activeSection === 'eval' && enriched.length > 0 && (
        <div style={{ padding: '0 0 1.5rem' }}>
          {!eval_ ? (
            <div style={{ padding:'2rem', textAlign:'center', color:'var(--text-sub)' }}>{t('cchCalculating')}</div>
          ) : (
            <>
              {/* Score header */}
              <div className="glass-card coach-eval-header">
                <div className="coach-eval-header-left">
                  <h2 className="coach-eval-title">{t('cchEvalTitle')}</h2>
                  <p className="muted" style={{ margin:'0.25rem 0 0', fontSize:'0.82rem' }}>{t('cchEvalSub')}</p>
                  {eval_.missing.length > 0 ? (
                    <div className="eval-missing-count"><Icon name="warning" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{eval_.missing.length} gap{eval_.missing.length > 1 ? 's' : ''} found — tap each to fix</div>
                  ) : (
                    <div className="eval-missing-count" style={{ color: 'var(--g-ink)', fontWeight: 700 }}><Icon name="shield-check" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{t('cchAllPassed')}</div>
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
                        <div className="eval-cat-label">{t(cat.labelKey)}</div>
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
                      <div className="eval-cat-tip"><Icon name={cat.pass ? 'lightbulb' : 'sliders'} size={14} style={{ marginRight:'0.4rem', verticalAlign:'-2px' }} />{renderTip(cat.tip, t)}</div>
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

      {/* ── Portfolio Analysis ── */}
      {activeSection === 'actions' && (
        <div style={{ padding: '1rem' }}>
          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'tools', tool: 'ai' } }); track('coach_action', { action: 'ai_analysis' }) }}>
            <div className="coach-action-icon" data-action="ai">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4"/><path d="M12 10v4"/><path d="M8 18a4 4 0 0 1 8 0"/><path d="M3 7h2M19 7h2"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">{t('cchFullAnalysis')}</div>
              <div className="coach-action-sub">{t('cchFullAnalysisSub')}</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'targets' } }); track('coach_action', { action: 'targets' }) }}>
            <div className="coach-action-icon" data-action="targets">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">{t('cchSetTargets')}</div>
              <div className="coach-action-sub">{t('cchSetTargetsSub')}</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'alerts' } }); track('coach_action', { action: 'alerts' }) }}>
            <div className="coach-action-icon" data-action="alerts">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">{t('cchSmartAlerts')}</div>
              <div className="coach-action-sub">{t('cchSmartAlertsSub')}</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { navigate('/dashboard', { state: { tab: 'tools', tool: 'risk' } }); track('coach_action', { action: 'risk' }) }}>
            <div className="coach-action-icon" data-action="risk">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">{t('cchRiskScanner')}</div>
              <div className="coach-action-sub">{t('cchRiskScannerSub')}</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>

          <div className="glass-card coach-action-card" onClick={() => { setActiveSection('alpha'); track('coach_action', { action: 'alpha' }) }}>
            <div className="coach-action-icon" data-action="alpha">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20L12 4l6 16"/><path d="M8.5 14h7"/><circle cx="12" cy="4" r="1" fill="currentColor" stroke="none"/></svg>
            </div>
            <div className="coach-action-body">
              <div className="coach-action-title">{t('cchAlphaSignals')}</div>
              <div className="coach-action-sub">{t('cchAlphaSignalsSub')}</div>
            </div>
            <span className="coach-action-arrow">→</span>
          </div>
        </div>
      )}

    </div>
  )
}
