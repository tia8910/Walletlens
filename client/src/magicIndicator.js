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
      quality: 'live',
      score: cr(ta.score),
      note: bits.join(' · ') || 'price structure',
    }
  }
  // Fallback: when the per-coin candle fetch is rate-limited, derive a
  // momentum-based technical read from 24h/30d price change so the pillar
  // still shows a value. This is NOT true RSI/MACD analysis, so it's marked
  // `proxy` and counts at reduced weight in the composite.
  if (fundamental && (typeof fundamental.change30d === 'number' || typeof fundamental.change24h === 'number')) {
    const c30 = fundamental.change30d ?? 0
    const c24 = fundamental.change24h ?? 0
    const score = cr(Math.tanh(c30 / 40) * 65 + Math.tanh(c24 / 12) * 35)
    return { available: true, quality: 'proxy', score, note: `price-momentum proxy (${c30 >= 0 ? '+' : ''}${Math.round(c30)}% 30d)` }
  }
  return { available: false }
}

// ── Pillar 2: Volume (confirmation) ──────────────────────────────────────
// Turnover (24h volume / market cap) from the bulk fundamentals call is the
// primary, reliably-present signal so the pillar almost always reads a real
// value. When the per-coin chart is available its volume pulse refines the
// score (a surge above average boosts conviction). Previously the pulse path
// short-circuited to 0 whenever volume was at/below average, which left most
// assets reading a flat 0 — turnover now anchors the score instead.
export function pillarVolume(signals, fundamental) {
  const notes = []
  let score = null

  // Base: turnover-driven conviction in the direction of the price move.
  if (fundamental && fundamental.marketCap > 0 && fundamental.totalVolume > 0) {
    const turnover = fundamental.totalVolume / fundamental.marketCap
    const dir = Math.sign(fundamental.change24h ?? fundamental.change30d ?? 0) || 1
    const conviction = Math.tanh(turnover / 0.05) // 0..1, ~0.76 at 5% daily turnover
    let s = conviction * 70 * dir
    if (turnover < 0.005) s *= 0.4 // very thin volume → dampen
    score = s
    notes.push(`${(turnover * 100).toFixed(1)}% turnover`)
  }

  // Refinement: volume pulse vs the trailing average when the chart is present.
  if (signals && typeof signals.volPulse === 'number') {
    const vp = signals.volPulse
    const mo = signals.momentum ?? 0
    const dir = Math.sign(mo || signals.adNormalized || (fundamental?.change24h ?? 0)) || 1
    const dev = Math.tanh(Math.abs(vp - 1)) // 0..1 deviation from average
    const pulse = (vp >= 1 ? dev : -dev * 0.5) * 100 * dir
    score = score == null ? pulse : score * 0.55 + pulse * 0.45
    notes.unshift(`${vp.toFixed(2)}× avg volume`)
  }

  if (score == null) return { available: false }
  const dirUp = score >= 0
  return {
    available: true,
    quality: 'live', // turnover & pulse are real volume data
    score: cr(score),
    note: `${notes.join(' · ')}, ${dirUp ? 'confirming up' : 'on weakness'}`,
  }
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
    return { available: true, quality: 'live', score: cr(signals.whaleScore), note: flowLabel(signals.whaleScore) }
  }
  // Fallback 1: accumulation/distribution flow — this is the core component of
  // the whale score, so it's a faithful read, not a loose proxy.
  if (signals && typeof signals.adNormalized === 'number') {
    const score = cr(signals.adNormalized * 100)
    return { available: true, quality: 'live', score, note: `${flowLabel(score)} (flow)` }
  }
  // Fallback 2: turnover×direction is only loosely related to whale flow, so
  // it's marked `proxy` and counts at reduced weight in the composite.
  if (fundamental && fundamental.marketCap > 0 && fundamental.totalVolume > 0) {
    const turnover = fundamental.totalVolume / fundamental.marketCap
    const dir = Math.sign(fundamental.change24h ?? fundamental.change30d ?? 0) || 1
    const score = cr(Math.tanh(turnover / 0.08) * 45 * dir)
    return { available: true, quality: 'proxy', score, note: `${flowLabel(score)} (volume proxy)` }
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
  return { available: true, quality: 'live', score: cr(score), note: notes.join(' · ') }
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

  return { available: true, quality: 'live', score: cr(s), note: notes.join(' · ') || 'market fundamentals' }
}


