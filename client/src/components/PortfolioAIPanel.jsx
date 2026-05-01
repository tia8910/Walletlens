// AI Portfolio Analysis card. Lifted out of Dashboard.jsx — receives the
// pre-computed `analysis` object as a prop and owns the local "expanded"
// + "show stress test" state. No data fetching here, no recharts deps,
// pure presentation.
import { useState } from 'react'

export default function PortfolioAIPanel({ analysis }) {
  const [showAnalysis, setShowAnalysis] = useState(true)
  const [showStressTest, setShowStressTest] = useState(false)
  if (!analysis) return null

  return (
    <div className="portfolio-ai">
      <div className="portfolio-ai-header" onClick={() => setShowAnalysis(s => !s)}>
        <div className="portfolio-ai-title">
          <span className="ai-badge">AI</span>
          <span>Portfolio Analysis</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             style={{ transform: showAnalysis ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {showAnalysis && (
        <div className="portfolio-ai-body">
          <div className="ai-score-cards">
            <ScoreRing value={analysis.healthScore} color={analysis.healthColor} label="Health" desc={analysis.healthLabel} descColor={analysis.healthColor} />
            <ScoreRing
              value={analysis.diversificationScore}
              color={analysis.diversificationScore > 60 ? '#10b981' : analysis.diversificationScore > 30 ? '#f59e0b' : '#ef4444'}
              label="Diversity"
              desc={analysis.diversificationScore > 60 ? 'Good' : analysis.diversificationScore > 30 ? 'Fair' : 'Low'}
            />
            <div className="ai-score-card">
              <div className="ai-info-block">
                <span className="ai-info-icon" aria-hidden="true">{analysis.riskIcon}</span>
                <span className="ai-info-value" style={{ color: analysis.riskColor }}>{analysis.riskLevel}</span>
              </div>
              <span className="ai-score-label">Risk</span>
              <span className="ai-score-desc muted">{analysis.riskDetail || `${analysis.avgVolatility.toFixed(1)}% 24h vol`}</span>
            </div>
            <div className="ai-score-card">
              <div className="ai-info-block">
                <span className="ai-info-value" style={{ color: analysis.momentumColor, fontSize: '1rem' }}>
                  {analysis.weightedChange24h >= 0 ? '↑' : '↓'} {Math.abs(analysis.weightedChange24h).toFixed(2)}%
                </span>
              </div>
              <span className="ai-score-label">Momentum</span>
              <span className="ai-score-desc" style={{ color: analysis.momentumColor }}>{analysis.momentumLabel}</span>
            </div>
          </div>

          {analysis.signalsReady && analysis.annualisedVol != null && (
            <div className="deep-metrics">
              <DeepMetric
                label="Sharpe-like"
                value={analysis.portfolioSharpe == null ? '–' : analysis.portfolioSharpe.toFixed(2)}
                hint="Risk-adjusted return (annualised return ÷ volatility). >1 = good."
                color={analysis.portfolioSharpe == null ? '#94a3b8'
                  : analysis.portfolioSharpe > 1 ? '#10b981'
                  : analysis.portfolioSharpe > 0 ? '#f59e0b' : '#ef4444'}
              />
              <DeepMetric label="30d Return" value={`${(analysis.portfolio30dReturn * 100).toFixed(1)}%`} hint="Weighted average of each asset's 30-day return." color={analysis.portfolio30dReturn >= 0 ? '#10b981' : '#ef4444'} />
              <DeepMetric label="Max Drawdown" value={`${(analysis.portfolioMaxDD * 100).toFixed(0)}%`} hint="Worst peak-to-trough drop over last 30 days (weighted)." color={analysis.portfolioMaxDD > 0.3 ? '#ef4444' : analysis.portfolioMaxDD > 0.15 ? '#f59e0b' : '#10b981'} />
              <DeepMetric label="Ann. Volatility" value={`${(analysis.annualisedVol * 100).toFixed(0)}%`} hint="Annualised stdev of daily log returns (weighted)." color={analysis.annualisedVol > 1 ? '#ef4444' : analysis.annualisedVol > 0.6 ? '#f59e0b' : '#10b981'} />
              <DeepMetric label="High-Vol Exp." value={`${analysis.highVolExposurePct.toFixed(0)}%`} hint="% of portfolio in assets with >100% annualised volatility." color={analysis.highVolExposurePct > 50 ? '#ef4444' : analysis.highVolExposurePct > 25 ? '#f59e0b' : '#10b981'} />
            </div>
          )}

          {!analysis.signalsReady && (
            <div className="deep-metrics-loading">
              <span className="tiny-spinner" /> Loading 30-day signals for deep metrics…
            </div>
          )}

          {analysis.categoryBreakdown.length > 1 && (
            <SegmentedBreakdown title="Asset-Class Allocation" badge={analysis.crossAssetDiversity} rows={analysis.categoryBreakdown} />
          )}

          {analysis.capBreakdown && analysis.capBreakdown.some(c => ['large','mid','small','unknown'].includes(c.key)) && (
            <SegmentedBreakdown title="Market Cap Split" badge="Large ≥$10B · Mid $1B–10B · Small <$1B" badgeMuted rows={analysis.capBreakdown} />
          )}

          {(analysis.topWinners.filter(h => h.pnl > 0).length > 0 || analysis.topLosers.length > 0) && (
            <div className="ai-section">
              <div className="ai-section-head"><span>P&L Attribution</span></div>
              <div className="ai-attribution">
                {analysis.topWinners.filter(h => h.pnl > 0).length > 0 && (
                  <div className="ai-attr-col">
                    <div className="ai-attr-title positive">Top Contributors</div>
                    {analysis.topWinners.filter(h => h.pnl > 0).map(h => (
                      <div key={h.coin_id} className="ai-attr-row">
                        <span className="ai-attr-sym">{h.coin_symbol.toUpperCase()}</span>
                        <span className="positive">+${h.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                )}
                {analysis.topLosers.length > 0 && (
                  <div className="ai-attr-col">
                    <div className="ai-attr-title negative">Biggest Drags</div>
                    {analysis.topLosers.map(h => (
                      <div key={h.coin_id} className="ai-attr-row">
                        <span className="ai-attr-sym">{h.coin_symbol.toUpperCase()}</span>
                        <span className="negative">${h.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="ai-section">
            <div className="ai-section-head">
              <span>Stress Test <span className="ai-section-badge-muted">if BTC moves</span></span>
              <button className="link-btn" onClick={() => setShowStressTest(s => !s)} aria-expanded={showStressTest}>
                {showStressTest ? 'Hide' : 'Show'}
              </button>
            </div>
            {showStressTest && (
              <div className="ai-stress-grid">
                {analysis.scenarios.map(sc => (
                  <div key={sc.btcDelta} className={`ai-stress-card ${sc.portfolioDelta >= 0 ? 'positive' : 'negative'}`}>
                    <div className="ai-stress-btc">BTC {sc.btcDelta > 0 ? '+' : ''}{sc.btcDelta}%</div>
                    <div className="ai-stress-delta">
                      {sc.portfolioDelta >= 0 ? '+' : ''}
                      ${sc.portfolioDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="ai-stress-nv">
                      → ${sc.newValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ai-winloss">
            <div className="ai-winloss-bar">
              <div className="ai-win-fill" style={{ width: `${(analysis.profitableCoins / analysis.totalCoins) * 100}%` }} />
            </div>
            <div className="ai-winloss-labels">
              <span className="positive">{analysis.profitableCoins} profitable</span>
              <span className="negative">{analysis.totalCoins - analysis.profitableCoins} losing</span>
            </div>
          </div>

          {analysis.insights.length > 0 && (
            <div className="ai-insights">
              {analysis.insights.map((ins, i) => (
                <div key={i} className={`ai-insight ${ins.type}`}>
                  <span className="ai-insight-icon" aria-hidden="true">{ins.icon}</span>
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScoreRing({ value, color, label, desc, descColor }) {
  return (
    <div className="ai-score-card">
      <div className="ai-score-ring" style={{ '--score': value, '--color': color }}>
        <svg viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="var(--bg4)" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke={color} strokeWidth="3"
                strokeDasharray={`${value}, 100`} strokeLinecap="round" />
        </svg>
        <span className="ai-score-value">{value}</span>
      </div>
      <span className="ai-score-label">{label}</span>
      <span className="ai-score-desc" style={descColor ? { color: descColor } : undefined}>{desc}</span>
    </div>
  )
}

function DeepMetric({ label, value, hint, color }) {
  return (
    <div className="deep-metric" title={hint}>
      <div className="deep-metric-label">{label}</div>
      <div className="deep-metric-value" style={{ color }}>{value}</div>
    </div>
  )
}

function SegmentedBreakdown({ title, badge, badgeMuted, rows }) {
  return (
    <div className="ai-section">
      <div className="ai-section-head">
        <span>{title}</span>
        {badge && (
          <span className={badgeMuted ? 'ai-section-badge-muted' : 'ai-section-badge'}>{badge}</span>
        )}
      </div>
      <div className="ai-class-bar">
        {rows.map(c => (
          <div
            key={c.key}
            className="ai-class-seg"
            style={{ width: `${c.pct}%`, background: c.color }}
            title={`${c.label}: ${c.pct.toFixed(1)}%${c.desc ? ` (${c.desc})` : ''}`}
          />
        ))}
      </div>
      <div className="ai-class-legend">
        {rows.map(c => (
          <div key={c.key} className="ai-class-item">
            <span className="ai-class-dot" style={{ background: c.color }} />
            <span className="ai-class-label">{c.label}</span>
            <span className="ai-class-pct">{c.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
