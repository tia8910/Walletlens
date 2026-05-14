import { useState, useEffect, useRef } from 'react'
import { track } from '../analytics'

/* ─── local rule engine (fallback when API not available) ─────────────── */
function runEngine(enriched, prices, transactions, totalValue, totalInvested) {
  if (!enriched?.length) return null

  const weights = enriched.map(h => totalValue > 0 ? h.value / totalValue : 0)
  const n = enriched.length

  const momentum = enriched.reduce((s, h, i) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return s + chg * weights[i]
  }, 0)

  const buyCount  = transactions.filter(t => t.type === 'buy').length
  const sellCount = transactions.filter(t => t.type === 'sell').length
  const tradeRatio = buyCount + sellCount > 0 ? buyCount / (buyCount + sellCount) : 0.5
  const sentiment = tradeRatio > 0.65 ? 'accumulating' : tradeRatio < 0.35 ? 'distributing' : 'balanced'

  const assetActions = enriched.map((h, i) => {
    const w = weights[i] * 100
    const pnlPct = h.pnlPct || 0
    const chg24h = prices[h.coin_id]?.usd_24h_change ?? 0
    const sym = h.coin_symbol?.toUpperCase() || h.coin_id

    let score = 0
    const reasons = []

    if (pnlPct > 200)       { score -= 3; reasons.push(`up ${pnlPct.toFixed(0)}% — consider taking some profit`) }
    else if (pnlPct > 80)   { score -= 1; reasons.push(`up ${pnlPct.toFixed(0)}% — partial profit-take worth considering`) }
    else if (pnlPct < -40)  { score -= 2; reasons.push(`down ${Math.abs(pnlPct).toFixed(0)}% from entry — weak recovery signal`) }
    else if (pnlPct < -15)  { score -= 1; reasons.push(`down ${Math.abs(pnlPct).toFixed(0)}% — watch for support`) }
    else if (pnlPct > 10)   { score += 1; reasons.push(`up ${pnlPct.toFixed(0)}% — in a healthy profit zone`) }

    if (w > 60)       { score -= 3; reasons.push(`${w.toFixed(0)}% of portfolio — dangerously concentrated`) }
    else if (w > 40)  { score -= 1; reasons.push(`${w.toFixed(0)}% of portfolio — consider trimming`) }

    if (chg24h > 10)       { score -= 1; reasons.push(`+${chg24h.toFixed(1)}% today — may be overextended`) }
    else if (chg24h > 3)   { score += 1; reasons.push(`+${chg24h.toFixed(1)}% today — bullish momentum`) }
    else if (chg24h < -8)  { score -= 1; reasons.push(`${chg24h.toFixed(1)}% today — bearish pressure`) }
    else if (chg24h < -3)  { reasons.push(`${chg24h.toFixed(1)}% today — pulling back`) }

    const action =
      score <= -4 ? 'SELL' :
      score <= -2 ? 'TRIM' :
      score >= 2  ? 'ADD'  :
      score >= 0  ? 'HOLD' : 'WATCH'

    const actionColor =
      action === 'SELL'  ? '#f87171' :
      action === 'TRIM'  ? '#fbbf24' :
      action === 'ADD'   ? '#34d399' :
      action === 'HOLD'  ? '#60a5fa' : '#a78bfa'

    return { sym, action, actionColor, score, reasons, pnlPct, chg24h, w, value: h.value, coin_image: h.coin_image }
  })

  const sellOrTrim = assetActions.filter(a => a.action === 'SELL' || a.action === 'TRIM')
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
    summary  = `${sellOrTrim.length} of your ${n} positions are flagged for trimming or selling.`
    overallColor = '#fbbf24'
  } else if (sentiment === 'accumulating' && momentum > 0) {
    headline = "You're in accumulation mode — keep building"
    summary  = `Your trade history shows strong buy conviction. Momentum is positive. Continue DCA on your core positions.`
    overallColor = '#34d399'
  } else {
    headline = 'Mixed signals — stay patient and watch the market'
    summary  = `No strong directional signal right now. Monitor your positions and wait for clearer market structure.`
    overallColor = '#a78bfa'
  }

  return { headline, summary, overallColor, confidence: Math.round(confidence), assetActions, momentum, sentiment, n, source: 'local' }
}

/* ─── AI API call ─────────────────────────────────────────────────────── */
async function fetchAIAnalysis(enriched, prices, totalValue, totalInvested, transactions) {
  const momentum = enriched.reduce((s, h) => {
    const w = totalValue > 0 ? h.value / totalValue : 0
    return s + (prices[h.coin_id]?.usd_24h_change ?? 0) * w
  }, 0)

  const buyCount  = transactions.filter(t => t.type === 'buy').length
  const sellCount = transactions.filter(t => t.type === 'sell').length
  const tradeRatio = buyCount + sellCount > 0 ? buyCount / (buyCount + sellCount) : 0.5
  const sentiment = tradeRatio > 0.65 ? 'accumulating' : tradeRatio < 0.35 ? 'distributing' : 'balanced'

  const holdings = enriched.map(h => ({
    sym: h.coin_symbol?.toUpperCase() || h.coin_id,
    w: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
    value: h.value,
    pnlPct: h.pnlPct || 0,
    chg24h: prices[h.coin_id]?.usd_24h_change ?? 0,
    coin_image: h.coin_image || '',
  }))

  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdings, totalValue, totalInvested, momentum, sentiment }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    if (err.error === 'not_configured') return null // fall back to local
    throw new Error(err.error || 'api_error')
  }

  const data = await resp.json()
  if (!data.ok) return null

  return { ...data.analysis, momentum, sentiment, n: enriched.length, source: 'ai' }
}