// ── Pillar 6: Momentum (NEW — composite oscillator signal) ────────────────
// Combines Stochastic RSI, Williams %R, ADX trend strength, and CCI into
// a single momentum score. This catches reversals that plain RSI/MACD miss.
export function pillarMomentum(ta) {
  if (!ta) return { available: false }
  let score = 0, count = 0, notes = []

  // StochRSI — strong reversal signal
  if (ta.stochRSI) {
    const { k, d, cross, state } = ta.stochRSI
    let s = 0
    if (cross === 'bullish') s += 35
    else if (cross === 'bearish') s -= 35
    if (state === 'oversold') s += 20
    else if (state === 'overbought') s -= 20
    // Also use %K position
    s += (k - 50) * 0.3
    score += s; count++
    notes.push(`StochRSI ${Math.round(k)}/${Math.round(d)}`)
  }

  // Williams %R
  if (ta.williamsR != null) {
    const wr = ta.williamsR
    let s = 0
    if (wr < -80) s += 30       // oversold — buy signal
    else if (wr > -20) s -= 30  // overbought — sell signal
    else s += wr * 0.3          // linear between
    score += s; count++
    notes.push(`W%R ${Math.round(wr)}`)
  }

  // ADX — trend strength (not direction, but amplifies directional signals)
  if (ta.adx) {
    const { adx: adxVal, trending } = ta.adx
    // ADX itself doesn't give direction, but when trending it amplifies
    // whatever the other signals say. We boost the note.
    if (trending) notes.push(`ADX ${Math.round(adxVal)} trending`)
    else notes.push(`ADX ${Math.round(adxVal)} ranging`)
    // ADX as a confidence amplifier (applied in composite, not here)
  }

  // CCI — overbought/oversold + momentum
  if (ta.cci != null) {
    const c = ta.cci
    let s = 0
    if (c > 100) s -= 25       // overbought
    else if (c < -100) s += 25 // oversold
    else s += (c / 100) * 20   // proportional
    score += s; count++
    notes.push(`CCI ${Math.round(c)}`)
  }

  // MFI — volume-weighted RSI
  if (ta.mfi != null) {
    const m = ta.mfi
    let s = 0
    if (m > 80) s -= 20
    else if (m < 20) s += 20
    else s += ((m - 50) / 50) * 15
    score += s; count++
    notes.push(`MFI ${Math.round(m)}`)
  }

  // Ichimoku Cloud position
  if (ta.ichimoku) {
    const { aboveCloud, belowCloud, cloudColor, cross } = ta.ichimoku
    let s = 0
    if (aboveCloud) s += 20
    else if (belowCloud) s -= 20
    if (cross === 'bullish') s += 15
    else if (cross === 'bearish') s -= 15
    if (cloudColor === 'bullish') s += 10
    else s -= 10
    score += s; count++
    notes.push(`Ichimoku ${cloudColor} cloud`)
  }

  // Parabolic SAR
  if (ta.sar) {
    const s = ta.sar.trend === 'long' ? 15 : -15
    score += s; count++
    notes.push(`SAR ${ta.sar.trend}`)
  }

  // OBV divergence
  if (ta.obv) {
    const { trend, divergence } = ta.obv
    let s = trend === 'up' ? 10 : -10
    if (divergence) { s = -s * 0.5; notes.push('OBV divergence ⚠') } // divergence = warning
    score += s; count++
    notes.push(`OBV ${trend}`)
  }

  if (count === 0) return { available: false }
  const avg = score / count
  // ADX amplifies when trending
  const adxAmp = ta.adx?.trending ? 1.15 : 1.0
  return {
    available: true,
    quality: 'live',
    score: cr(clamp(avg * adxAmp)),
    note: notes.slice(0, 3).join(' · ') || 'momentum analysis',
  }
}

