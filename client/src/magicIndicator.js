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

// ── Pillar 1: Technical ──────────────────────────────────────────────────
export function pillarTechnical(ta) {
  if (!ta || typeof ta.score !== 'number') return { available: false }
  const bits = []
  if (ta.trend) bits.push(ta.trend)
  if (ta.rsi != null) bits.push(`RSI ${Math.round(ta.rsi)}`)
  if (ta.macd?.cross) bits.push(`MACD ${ta.macd.cross}`)
  return {
    available: true,
    score: clamp(ta.score),
    note: bits.join(' · ') || 'price structure',
  }
}

// ── Pillar 2: Volume (confirmation) ──────────────────────────────────────
export function pillarVolume(signals) {
  if (!signals || typeof signals.volPulse !== 'number') return { available: false }
  const vp = signals.volPulse
  const mo = signals.momentum ?? 0
  const dir = Math.sign(mo || signals.adNormalized || 0) || 1
  // Above-average volume → conviction; below-average → dampen toward neutral.
  const surge = Math.tanh(Math.max(0, vp - 1)) // 0..1
  let score = surge * 100 * dir
  if (vp < 1) score *= 0.4
  return {
    available: true,
    score: clamp(score),
    note: `${vp.toFixed(2)}× avg volume, ${dir >= 0 ? 'confirming up' : 'on weakness'}`,
  }
}

// ── Pillar 3: Whales (accumulation / distribution) ───────────────────────
export function pillarWhales(signals) {
  if (!signals || typeof signals.whaleScore !== 'number') return { available: false }
  const w = signals.whaleScore
  const label =
    w >= 50 ? 'strong accumulation' :
    w >= 20 ? 'mild accumulation' :
    w >= -20 ? 'neutral flow' :
    w >= -50 ? 'mild distribution' :
    'strong distribution'
  return { available: true, score: clamp(w), note: label }
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
  return { available: true, score: clamp(score), note: notes.join(' · ') }
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

  return { available: true, score: clamp(s), note: notes.join(' · ') || 'market fundamentals' }
}

// Direction label / colour / emoji for a composite score.
export function directionMeta(score) {
  if (score >= 45) return { label: 'Strong Buy', stance: 'bullish', emoji: '🚀', color: '#16a34a' }
  if (score >= 15) return { label: 'Accumulate', stance: 'bullish', emoji: '📈', color: '#22c55e' }
  if (score > -15) return { label: 'Neutral', stance: 'neutral', emoji: '⚖️', color: '#94a3b8' }
  if (score > -45) return { label: 'Reduce', stance: 'bearish', emoji: '📉', color: '#f59e0b' }
  return { label: 'Distribute', stance: 'bearish', emoji: '🔻', color: '#ef4444' }
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
// Returns null only when no pillar has data.
export function computeMagic({ ta, signals, fundamental } = {}) {
  const raw = {
    technical: pillarTechnical(ta),
    volume: pillarVolume(signals),
    whales: pillarWhales(signals),
    onchain: pillarOnchain(signals, fundamental),
    fundamental: pillarFundamental(fundamental),
  }

  const pillars = PILLAR_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    weight: d.weight,
    available: !!raw[d.key].available,
    score: raw[d.key].available ? raw[d.key].score : null,
    note: raw[d.key].available ? raw[d.key].note : 'no data',
  }))

  const avail = pillars.filter((p) => p.available)
  if (!avail.length) return null

  const wsum = avail.reduce((s, p) => s + p.weight, 0)
  const score = clamp(avail.reduce((s, p) => s + p.score * p.weight, 0) / wsum)

  // Confidence: how much of the model is covered + how much the pillars agree
  // with the composite direction.
  const coverage = avail.length / PILLAR_DEFS.length
  const compSign = Math.sign(score) || 1
  let agreeW = 0
  for (const p of avail) {
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
