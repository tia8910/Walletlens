import { useState, useMemo, useEffect, useRef } from 'react'
import { inline } from './DocProse'
import Icon from './Icon'
import { track } from '../analytics'
import { isStablecoin } from '../stablecoins'
import { loadBuckets } from '../data/visionStorage'
import { useLanguage } from '../LanguageContext'

/**
 * Grow My Net Worth — a personalized growth engine.
 *
 * Reads the user's real profile (allocation, concentration, PnL, trade
 * behaviour, Vision goals) and runs a seeded Monte-Carlo simulation of THEIR
 * portfolio mix (per-asset-class return/volatility, cross-correlated) with
 * monthly contributions. Outputs a P10/P50/P90 fan chart, probability of
 * reaching the goal, a ranked list of "which lever moves your outcome most",
 * live what-if sliders, and an AI strategist plan (Claude via /api/analyze,
 * mode growth_plan) with a full local fallback.
 */

/* ── asset-class capital-market assumptions (annual, log-space friendly) ── */
const CLASS_PARAMS = {
  crypto_large: { mu: 0.20, sig: 0.65 },
  crypto_small: { mu: 0.25, sig: 1.05 },
  stocks:       { mu: 0.09, sig: 0.17 },
  metals:       { mu: 0.06, sig: 0.15 },
  realestate:   { mu: 0.05, sig: 0.09 },
  cash:         { mu: 0.03, sig: 0.01 },
}
// Cross-class correlation: risk assets loosely co-move; cash doesn't.
function corr(a, b) {
  if (a === b) return 1
  if (a === 'cash' || b === 'cash') return 0.05
  const cryptoish = c => c.startsWith('crypto')
  if (cryptoish(a) && cryptoish(b)) return 0.85
  return 0.55
}

function classify(h) {
  const id = (h.coin_id || '').toLowerCase()
  const sym = (h.coin_symbol || '').toLowerCase()
  if (isStablecoin(h.coin_id, h.coin_symbol)) return 'cash'
  if (id.startsWith('metal:') || ['xau','xag','xpt','xpd'].includes(sym)) return 'metals'
  if (id.startsWith('stock:') || id.startsWith('xstock:')) return 'stocks'
  if (id.startsWith('real:') || sym.includes('property') || sym.includes('reit')) return 'realestate'
  if (id.startsWith('cash:') || id.startsWith('fiat:')) return 'cash'
  return (h.market_cap || 0) > 10e9 ? 'crypto_large' : 'crypto_small'
}