// ── Pillar 7: Sentiment (Fear & Greed + dominance) ────────────────────────
// Uses Fear & Greed Index + BTC dominance change + market cap breadth.
export function pillarSentiment(signals, fundamental) {
  if (!signals && !fundamental) return { available: false }
  let score = 0, count = 0, notes = []

  // Fear & Greed Index (0 = extreme fear, 100 = extreme greed)
  // Contrarian: extreme fear = buy, extreme greed = sell
  if (signals && typeof signals.fearGreed === 'number') {
    const fg = signals.fearGreed
    let s = 0
    if (fg <= 20) s += 40       // extreme fear — strong contrarian buy
    else if (fg <= 35) s += 20  // fear
    else if (fg >= 80) s -= 40  // extreme greed — strong contrarian sell
    else if (fg >= 65) s -= 20  // greed
    else s += (50 - fg) * 0.3   // moderate
    score += s; count++
    notes.push(`F&G ${Math.round(fg)}`)
  }

  // BTC dominance — rising dominance = altcoins underperforming
  if (signals && typeof signals.btcDominance === 'number' && typeof signals.dominanceChange === 'number') {
    const dc = signals.dominanceChange
    const isBTC = fundamental?.symbol?.toLowerCase() === 'btc'
    if (isBTC) score += clamp(dc * 8, -20, 20)
    else score += clamp(-dc * 8, -20, 20)
    count++
    notes.push(`BTC.D ${signals.btcDominance.toFixed(1)}%`)
  }

  // Social sentiment proxy (from CoinGecko community data)
  if (signals && typeof signals.socialScore === 'number') {
    score += clamp((signals.socialScore - 50) * 0.4, -20, 20)
    count++
    notes.push(`social ${Math.round(signals.socialScore)}`)
  }

  // Market breadth (% of coins above their 200-day SMA)
  if (signals && typeof signals.marketBreadth === 'number') {
    const mb = signals.marketBreadth
    score += clamp((mb - 50) * 0.5, -25, 25)
    count++
    notes.push(`breadth ${Math.round(mb)}%`)
  }

  // Fallback for non-crypto: derive sentiment from price momentum + volume
  if (count === 0 && fundamental) {
    // Strong recent gains = greedy sentiment (contrarian sell signal)
    if (typeof fundamental.change24h === 'number') {
      const s = clamp(-fundamental.change24h * 2, -30, 30) // contrarian
      score += s; count++
      notes.push(`24h ${fundamental.change24h >= 0 ? '+' : ''}${Math.round(fundamental.change24h)}%`)
    }
    if (typeof fundamental.change30d === 'number') {
      const s = clamp(-fundamental.change30d * 0.8, -25, 25) // contrarian
      score += s; count++
      notes.push(`30d ${fundamental.change30d >= 0 ? '+' : ''}${Math.round(fundamental.change30d)}%`)
    }
    // High volume turnover = high attention = sentiment-driven
    if (fundamental.marketCap > 0 && fundamental.totalVolume > 0) {
      const turnover = fundamental.totalVolume / fundamental.marketCap
      if (turnover > 0.1) { score -= 15; notes.push('high attention') }
      else if (turnover < 0.01) { score += 10; notes.push('low attention') }
    }
    // ATH distance as fear proxy — deep drawdown = fear
    if (typeof fundamental.athChangePct === 'number') {
      const ath = fundamental.athChangePct
      if (ath < -50) { score += 20; notes.push(`${Math.round(ath)}% from ATH`) }
      else if (ath > -5) { score -= 15; notes.push('near ATH') }
    }
  }

  if (count === 0) return { available: false }
  return {
    available: true,
    quality: count >= 2 ? 'live' : 'proxy',
    score: cr(clamp(score / Math.max(count, 1))),
    note: notes.join(' · ') || 'market sentiment',
  }
}

