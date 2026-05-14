import { useState, useEffect, useRef } from 'react'

/* ─── engine ─────────────────────────────────────────────────────────────── */
function runEngine(enriched, prices, transactions, totalValue, totalInvested) {
  if (!enriched?.length) return null

  const weights = enriched.map(h => totalValue > 0 ? h.value / totalValue : 0)
  const n = enriched.length

  // Momentum
  const momentum = enriched.reduce((s, h, i) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return s + chg * weights[i]
  }, 0)

  // Trade sentiment
  const buyCount  = transactions.filter(t => t.type === 'buy').length
  const sellCount = transactions.filter(t => t.type === 'sell').length
  const tradeRatio = buyCount + sellCount > 0 ? buyCount / (buyCount + sellCount) : 0.5
  const sentiment = tradeRatio > 0.65 ? 'accumulating' : tradeRatio < 0.35 ? 'distributing' : 'balanced'

  // Per-asset verdicts
  const assetActions = enriched.map((h, i) => {
    const w = weights[i] * 100
    const pnlPct = h.pnlPct || 0
    const chg24h = prices[h.coin_id]?.usd_24h_change ?? 0
    const sym = h.coin_symbol?.toUpperCase() || h.coin_id

    // Score each holding — positive = hold/buy, negative = sell/trim
    let score = 0
    const reasons = []

    if (pnlPct > 200)  { score -= 3; reasons.push(`up ${pnlPct.toFixed(0)}% — consider taking some profit`) }
    else if (pnlPct > 80)  { score -= 1; reasons.push(`up ${pnlPct.toFixed(0)}% — partial profit-take worth considering`) }
    else if (pnlPct < -40) { score -= 2; reasons.push(`down ${Math.abs(pnlPct).toFixed(0)}% from entry — weak recovery signal`) }
    else if (pnlPct < -15) { score -= 1; reasons.push(`down ${Math.abs(pnlPct).toFixed(0)}% — watch for support`) }
    else if (pnlPct > 10 && pnlPct <= 80) { score += 1; reasons.push(`up ${pnlPct.toFixed(0)}% — in a healthy profit zone`) }

    if (w > 60)  { score -= 3; reasons.push(`${w.toFixed(0)}% of your portfolio — dangerously concentrated`) }
    else if (w > 40) { score -= 1; reasons.push(`${w.toFixed(0)}% of portfolio — consider trimming concentration`) }
    else if (w < 5 && h.value > 50) { score += 0; reasons.push(`small position at ${w.toFixed(1)}%`) }

    if (chg24h > 10)  { score -= 1; reasons.push(`+${chg24h.toFixed(1)}% today — may be overextended short-term`) }
    else if (chg24h > 3)  { score += 1; reasons.push(`+${chg24h.toFixed(1)}% today — bullish momentum`) }
    else if (chg24h < -8) { score -= 1; reasons.push(`${chg24h.toFixed(1)}% today — bearish pressure`) }
    else if (chg24h < -3) { score += 0; reasons.push(`${chg24h.toFixed(1)}% today — pulling back`) }

    const action =
      score <= -4 ? 'SELL'     :
      score <= -2 ? 'TRIM'     :
      score >= 2  ? 'ADD'      :
      score >= 0  ? 'HOLD'     : 'WATCH'

    const actionColor =
      action === 'SELL'  ? '#f87171' :
      action === 'TRIM'  ? '#fbbf24' :
      action === 'ADD'   ? '#34d399' :
      action === 'HOLD'  ? '#60a5fa' : '#a78bfa'

    return { sym, action, actionColor, score, reasons, pnlPct, chg24h, w, value: h.value, coin_image: h.coin_image }
  })

  // Overall verdict
  const sellOrTrim = assetActions.filter(a => a.action === 'SELL' || a.action === 'TRIM')
  const adds       = assetActions.filter(a => a.action === 'ADD')
  const confidence = Math.min(95, 55 + Math.abs(momentum) * 3 + (n >= 4 ? 15 : 0) + (transactions.length >= 5 ? 10 : 0))

  let headline, summary, overallColor
  if (momentum > 5 && sellOrTrim.length === 0) {
    headline = 'Portfolio is performing well — hold your positions'
    summary  = `Strong bullish momentum (+${momentum.toFixed(1)}% weighted). All positions look healthy. No urgent action required.`
    overallColor = '#34d399'
  } else if (momentum < -5 && sellOrTrim.length >= 2) {
    headline = 'Market is turning — consider reducing risk'
    summary  = `Bearish momentum (${momentum.toFixed(1)}% weighted) with ${sellOrTrim.length} positions signalling exit. Protect capital.`
    overallColor = '#f87171'
  } else if (sellOrTrim.length >= 2) {
    headline = 'Take some profit — a few positions are overextended'
    summary  = `${sellOrTrim.length} of your ${n} positions are flagged for trimming or selling. Market momentum is ${momentum >= 0 ? 'positive' : 'weak'}.`
    overallColor = '#fbbf24'
  } else if (sentiment === 'accumulating' && momentum > 0) {
    headline = 'You\'re in accumulation mode — keep building'
    summary  = `Your trade history shows strong buy conviction. Momentum is positive. Continue DCA on your core positions.`
    overallColor = '#34d399'
  } else {
    headline = 'Mixed signals — stay patient and watch the market'
    summary  = `No strong directional signal right now. Monitor your flagged positions and wait for clearer market structure.`
    overallColor = '#a78bfa'
  }

  return { headline, summary, overallColor, confidence: Math.round(confidence), assetActions, momentum, sentiment, n }
}

