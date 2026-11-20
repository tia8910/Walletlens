import { useState, useEffect, useMemo } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import { track } from '../analytics'
import { analyzeTarget, fetchTargetData } from '../targetAnalysis'
import { VOICE_API } from '../apiHosts.js'

// Sell-target reality check — "is this target reasonable, and how long might it
// take?" Local heuristic (ATH + past-year pace + trend) with an optional AI take.
const VOICE_ENDPOINT = VOICE_API
export default function TargetRealityCheck({ coinId, coinSymbol, coinName, currentPrice, targetPrice, assetClass, compact = false }) {
  const { t } = useLanguage()
  const [data, setData] = useState(null)
  const [ai, setAi] = useState({ state: 'idle' })

  useEffect(() => {
    let alive = true
    fetchTargetData(coinId).then(d => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [coinId])

  const analysis = useMemo(
    () => (targetPrice > 0 ? analyzeTarget({ symbol: coinSymbol, currentPrice, targetPrice, ath: data?.ath, change30d: data?.change30d, oneYearReturnPct: data?.oneYearReturnPct }) : null),
    [coinSymbol, currentPrice, targetPrice, data]
  )
  if (!analysis) return null

  async function askAi() {
    setAi({ state: 'loading' })
    track('target_ai_analysis', { coin_id: coinId })
    try {
      const resp = await fetch(VOICE_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'target_analysis', symbol: coinSymbol, name: coinName, current: currentPrice, target: targetPrice, ath: data?.ath, oneYearReturnPct: data?.oneYearReturnPct, volatilityPct: data?.volatilityPct, assetClass }),
      })
      const j = await resp.json().catch(() => ({}))
      if (resp.ok && j.ok && j.analysis) setAi({ state: 'done', ...j.analysis })
      else setAi({ state: 'error' })
    } catch { setAi({ state: 'error' }) }
  }

  if (compact) {
    // Inline: the verdict as a pill beside the other facts, with its timeframe
    // when there is one. It used to sit alone in a full-width box.
    return (
      <span className="tg2-trc" style={{ '--trc': analysis.color }} title={[analysis.timeframe, analysis.context].filter(Boolean).join('. ')}>
        <span className="tg2-trc-badge">{analysis.label}</span>
      </span>
    )
  }

  return (
    <div className="dvx-trc" style={{ '--trc': analysis.color }}>
      <div className="dvx-trc-head">
        <span className="dvx-trc-badge">{analysis.label}</span>
        <span className="dvx-trc-req">{analysis.requiredPct >= 0 ? '+' : ''}{analysis.requiredPct.toFixed(0)}% away</span>
      </div>
      <div className="dvx-trc-line">{analysis.context}</div>
      {analysis.timeframe && <div className="dvx-trc-line"><Icon name="clock" size={12} style={{ verticalAlign:'-1px', marginRight:'0.3em' }} />{analysis.timeframe}</div>}
      {analysis.trend && <div className="dvx-trc-line dvx-trc-sub">{analysis.trend}</div>}
      {ai.state === 'done' && ai.reasoning && (
        <div className="dvx-trc-ai"><Icon name="sparkles" size={12} style={{ verticalAlign:'-1px', marginRight:'0.3em' }} /><strong>{ai.verdict || 'AI'}{ai.timeframe ? ` · ${ai.timeframe}` : ''}</strong><br />{ai.reasoning}</div>
      )}
      <div className="dvx-trc-foot">
        {ai.state !== 'done' && (
          <button type="button" className="dvx-trc-ai-btn" onClick={askAi} disabled={ai.state === 'loading'}>
            {ai.state === 'loading' ? 'Analyzing…' : ai.state === 'error' ? 'Retry AI take' : '✨ Ask AI for a deeper take'}
          </button>
        )}
        <span className="dvx-trc-disclaimer">{t('dsRoughEstimate')}</span>
      </div>
    </div>
  )
}