/* ── deterministic RNG so re-renders don't repaint different futures ────── */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// Box–Muller
function gauss(rnd) {
  let u = 0, v = 0
  while (u === 0) u = rnd()
  while (v === 0) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/* ── portfolio parameters from the user's actual mix ────────────────────── */
function mixParams(weights) {
  // weights: { className: weight 0..1 }
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const mu = entries.reduce((s, [c, w]) => s + w * CLASS_PARAMS[c].mu, 0)
  let variance = 0
  for (const [ci, wi] of entries) {
    for (const [cj, wj] of entries) {
      variance += wi * wj * corr(ci, cj) * CLASS_PARAMS[ci].sig * CLASS_PARAMS[cj].sig
    }
  }
  return { mu, sig: Math.sqrt(Math.max(variance, 0)) }
}

const PRESET_MIXES = {
  current:      null, // resolved from real holdings
  conservative: { stocks: 0.45, metals: 0.20, cash: 0.30, crypto_large: 0.05 },
  balanced:     { stocks: 0.45, crypto_large: 0.20, metals: 0.15, cash: 0.15, crypto_small: 0.05 },
  aggressive:   { crypto_large: 0.45, crypto_small: 0.20, stocks: 0.30, cash: 0.05 },
}

/* ── Monte-Carlo simulation ─────────────────────────────────────────────── */
function simulate({ start, monthly, months, mu, sig, goal, paths = 300, seed = 42 }) {
  const rnd = mulberry32(seed)
  // mu is a geometric CAGR (historical stated returns already embed volatility
  // drag), so the median path compounds at mu and P10/P90 fan around it.
  const mDrift = Math.log(1 + mu) / 12
  const mSig = sig / Math.sqrt(12)
  const terminal = new Array(paths)
  // Per-month sorted snapshots for percentiles. Short horizons sample monthly so
  // a 1-year view isn't a 4-point straight line and the "when do I cross my
  // goal" estimate is accurate to the month; long ones coarsen to stay light.
  const step = months > 120 ? 6 : months > 36 ? 3 : 1
  const sampleMonths = []
  for (let m = step; m <= months; m += step) sampleMonths.push(m)
  if (sampleMonths[sampleMonths.length - 1] !== months) sampleMonths.push(months)
  const snap = sampleMonths.map(() => new Array(paths))
  let goalHits = 0
  const goalMonths = []

  for (let p = 0; p < paths; p++) {
    let v = start
    let hit = 0
    let si = 0
    for (let m = 1; m <= months; m++) {
      v = v * Math.exp(mDrift + mSig * gauss(rnd)) + monthly
      if (!hit && goal > 0 && v >= goal) hit = m
      if (sampleMonths[si] === m) { snap[si][p] = v; si++ }
    }
    terminal[p] = v
    if (hit) { goalHits++; goalMonths.push(hit) }
  }

  const pct = (arr, q) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(q * s.length))]
  }
  const band = sampleMonths.map((m, i) => ({
    m, p10: pct(snap[i], 0.10), p50: pct(snap[i], 0.50), p90: pct(snap[i], 0.90),
  }))
  goalMonths.sort((a, b) => a - b)
  return {
    band,
    p50Terminal: pct(terminal, 0.50),
    p10Terminal: pct(terminal, 0.10),
    p90Terminal: pct(terminal, 0.90),
    probGoal: goal > 0 ? goalHits / paths : null,
    medianGoalMonth: goalMonths.length >= paths / 2 ? goalMonths[Math.floor(paths / 4)] : (goalMonths.length ? goalMonths[Math.floor(goalMonths.length / 2)] : null),
  }
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
    Object.assign(weights, { stocks: 0.45, crypto_large: 0.20, metals: 0.15, cash: 0.15, crypto_small: 0.05 })
  }

  // Concentration: largest single position share
  const top = enriched.reduce((m, h) => Math.max(m, (h.value || 0) / tv), 0)
  const dryPowder = (weights.cash || 0)

  // Trade behaviour: median gap between buys → DCA vs lump-sum
  const buys = transactions.filter(t => t.type === 'buy').length
  const behaviour = buys >= 6 ? 'dca' : buys >= 2 ? 'occasional' : 'lump'

  // Vision goals
  const buckets = loadBuckets()
  let goal = 0, goalMonths = 0, monthly = 0
  for (const b of buckets) {
    monthly += Number(b.monthlyContribution) || 0
    const t = b.targetAmount != null ? Number(b.targetAmount)
            : b.targetPct != null ? tv * Number(b.targetPct) / 100 : 0
    if (t > goal) { goal = t; goalMonths = Number(b.targetMonths) || 0 }
  }
  // Sensible defaults when no Vision goal exists: next big milestone ≈ 2.5×
  if (!goal || goal <= totalValue) {
    const M = [1e3, 2.5e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7]
    goal = M.find(x => x >= totalValue * 2.2) || totalValue * 2.5
  }
  if (!monthly) monthly = Math.max(50, Math.round(totalValue * 0.02 / 50) * 50) // ~2%/mo heuristic
  const horizonM = goalMonths || 120

  const params = mixParams(weights)
  const risk = params.sig > 0.45 ? 'aggressive' : params.sig > 0.20 ? 'growth' : params.sig > 0.08 ? 'balanced' : 'conservative'

  const pnlPct = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0

  return { weights, params, top, dryPowder, behaviour, goal, monthly, horizonM, risk, pnlPct }
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
function localPlan(profile, sim, levers, totalValue) {
  const acts = []
  if (profile.top > 0.5) acts.push(`Your largest position is ${(profile.top * 100).toFixed(0)}% of the portfolio — trimming it toward 30% cuts drawdown risk without hurting expected growth.`)
  if (profile.dryPowder > 0.35) acts.push(`${(profile.dryPowder * 100).toFixed(0)}% sits in cash/stables — idle capital drags your growth rate. Deploy gradually (DCA) into your core mix.`)
  if (profile.dryPowder < 0.05) acts.push('You hold almost no dry powder — keeping 5–10% in stables lets you buy dips instead of watching them.')
  if (profile.behaviour === 'lump') acts.push('Your history shows lump-sum buying. Switching to a fixed monthly DCA removes timing risk — the simulation already assumes you invest monthly, so consistency is the whole game.')
  if (levers[0]) acts.push(`Biggest lever: ${levers[0].label} — ${levers[0].detail}.`)
  const eta = sim.medianGoalMonth ? `${Math.round(sim.medianGoalMonth / 12 * 10) / 10} years` : 'beyond the horizon'
  return {
    headline: sim.probGoal >= 0.7
      ? `You're on track — median path reaches your goal in ~${eta}.`
      : sim.probGoal >= 0.4
        ? `Your goal is reachable but not secured (${Math.round(sim.probGoal * 100)}% of simulated paths make it). Pull the levers below.`
        : `On the current path the goal is unlikely (${Math.round((sim.probGoal || 0) * 100)}% of paths) — contribution is your strongest lever.`,
    narrative: `Simulated ${'400'} market paths of your actual mix (expected ${(profile.params.mu * 100).toFixed(1)}%/yr, volatility ${(profile.params.sig * 100).toFixed(0)}%). Median outcome $${fmtN(sim.p50Terminal)}, pessimistic $${fmtN(sim.p10Terminal)}, optimistic $${fmtN(sim.p90Terminal)}.`,
    actions: acts.slice(0, 4),
    source: 'local',
  }
}