/* ─── component ──────────────────────────────────────────────────────────── */
export default function AIDecisionEngine({ enriched, prices, transactions, totalValue, totalInvested }) {
  const [open, setOpen]         = useState(false)
  const [thinking, setThinking] = useState(false)
  const [result, setResult]     = useState(null)
  const [dots, setDots]         = useState('')
  const timerRef                = useRef(null)

  // Animate thinking dots
  useEffect(() => {
    if (thinking) {
      let i = 0
      timerRef.current = setInterval(() => { i = (i + 1) % 4; setDots('.'.repeat(i)) }, 400)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [thinking])

  function analyze() {
    setOpen(true)
    setResult(null)
    setThinking(true)
    // Simulate "thinking" delay for effect
    setTimeout(() => {
      const r = runEngine(enriched, prices, transactions, totalValue, totalInvested)
      setResult(r)
      setThinking(false)
    }, 1800)
  }

  function close() { setOpen(false); setResult(null) }

  return (
    <>
      {/* Trigger button */}
      <button className="ade-trigger" onClick={analyze}>
        <span className="ade-trigger-brain">🧠</span>
        <span className="ade-trigger-text">What Should I Do Right Now?</span>
        <span className="ade-trigger-arrow">→</span>
      </button>

      {/* Full-screen panel */}
      {open && (
        <div className="ade-overlay" onClick={close}>
          <div className="ade-panel" onClick={e => e.stopPropagation()}>
            <div className="ade-panel-header">
              <div className="ade-panel-title">
                <span className="ade-title-icon">🧠</span> AI Decision Engine
              </div>
              <button className="qs-close" onClick={close}>✕</button>
            </div>

            {thinking && (
              <div className="ade-thinking">
                <div className="ade-thinking-orb">
                  <span className="ade-thinking-emoji">🧠</span>
                </div>
                <div className="ade-thinking-text">
                  Analysing your portfolio{dots}
                  <div className="ade-thinking-steps">
                    <span>Reading {enriched?.length ?? 0} holdings</span>
                    <span>Checking market momentum</span>
                    <span>Scoring each position</span>
                  </div>
                </div>
              </div>
            )}

            {!thinking && result && (
              <div className="ade-body">
                {/* Overall verdict */}
                <div className="ade-verdict" style={{ borderColor: result.overallColor + '44', background: result.overallColor + '0d' }}>
                  <div className="ade-verdict-headline" style={{ color: result.overallColor }}>
                    {result.headline}
                  </div>
                  <div className="ade-verdict-summary">{result.summary}</div>
                  <div className="ade-verdict-meta">
                    <span className="ade-confidence">
                      <span className="ade-conf-bar" style={{ width: result.confidence + '%', background: result.overallColor }} />
                      {result.confidence}% confidence
                    </span>
                    <span className="ade-momentum-badge" style={{ color: result.momentum >= 0 ? '#34d399' : '#f87171' }}>
                      {result.momentum >= 0 ? '▲' : '▼'} {Math.abs(result.momentum).toFixed(1)}% momentum
                    </span>
                  </div>
                </div>

                {/* Per-asset verdicts */}
                <div className="ade-assets-title">Position-by-Position Breakdown</div>
                <div className="ade-assets">
                  {result.assetActions.map((a, i) => (
                    <div key={i} className="ade-asset-row">
                      <div className="ade-asset-left">
                        {a.coin_image && <img src={a.coin_image} alt="" width={28} height={28} className="ade-asset-img" />}
                        <div>
                          <div className="ade-asset-sym">{a.sym}</div>
                          <div className="ade-asset-weight">{a.w.toFixed(1)}% of portfolio</div>
                        </div>
                      </div>
                      <div className="ade-asset-reasons">
                        {a.reasons.map((r, j) => (
                          <div key={j} className="ade-reason">{r}</div>
                        ))}
                      </div>
                      <div className="ade-action-badge" style={{ background: a.actionColor + '22', color: a.actionColor, borderColor: a.actionColor + '44' }}>
                        {a.action}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="ade-disclaimer">
                  This analysis is generated from your own portfolio data and market signals. It is not financial advice.
                </div>
              </div>
            )}

            {!thinking && !result && (
              <div className="ade-empty">Add some holdings to get a personalised verdict.</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
