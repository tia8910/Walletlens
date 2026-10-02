import { useState, useMemo, useEffect, useRef } from 'react'
import { inline } from './DocProse'
import Icon from './Icon'
import { track } from '../analytics'
import { isStablecoin } from '../stablecoins'
import { categorizeAsset } from '../data/assets'
import { loadBuckets } from '../data/visionStorage'
import { useLanguage } from '../LanguageContext'
import AiReport from './AiReport'
import { CLASS_PARAMS, INFLATION, mixParams, realGrowth, simulate, monthlyFromHistory, goalCrossing } from '../growthEngine'


/**
 * Grow My Net Worth — a personal projection built on the user's own profile.
 *
 * Their real mix (per-class growth and volatility, cross-correlated), what they
 * actually invest each month (from their trade history), their Vision goals,
 * and a Monte-Carlo of that mix with monthly contributions. Shown in today's
 * money by default, because "$143k in 2036" is a number nobody can picture.
 * The engine and its assumptions live in growthEngine.js.
 */

const PRESET_MIXES = {
  current:      null, // resolved from real holdings
  conservative: { stocks: 0.45, metals: 0.20, cash: 0.30, crypto_large: 0.05 },
  balanced:     { stocks: 0.50, crypto_large: 0.15, metals: 0.15, cash: 0.15, crypto_small: 0.05 },
  aggressive:   { crypto_large: 0.45, crypto_small: 0.15, stocks: 0.35, cash: 0.05 },
}

