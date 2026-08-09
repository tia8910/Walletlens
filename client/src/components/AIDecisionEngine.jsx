import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import { track } from '../analytics'
import { isStablecoin } from '../stablecoins'
import CoinLogo from './CoinLogo'
import { renderMaybe } from '../data/walletEvalTips'

// The action code drives the filtering below and the badge colour, so it stays
// a stable English token. Only its label is translated.
const ACTION_LABEL_KEYS = {
  SELL: 'deActSell', TRIM: 'deActTrim', ADD: 'deActAdd',
  HOLD: 'deActHold', WATCH: 'deActWatch',
}

/* ─── local rule engine (fallback when API not available) ─────────────── */
/**
 * Runs at module scope, so every sentence it produces is a descriptor
 * `[key, ...args]` that the panel resolves — there is no hook to translate
 * from here. The model-backed path in fetchAIAnalysis() returns real prose
 * instead, which renderMaybe passes through untouched.
 */
function runEngine(enriched, prices, transactions, totalValue, totalInvested) {
  if (!enriched?.length) return null

  const investable = enriched.filter(h => !isStablecoin(h.coin_id, h.coin_symbol))
  const investValue = investable.reduce((s, h) => s + h.value, 0) || 1
  const weights = investable.map(h => h.value / investValue)
  const n = investable.length

  const momentum = investable.reduce((s, h, i) => {
    const chg = prices[h.coin_id]?.usd_24h_change ?? 0
    return s + chg * weights[i]
  }, 0)

  const buyCount  = transactions.filter(t => t.type === 'buy').length
  const sellCount = transactions.filter(t => t.type === 'sell').length
  const tradeRatio = buyCount + sellCount > 0 ? buyCount / (buyCount + sellCount) : 0.5
  const sentiment = tradeRatio > 0.65 ? 'accumulating' : tradeRatio < 0.35 ? 'distributing' : 'balanced'

  const assetActions = investable.map((h, i) => {
    const w = weights[i] * 100
    const pnlPct = h.pnlPct || 0
    const chg24h = prices[h.coin_id]?.usd_24h_change ?? 0
    const sym = h.coin_symbol?.toUpperCase() || h.coin_id

    let score = 0
    const reasons = []

    if (pnlPct > 200)       { score -= 3; reasons.push(['deRnProfitBig', pnlPct.toFixed(0)]) }
    else if (pnlPct > 80)   { score -= 1; reasons.push(['deRnProfitMed', pnlPct.toFixed(0)]) }
    else if (pnlPct < -40)  { score -= 2; reasons.push(['deRnDownBig', Math.abs(pnlPct).toFixed(0)]) }
    else if (pnlPct < -15)  { score -= 1; reasons.push(['deRnDownMed', Math.abs(pnlPct).toFixed(0)]) }
    else if (pnlPct > 10)   { score += 1; reasons.push(['deRnHealthy', pnlPct.toFixed(0)]) }

    if (w > 60)       { score -= 3; reasons.push(['deRnConcentrated', w.toFixed(0)]) }
    else if (w > 40)  { score -= 1; reasons.push(['deRnTrimWeight', w.toFixed(0)]) }

    if (chg24h > 10)       { score -= 1; reasons.push(['deRnOverextended', chg24h.toFixed(1)]) }
    else if (chg24h > 3)   { score += 1; reasons.push(['deRnBullish', chg24h.toFixed(1)]) }
    else if (chg24h < -8)  { score -= 1; reasons.push(['deRnBearish', chg24h.toFixed(1)]) }
    else if (chg24h < -3)  { reasons.push(['deRnPullback', chg24h.toFixed(1)]) }

    const action =
      score <= -4 ? 'SELL' :
      score <= -2 ? 'TRIM' :
      score >= 2  ? 'ADD'  :
      score >= 0  ? 'HOLD' : 'WATCH'

    const actionColor =
      action === 'SELL'  ? '#f87171' :
      action === 'TRIM'  ? '#fbbf24' :
      action === 'ADD'   ? 'var(--g)' :
      action === 'HOLD'  ? '#60a5fa' : '#a78bfa'

    return { sym, action, actionColor, score, reasons, pnlPct, chg24h, w, value: h.value, coin_image: h.coin_image, coin_id: h.coin_id }
  })

  const sellOrTrim = assetActions.filter(a => a.action === 'SELL' || a.action === 'TRIM')
  const confidence = Math.min(95, 55 + Math.abs(momentum) * 3 + (n >= 4 ? 15 : 0) + (transactions.length >= 5 ? 10 : 0))

  let headline, summary, overallColor
  if (momentum > 5 && sellOrTrim.length === 0) {
    headline = ['deHlPerforming']
    summary  = ['deSumPerforming', momentum.toFixed(1)]
    overallColor = 'var(--g)'
  } else if (momentum < -5 && sellOrTrim.length >= 2) {
    headline = ['deHlTurning']
    summary  = ['deSumTurning', momentum.toFixed(1), sellOrTrim.length]
    overallColor = '#f87171'
  } else if (sellOrTrim.length >= 2) {
    headline = ['deHlTakeProfit']
    summary  = ['deSumTakeProfit', sellOrTrim.length, n]
    overallColor = '#fbbf24'
  } else if (sentiment === 'accumulating' && momentum > 0) {
    headline = ['deHlAccumulation']
    summary  = ['deSumAccumulation']
    overallColor = 'var(--g)'
  } else {
    headline = ['deHlMixed']
    summary  = ['deSumMixed']
    overallColor = '#a78bfa'
  }

  return { headline, summary, overallColor, confidence: Math.round(confidence), assetActions, momentum, sentiment, n, source: 'local' }
}