const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString()

/* ── fan chart ──────────────────────────────────────────────────────────── */
function FanChart({ band, goal, months }) {
  if (!band?.length) return null
  const W = 600, H = 240, PAD = { l: 8, r: 56, t: 12, b: 22 }
  const last = band[band.length - 1]
  // Scale to the median/goal region — the lognormal P90 tail would otherwise
  // squash everything to the floor. P90 simply clips at the top of the chart.
  const maxY = Math.max(last.p50 * 1.7, (goal || 0) * 1.35, last.p10 * 2)
  const x = m => PAD.l + (m / months) * (W - PAD.l - PAD.r)
  const y = v => Math.max(PAD.t - 6, H - PAD.b - (v / maxY) * (H - PAD.t - PAD.b))
  const line = key => band.map((b, i) => `${i ? 'L' : 'M'}${x(b.m).toFixed(1)},${y(b[key]).toFixed(1)}`).join('')
  const area = `${line('p90')} ${[...band].reverse().map(b => `L${x(b.m).toFixed(1)},${y(b.p10).toFixed(1)}`).join(' ')} Z`
  const years = Math.round(months / 12)
  const ticks = []
  for (let yr = 1; yr <= years; yr += years > 6 ? 2 : 1) ticks.push(yr)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gp-chart" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill="rgba(var(--g-rgb),0.14)" />
      <path d={line('p90')} fill="none" stroke="rgba(var(--g-rgb),0.45)" strokeWidth="1.4" strokeDasharray="3 4" />
      <path d={line('p10')} fill="none" stroke="rgba(248,113,113,0.5)" strokeWidth="1.4" strokeDasharray="3 4" />
      <path d={line('p50')} fill="none" stroke="var(--g)" strokeWidth="2.6" strokeLinecap="round" />
      {goal > 0 && goal < maxY && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="6 5" />
          <text x={W - PAD.r + 4} y={y(goal) + 4} fill="#fbbf24" fontSize="11" fontWeight="700">${fmtN(goal)}</text>
        </g>
      )}
      <text x={W - PAD.r + 4} y={y(band[band.length - 1].p50) + 4} fill="var(--g-ink)" fontSize="11" fontWeight="700">${fmtN(band[band.length - 1].p50)}</text>
      {ticks.map(yr => (
        <text key={yr} x={x(yr * 12)} y={H - 6} fill="var(--text-sub)" fontSize="10" textAnchor="middle">{yr}y</text>
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
  const [showDetails, setShowDetails] = useState(false)
  const [ai, setAi] = useState({ state: 'idle' })

  // Key the (heavy) profile on stable primitives, not the array identities of
  // `enriched`/`transactions` — Coach re-renders (price polls, etc.) hand us new
  // array refs each time, which otherwise re-ran the whole Monte-Carlo every
  // render and made the panel flash. Recomputes only when the data meaningfully
  // changes.
  const profile = useMemo(
    () => (open && enriched.length ? buildProfile(enriched, totalValue, totalInvested, transactions) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, Math.round(totalValue), Math.round(totalInvested), enriched.length, transactions.length]
  )

  const inputs = profile && {
    monthly: monthly ?? profile.monthly,
    months: (years ?? Math.round(profile.horizonM / 12)) * 12,
    goal: goal ?? profile.goal,
    params: preset === 'current' ? profile.params : mixParams(PRESET_MIXES[preset]),
  }

  const sim = useMemo(() => {
    if (!profile || !inputs) return null
    return simulate({
      start: totalValue, monthly: inputs.monthly, months: inputs.months,
      mu: inputs.params.mu, sig: inputs.params.sig, goal: inputs.goal,
    })
  }, [profile, totalValue, inputs?.monthly, inputs?.months, inputs?.goal, inputs?.params.mu, inputs?.params.sig])

  // Open as a full page: push a history entry so the device/browser back button
  // (and the in-header X) closes it like a real page navigation. Also lock the
  // background page from scrolling underneath, and always start at the top —
  // otherwise the page could open mid-content with the chart/stats cut off.
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
  // The panel mounts only once profile+sim are ready, so pin it to the top then
  // too (the effect above can run before the scroll container exists).
  useEffect(() => {
    if (open && pageRef.current) pageRef.current.scrollTop = 0
  }, [open, !!(profile && sim)])
  const closePage = () => {
    if (window.history.state?.gpOpen) window.history.back()
    else setOpen(false)
  }

  // Lever sensitivity: rerun the sim per lever, rank by Δ median terminal.
  // All runs (including the baseline) share seed 7 so deltas measure the
  // lever, not Monte-Carlo noise between different random sequences.
  const levers = useMemo(() => {
    if (!profile || !sim || !inputs) return []
    const LP = 160 // lighter path count for the lever what-ifs (mobile-friendly)
    const baseline = simulate({ start: totalValue, monthly: inputs.monthly, months: inputs.months, mu: inputs.params.mu, sig: inputs.params.sig, goal: inputs.goal, seed: 7, paths: LP })
    const base = baseline.p50Terminal
    const runs = [
      { id: 'contrib', label: `Add $100/mo (→ $${fmtN(inputs.monthly + 100)})`,
        sim: simulate({ start: totalValue, monthly: inputs.monthly + 100, months: inputs.months, mu: inputs.params.mu, sig: inputs.params.sig, goal: inputs.goal, seed: 7, paths: LP }) },
      { id: 'time', label: 'Stay invested 2 more years',
        sim: simulate({ start: totalValue, monthly: inputs.monthly, months: inputs.months + 24, mu: inputs.params.mu, sig: inputs.params.sig, goal: inputs.goal, seed: 7, paths: LP }) },
      { id: 'derisk', label: 'Rebalance to a balanced mix',
        sim: simulate({ start: totalValue, monthly: inputs.monthly, months: inputs.months, ...mixParams(PRESET_MIXES.balanced), goal: inputs.goal, seed: 7, paths: LP }) },
    ]
    if ((profile.weights.cash || 0) > 0.25) {
      const w = { ...profile.weights }
      const move = Math.min(w.cash - 0.10, 0.5)
      w.cash -= move; w.stocks = (w.stocks || 0) + move * 0.6; w.crypto_large = (w.crypto_large || 0) + move * 0.4
      runs.push({ id: 'deploy', label: `Deploy idle cash (${Math.round((profile.weights.cash) * 100)}% → 10%)`,
        sim: simulate({ start: totalValue, monthly: inputs.monthly, months: inputs.months, ...mixParams(w), goal: inputs.goal, seed: 7, paths: LP }) })
    }
    return runs
      .map(r => {
        const d = r.sim.p50Terminal - base
        const dp = (r.sim.probGoal ?? 0) - (baseline.probGoal ?? 0)
        const parts = []
        if (d >= 500) parts.push(`median +$${fmtN(d)} at horizon`)
        if (dp > 0.015) parts.push(`goal odds +${Math.round(dp * 100)}pts`)
        return { ...r, delta: d, deltaProb: dp, detail: parts.join(', ') }
      })
      .filter(r => r.detail)
      .sort((a, b) => (b.deltaProb - a.deltaProb) || (b.delta - a.delta))
  }, [profile, sim, totalValue, inputs?.monthly, inputs?.months, inputs?.goal, inputs?.params.mu, inputs?.params.sig])

  const stones = useMemo(() => (sim ? milestones(totalValue, sim.band) : []), [sim, totalValue])

  // ── Plain-English summary ────────────────────────────────────────────────
  // Everything below turns the simulation into sentences a non-technical user
  // can act on: what they'll likely have, whether the goal is reachable, and
  // exactly how much per month it would take if it isn't.
  //
  // Monthly contribution needed to reach the goal within the horizon, solved
  // from the compound-growth formula (median growth, no volatility):
  //   FV = start(1+r)^n + m((1+r)^n − 1)/r
  const needMonthly = useMemo(() => {
    if (!inputs || !sim) return null
    const n = inputs.months
    const r = Math.pow(1 + inputs.params.mu, 1 / 12) - 1
    const growth = Math.pow(1 + r, n)
    const fromNow = totalValue * growth
    if (fromNow >= inputs.goal) return 0            // already gets there with $0/mo
    const factor = r > 0 ? (growth - 1) / r : n
    return Math.max(0, Math.ceil((inputs.goal - fromNow) / factor / 10) * 10)
  }, [inputs?.goal, inputs?.months, inputs?.params.mu, totalValue, sim])

  // How long the goal takes at the CURRENT monthly amount (the "just be
  // patient" route). Solved from the same formula for n:
  //   n = ln((goal + m/r) / (start + m/r)) / ln(1+r)
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

  // A one-off top-up today that gets there within the chosen horizon — the
  // "I have some cash spare" route.
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

  // When the goal is reached, taken from the SAME median line drawn on the
  // chart (first point where it crosses the goal, interpolated). The raw sim's
  // medianGoalMonth averages only the paths that happened to hit, so it could
  // promise 5.7 years while the visible line never reaches the goal — telling
  // the user two different stories. Null means "not within this horizon", and
  // the "save $X/month" tip takes over.
  const likelyYears = useMemo(() => {
    if (!sim?.band?.length || !inputs?.goal) return null
    let prev = { m: 0, p50: totalValue }
    for (const pt of sim.band) {
      if (pt.p50 >= inputs.goal) {
        const span = pt.p50 - prev.p50
        const t = span > 0 ? (inputs.goal - prev.p50) / span : 0
        return (prev.m + t * (pt.m - prev.m)) / 12
      }
      prev = pt
    }
    return null
  }, [sim, inputs?.goal, totalValue])

  // Arabic has four plural forms for a count, so this cannot be a suffix.
  const yearsLabel = inputs ? t('gpYears')(Math.round(inputs.months / 12)) : ''
  const odds = Math.round((sim?.probGoal ?? 0) * 100)
  const oddsWord = odds >= 90 ? 'almost certain' : odds >= 70 ? 'very likely' : odds >= 40 ? 'possible' : 'unlikely'
  // Percentages confuse; "7 in 10" reads instantly.
  const oddsChance = Math.max(1, Math.round(odds / 10))
  const oddsColor = odds >= 70 ? 'var(--g-ink)' : odds >= 40 ? '#fbbf24' : '#f87171'

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
            expReturn: inputs.params.mu, vol: inputs.params.sig,
            p10: sim.p10Terminal, p50: sim.p50Terminal, p90: sim.p90Terminal,
            probGoal: sim.probGoal, levers: levers.map(l => ({ label: l.label, detail: l.detail })),
          }),
        })
        const j = await resp.json().catch(() => ({}))
        if (alive && resp.ok && j.ok && j.plan) { setAi({ state: 'done', plan: { ...j.plan, source: 'ai' } }); return }
        throw new Error('fallback')
      } catch {
        if (alive) setAi({ state: 'done', plan: localPlan(profile, sim, levers, totalValue) })
      }
    })()
    return () => { alive = false }
  }, [open, profile, sim])   // eslint-disable-line react-hooks/exhaustive-deps

  // The full growth-plan body, shared by the inline page (/grow) and the
  // legacy overlay presentation.
  const growthBody = () => (
    <>
            {/* ── The answer, in one sentence ── */}
            <div className="gp-answer">
              <p className="gp-answer-lead">
                {inline(t('gpAnswerLead')('$' + fmtN(inputs.monthly), yearsLabel))}
              </p>
              <p className="gp-answer-big">${fmtN(sim.p50Terminal)}</p>
              <p className="gp-answer-sub">
                {inline(t('gpAnswerRange')('$' + fmtN(sim.p10Terminal), '$' + fmtN(sim.p90Terminal)))}
              </p>
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
              <p className="gp-goal-verdict" style={{ color: oddsColor }}>
                {odds < 40 ? (
                  inline(t('gpVerdictUnlikely')('$' + fmtN(inputs.monthly), yearsLabel, oddsChance))
                ) : likelyYears ? (
                  <>{inline(t('gpVerdictReach')(
                      likelyYears < 1
                        ? t('gpMonths')(Math.max(1, Math.round(likelyYears * 12)))
                        : t('gpYearsDec')(likelyYears.toFixed(1)),
                      oddsWord))}
                    {inputs.goal > totalValue && inline(t('gpVerdictAway')('$' + fmtN(inputs.goal - totalValue)))}</>
                ) : (
                  inline(t('gpVerdictOdds')(yearsLabel, oddsWord, oddsChance))
                )}
              </p>
            </div>

            {/* ── How to actually get there ──
                Concrete routes, not just one number: save more, wait longer,
                add a lump sum, or lower the target. Each is one tap to apply. */}
            {(needMonthly > inputs.monthly || (yearsAtCurrent && yearsAtCurrent > inputs.months / 12)) && (
              <div className="gp-how">
                <h4 className="gp-how-h"><Icon name="lightbulb" size={15} />{t('gpHowToReach')}</h4>
                <p className="gp-how-lead">{t('gpAnyOne')}</p>
                <ol className="gp-how-list">
                  {needMonthly > inputs.monthly && (
                    <li>
                      <span className="gp-how-n">1</span>
                      <div>
                        <b>Save ${fmtN(needMonthly)} a month</b> instead of ${fmtN(inputs.monthly)}
                        <span className="gp-how-note">
                          That's ${fmtN(needMonthly - inputs.monthly)} more a month — about
                          ${fmtN(Math.round((needMonthly - inputs.monthly) / 30))} a day.
                        </span>
                        <button type="button" className="gp-how-apply" onClick={() => setMonthly(needMonthly)}>{t('gpTryIt')}</button>
                      </div>
                    </li>
                  )}
                  {yearsAtCurrent && yearsAtCurrent > inputs.months / 12 && yearsAtCurrent <= 30 && (
                    <li>
                      <span className="gp-how-n">{needMonthly > inputs.monthly ? 2 : 1}</span>
                      <div>
                        <b>Give it {Math.ceil(yearsAtCurrent)} years</b> instead of {yearsLabel}
                        <span className="gp-how-note">
                          Keep saving ${fmtN(inputs.monthly)} a month and just wait longer — no extra money needed.
                        </span>
                        <button type="button" className="gp-how-apply" onClick={() => setYears(Math.min(30, Math.ceil(yearsAtCurrent)))}>{t('gpTryIt')}</button>
                      </div>
                    </li>
                  )}
                  {lumpNow > 0 && (
                    <li>
                      <span className="gp-how-n">{1 + (needMonthly > inputs.monthly ? 1 : 0) + (yearsAtCurrent && yearsAtCurrent > inputs.months / 12 && yearsAtCurrent <= 30 ? 1 : 0)}</span>
                      <div>
                        {inline(t('gpAddLump')('$' + fmtN(lumpNow)))}
                        <span className="gp-how-note">
                          A single top-up today — a bonus, savings, or selling something you don't need —
                          then carry on at ${fmtN(inputs.monthly)} a month.
                        </span>
                      </div>
                    </li>
                  )}
                  {sim.p50Terminal < inputs.goal && (
                    <li>
                      <span className="gp-how-n">{1 + (needMonthly > inputs.monthly ? 1 : 0) + (yearsAtCurrent && yearsAtCurrent > inputs.months / 12 && yearsAtCurrent <= 30 ? 1 : 0) + (lumpNow > 0 ? 1 : 0)}</span>
                      <div>
                        <b>Aim for ${fmtN(sim.p50Terminal)}</b> instead
                        <span className="gp-how-note">
                          {t('gpSmallerTarget')}
                        </span>
                        <button type="button" className="gp-how-apply" onClick={() => setGoal(Math.round(sim.p50Terminal))}>{t('gpTryIt')}</button>
                      </div>
                    </li>
                  )}
                </ol>
                <p className="gp-how-foot">
                  {t('gpSavingControl')}
                </p>
              </div>
            )}

            {/* ── Chart, with a plain caption ── */}
            <FanChart band={sim.band} goal={inputs.goal} months={inputs.months} />
            <div className="gp-legend">
              <span><i className="gp-dot" style={{ background: 'var(--g)' }} /> {t('gpLikely')}</span>
              <span><i className="gp-dot" style={{ background: 'rgba(var(--g-rgb),0.45)' }} /> {t('gpMarketsWell')}</span>
              <span><i className="gp-dot" style={{ background: 'rgba(248,113,113,0.6)' }} /> {t('gpMarketsPoorly')}</span>
            </div>
            <p className="gp-caption">{t('gpCaption')}</p>

            {/* ── Two simple dials ── */}
            <div className="gp-controls">
              <label className="gp-slider">
                <span>{inline(t('gpSaveMonthly')('$' + fmtN(inputs.monthly)))}</span>
                <input type="range" min="0" max={Math.max(2000, profile.monthly * 4)} step="25"
                  value={inputs.monthly} onChange={e => setMonthly(Number(e.target.value))} />
              </label>
              <label className="gp-slider">
                <span>{inline(t('gpForYears')(yearsLabel))}</span>
                <input type="range" min="1" max="30" step="1"
                  value={Math.round(inputs.months / 12)} onChange={e => setYears(Number(e.target.value))} />
              </label>
            </div>

            {/* ── Everything advanced lives behind one toggle ── */}
            <button type="button" className="gp-more" onClick={() => setShowDetails(v => !v)}>
              {showDetails ? t('gpHideDetails') : t('gpShowDetails')}
              <span className={`gp-more-arrow${showDetails ? ' open' : ''}`}>›</span>
            </button>

            {showDetails && (<>
            <div className="gp-section">
              <h4 className="gp-h">{t('gpTryDifferentMix')}</h4>
              <p className="gp-caption gp-caption--tight">
                {inline(t('gpMixGrows')((inputs.params.mu * 100).toFixed(1)))}
              </p>
              <div className="gp-presets">
                {['current', 'conservative', 'balanced', 'aggressive'].map(p => (
                  <button key={p} className={`gp-preset ${preset === p ? 'active' : ''}`} onClick={() => setPreset(p)}>
                    {p === 'current' ? 'My mix' : p}
                  </button>
                ))}
              </div>
            </div>

            {/* levers */}
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

            {/* milestones */}
            {stones.length > 0 && (
              <div className="gp-section">
                <h4 className="gp-h">{t('gpMilestones')}</h4>
                <div className="gp-stones">
                  {stones.map(s => (
                    <div key={s.target} className="gp-stone">
                      <b>${fmtN(s.target)}</b>
                      <span>{s.months ? `~${(s.months / 12).toFixed(1)}y` : 'beyond horizon'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI strategist */}
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
                </>
              )}
            </div>

            <p className="gp-disclaimer">These are simulations based on historical-style returns — not financial advice, and not a guarantee. Assumes about {(inputs.params.mu * 100).toFixed(1)}% growth a year with {(inputs.params.sig * 100).toFixed(0)}% ups and downs for your mix.</p>
            </>)}
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