// The same categories the dashboard shows, so "your mix" here matches the
// card on Home. Stablecoins count as cash for growth (they do not grow), and
// crypto splits by size because small caps behave very differently.
const LARGE_CRYPTO = new Set(['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'cardano', 'tron', 'dogecoin'])
function classify(h) {
  if (isStablecoin(h.coin_id, h.coin_symbol)) return 'cash'
  const cat = categorizeAsset(h)
  if (cat !== 'crypto') return cat
  return LARGE_CRYPTO.has((h.coin_id || '').toLowerCase()) || (h.market_cap || 0) > 10e9 ? 'crypto_large' : 'crypto_small'
}

/* ── profile synthesis ──────────────────────────────────────────────────── */
function buildProfile(enriched, totalValue, totalInvested, transactions) {
  const weights = {}
  for (const h of enriched) {
    const c = classify(h)
    weights[c] = (weights[c] || 0) + (h.value || 0)
  }
  const tv = Math.max(totalValue, 1)
  for (const k of Object.keys(weights)) weights[k] /= tv
  // Degenerate guard: if live prices haven't resolved yet every value is 0 and
  // the mix collapses to 0%/0% — simulate a balanced mix instead of nonsense.
  const wsum = Object.values(weights).reduce((s, w) => s + w, 0)
  if (wsum < 0.5) {
    for (const k of Object.keys(weights)) delete weights[k]
    Object.assign(weights, PRESET_MIXES.balanced)
  }

  const top = enriched.reduce((m, h) => Math.max(m, (h.value || 0) / tv), 0)
  const dryPowder = (weights.cash || 0)
  const buys = transactions.filter(t => t.type === 'buy').length
  const behaviour = buys >= 6 ? 'dca' : buys >= 2 ? 'occasional' : 'lump'

  // Vision goals first: the user said these out loud.
  const buckets = loadBuckets()
  let goal = 0, goalMonths = 0, visionMonthly = 0
  for (const b of buckets) {
    visionMonthly += Number(b.monthlyContribution) || 0
    const t = b.targetAmount != null ? Number(b.targetAmount)
            : b.targetPct != null ? tv * Number(b.targetPct) / 100 : 0
    if (t > goal) { goal = t; goalMonths = Number(b.targetMonths) || 0 }
  }
  if (!goal || goal <= totalValue) {
    const M = [1e3, 2.5e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7]
    goal = M.find(x => x >= totalValue * 2) || totalValue * 2.5
  }

  // What they really put in: their stated Vision plan, else their own last
  // year of trades, else a cautious guess they are invited to correct.
  const history = monthlyFromHistory(transactions)
  let monthly, monthlySource
  if (visionMonthly > 0) { monthly = visionMonthly; monthlySource = 'vision' }
  else if (history && history.monthly > 0) { monthly = history.monthly; monthlySource = 'history' }
  else { monthly = Math.max(100, Math.round(totalValue * 0.01 / 50) * 50); monthlySource = 'estimate' }

  const params = mixParams(weights)
  const risk = params.sig > 0.45 ? 'aggressive' : params.sig > 0.20 ? 'growth' : params.sig > 0.08 ? 'balanced' : 'conservative'
  const pnlPct = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0

  return { weights, params, top, dryPowder, behaviour, goal, monthly, monthlySource, historyMonths: history?.months || 0, horizonM: goalMonths || 120, risk, pnlPct }
}

/* ── milestone ladder ───────────────────────────────────────────────────── */
function milestones(totalValue, band) {
  const M = [1e3, 2.5e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7]
  const next = M.filter(x => x > totalValue).slice(0, 3)
  return next.map(target => {
    const at = band.find(b => b.p50 >= target)
    return { target, months: at ? at.m : null }
  })
}

/* ── local strategist (offline fallback) ────────────────────────────────── */
function localPlan(profile, sim, levers, crossYears, realMoney) {
  const acts = []
  if (profile.top > 0.5) acts.push(`Your largest position is ${(profile.top * 100).toFixed(0)}% of the portfolio. Trimming it toward 30% cuts how hard one coin can set you back, with little cost to expected growth.`)
  if (profile.dryPowder > 0.35) acts.push(`${(profile.dryPowder * 100).toFixed(0)}% sits in cash or stablecoins, which barely beat inflation. Moving some of it into your core mix, a little each month, lifts the growth rate.`)
  if (profile.dryPowder < 0.05) acts.push('You hold almost no cash. Keeping 5–10% aside lets you buy dips instead of watching them.')
  if (profile.behaviour === 'lump') acts.push('Your history shows occasional big buys. A fixed amount every month removes timing risk, and this projection already assumes you invest monthly.')
  if (levers[0]) acts.push(`Biggest lever: ${levers[0].label}. ${levers[0].detail[0].toUpperCase()}${levers[0].detail.slice(1)}.`)
  const eta = crossYears != null ? `about ${crossYears.toFixed(1)} years` : 'beyond this horizon'
  const odds = Math.round((sim.probGoal || 0) * 100)
  return {
    headline: odds >= 70
      ? `On track: the likely path reaches your goal in ${eta}.`
      : odds >= 40
        ? `Reachable but not secured: ${odds} in 100 simulated futures make it. The levers below change that most.`
        : `On today's plan the goal is a stretch (${odds} in 100 futures). The monthly amount is your strongest lever.`,
    narrative: `1,000 simulated futures of your actual mix: about ${(profile.params.mu * 100).toFixed(1)}% a year before inflation, with ${(profile.params.sig * 100).toFixed(0)}% swings. Likely $${fmtN(sim.p50Terminal)}, most outcomes between $${fmtN(sim.p25Terminal)} and $${fmtN(sim.p75Terminal)}${realMoney ? ', in today\'s money' : ''}.`,
    actions: acts.slice(0, 4),
    source: 'local',
  }
}

const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString()

/* ── fan chart ──────────────────────────────────────────────────────────── */
// Two bands instead of one: the middle half of outcomes (p25–p75) drawn
// solid, the wider 80% (p10–p90) as a faint halo clipped at the top. The old
// single p10–p90 band hit the ceiling and ran flat across half the chart.
function FanChart({ band, start, goal, months, crossMonth, label }) {
  if (!band?.length) return null
  const W = 600, H = 240, PAD = { l: 8, r: 60, t: 14, b: 24 }
  const pts = [{ m: 0, p10: start, p25: start, p50: start, p75: start, p90: start }, ...band]
  const last = pts[pts.length - 1]
  const maxY = Math.max(last.p75 * 1.12, (goal || 0) * 1.18, start * 1.3)
  const x = m => PAD.l + (m / months) * (W - PAD.l - PAD.r)
  const y = v => H - PAD.b - (Math.min(v, maxY * 1.5) / maxY) * (H - PAD.t - PAD.b)
  const path = key => pts.map((b, i) => `${i ? 'L' : 'M'}${x(b.m).toFixed(1)},${y(b[key]).toFixed(1)}`).join('')
  const area = (hi, lo) => `${path(hi)} ${[...pts].reverse().map(b => `L${x(b.m).toFixed(1)},${y(b[lo]).toFixed(1)}`).join(' ')} Z`
  const years = Math.round(months / 12)
  const ticks = []
  const every = years > 15 ? 5 : years > 6 ? 2 : 1
  for (let yr = every; yr <= years; yr += every) ticks.push(yr)
  const goalY = goal > 0 ? y(goal) : null
  const endY = y(last.p50)
  // Keep the two right-hand labels from sitting on top of each other.
  const labelGap = goalY != null && Math.abs(goalY - endY) < 14
  const thisYear = new Date().getFullYear()
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gp-chart gp-chart--v2" preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <clipPath id="gp-clip"><rect x="0" y={PAD.t - 4} width={W} height={H - PAD.t - PAD.b + 4} /></clipPath>
        <linearGradient id="gp-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--g)" stopOpacity="0.34" />
          <stop offset="1" stopColor="var(--g)" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PAD.l} x2={W - PAD.r} y1={y(maxY * f)} y2={y(maxY * f)} stroke="currentColor" strokeOpacity="0.07" />
      ))}
      <g clipPath="url(#gp-clip)">
        <path d={area('p90', 'p10')} fill="var(--g)" fillOpacity="0.08" />
        <path d={area('p75', 'p25')} fill="url(#gp-mid)" />
        <path d={path('p50')} fill="none" stroke="var(--g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {goalY != null && goal < maxY * 1.2 && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={goalY} y2={goalY} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="6 5" />
          <text x={W - PAD.r + 5} y={goalY + (labelGap && goalY < endY ? -2 : 4)} fill="#fbbf24" fontSize="11" fontWeight="800">${fmtN(goal)}</text>
        </g>
      )}
      {crossMonth != null && crossMonth > 0 && crossMonth <= months && (
        <g>
          <circle cx={x(crossMonth)} cy={goalY} r="5.5" fill="#fbbf24" stroke="var(--card-bg, #111)" strokeWidth="2" />
          <text x={Math.min(x(crossMonth), W - PAD.r - 30)} y={goalY - 10} fill="#fbbf24" fontSize="10.5" fontWeight="800" textAnchor="middle">
            {thisYear + Math.round(crossMonth / 12)}
          </text>
        </g>
      )}
      <text x={W - PAD.r + 5} y={endY + (labelGap && endY <= goalY ? -6 : 4)} fill="var(--g-ink, var(--g))" fontSize="11" fontWeight="800">${fmtN(last.p50)}</text>
      {ticks.map(yr => (
        <text key={yr} x={x(yr * 12)} y={H - 7} fill="var(--text-sub)" fontSize="10" textAnchor="middle">{thisYear + yr}</text>
      ))}
    </svg>
  )
}

