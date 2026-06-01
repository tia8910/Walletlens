// ── Magic Indicator ───────────────────────────────────────────────────────
// Merges five independent read-outs of a crypto holding into one direction:
//   1. Technical   — RSI / MACD / Bollinger / trend (from technicals.js)
//   2. On-chain    — flow + supply/turnover proxies (free data, no paid API)
//   3. Volume      — is volume confirming the move?
//   4. Whales      — accumulation vs distribution (smart-signal whale score)
//   5. Fundamental — market-cap tier, dilution (FDV/MC, supply), ATH distance
//
// Each pillar produces a score in -100..100 (positive = bullish / accumulate,
// negative = bearish / distribute). They are blended by weight (only the
// pillars that have data count, with weights renormalised), yielding a
// composite score, a direction label, and a confidence based on coverage +
// agreement between the pillars.
//
// Pure & dependency-free so it is unit-testable and runs client-side.

const clamp = (v, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v))
const round = (v) => Math.round(v)
// Pillar scores are displayed directly, so they must be whole integers.
const cr = (v) => Math.round(clamp(v))

// ── Pillar 1: Technical ──────────────────────────────────────────────────
export function pillarTechnical(ta, fundamental) {
  if (ta && typeof ta.score === 'number') {
    const bits = []
    if (ta.trend) bits.push(ta.trend)
    if (ta.rsi != null) bits.push(`RSI ${Math.round(ta.rsi)}`)
    if (ta.macd?.cross) bits.push(`MACD ${ta.macd.cross}`)
    return {
      available: true,
      score: cr(ta.score),
      note: bits.join(' · ') || 'price structure',
    }
  }
  // Fallback: when the per-coin candle fetch is rate-limited, derive a
  // momentum-based technical read from 24h/30d price change so the pillar
  // still shows a value instead of "n/a". Flagged as a proxy in the note.
  if (fundamental && (typeof fundamental.change30d === 'number' || typeof fundamental.change24h === 'number')) {
    const c30 = fundamental.change30d ?? 0
    const c24 = fundamental.change24h ?? 0
    const score = cr(Math.tanh(c30 / 40) * 65 + Math.tanh(c24 / 12) * 35)
    return { available: true, score, note: `price-momentum proxy (${c30 >= 0 ? '+' : ''}${Math.round(c30)}% 30d)` }
  }
  return { available: false }
}

// ── Pillar 2: Volume (confirmation) ──────────────────────────────────────
// Primary signal is the volume pulse (last-24h vs window-average) from the
// per-coin chart fetch. That fetch is the first to drop out under CoinGecko
// rate limits, so when it's missing we fall back to the asset's 24h volume vs
// market cap (turnover) from the bulk fundamentals call — which is almost
// always present — so the pillar still reads a value instead of "n/a".
export function pillarVolume(signals, fundamental) {
  if (signals && typeof signals.volPulse === 'number') {
    const vp = signals.volPulse
    const mo = signals.momentum ?? 0
    const dir = Math.sign(mo || signals.adNormalized || 0) || 1
    // Above-average volume → conviction; below-average → dampen toward neutral.
    const surge = Math.tanh(Math.max(0, vp - 1)) // 0..1
    let score = surge * 100 * dir
    if (vp < 1) score *= 0.4
    return {
      available: true,
      score: cr(score),
      note: `${vp.toFixed(2)}× avg volume, ${dir >= 0 ? 'confirming up' : 'on weakness'}`,
    }
  }

  // Fallback: turnover (24h volume / market cap) as a liquidity/conviction proxy.
  if (fundamental && fundamental.marketCap > 0 && fundamental.totalVolume > 0) {
    const turnover = fundamental.totalVolume / fundamental.marketCap
    const dir = Math.sign(fundamental.change24h ?? fundamental.change30d ?? 0) || 1
    // Map turnover to a 0..1 conviction: ~3%+ daily turnover is healthy/active.
    const conviction = Math.tanh(turnover / 0.05) // 0..1, ~0.76 at 5%
    let score = conviction * 70 * dir // capped softer than the pulse path
    if (turnover < 0.005) score *= 0.4 // very thin volume → dampen
    return {
      available: true,
      score: cr(score),
      note: `${(turnover * 100).toFixed(1)}% turnover, ${dir >= 0 ? 'confirming up' : 'on weakness'}`,
    }
  }

  return { available: false }
}