/* ─── AI API call ─────────────────────────────────────────────────────── */
async function fetchAIAnalysis(enriched, prices, totalValue, totalInvested, transactions, lang) {
  const investable = enriched.filter(h => !isStablecoin(h.coin_id, h.coin_symbol))
  const investValue = investable.reduce((s, h) => s + h.value, 0) || 1
  const momentum = investable.reduce((s, h) => {
    const w = h.value / investValue
    return s + (prices[h.coin_id]?.usd_24h_change ?? 0) * w
  }, 0)

  const buyCount  = transactions.filter(t => t.type === 'buy').length
  const sellCount = transactions.filter(t => t.type === 'sell').length
  const tradeRatio = buyCount + sellCount > 0 ? buyCount / (buyCount + sellCount) : 0.5
  const sentiment = tradeRatio > 0.65 ? 'accumulating' : tradeRatio < 0.35 ? 'distributing' : 'balanced'

  const holdings = investable.map(h => ({
    sym: h.coin_symbol?.toUpperCase() || h.coin_id,
    w: (h.value / investValue) * 100,
    value: h.value,
    pnlPct: h.pnlPct || 0,
    chg24h: prices[h.coin_id]?.usd_24h_change ?? 0,
    coin_image: h.coin_image || '',
  }))

  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdings, totalValue, totalInvested, momentum, sentiment, lang }),
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
  const { t, lang } = useLanguage()
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
      const aiResult = await fetchAIAnalysis(enriched, prices, totalValue, totalInvested, transactions, lang)
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
        <span className="ade-trigger-brain">◈</span>
        <span className="ade-trigger-text">
          {t('deTitle')}
          <span className="ade-trigger-sub">{t('deSub')}</span>
        </span>
        <span className="ade-trigger-arrow">→</span>
      </button>

      {open && (
        <div className="ade-overlay" onClick={close}>
          <div className="ade-panel" onClick={e => e.stopPropagation()}>
            <div className="ade-panel-header">
              <div className="ade-panel-title">
                <span className="ade-title-icon">◈</span> {t('deTitleFull')}
                {result?.source === 'ai' && (
                  <span className="ade-ai-badge"><Icon name="sparkles" size={12} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />{t('deAiBadge')}</span>
                )}
              </div>
              <button className="qs-close" onClick={close} aria-label={t('close')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
              </button>
            </div>

            {thinking && (
              <div className="ade-thinking">
                <div className="ade-thinking-orb">◈</div>
                <div className="ade-thinking-text">{t('deAnalysing')}{dots}</div>
                <div className="ade-thinking-steps">
                  <div className="ade-thinking-step">
                    <span className="ade-step-dot" />
                    <span className="ade-step-label">{t('deReadingN')(enriched?.length ?? 0)}</span>
                  </div>
                  <div className="ade-thinking-step">
                    <span className="ade-step-dot" />
                    <span className="ade-step-label">{t('deChecking')}</span>
                  </div>
                  <div className="ade-thinking-step">
                    <span className="ade-step-dot" />
                    <span className="ade-step-label">{t('deGenerating')}</span>
                  </div>
                </div>
              </div>
            )}

            {!thinking && result && (
              <div className="ade-body">
                <div className="ade-verdict" style={{ borderColor: result.overallColor + '44', background: result.overallColor + '0d', '--verdict-color': result.overallColor }}>
                  <div className="ade-verdict-headline" style={{ color: result.overallColor }}>
                    {renderMaybe(result.headline, t)}
                  </div>
                  <div className="ade-verdict-summary">{renderMaybe(result.summary, t)}</div>
                  {result.tip && (
                    <div className="ade-tip">
                      <span className="ade-tip-icon"><Icon name="lightbulb" size={14} /></span>
                      <span>{renderMaybe(result.tip, t)}</span>
                    </div>
                  )}
                  <div className="ade-verdict-meta">
                    <span className="ade-confidence">
                      <span className="ade-conf-track">
                        <span className="ade-conf-bar" style={{ width: result.confidence + '%', background: result.overallColor }} />
                      </span>
                      {t('deConfidencePct')(result.confidence)}
                    </span>
                    <span className="ade-momentum-badge" style={{ color: result.momentum >= 0 ? 'var(--g-ink)' : '#f87171' }}>
                      {t('deMomentumBadge')(`${result.momentum >= 0 ? '▲' : '▼'} ${Math.abs(result.momentum).toFixed(1)}%`)}
                    </span>
                  </div>
                </div>

                <div className="ade-assets-title">{t('deBreakdown')}</div>
                <div className="ade-assets">
                  {result.assetActions.map((a, i) => (
                    <div key={i} className="ade-asset-row">
                      <div className="ade-asset-left">
                        <CoinLogo image={a.coin_image} symbol={a.sym} coinId={a.coin_id} size={28} className="ade-asset-img" />
                        <div>
                          <div className="ade-asset-sym">{a.sym}</div>
                          <div className="ade-asset-weight">{t('deOfPortfolio')(typeof a.w === 'number' ? a.w.toFixed(1) : '—')}</div>
                        </div>
                      </div>
                      <div className="ade-asset-reasons">
                        {(a.reasons || []).map((r, j) => (
                          <div key={j} className="ade-reason">{renderMaybe(r, t)}</div>
                        ))}
                      </div>
                      <div className="ade-action-badge" style={{ background: a.actionColor + '22', color: a.actionColor, borderColor: a.actionColor + '44', '--badge-glow': a.actionColor + '44' }}>
                        {t(ACTION_LABEL_KEYS[a.action]) || a.action}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="ade-disclaimer">
                  {result.source === 'ai'
                    ? t('deDisclaimerAi')
                    : t('deDisclaimerLocal')}
                </div>
              </div>
            )}

            {!thinking && !result && (
              <div className="ade-empty">{t('deEmpty')}</div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