/* ── component ──────────────────────────────────────────────────────────── */
export default function GrowthPlan({ enriched = [], prices = {}, transactions = [], totalValue = 0, totalInvested = 0, asPage = false, initialGoal = null }) {
  const { t } = useLanguage()
  // As a page (route /grow) the content is always "open" and rendered inline —
  // no trigger button, no overlay, no history juggling.
  const [open, setOpen] = useState(asPage)
  const [monthly, setMonthly] = useState(null)   // null = from profile
  const [years, setYears] = useState(null)
  const [goal, setGoal] = useState(initialGoal)  // null = auto-guessed from profile
  const [preset, setPreset] = useState('current')
  // Today's money by default: a goal is something you can picture buying now.
  const [realMoney, setRealMoney] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const [ai, setAi] = useState({ state: 'idle' })

  // Key the (heavy) profile on stable primitives, not the array identities of
  // `enriched`/`transactions` — Coach re-renders hand us new array refs each
  // time, which otherwise re-ran the whole Monte-Carlo every render.
  const profile = useMemo(
    () => (open && enriched.length ? buildProfile(enriched, totalValue, totalInvested, transactions) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, Math.round(totalValue), Math.round(totalInvested), enriched.length, transactions.length]
  )

  // The mix being projected, then its growth in the money being shown.
  const mixP = profile && (preset === 'current' ? profile.params : mixParams(PRESET_MIXES[preset]))
  const eff = (pp) => ({ mu: realMoney ? realGrowth(pp.mu) : pp.mu, sig: pp.sig })
  const inputs = profile && {
    monthly: monthly ?? profile.monthly,
    months: (years ?? Math.round(profile.horizonM / 12)) * 12,
    goal: goal ?? profile.goal,
    params: eff(mixP),
  }

  const sim = useMemo(() => {
    if (!profile || !inputs) return null
    return simulate({
      start: totalValue, monthly: inputs.monthly, months: inputs.months,
      mu: inputs.params.mu, sig: inputs.params.sig, goal: inputs.goal,
    })
  }, [profile, totalValue, inputs?.monthly, inputs?.months, inputs?.goal, inputs?.params.mu, inputs?.params.sig])

  // Open as a full page: push a history entry so the device/browser back button
  // (and the in-header X) closes it like a real page navigation.
  const pageRef = useRef(null)
  useEffect(() => {
    if (!open || asPage) return
    window.history.pushState({ gpOpen: true }, '')
    const onPop = () => setOpen(false)
    window.addEventListener('popstate', onPop)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (pageRef.current) pageRef.current.scrollTop = 0
    return () => {
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prevOverflow
    }
  }, [open, asPage])
  useEffect(() => {
    if (open && pageRef.current) pageRef.current.scrollTop = 0
  }, [open, !!(profile && sim)])
  const closePage = () => {
    if (window.history.state?.gpOpen) window.history.back()
    else setOpen(false)
  }

  // Lever sensitivity: rerun the sim per lever, rank by goal odds then median.
  // All runs share seed 7 so deltas measure the lever, not simulation noise.
  const levers = useMemo(() => {
    if (!profile || !sim || !inputs) return []
    const LP = 400
    const run = (o) => simulate({ start: totalValue, monthly: inputs.monthly, months: inputs.months, mu: inputs.params.mu, sig: inputs.params.sig, goal: inputs.goal, seed: 7, paths: LP, ...o })
    const baseline = run({})
    const base = baseline.p50Terminal
    const bump = inputs.monthly >= 1000 ? 250 : 100
    const runs = [
      { id: 'contrib', label: `Invest $${fmtN(bump)} more a month`, sim: run({ monthly: inputs.monthly + bump }) },
      { id: 'time', label: 'Stay invested 2 more years', sim: run({ months: inputs.months + 24 }) },
    ]
    if (preset === 'current' && profile.params.sig > 0.3) {
      runs.push({ id: 'derisk', label: 'Rebalance to a balanced mix', sim: run(eff(mixParams(PRESET_MIXES.balanced))) })
    }
    if ((profile.weights.cash || 0) > 0.25) {
      const w = { ...profile.weights }
      const move = Math.min(w.cash - 0.10, 0.5)
      w.cash -= move; w.stocks = (w.stocks || 0) + move * 0.7; w.crypto_large = (w.crypto_large || 0) + move * 0.3
      runs.push({ id: 'deploy', label: `Put idle cash to work (${Math.round(profile.weights.cash * 100)}% → 10%)`, sim: run(eff(mixParams(w))) })
    }
    return runs
      .map(r => {
        const d = r.sim.p50Terminal - base
        const dp = (r.sim.probGoal ?? 0) - (baseline.probGoal ?? 0)
        const parts = []
        if (d >= 500) parts.push(`likely +$${fmtN(d)} by the end`)
        if (dp > 0.015) parts.push(`goal odds +${Math.round(dp * 100)} in 100`)
        return { ...r, delta: d, deltaProb: dp, detail: parts.join(', ') }
      })
      .filter(r => r.detail)
      .sort((a, b) => (b.deltaProb - a.deltaProb) || (b.delta - a.delta))
  }, [profile, sim, totalValue, inputs?.monthly, inputs?.months, inputs?.goal, inputs?.params.mu, inputs?.params.sig, preset, realMoney])

  const stones = useMemo(() => (sim ? milestones(totalValue, sim.band) : []), [sim, totalValue])

  // Monthly contribution needed to reach the goal within the horizon, solved
  // from the compound-growth formula on the median growth rate:
  //   FV = start(1+r)^n + m((1+r)^n − 1)/r
  const needMonthly = useMemo(() => {
    if (!inputs || !sim) return null
    const n = inputs.months
    const r = Math.pow(1 + inputs.params.mu, 1 / 12) - 1
    const growth = Math.pow(1 + r, n)
    const fromNow = totalValue * growth
    if (fromNow >= inputs.goal) return 0
    const factor = r > 0 ? (growth - 1) / r : n
    return Math.max(0, Math.ceil((inputs.goal - fromNow) / factor / 10) * 10)
  }, [inputs?.goal, inputs?.months, inputs?.params.mu, totalValue, sim])

  // How long the goal takes at the current monthly amount.
  const yearsAtCurrent = useMemo(() => {
    if (!inputs) return null
    if (totalValue >= inputs.goal) return 0
    const r = Math.pow(1 + inputs.params.mu, 1 / 12) - 1
    const m = inputs.monthly
    if (r <= 0) return m > 0 ? (inputs.goal - totalValue) / m / 12 : null
    const num = inputs.goal + m / r, den = totalValue + m / r
    if (num <= 0 || den <= 0) return null
    const n = Math.log(num / den) / Math.log(1 + r)
    return n > 0 && isFinite(n) ? n / 12 : null
  }, [inputs?.goal, inputs?.monthly, inputs?.params.mu, totalValue])

  // A one-off top-up today that gets there within the chosen horizon.
  const lumpNow = useMemo(() => {
    if (!inputs) return null
    const n = inputs.months
    const r = Math.pow(1 + inputs.params.mu, 1 / 12) - 1
    const growth = Math.pow(1 + r, n)
    const factor = r > 0 ? (growth - 1) / r : n
    const needStart = (inputs.goal - inputs.monthly * factor) / growth
    const gap = needStart - totalValue
    return gap > 0 ? Math.ceil(gap / 10) * 10 : 0
  }, [inputs?.goal, inputs?.months, inputs?.monthly, inputs?.params.mu, totalValue])

  // When the goal is reached, read off the same likely line the chart draws.
  const crossMonth = useMemo(() => (sim && inputs ? goalCrossing(sim.band, totalValue, inputs.goal) : null), [sim, inputs?.goal, totalValue])
  const likelyYears = crossMonth != null ? crossMonth / 12 : null

  const yearsLabel = inputs ? t('gpYears')(Math.round(inputs.months / 12)) : ''
  const odds = Math.round((sim?.probGoal ?? 0) * 100)
  const oddsWord = odds >= 90 ? 'almost certain' : odds >= 70 ? 'very likely' : odds >= 40 ? 'possible' : 'unlikely'
  const oddsChance = Math.max(1, Math.round(odds / 10))
  const oddsColor = odds >= 70 ? 'var(--g-ink)' : odds >= 40 ? '#fbbf24' : '#f87171'
  const putIn = inputs ? inputs.monthly * inputs.months : 0

  // AI strategist — fire once per open with the synthesized profile + sim.
  useEffect(() => {
    if (!open || !profile || !sim || ai.state !== 'idle') return
    let alive = true
    ;(async () => {
      setAi({ state: 'loading' })
      try {
        const resp = await fetch('/api/analyze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'growth_plan',
            totalValue, pnlPct: profile.pnlPct,
            weights: profile.weights, risk: profile.risk, behaviour: profile.behaviour,
            topShare: profile.top, dryPowder: profile.dryPowder,
            monthly: inputs.monthly, goal: inputs.goal, months: inputs.months,
            expReturn: inputs.params.mu, vol: inputs.params.sig, todaysMoney: realMoney,
            p10: sim.p10Terminal, p50: sim.p50Terminal, p90: sim.p90Terminal,
            probGoal: sim.probGoal, levers: levers.map(l => ({ label: l.label, detail: l.detail })),
          }),
        })
        const j = await resp.json().catch(() => ({}))
        if (alive && resp.ok && j.ok && j.plan) { setAi({ state: 'done', plan: { ...j.plan, source: 'ai' } }); return }
        throw new Error('fallback')
      } catch {
        if (alive) setAi({ state: 'done', plan: localPlan(profile, sim, levers, likelyYears, realMoney) })
      }
    })()
    return () => { alive = false }
  }, [open, profile, sim])   // eslint-disable-line react-hooks/exhaustive-deps

  // Where the projection's inputs come from, said out loud. This is what makes
  // it the user's projection rather than a generic calculator.
  const mixChips = profile ? Object.entries(profile.weights)
    .filter(([, w]) => w >= 0.02)
    .sort((a, b) => b[1] - a[1])
    .map(([c, w]) => ({ c, w, label: CLASS_PARAMS[c]?.label || c, mu: CLASS_PARAMS[c]?.mu || 0 })) : []
  const monthlyNote = profile && monthly == null
    ? profile.monthlySource === 'history' ? `your typical month over the last ${profile.historyMonths} months`
      : profile.monthlySource === 'vision' ? 'from your Vision plan'
      : 'a starting guess. Set it to what you really invest'
    : 'your choice'

  const growthBody = () => (
    <>
      {/* ── The answer ── */}
      <div className="gp-answer gp-answer--v2">
        <div className="gp-money-toggle" role="group" aria-label={t('gpMoneyShownIn')}>
          <button type="button" className={realMoney ? 'on' : ''} aria-pressed={realMoney} onClick={() => setRealMoney(true)}>Today's money</button>
          <button type="button" className={!realMoney ? 'on' : ''} aria-pressed={!realMoney} onClick={() => setRealMoney(false)}>Future dollars</button>
        </div>
        <p className="gp-answer-lead">
          Investing <b>${fmtN(inputs.monthly)}</b> a month, in <b>{yearsLabel}</b> you'll likely have
        </p>
        <p className="gp-answer-big">${fmtN(sim.p50Terminal)}</p>
        <p className="gp-answer-sub">
          Most likely between <b>${fmtN(sim.p25Terminal)}</b> and <b>${fmtN(sim.p75Terminal)}</b>.
          In a weak decade, about <b>${fmtN(sim.p10Terminal)}</b>.
        </p>
        <div className="gp-split">
          <span><i style={{ background: 'rgba(255,255,255,0.35)' }} />You have <b>${fmtN(totalValue)}</b></span>
          <span><i style={{ background: 'rgba(var(--g-rgb),0.55)' }} />You add <b>${fmtN(putIn)}</b></span>
          <span><i style={{ background: 'var(--g)' }} />Growth <b>{sim.p50Terminal - totalValue - putIn >= 0 ? '+' : '−'}${fmtN(Math.abs(sim.p50Terminal - totalValue - putIn))}</b></span>
        </div>
      </div>

      {/* ── Built on you ── */}
      <div className="gp-basis">
        <p className="gp-basis-h"><Icon name="wallet" size={13} /> Built on your portfolio</p>
        <div className="gp-basis-mix">
          {mixChips.map(m => (
            <span key={m.c} className="gp-chip">
              {m.label} <b>{Math.round(m.w * 100)}%</b>
              <em>~{(m.mu * 100).toFixed(1)}%/yr</em>
            </span>
          ))}
        </div>
        <p className="gp-basis-note">
          Your mix grows about <b>{(mixP.mu * 100).toFixed(1)}% a year</b>{realMoney ? <> (<b>{(realGrowth(mixP.mu) * 100).toFixed(1)}%</b> after inflation)</> : null},
          with swings of about {(mixP.sig * 100).toFixed(0)}%. Monthly amount: {monthlyNote}.
        </p>
      </div>

      {/* ── Two dials, right under the answer they change ── */}
      <div className="gp-controls gp-controls--v2">
        <label className="gp-slider">
          <span>Invest <b>${fmtN(inputs.monthly)}</b> a month</span>
          <input type="range" min="0" max={Math.max(2000, profile.monthly * 4)} step="25"
            value={inputs.monthly} onChange={e => setMonthly(Number(e.target.value))} />
        </label>
        <label className="gp-slider">
          <span>For <b>{yearsLabel}</b></span>
          <input type="range" min="1" max="30" step="1"
            value={Math.round(inputs.months / 12)} onChange={e => setYears(Number(e.target.value))} />
        </label>
      </div>

      {/* ── Your goal — editable ── */}
      <div className="gp-goalcard">
        <label className="gp-goal-row">
          <span className="gp-goal-lbl">{t('gpMyGoal')}</span>
          <span className="gp-goal-input">
            <span>$</span>
            <input
              type="number" inputMode="numeric" min="0" step="1000"
              value={Math.round(inputs.goal)}
              onChange={e => setGoal(Math.max(0, Number(e.target.value) || 0))}
              aria-label={t('gpGoalAmount')}
            />
          </span>
        </label>
        <div className="gp-odds">
          <div className="gp-odds-bar"><i style={{ width: `${Math.max(3, odds)}%`, background: oddsColor }} /></div>
          <span style={{ color: oddsColor }}><b>{odds}</b> in 100 futures reach it</span>
        </div>
        <p className="gp-goal-verdict" style={{ color: oddsColor }}>
          {totalValue >= inputs.goal ? (
            <>You're already past this goal. Raise it to plan the next one.</>
          ) : odds < 40 ? (
            inline(t('gpVerdictUnlikely')('$' + fmtN(inputs.monthly), yearsLabel, oddsChance))
          ) : likelyYears ? (
            <>{inline(t('gpVerdictReach')(
                likelyYears < 1
                  ? t('gpMonths')(Math.max(1, Math.round(likelyYears * 12)))
                  : t('gpYearsDec')(likelyYears.toFixed(1)),
                oddsWord))}
              {inline(t('gpVerdictAway')('$' + fmtN(inputs.goal - totalValue)))}</>
          ) : (
            inline(t('gpVerdictOdds')(yearsLabel, oddsWord, oddsChance))
          )}
        </p>
      </div>

      {/* ── Chart, with a plain caption ── */}
      <FanChart band={sim.band} start={totalValue} goal={inputs.goal} months={inputs.months} crossMonth={crossMonth} label={t('gpChartLabel')} />
      <div className="gp-legend">
        <span><i className="gp-dot" style={{ background: 'var(--g)' }} /> Likely</span>
        <span><i className="gp-dot" style={{ background: 'rgba(var(--g-rgb),0.35)' }} /> Most outcomes</span>
        <span><i className="gp-dot" style={{ background: 'rgba(var(--g-rgb),0.12)' }} /> 8 in 10 outcomes</span>
        <span><i className="gp-dot" style={{ background: '#fbbf24' }} /> Goal</span>
      </div>

      {/* ── How to actually get there ── */}
      {(needMonthly > inputs.monthly || (yearsAtCurrent && yearsAtCurrent > inputs.months / 12)) && (() => {
        const routes = []
        if (needMonthly > inputs.monthly) routes.push(
          <li key="m">
            <div>
              <b>Invest ${fmtN(needMonthly)} a month</b> instead of ${fmtN(inputs.monthly)}
              <span className="gp-how-note">
                ${fmtN(needMonthly - inputs.monthly)} more a month, about ${fmtN(Math.max(1, Math.round((needMonthly - inputs.monthly) / 30)))} a day.
              </span>
            </div>
            <button type="button" className="gp-how-apply" onClick={() => setMonthly(needMonthly)}>{t('gpTryIt')}</button>
          </li>)
        if (yearsAtCurrent && yearsAtCurrent > inputs.months / 12 && yearsAtCurrent <= 30) routes.push(
          <li key="y">
            <div>
              <b>Give it {Math.ceil(yearsAtCurrent)} years</b> instead of {yearsLabel}
              <span className="gp-how-note">Same ${fmtN(inputs.monthly)} a month, just more time. No extra money.</span>
            </div>
            <button type="button" className="gp-how-apply" onClick={() => setYears(Math.min(30, Math.ceil(yearsAtCurrent)))}>{t('gpTryIt')}</button>
          </li>)
        if (lumpNow > 0) routes.push(
          <li key="l">
            <div>
              {inline(t('gpAddLump')('$' + fmtN(lumpNow)))}
              <span className="gp-how-note">A one-off top-up today, then carry on at ${fmtN(inputs.monthly)} a month.</span>
            </div>
          </li>)
        if (sim.p50Terminal < inputs.goal) routes.push(
          <li key="g">
            <div>
              <b>Aim for ${fmtN(sim.p50Terminal)}</b> instead
              <span className="gp-how-note">{t('gpSmallerTarget')}</span>
            </div>
            <button type="button" className="gp-how-apply" onClick={() => setGoal(Math.round(sim.p50Terminal))}>{t('gpTryIt')}</button>
          </li>)
        return (
          <div className="gp-how">
            <h4 className="gp-how-h"><Icon name="lightbulb" size={15} />{t('gpHowToReach')}</h4>
            <p className="gp-how-lead">{t('gpAnyOne')}</p>
            <ol className="gp-how-list gp-how-list--v2">{routes}</ol>
          </div>
        )
      })()}

      {/* ── Everything advanced lives behind one toggle ── */}
      <button type="button" className="gp-more" onClick={() => setShowDetails(v => !v)}>
        {showDetails ? t('gpHideDetails') : t('gpShowDetails')}
        <span className={`gp-more-arrow${showDetails ? ' open' : ''}`}>›</span>
      </button>

      {showDetails && (<>
      <div className="gp-section">
        <h4 className="gp-h">{t('gpTryDifferentMix')}</h4>
        <div className="gp-presets">
          {['current', 'conservative', 'balanced', 'aggressive'].map(p => (
            <button key={p} className={`gp-preset ${preset === p ? 'active' : ''}`} onClick={() => setPreset(p)}>
              {p === 'current' ? 'My mix' : p[0].toUpperCase() + p.slice(1)}
              <small>~{(((p === 'current' ? profile.params : mixParams(PRESET_MIXES[p])).mu) * 100).toFixed(1)}%/yr</small>
            </button>
          ))}
        </div>
      </div>

      {levers.length > 0 && (
        <div className="gp-section">
          <h4 className="gp-h">{t('gpWhatMoves')}</h4>
          {levers.map((l, i) => (
            <div key={l.id} className="gp-lever">
              <span className="gp-lever-rank">{i + 1}</span>
              <div className="gp-lever-txt">
                <b>{l.label}</b>
                <span>{l.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {stones.length > 0 && (
        <div className="gp-section">
          <h4 className="gp-h">{t('gpMilestones')}</h4>
          <div className="gp-stones">
            {stones.map(st => (
              <div key={st.target} className="gp-stone">
                <b>${fmtN(st.target)}</b>
                <span>{st.months ? `~${new Date().getFullYear() + Math.round(st.months / 12)}` : 'beyond horizon'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="gp-section">
        <h4 className="gp-h">{t('gpTitle')}</h4>
        {ai.state === 'loading' && <p className="muted" style={{ fontSize: '0.82rem' }}>{t('gpBuildingPlan')}</p>}
        {ai.state === 'done' && ai.plan && (
          <>
            <p className="gp-headline">{ai.plan.headline}</p>
            {ai.plan.narrative && <p className="gp-narrative">{ai.plan.narrative}</p>}
            {(ai.plan.actions || []).map((a, i) => (
              <div key={i} className="gp-action"><span className="gp-action-n">{i + 1}</span><span>{a}</span></div>
            ))}
            {ai.plan.source === 'ai' && (
              <AiReport surface="growth_plan" output={() => [ai.plan.headline, ai.plan.narrative, ...(ai.plan.actions || [])].filter(Boolean).join('\n')} />
            )}
          </>
        )}
      </div>
      </>)}

      <p className="gp-disclaimer">
        A projection, not a promise or financial advice. 1,000 simulated futures of your mix using long-run, middle-of-the-road
        growth for each asset class{realMoney ? `, with ${(INFLATION * 100).toFixed(0)}% inflation taken out` : ''}. Real markets can do better or much worse.
      </p>
    </>
  )

  if (!enriched.length) return null

  // On the /grow route the parent page supplies the header + back button, so we
  // render the body inline with no trigger and no overlay chrome.
  if (asPage) {
    if (!(profile && sim)) return <p className="gnw-msg">{t('gpBuildingModel')}</p>
    return (
      <div className="gp-body gp-body--page">
        {growthBody()}
      </div>
    )
  }

  return (
    <>
      <button className="ade-trigger gp-trigger" onClick={() => { setOpen(true); setAi({ state: 'idle' }); track('growth_plan_open', { nw: Math.round(totalValue) }) }}>
        <span className="ade-trigger-brain"><Icon name="trend-up" size={20} /></span>
        <span className="ade-trigger-text">
          Grow My Net Worth
          <span className="ade-trigger-sub">Personal growth path — simulated on your real portfolio</span>
        </span>
        <span className="ade-trigger-arrow">→</span>
      </button>

      {open && profile && sim && (
        <div className="ade-overlay gp-overlay" onClick={closePage}>
          <div ref={pageRef} className="ade-panel gp-panel gp-page" onClick={e => e.stopPropagation()}>
            <div className="ade-panel-header">
              <div className="ade-panel-title">
                <Icon name="trend-up" size={16} style={{ marginRight: '0.4em', verticalAlign: '-2px' }} />
                Grow My Net Worth
                {ai.plan?.source === 'ai' && <span className="ade-ai-badge"><Icon name="sparkles" size={12} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Claude AI</span>}
              </div>
              <button className="qs-close" onClick={closePage} aria-label={t('close')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
              </button>
            </div>

            <div className="gp-body">
              {growthBody()}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