// ── Pillar 8: Cycle Position (Bitcoin halving cycle + market phases) ──────
// Uses Bitcoin halving cycle timing + Pi Cycle Top/Bottom indicators to
// estimate where we are in the 4-year market cycle.
export function pillarCycle(fundamental) {
  if (!fundamental) return { available: false }
  let score = 0, notes = []

  // Pi Cycle Bottom/Top signals (from fundamental data if available)
  if (fundamental.piCycleBottom) { score += 40; notes.push('Pi Cycle Bottom signal') }
  if (fundamental.piCycleTop) { score -= 40; notes.push('Pi Cycle Top signal') }

  // Bitcoin halving cycle position (approx every 4 years)
  // Last halving: April 2024. Next: ~2028.
  if (fundamental.halvingCyclePosition != null) {
    const pos = fundamental.halvingCyclePosition
    if (pos < 0.15) { score += 30; notes.push('early cycle accumulation') }
    else if (pos < 0.4) { score += 20; notes.push('markup phase') }
    else if (pos < 0.6) { score += 5; notes.push('mid-cycle') }
    else if (pos < 0.8) { score -= 15; notes.push('late cycle') }
    else { score -= 30; notes.push('distribution phase') }
  }

  // Distance from all-time high as a cycle proxy (works for ALL assets)
  if (typeof fundamental.athChangePct === 'number') {
    const ath = fundamental.athChangePct
    if (ath > -10) { score -= 20; notes.push('near ATH — late cycle') }
    else if (ath < -75) { score += 25; notes.push('deep drawdown — early cycle') }
    else if (ath < -50) { score += 15; notes.push('mid-recovery') }
    else if (ath < -25) { score += 5; notes.push('post-ATH pullback') }
  }

  // Multi-timeframe momentum as cycle proxy (works for ALL assets)
  if (typeof fundamental.change30d === 'number' && typeof fundamental.change24h === 'number') {
    const m30 = fundamental.change30d
    const m24 = fundamental.change24h
    // Strong 30d rally + slowing 24h = potential cycle top
    if (m30 > 40 && m24 < 0) { score -= 15; notes.push('rally stalling') }
    // Weak 30d + strong 24h bounce = potential cycle bottom
    else if (m30 < -30 && m24 > 5) { score += 15; notes.push('bounce from bottom') }
    // Steady uptrend
    else if (m30 > 10 && m24 > 0) { score += 8; notes.push('uptrend momentum') }
    // Steady downtrend
    else if (m30 < -10 && m24 < 0) { score -= 8; notes.push('downtrend momentum') }
  }

  // Market cap rank as cycle proxy (crypto-specific, but rank changes matter for stocks too)
  if (fundamental.marketCapRank && fundamental.marketCapRank <= 10) {
    if (typeof fundamental.athChangePct === 'number' && fundamental.athChangePct > -30) {
      score -= 5
    }
  }

  if (notes.length === 0) return { available: false }
  return {
    available: true,
    quality: 'proxy',
    score: cr(clamp(score / Math.max(notes.length, 1) * 1.5)),
    note: notes.slice(0, 2).join(' · ') || 'cycle analysis',
  }
}

// ── Pillar 9: Cross-Asset Correlation ────────────────────────────────────
// Measures how correlated the asset is with BTC, SPY, gold, and DXY.
// High BTC correlation = BTC regime matters more. Negative SPY correlation = hedge.
export function pillarCorrelation(signals, fundamental) {
  if (!signals && !fundamental) return { available: false }
  let score = 0, notes = []

  // BTC correlation (for altcoins — from signals if available)
  if (signals && typeof signals.btcCorrelation === 'number') {
    const corr = signals.btcCorrelation
    const btcMomentum = signals.btcMomentum ?? 0
    if (corr > 0.7) {
      score += btcMomentum * corr * 0.5
      notes.push(`BTC corr ${corr.toFixed(2)}`)
    } else if (corr < 0.3) {
      score += 10
      notes.push('low BTC corr — diversifier')
    }
  }

  // SPY correlation
  if (signals && typeof signals.spyCorrelation === 'number') {
    const corr = signals.spyCorrelation
    if (corr > 0.6) {
      const spyTrend = signals.spyTrend ?? 0
      score += spyTrend * 0.3
      notes.push(`SPY corr ${corr.toFixed(2)}`)
    }
  }

  // Gold correlation
  if (signals && typeof signals.goldCorrelation === 'number') {
    const corr = signals.goldCorrelation
    if (corr < -0.3) { score += 8; notes.push('neg. gold corr — hedge') }
    else if (corr > 0.6) { notes.push('high gold corr') }
  }

  // DXY (Dollar Index)
  if (signals && typeof signals.dxyChange === 'number') {
    const dxy = signals.dxyChange
    score += clamp(-dxy * 5, -20, 20)
    notes.push(`DXY ${dxy >= 0 ? '+' : ''}${(dxy * 100).toFixed(1)}%`)
  }

  // Fallback for non-crypto: use asset category + momentum as proxy
  if (notes.length === 0 && fundamental) {
    const id = fundamental.id || ''
    const isMetal = id.startsWith('metal:') || /xau|xag|xpt|xcu/i.test(id)
    const isStock = id.startsWith('stock:') || fundamental.stockSymbol

    if (isMetal) {
      // Metals are inflation hedges — positive in risk-off environments
      if (typeof fundamental.change30d === 'number' && fundamental.change30d > 10) {
        score += 15; notes.push('strong metal rally — risk-off')
      } else if (typeof fundamental.change30d === 'number' && fundamental.change30d < -10) {
        score -= 10; notes.push('weak metal — risk-on')
      } else {
        notes.push('metal — inflation hedge')
      }
    } else if (isStock) {
      // Stocks correlate with macro — use momentum as proxy
      if (typeof fundamental.change30d === 'number') {
        score += clamp(fundamental.change30d * 0.5, -20, 20)
        notes.push(`stock momentum ${fundamental.change30d >= 0 ? '+' : ''}${Math.round(fundamental.change30d)}%`)
      }
    } else {
      // Crypto — use market cap dominance changes as proxy
      if (typeof fundamental.change30d === 'number') {
        score += clamp(fundamental.change30d * 0.3, -15, 15)
        notes.push(`crypto momentum`)
      }
    }
  }

  if (notes.length === 0) return { available: false }
  return {
    available: true,
    quality: signals ? 'live' : 'proxy',
    score: cr(clamp(score / Math.max(notes.length, 1) * 1.2)),
    note: notes.slice(0, 2).join(' · ') || 'cross-asset analysis',
  }
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
  { key: 'technical', label: 'Technical', weight: 0.20 },
  { key: 'momentum', label: 'Momentum', weight: 0.18 },
  { key: 'whales', label: 'Whales', weight: 0.12 },
  { key: 'onchain', label: 'On-chain', weight: 0.12 },
  { key: 'volume', label: 'Volume', weight: 0.10 },
  { key: 'sentiment', label: 'Sentiment', weight: 0.12 },
  { key: 'cycle', label: 'Cycle', weight: 0.08 },
  { key: 'correlation', label: 'Correlation', weight: 0.08 },
]