// ── Pillar 3: Whales (accumulation / distribution) ───────────────────────
export function pillarWhales(signals, fundamental) {
  const flowLabel = (w) =>
    w >= 50 ? 'strong accumulation' :
    w >= 20 ? 'mild accumulation' :
    w >= -20 ? 'neutral flow' :
    w >= -50 ? 'mild distribution' :
    'strong distribution'

  if (signals && typeof signals.whaleScore === 'number') {
    return { available: true, score: cr(signals.whaleScore), note: flowLabel(signals.whaleScore) }
  }
  // Fallback 1: accumulation/distribution flow if the whale feed is missing.
  if (signals && typeof signals.adNormalized === 'number') {
    const score = cr(signals.adNormalized * 100)
    return { available: true, score, note: `${flowLabel(score)} (flow estimate)` }
  }
  // Fallback 2: turnover-vs-momentum proxy from bulk fundamentals so the
  // pillar always reads a value instead of "n/a".
  if (fundamental && fundamental.marketCap > 0 && fundamental.totalVolume > 0) {
    const turnover = fundamental.totalVolume / fundamental.marketCap
    const dir = Math.sign(fundamental.change24h ?? fundamental.change30d ?? 0) || 1
    const score = cr(Math.tanh(turnover / 0.08) * 45 * dir)
    return { available: true, score, note: `${flowLabel(score)} (volume proxy)` }
  }
  return { available: false }
}

// ── Pillar 4: On-chain (flow + supply/turnover proxies) ──────────────────
export function pillarOnchain(signals, fundamental) {
  const parts = []
  const notes = []

  if (signals && typeof signals.adNormalized === 'number') {
    parts.push({ v: clamp(signals.adNormalized * 100), w: 0.5 })
    notes.push(`flow ${signals.adNormalized >= 0 ? '+' : ''}${Math.round(signals.adNormalized * 100)}%`)
  }

  if (fundamental && fundamental.marketCap > 0 && fundamental.totalVolume > 0) {
    const turnover = fundamental.totalVolume / fundamental.marketCap // NVT-ish
    let tScore
    if (turnover < 0.01) tScore = -25            // illiquid / stagnant
    else if (turnover <= 0.3) tScore = 25         // healthy liquidity
    else if (turnover <= 0.6) tScore = 0          // hot
    else tScore = -25                             // churn / blow-off
    parts.push({ v: tScore, w: 0.25 })
    notes.push(`turnover ${(turnover * 100).toFixed(1)}%`)
  }

  if (fundamental && fundamental.circulatingSupply > 0) {
    const denom = fundamental.maxSupply || fundamental.totalSupply || 0
    if (denom > 0) {
      const ratio = fundamental.circulatingSupply / denom
      let dScore
      if (ratio >= 0.9) dScore = 25                // little future dilution
      else if (ratio >= 0.7) dScore = 10
      else if (ratio >= 0.5) dScore = -5
      else dScore = -25                            // heavy unlocks ahead
      parts.push({ v: dScore, w: 0.25 })
      notes.push(`${Math.round(ratio * 100)}% supply circulating`)
    }
  }

  if (!parts.length) return { available: false }
  const wsum = parts.reduce((s, p) => s + p.w, 0)
  const score = parts.reduce((s, p) => s + p.v * p.w, 0) / wsum
  return { available: true, score: cr(score), note: notes.join(' · ') }
}

// ── Pillar 5: Fundamental ────────────────────────────────────────────────
export function pillarFundamental(fundamental) {
  if (!fundamental || !(fundamental.marketCap > 0)) return { available: false }
  let s = 0
  const notes = []

  const rank = fundamental.marketCapRank
  if (rank) {
    if (rank <= 10) s += 30
    else if (rank <= 25) s += 18
    else if (rank <= 50) s += 8
    else if (rank <= 100) s += 0
    else if (rank <= 300) s -= 10
    else s -= 18
    notes.push(`#${rank} mcap`)
  }

  if (fundamental.fdv && fundamental.fdv > fundamental.marketCap * 1.05) {
    const fdvRatio = fundamental.fdv / fundamental.marketCap
    if (fdvRatio > 5) s -= 25
    else if (fdvRatio > 2) s -= 12
    else s -= 5
    notes.push(`FDV ${fdvRatio.toFixed(1)}× mcap`)
  }

  const ath = fundamental.athChangePct // typically negative (% below ATH)
  if (typeof ath === 'number') {
    if (ath > -12) s -= 8                 // near ATH — stretched
    else if (ath >= -75) s += 12          // healthy room to recover
    else if (ath < -88) s -= 12           // broken / left for dead
    notes.push(`${Math.round(ath)}% from ATH`)
  }

  if (typeof fundamental.change30d === 'number') {
    s += clamp(Math.tanh(fundamental.change30d / 60) * 20, -20, 20)
  }

  return { available: true, score: cr(s), note: notes.join(' · ') || 'market fundamentals' }
}