/* ─── component ──────────────────────────────────────────────────────── */
export default function AIDecisionEngine({ enriched, prices, transactions, totalValue, totalInvested }) {
  const [open, setOpen]         = useState(false)
  const [thinking, setThinking] = useState(false)
  const [result, setResult]     = useState(null)
  const [dots, setDots]         = useState('')
  const [aiMode, setAiMode]     = useState(true)  // optimistically true; set false if API unavailable
  const timerRef                = useRef(null)

  useEffect(() => {
    if (thinking) {
      let i = 0
      timerRef.current = setInterval(() => { i = (i + 1) % 4; setDots('.'.repeat(i)) }, 400)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [thinking])

  async function analyze() {
    setOpen(true)
    setResult(null)
    setThinking(true)
    track('ai_engine_trigger', { holdings_count: enriched?.length || 0 })

    try {
      // Try Claude API first
      const aiResult = await fetchAIAnalysis(enriched, prices, totalValue, totalInvested, transactions)
      if (aiResult) {
        setResult(aiResult)
        setAiMode(true)
        track('ai_engine_result', { source: 'ai', confidence: aiResult.confidence })
        setThinking(false)
        return
      }
    } catch (e) {
      // Network error or parse error — fall through to local engine
    }

    // Local fallback
    setAiMode(false)
    setTimeout(() => {
      const r = runEngine(enriched, prices, transactions, totalValue, totalInvested)
      setResult(r)
      setThinking(false)
      if (r) track('ai_engine_result', { source: 'local', confidence: r.confidence })
    }, 1200)
  }

  function close() { setOpen(false); setResult(null) }

  return (
    <>
      <button className="ade-trigger" onClick={analyze}>
        <span className="ade-trigger-brain">🧠</span>
        <span className="ade-trigger-text">
          What Should I Do Right Now?
          <span className="ade-trigger-sub">AI analyses your portfolio and gives you a verdict</span>
        </span>
        <span className="ade-trigger-arrow">→</span>
      </button>

      {open && (
        <div className="ade-overlay" onClick={close}>
          <div className="ade-panel" onClick={e => e.stopPropagation()}>
            <div className="ade-panel-header">
              <div className="ade-panel-title">
                <span className="ade-title-icon">🧠</span> AI Decision Engine
                {result?.source === 'ai' && (
                  <span className="ade-ai-badge">✦ Claude AI</span>
                )}
              </div>
              <button className="qs-close" onClick={close}>✕</button>
            </div>

            {thinking && (
              <div className="ade-thinking">
                <div className="ade-thinking-orb">🧠</div>
                <div className="ade-thinking-text">Analysing your portfolio{dots}</div>
                <div className="ade-thinking-steps">
                  <div className="ade-thinking-step">
                    <span className="ade-step-dot" />
                    <span className="ade-step-label">Reading {enriched?.length ?? 0} holdings</span>
                  </div>
                  <div className="ade-thinking-step">
                    <span className="ade-step-dot" />
                    <span className="ade-step-label">Checking market momentum</span>
                  </div>
                  <div className="ade-thinking-step">
                    <span className="ade-step-dot" />
                    <span className="ade-step-label">Generating personalised verdict</span>
                  </div>
                </div>
              </div>
            )}

            {!thinking && result && (
              <div className="ade-body">
                <div className="ade-verdict" style={{ borderColor: result.overallColor + '44', background: result.overallColor + '0d', '--verdict-color': result.overallColor }}>
                  <div className="ade-verdict-headline" style={{ color: result.overallColor }}>
                    {result.headline}
                  </div>
                  <div className="ade-verdict-summary">{result.summary}</div>
                  {result.tip && (
                    <div className="ade-tip">
                      <span className="ade-tip-icon">💡</span>
                      <span>{result.tip}</span>
                    </div>
                  )}
                  <div className="ade-verdict-meta">
                    <span className="ade-confidence">
                      <span className="ade-conf-track">
                        <span className="ade-conf-bar" style={{ width: result.confidence + '%', background: result.overallColor }} />
                      </span>
                      {result.confidence}% confidence
                    </span>
                    <span className="ade-momentum-badge" style={{ color: result.momentum >= 0 ? '#34d399' : '#f87171' }}>
                      {result.momentum >= 0 ? '▲' : '▼'} {Math.abs(result.momentum).toFixed(1)}% momentum
                    </span>
                  </div>
                </div>

                <div className="ade-assets-title">Position-by-Position Breakdown</div>
                <div className="ade-assets">
                  {result.assetActions.map((a, i) => (
                    <div key={i} className="ade-asset-row">
                      <div className="ade-asset-left">
                        {a.coin_image && <img src={a.coin_image} alt="" width={28} height={28} className="ade-asset-img" />}
                        <div>
                          <div className="ade-asset-sym">{a.sym}</div>
                          <div className="ade-asset-weight">{typeof a.w === 'number' ? a.w.toFixed(1) : '—'}% of portfolio</div>
                        </div>
                      </div>
                      <div className="ade-asset-reasons">
                        {(a.reasons || []).map((r, j) => (
                          <div key={j} className="ade-reason">{r}</div>
                        ))}
                      </div>
                      <div className="ade-action-badge" style={{ background: a.actionColor + '22', color: a.actionColor, borderColor: a.actionColor + '44', '--badge-glow': a.actionColor + '44' }}>
                        {a.action}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="ade-disclaimer">
                  {result.source === 'ai'
                    ? 'Analysis generated by Claude AI using your live portfolio data. Not financial advice.'
                    : 'This analysis is generated from your portfolio data and market signals. Not financial advice.'}
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