// Merge the pillars into a single direction.
// Inputs: { ta, signals, fundamental } — any may be null/undefined.
// Every pillar always renders a value: when a feed is rate-limited we fall
// back to data-backed proxies (see the pillar fns) and, as a last resort,
// to a neutral 0 (flagged `estimated`) so nothing ever shows "n/a".
export function computeMagic({ ta, signals, fundamental } = {}) {
  const raw = {
    technical: pillarTechnical(ta, fundamental),
    momentum: pillarMomentum(ta),
    volume: pillarVolume(signals, fundamental),
    whales: pillarWhales(signals, fundamental),
    onchain: pillarOnchain(signals, fundamental),
    sentiment: pillarSentiment(signals, fundamental),
    cycle: pillarCycle({ ...fundamental, ...signals }),
    correlation: pillarCorrelation(signals, fundamental),
    fundamental: pillarFundamental(fundamental),
  }

  const pillars = PILLAR_DEFS.map((d) => {
    const r = raw[d.key]
    if (r.available) {
      return { key: d.key, label: d.label, weight: d.weight, available: true, score: r.score, note: r.note, quality: r.quality || 'live', estimated: false }
    }
    // Last-resort neutral so the row reads "0" instead of "n/a". Marked
    // `none`/`estimated` so it's excluded from the composite & confidence.
    return { key: d.key, label: d.label, weight: d.weight, available: true, score: 0, note: 'limited data — neutral', quality: 'none', estimated: true }
  })

  // Effective weight by data quality: live data at full weight, proxies (price
  // momentum standing in for real TA, turnover standing in for whale flow) at
  // half so the composite stays driven by genuine signals, neutral fillers at
  // zero. This keeps the reading accurate and confidence honest.
  const QW = { live: 1, proxy: 0.5, none: 0 }
  const ew = (p) => p.weight * QW[p.quality]

  const basis = pillars.filter((p) => p.quality !== 'none')
  const ewsum = basis.reduce((s, p) => s + ew(p), 0)
  if (!basis.length || ewsum <= 0) {
    return { score: 0, direction: directionMeta(0), confidence: 0, coverage: 0, pillars }
  }

  const score = clamp(basis.reduce((s, p) => s + p.score * ew(p), 0) / ewsum)

  // Confidence: effective coverage of the model + how strongly the pillars
  // agree with the composite direction (both weighted by data quality, so
  // proxy-heavy reads report lower confidence).
  const fullW = PILLAR_DEFS.reduce((s, d) => s + d.weight, 0)
  const coverage = ewsum / fullW
  const compSign = Math.sign(score) || 1
  let agreeW = 0
  for (const p of basis) {
    const w = ew(p)
    const ps = Math.sign(p.score)
    if (Math.abs(p.score) < 8) agreeW += 0.5 * w     // ~neutral: half credit
    else if (ps === compSign) agreeW += w
  }
  const agreement = agreeW / ewsum
  // Gate confidence by coverage so a single proxy pillar (which trivially
  // "agrees" with itself) can't report high confidence — thin or proxy-heavy
  // reads stay honestly low.
  const confidence = round(100 * coverage * (0.4 + 0.6 * agreement))

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