// Direction label / colour / icon for a composite score.
export function directionMeta(score) {
  if (score >= 45) return { label: 'Strong Buy', stance: 'bullish', icon: 'arrow-ne', color: '#16a34a' }
  if (score >= 15) return { label: 'Accumulate', stance: 'bullish', icon: 'trend-up', color: '#22c55e' }
  if (score > -15) return { label: 'Neutral', stance: 'neutral', icon: 'scale', color: '#94a3b8' }
  if (score > -45) return { label: 'Reduce', stance: 'bearish', icon: 'trend-down', color: '#f59e0b' }
  return { label: 'Distribute', stance: 'bearish', icon: 'arrow-down', color: '#ef4444' }
}

const PILLAR_DEFS = [
  { key: 'technical', label: 'Technical', weight: 0.30 },
  { key: 'whales', label: 'Whales', weight: 0.20 },
  { key: 'onchain', label: 'On-chain', weight: 0.20 },
  { key: 'fundamental', label: 'Fundamental', weight: 0.18 },
  { key: 'volume', label: 'Volume', weight: 0.12 },
]

// Merge the pillars into a single direction.
// Inputs: { ta, signals, fundamental } — any may be null/undefined.
// Every pillar always renders a value: when a feed is rate-limited we fall
// back to data-backed proxies (see the pillar fns) and, as a last resort,
// to a neutral 0 (flagged `estimated`) so nothing ever shows "n/a".
export function computeMagic({ ta, signals, fundamental } = {}) {
  const raw = {
    technical: pillarTechnical(ta, fundamental),
    volume: pillarVolume(signals, fundamental),
    whales: pillarWhales(signals, fundamental),
    onchain: pillarOnchain(signals, fundamental),
    fundamental: pillarFundamental(fundamental),
  }

  const pillars = PILLAR_DEFS.map((d) => {
    const r = raw[d.key]
    if (r.available) {
      return { key: d.key, label: d.label, weight: d.weight, available: true, score: r.score, note: r.note, estimated: false }
    }
    // Last-resort neutral so the row reads "0" instead of "n/a". Marked
    // `estimated` so it's excluded from the composite score & confidence.
    return { key: d.key, label: d.label, weight: d.weight, available: true, score: 0, note: 'limited data — neutral', estimated: true }
  })

  // Composite is built only from data-backed pillars (real + proxy), never
  // from the neutral fillers, so confidence isn't inflated by missing feeds.
  const basis = pillars.filter((p) => !p.estimated)
  if (!basis.length) {
    return { score: 0, direction: directionMeta(0), confidence: 0, coverage: 0, pillars }
  }

  const wsum = basis.reduce((s, p) => s + p.weight, 0)
  const score = clamp(basis.reduce((s, p) => s + p.score * p.weight, 0) / wsum)

  // Confidence: how much of the model is covered + how much the pillars agree
  // with the composite direction.
  const coverage = basis.length / PILLAR_DEFS.length
  const compSign = Math.sign(score) || 1
  let agreeW = 0
  for (const p of basis) {
    const ps = Math.sign(p.score)
    if (Math.abs(p.score) < 8) agreeW += 0.5 * p.weight     // ~neutral: half credit
    else if (ps === compSign) agreeW += p.weight
  }
  const agreement = agreeW / wsum
  const confidence = round(100 * (0.35 * coverage + 0.65 * agreement))

  return {
    score: round(score),
    direction: directionMeta(score),
    confidence,
    coverage: round(coverage * 100),
    pillars,
  }
}

// Value-weighted portfolio direction from an array of per-asset magic results
// shaped as { value, magic }. Returns null if none are usable.
export function aggregateMagic(items = []) {
  const usable = items.filter((it) => it && it.magic && it.value > 0)
  if (!usable.length) return null
  const totalW = usable.reduce((s, it) => s + it.value, 0)
  if (totalW <= 0) return null
  const score = clamp(usable.reduce((s, it) => s + it.magic.score * it.value, 0) / totalW)
  const confidence = round(usable.reduce((s, it) => s + it.magic.confidence * it.value, 0) / totalW)
  return { score: round(score), direction: directionMeta(score), confidence, assets: usable.length }
}
